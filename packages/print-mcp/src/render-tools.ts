// 视觉回读：把模板渲染成 PNG 喂回模型自评版式。渲染管线（测量趟需要浏览器真实字体）在客户端执行，
// MCP 包只做门禁与转发；bridge 由桌面客户端注入，本包不依赖 Electron。
import { z } from 'zod'
import { validateTemplateJson } from '@worm-vue3-print/contract'
import { findBlockedElementPaths } from '@worm-vue3-print/core/designer'
import type { ToolDef, ToolResult } from './tool-types.js'
import { asError, asText } from './tool-types.js'
import { unwrapTemplateShell } from './template-session-tools.js'

/** 单次预览的缩放上限：超过后 PNG 体积与视觉 token 成本增长不划算 */
const PREVIEW_SCALE_MAX = 3

/**
 * 宿主注入的渲染接口：完整两遍式管线（测量 → 分页 → 单页 HTML → 截图）由客户端实现。
 * page 越界、渲染失败、超时都由 bridge 抛带 code 的 Error，工具层映射为可行动文案。
 */
export interface TemplateRenderBridge {
  renderTemplatePage(input: {
    templateJson: unknown
    /** 行内字段走 {字段} 求值、数组走表格 dataSource；不传则表格与绑定表达式渲染为空 */
    printData?: Record<string, unknown>
    /** 1-based 页号；超过总页数抛 PAGE_OUT_OF_RANGE（message 含实际页数） */
    page: number
    /** 截图像素密度倍数：1~3，影响返回 PNG 的像素尺寸 */
    scale: number
  }): Promise<{
    pageCount: number
    /** 本页纸张尺寸（mm）；连续纸为探针推导的出纸高度 */
    pageSizeMm: { width: number; height: number }
    pngBase64: string
    widthPx: number
    heightPx: number
    /** 1 个截图输出像素对应的毫米数，用于把截图坐标换算回模板毫米坐标 */
    mmPerPx?: number
    /** 本页每个元素的实际渲染包围盒（mm）；content 元素相对内容区左上角，header/footer 元素相对各自容器左上角 */
    elementBoxes?: Array<{
      id: string
      leftMm: number
      topMm: number
      widthMm: number
      heightMm: number
      /** 坐标基准区域：缺省按 content 处理 */
      zone?: 'content' | 'header' | 'footer'
    }>
  }>
}

/** bridge 抛错 → 可行动文案；与 template-session-tools 的错误码映射同风格 */
function renderBridgeError(err: unknown): string {
  const code = err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined
  const message = err instanceof Error ? err.message : String(err)
  switch (code) {
    case 'PAGE_OUT_OF_RANGE':
      return `page 超出范围：${message}（按实际页数重新选页重试）。`
    case 'RENDER_TIMEOUT':
      return '渲染超时：模板可能过于复杂（长表格/多页），请精简后重试。'
    case 'RENDER_FAILED':
      return `渲染失败：${message}`
    default:
      return message
  }
}

/**
 * 预览注解：不落画布（只读、非破坏性），但渲染在宿主（桌面客户端）内进行——
 * 模板里引用的远程图片/字体会真实触网，file:// 资源会读本地文件，故 openWorldHint 为 true。
 */
const PREVIEW_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const

/** zod → JSON Schema（与 tools.ts 同款） */
function schemaOf<T extends z.ZodTypeAny>(schema: T): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>
}

/** 带结构的 isError 结果（与 template-session-tools 同形） */
function errorResult(body: unknown): ToolResult {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
    isError: true,
  }
}

export function createRenderTools(bridge: TemplateRenderBridge): ToolDef[] {
  return [
    {
      name: 'print_preview_template',
      description: '【视觉回读】把模板渲染成单页 PNG 返回给模型自评：走客户端完整渲染管线（测量→分页→出纸管线），'
        + '长文本换行、表格分页、页眉页脚重复都是真实效果。写回画布（print_apply_open_template）之前先看图自评版式'
        + '（对齐、密度、留白、溢出、条码清晰度），修完再写回。'
        + '一次返回一张图：多页模板用 page 参数逐页看。不落画布、只读不写。'
        + '注意：渲染在宿主（桌面客户端）内进行，模板内引用的远程图片/字体可能触发网络请求或读取本地文件，'
        + '宿主应就此征求用户批准。',
      annotations: { title: '预览模板渲染效果', ...PREVIEW_ANNOTATIONS },
      inputSchema: schemaOf(z.object({
        templateJson: z.record(z.string(), z.unknown()).describe(
          '要预览的模板 JSON（单页 TemplateData；多页 wrapper 逐页渲染后按 page 取）。'
            + '预览实时画布请先用 print_get_open_template 取快照再传入。',
        ),
        printData: z.record(z.string(), z.unknown()).optional().describe(
          '样例打印数据：不传则表格与绑定表达式渲染为空，图没有评估价值，强烈建议传。',
        ),
        page: z.number().int().min(1).optional().describe('预览第几页（1 起）；缺省第 1 页。多页模板逐页调用查看。'),
        scale: z.number().int().min(1).max(PREVIEW_SCALE_MAX).optional().describe(
          '截图像素密度倍数（1~3）；缺省 2。A4@2x 约 1588×2246px，一般不需要调。',
        ),
      })),
      handler: async (args): Promise<ToolResult> => {
        const a = args as {
          templateJson?: unknown
          printData?: Record<string, unknown>
          page?: number
          scale?: number
        }
        if (!Object.prototype.hasOwnProperty.call(args, 'templateJson') || !a.templateJson || typeof a.templateJson !== 'object'
          || Array.isArray(a.templateJson)) {
          return asError('缺少必填参数 templateJson（模板 JSON 对象）。')
        }
        const template = unwrapTemplateShell(a.templateJson)
        if (!template || typeof template !== 'object' || Array.isArray(template)) {
          return asError('templateJson 不是合法的模板 JSON（应为 TemplateData 对象或多页 wrapper）。')
        }

        // 门禁 1：契约校验 error 直接拒绝（与写回门禁同源），不让废模板浪费一次渲染
        const checked = validateTemplateJson(template)
        if (!checked.ok || !checked.data) {
          return errorResult({
            stage: 'validate',
            ok: false,
            hint: '契约校验未通过：按 issues[].path（level=error）修正后重试；warning 可忽略。',
            issues: checked.issues,
          })
        }
        // 门禁 2：封禁元素类型（html 等）
        const blocked = findBlockedElementPaths(template)
        if (blocked.length > 0) {
          return errorResult({
            stage: 'blocked-elements',
            ok: false,
            hint: '模板包含被封禁的元素类型（占位实现，出纸为空盒）：删除这些元素后重试。',
            blockedPaths: blocked,
          })
        }

        const page = typeof a.page === 'number' && Number.isInteger(a.page) && a.page >= 1 ? a.page : 1
        const scale = typeof a.scale === 'number' && Number.isInteger(a.scale) && a.scale >= 1 ? a.scale : 2

        try {
          const r = await bridge.renderTemplatePage({
            templateJson: checked.data,
            ...(a.printData && typeof a.printData === 'object' && !Array.isArray(a.printData)
              ? { printData: a.printData }
              : {}),
            page,
            scale,
          })
          const textPayload = {
            ok: true,
            pageCount: r.pageCount,
            page,
            pageSizeMm: r.pageSizeMm,
            widthPx: r.widthPx,
            heightPx: r.heightPx,
            ...(r.mmPerPx !== undefined ? { mmPerPx: r.mmPerPx } : {}),
            ...(r.elementBoxes ? { elementBoxes: r.elementBoxes } : {}),
            note: '下方附本页渲染 PNG。elementBoxes 是每个元素的实际渲染包围盒（mm）：'
              + 'content 元素相对内容区左上角，header/footer 元素分别相对 .page-header / .page-footer 容器左上角（看 zone 字段）；'
              + '可与模板里写的 left/top/width/height 直接对照；连续纸的 top 按探针推导纸高计算。'
              + '自评清单：元素对齐与间距、文字密度（过大/过挤）、留白均衡、有无溢出/裁切、条码是否清晰。',
          }
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(textPayload, null, 2) },
              { type: 'image' as const, data: r.pngBase64, mimeType: 'image/png' },
            ],
          }
        } catch (e) {
          return asError(renderBridgeError(e))
        }
      },
    },
  ]
}
