// 模板会话工具：AI 通过桌面客户端读写浏览器里正在编辑的模板。
// bridge 由宿主（桌面客户端）注入，MCP 包不依赖 Electron。
import { z } from 'zod'
import { validateTemplateJson } from '@worm-vue3-print/contract'
import { findBlockedElementPaths } from '@worm-vue3-print/core/designer'
import type { ToolDef, ToolResult } from './tool-types.js'
import { asError, asText } from './tool-types.js'
import { applyTemplateOperations, projectTemplateSummary, type TemplateOperation } from './template-operations.js'

/** AI 写回模板的体积上限：与 POST /mcp 请求体一致（4 MiB） */
const APPLY_MAX_BYTES = 4 * 1024 * 1024

function schemaOf<T extends z.ZodTypeAny>(schema: T): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>
}

const PURE_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

export interface OpenTemplateSession {
  sessionId: string
  name: string
  url: string
  templateName?: string
  lastActiveAt: number
}

export interface GetOpenTemplateResult {
  session: OpenTemplateSession
  revision: string
  templateJson: unknown
  fields?: unknown[]
  printData?: unknown
}

/**
 * 宿主注入的模板会话接口：会话解析（数量/选中）、实时快照与写回。
 * bridge 实现负责 5s get / 10s apply 超时与串行化；工具层只做门禁与文案。
 */
export interface TemplateSessionBridge {
  listSessions(): OpenTemplateSession[]
  /** 取实时快照：sessionId 必须是 listSessions 里现存会话 */
  getTemplate(sessionId: string): Promise<GetOpenTemplateResult>
  applyTemplate(input: {
    sessionId: string
    baseRevision: string
    templateJson: unknown
    reason?: string
  }): Promise<{
    revision: string
    templateJson: unknown
    issues?: unknown[]
    warnings?: unknown[]
  }>
}

/** { templateJson } 外壳统一解包成裸模板 */
export function unwrapTemplateShell(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)
    && Object.prototype.hasOwnProperty.call(raw, 'templateJson')) {
    return (raw as { templateJson: unknown }).templateJson
  }
  return raw
}

function listCandidates(sessions: OpenTemplateSession[]): string {
  return sessions
    .map(s => `- ${s.name || '未命名页面'}（sessionId=${s.sessionId}${s.url ? `，${s.url}` : ''}）`)
    .join('\n')
}

function resolveSession(
  bridge: TemplateSessionBridge,
  sessionId: string | undefined,
): { session: OpenTemplateSession } | { error: ToolResult } {
  const sessions = bridge.listSessions()
  if (sessions.length === 0) {
    return {
      error: asError(
        '当前没有打开的模板页面：请先在浏览器打开模板设计器页面（demo 或宿主页面），'
        + '页面与客户端保持连接后重试。',
      ),
    }
  }
  if (sessionId && typeof sessionId === 'string' && sessionId.trim()) {
    const session = sessions.find(s => s.sessionId === sessionId.trim())
    if (!session) {
      return {
        error: asError(
          `模板会话不存在或已断开（${sessionId}）。请先调 print_list_open_templates 获取当前会话：\n${listCandidates(sessions)}`,
        ),
      }
    }
    return { session }
  }
  if (sessions.length === 1) return { session: sessions[0]! }
  return {
    error: asError(
      `当前打开了 ${sessions.length} 个模板页面，需要指定 sessionId：\n${listCandidates(sessions)}\n`
      + '请改用 print_get_open_template / print_apply_open_template 并传入目标 sessionId。',
    ),
  }
}

export function createTemplateSessionTools(bridge: TemplateSessionBridge): ToolDef[] {
  return [
    {
      name: 'print_list_open_templates',
      description: '列出桌面客户端当前连接的模板设计器页面（sessionId / 页面名 / URL / 最近活跃时间）。'
        + '页面必须保持打开：关闭页面后会话即刻失效。有多个页面时给 print_get_open_template / '
        + 'print_apply_open_template 指定 sessionId。',
      annotations: { title: '列出打开的模板页面', ...PURE_ANNOTATIONS },
      inputSchema: schemaOf(z.object({})),
      handler: async (): Promise<ToolResult> => asText({ sessions: bridge.listSessions() }),
    },
    {
      name: 'print_get_open_template',
      description: '读取打开页面里当前模板的实时快照：templateJson、业务字段、打印数据与 revision。'
        + '默认返回完整快照；view=summary 时仅返回页面和元素索引，可用 elementIds/includeFields 精简。'
        + '小范围修改推荐使用 print_patch_open_template，并通过返回的 revision 链式修改。',
      annotations: { title: '读取打开的模板', ...PURE_ANNOTATIONS },
      inputSchema: schemaOf(z.object({
        sessionId: z.string().optional().describe(
          '目标页面会话；只有一个页面时可省略，多个页面时必传（print_list_open_templates 可列出）。',
        ),
        view: z.enum(['full', 'summary']).optional().describe('默认 full；summary 只返回页面与元素索引。'),
        elementIds: z.array(z.string()).optional().describe('仅 summary：需要返回的元素 ID。'),
        includeFields: z.array(z.string()).optional().describe('仅 summary：元素 options 中需要返回的字段。'),
        includePrintData: z.boolean().optional().describe('仅 summary：默认不返回打印数据，true 时返回。'),
      })),
      handler: async (args): Promise<ToolResult> => {
        const a = args as { sessionId?: string; view?: 'full' | 'summary'; elementIds?: string[]; includeFields?: string[]; includePrintData?: boolean }
        const resolved = resolveSession(bridge, a.sessionId)
        if ('error' in resolved) return resolved.error
        try {
          const r = await bridge.getTemplate(resolved.session.sessionId)
          if ((a.view ?? 'full') === 'full') {
            if (a.elementIds || a.includeFields || a.includePrintData !== undefined) {
              return asError('elementIds/includeFields/includePrintData 仅支持与 view=summary 搭配。')
            }
            return asText(r)
          }
          const summary = projectTemplateSummary(r.templateJson, {
            ...(a.elementIds ? { elementIds: a.elementIds } : {}),
            ...(a.includeFields ? { includeFields: a.includeFields } : {}),
          })
          return asText({
            session: r.session,
            revision: r.revision,
            view: 'summary',
            ...summary,
            ...(r.fields !== undefined ? { fields: r.fields } : {}),
            ...(a.includePrintData && r.printData !== undefined ? { printData: r.printData } : {}),
          })
        } catch (e) {
          return asError(sessionBridgeError('读取模板失败', e))
        }
      },
    },
    {
      name: 'print_apply_open_template',
      description: '【整份替换】把提供的模板 JSON 写回打开的设计器页面：整份覆盖当前画布模板，'
        + '用户可用一次撤销恢复。写回前先过契约校验（error 必须先修）并拒绝 html 等封禁元素。'
        + 'baseRevision 必须来自刚取到的 print_get_open_template 快照：用户可能已改动模板，'
        + '旧 revision 写回会被拒绝（REVISION_CONFLICT），重新读取即可恢复。',
      annotations: {
        title: '写回打开的模板（整份替换，可一次撤销）',
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      inputSchema: schemaOf(z.object({
        sessionId: z.string().optional().describe(
          '目标页面会话；只有一个页面时可省略，多个页面时必传。',
        ),
        baseRevision: z.string().describe(
          '来自最近一次 print_get_open_template 的 revision；模板被用户改动后写回会被拒绝。',
        ),
        templateJson: z.unknown().describe(
          '整份替换后的模板 JSON：单页 TemplateData（paperSize/orientation/margins/elements）或'
            + '多页 wrapper { version: 1, pages: [...] }；单位 mm（fontSize 等为 pt），unit 用 "mm"。',
        ),
        reason: z.string().optional().describe('本次修改的目的，页面侧会提示该说明。'),
      })),
      handler: async (args): Promise<ToolResult> => {
        const a = args as {
          sessionId?: string
          baseRevision?: string
          templateJson?: unknown
          reason?: string
        }
        if (typeof a.baseRevision !== 'string' || !a.baseRevision.trim()) {
          return asError('缺少 baseRevision：必须以最近一次 print_get_open_template 快照里的 revision 作为写回依据。')
        }
        if (!a.templateJson || typeof a.templateJson !== 'object' || Array.isArray(a.templateJson)) {
          return asError('templateJson 不是合法的模板 JSON（应为 TemplateData 对象或多页 wrapper）。')
        }
        const resolved = resolveSession(bridge, a.sessionId)
        if ('error' in resolved) return resolved.error

        const template = unwrapTemplateShell(a.templateJson)
        if (!template || typeof template !== 'object' || Array.isArray(template)) {
          return asError('templateJson 不是合法的模板 JSON（应为 TemplateData 对象或多页 wrapper）。')
        }

        // 门禁 1：契约校验，error 直接拒绝，不触达浏览器
        const checked = validateTemplateJson(template)
        if (!checked.ok || !checked.data) {
          return errorResult({
            stage: 'validate',
            ok: false,
            hint: '契约校验未通过：按 issues[].path（level=error）修正后重试；warning 可忽略。',
            issues: checked.issues,
          })
        }

        // 门禁 2：封禁元素类型（html 等），覆盖所有页与 header/footer
        const blocked = findBlockedElementPaths(template)
        if (blocked.length > 0) {
          return errorResult({
            ok: false,
            stage: 'blocked-elements',
            hint: '模板包含被封禁的元素类型（占位实现，出纸为空盒）：删除这些元素后重试。',
            blockedPaths: blocked,
          })
        }

        // 门禁 3：序列化体积 4 MiB
        const serialized = JSON.stringify(checked.data)
        if (serialized.length > APPLY_MAX_BYTES) {
          return asError(
            `模板序列化后 ${(serialized.length / 1024 / 1024).toFixed(1)}MB 超过 4MiB 上限，`
            + '请精简模板（如拆分页面、去掉重复元素）后重试。',
          )
        }

        try {
          const r = await bridge.applyTemplate({
            sessionId: resolved.session.sessionId,
            baseRevision: a.baseRevision,
            // 使用契约层返回的规范化数据，而不是原样未知对象
            templateJson: checked.data,
            ...(typeof a.reason === 'string' && a.reason.trim() ? { reason: a.reason } : {}),
          })
          return asText({
            ok: true,
            revision: r.revision,
            issues: r.issues ?? [],
            warnings: r.warnings ?? [],
            note: '模板已整份替换写回画布（一次撤销可恢复）；后续修改请重新 print_get_open_template 获取新 revision。',
          })
        } catch (e) {
          return asError(sessionBridgeError('模板写回失败', e))
        }
      },
    },
    {
      name: 'print_patch_open_template',
      description: '【推荐】按元素 ID 原子批量修改打开的画布，避免模型生成整份模板。'
        + '支持 updateElement（浅合并 options.changes）与 moveElement（x/y 对应 left/top，单位 mm）。'
        + '全部操作成功才写回一次，可一次撤销；返回新 revision，后续 Patch 可直接链式使用。',
      annotations: { title: '批量修改打开的模板', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      inputSchema: schemaOf(z.object({
        sessionId: z.string().optional(),
        baseRevision: z.string().describe('来自最近一次读取或 Patch 返回的 revision。'),
        reason: z.string().optional(),
        operations: z.array(z.discriminatedUnion('op', [
          z.object({ op: z.literal('updateElement'), elementId: z.string().min(1), changes: z.record(z.string(), z.unknown()) }),
          z.object({ op: z.literal('moveElement'), elementId: z.string().min(1), x: z.number().finite(), y: z.number().finite() }),
        ])).min(1),
      })),
      handler: async (args): Promise<ToolResult> => {
        const a = args as { sessionId?: string; baseRevision?: string; reason?: string; operations?: TemplateOperation[] }
        if (!a.baseRevision?.trim()) return asError('缺少 baseRevision：请使用最近一次读取或 Patch 返回的 revision。')
        const resolved = resolveSession(bridge, a.sessionId)
        if ('error' in resolved) return resolved.error
        try {
          const snapshot = await bridge.getTemplate(resolved.session.sessionId)
          if (snapshot.revision !== a.baseRevision) {
            return asError('模板在读取后被修改过（revision 不一致）：请重新读取后再 Patch。')
          }
          const patched = applyTemplateOperations(snapshot.templateJson, a.operations ?? [])
          const checked = validateTemplateJson(patched.templateJson)
          if (!checked.ok || !checked.data) return errorResult({ stage: 'validate', ok: false, issues: checked.issues })
          const blocked = findBlockedElementPaths(checked.data)
          if (blocked.length) return errorResult({ ok: false, stage: 'blocked-elements', blockedPaths: blocked })
          if (JSON.stringify(checked.data).length > APPLY_MAX_BYTES) return asError('Patch 后模板超过 4MiB 上限。')
          const r = await bridge.applyTemplate({
            sessionId: resolved.session.sessionId,
            baseRevision: a.baseRevision,
            templateJson: checked.data,
            ...(a.reason?.trim() ? { reason: a.reason } : {}),
          })
          return asText({
            ok: true,
            revision: r.revision,
            changedPaths: patched.changedPaths,
            issues: r.issues ?? [],
            warnings: r.warnings ?? [],
          })
        } catch (e) {
          return asError(sessionBridgeError('模板 Patch 失败', e))
        }
      },
    },
  ]
}

/** bridge 抛错 → 可行动文案（含协议错误码），不外泄堆栈 */
function sessionBridgeError(prefix: string, err: unknown): string {
  const code = err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined
  const message = err instanceof Error ? err.message : String(err)
  switch (code) {
    case 'SESSION_NOT_FOUND':
      return '模板会话不存在或已关闭：页面可能已被关闭，请调 print_list_open_templates 确认后重试。'
    case 'SESSION_DISCONNECTED':
      return '模板页面已断开连接（可能正在刷新或已关闭）：等页面恢复连接后重试。'
    case 'REVISION_CONFLICT':
      return '模板在读取后被修改过（revision 不一致）：先 print_get_open_template 重新读取快照，再基于新 revision 写回。'
    case 'INVALID_TEMPLATE':
      return `浏览器判定模板不合法：${message}`
    case 'CLIENT_TIMEOUT':
      return `${prefix}: 页面未在超时内响应（页面可能卡顿或已关闭），请重试。`
    default:
      return message
  }
}

/** 带结构的 isError 结果（不外泄堆栈，只给可行动信息） */
function errorResult(body: unknown): ToolResult {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
    isError: true,
  }
}
