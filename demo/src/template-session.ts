/**
 * demo 模板会话：把页面里的设计器接入桌面客户端的「AI 助手」通道。
 *
 * 职责（对应 spec 2026-11-02 §6.2）：
 * - 页面加载后连接本地桌面客户端；未启动时由 PrintClient 固定退避重试，不阻塞设计器。
 * - 每次连接成功后发送 template.attach（sessionId 存 sessionStorage，重连复用）。
 * - 响应桌面端 template.get：返回画布快照（模板 JSON / 字段树 / 打印数据）与内容 revision。
 * - 响应桌面端 template.apply：revision 冲突拒绝 → 封禁元素拒绝 → 结构校验 → 深拷贝写回。
 * - 页面卸载 best-effort 发送 template.detach，连接关闭由桌面端自动回收会话。
 */
import { PrintClient, MESSAGE_TYPES, WormPrintError } from '@worm-vue3-print/core/client'
import type { ServerRequestHandler } from '@worm-vue3-print/core/client'
import { findBlockedElementPaths } from '@worm-vue3-print/core/designer'
import type { PrintTemplateData, MultiPageTemplateData } from "@worm-vue3-print/core"

/**
 * 会话状态：
 * - unreachable：桌面客户端未启动或端口探测失败（后台持续重试）
 * - idle：已连接桌面客户端，但模板 attach 未成功（需配对 / 上限等，见 lastError）
 * - attached：模板会话成立，AI 可通过 MCP 读写
 */
export type TemplateSessionStatus = 'unreachable' | 'idle' | 'attached'

export interface TemplateSnapshot {
  templateJson: unknown
  templateName?: string
  fields?: unknown[]
  printData?: unknown
}

export interface TemplateSessionHooks {
  /** 读取当前画布快照（get 用） */
  readSnapshot(): TemplateSnapshot
  /**
   * 写回（apply 用）：templateJson 已深拷贝并通过封禁/结构校验。
   * 宿主应写回画布、等待重载后重新读取并返回最新 JSON（revision 由本模块计算）。
   */
  writeTemplate(templateJson: unknown): Promise<{ freshTemplateJson: unknown; warnings?: string[] } | void>
  /** apply 结果通知（仅 UI 提示用）：写回成功 / revision 冲突 */
  onApplyResult?(kind: 'success' | 'conflict', message: string, revision?: string): void
}

export interface TemplateSessionHandle {
  readonly sessionId: string
  /** 当前 revision（画布内容的稳定指纹） */
  currentRevision(): Promise<string>
  start(): void
  /** 页面卸载：best-effort detach + 关闭连接 */
  stop(): void
  onStatusChange(cb: (status: TemplateSessionStatus, lastError: string | null) => void): () => void
}

const SESSION_KEY = 'worm-print-demo:template-session'

const SESSION_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'

function randomSessionId(): string {
  const byte = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(byte, b => SESSION_ALPHABET[b % 64]).join('') // 固定 24 位，64 值均匀映射无越界
}

/** 稳定内容指纹：键排序后 JSON 序列化，再 SHA-256（无 subtle 时退化为 FNV-1a） */
export async function revisionOf(value: unknown): Promise<string> {
  const canonical = canonicalize(value)
  const text = JSON.stringify(canonical)
  if (crypto?.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    } catch {
      // 非安全上下文（http://）下 subtle 不可用，走 FNV-1a
    }
  }
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0').repeat(8)
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = canonicalize((value as Record<string, unknown>)[k])
    }
    return out
  }
  return value
}

/** 单页/多页模板外壳校验（同 demo 的导入校验口径） */
function isTemplateLikeShape(data: unknown): data is PrintTemplateData | MultiPageTemplateData {
  const single = (t: unknown): boolean =>
    !!t && typeof t === 'object'
    && typeof (t as Record<string, unknown>).paperSize === 'string'
    && !!(t as Record<string, unknown>).margins && typeof (t as Record<string, unknown>).margins === 'object'
    && Array.isArray((t as Record<string, unknown>).elements)
  if (!data || typeof data !== 'object') return false
  if (single(data)) return true
  const pages = (data as Record<string, unknown>).pages
  return Array.isArray(pages) && pages.length > 0 && pages.every(single)
}

export function createTemplateSession(hooks: TemplateSessionHooks, token?: string): TemplateSessionHandle {
  const sessionId = (() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved && /^[A-Za-z0-9_-]{16,128}$/.test(saved)) return saved
    } catch { /* 隐私模式下可能受限 */ }
    const fresh = randomSessionId()
    try { sessionStorage.setItem(SESSION_KEY, fresh) } catch { /* 忽略 */ }
    return fresh
  })()

  const client = new PrintClient({ timeoutMs: 20000, token: token ?? undefined })
  let status: TemplateSessionStatus = 'unreachable'
  let lastError: string | null = null
  const statusSubs = new Set<(s: TemplateSessionStatus, err: string | null) => void>()
  const unsubs: Array<() => void> = []

  function setStatus(next: TemplateSessionStatus, err: string | null = null) {
    status = next
    lastError = err
    statusSubs.forEach(cb => cb(status, lastError))
  }

  async function sendAttach(): Promise<void> {
    const snapshot = hooks.readSnapshot()
    try {
      await client.attachTemplate({
        sessionId,
        name: document.title || 'demo 设计器页面',
        url: window.location.href,
        ...(snapshot.templateName ? { templateName: snapshot.templateName } : {}),
      })
      setStatus('attached', null)
    } catch (err) {
      // 画面保留连接态：attach 失败不等于桌面端不可达
      setStatus('idle', describeError(err))
    }
  }

  /** template.get / template.apply 处理器：桌面端 MCP 读取与写回的真正落点 */
  const handler: ServerRequestHandler = async (type, payload) => {
    if (type === MESSAGE_TYPES.TEMPLATE_GET) {
      const snapshot = hooks.readSnapshot()
      return {
        sessionId,
        revision: await revisionOf(snapshot.templateJson),
        templateJson: snapshot.templateJson,
        ...(snapshot.fields ? { fields: snapshot.fields } : {}),
        ...(snapshot.printData ? { printData: snapshot.printData } : {}),
        ...(snapshot.templateName ? { templateName: snapshot.templateName } : {}),
      }
    }
    if (type === MESSAGE_TYPES.TEMPLATE_APPLY) {
      const req = payload as { baseRevision?: string; templateJson?: unknown; reason?: string }
      const currentRev = await revisionOf(hooks.readSnapshot().templateJson)
      if (!req || typeof req.baseRevision !== 'string' || req.baseRevision !== currentRev) {
        const message = '模板在读取后被修改（如手动编辑或撤销重做）：请重新读取最新模板后再应用。'
        hooks.onApplyResult?.('conflict', message)
        throw new WormPrintError('REVISION_CONFLICT', message)
      }
      const blocked = findBlockedElementPaths(req.templateJson)
      if (blocked.length) {
        throw new WormPrintError('INVALID_TEMPLATE', `模板包含不允许直改的元素：${blocked.join('、')}。请改用图片/文本等方式呈现该内容。`)
      }
      if (!isTemplateLikeShape(req.templateJson)) {
        throw new WormPrintError('INVALID_TEMPLATE', '模板 JSON 缺少 paperSize / margins / elements 关键结构（多页面模板需在 pages 内提供）。')
      }
      const result = await hooks.writeTemplate(structuredClone(req.templateJson))
      if (!result) {
        throw new WormPrintError('INTERNAL', '写回失败：宿主未返回写回结果')
      }
      const reply = {
        revision: await revisionOf(result.freshTemplateJson),
        templateJson: result.freshTemplateJson,
        ...(result.warnings?.length ? { warnings: result.warnings } : {}),
      }
      hooks.onApplyResult?.('success', 'AI 已修改模板，可通过设计器撤销按钮回退', reply.revision)
      setStatus('attached', null)
      return reply
    }
    throw new WormPrintError('INVALID_REQUEST', `浏览器侧不支持处理请求：${type}`)
  }

  function start(): void {
    client.setRequestHandler(handler)
    unsubs.push(
      client.onStatusChange(s => {
        if (s === 'connected') void sendAttach()
        else if (status !== 'idle' || lastError?.includes('连接')) setStatus('unreachable', '桌面客户端未连接：请启动客户端或在设置里开启 MCP')
      }),
    )
    void client.connect().catch(() => {
      // 未启动客户端：PrintClient 会按固定退避重试，无需额外处理
    })
    setStatus('unreachable', null)
  }

  function stop(): void {
    void client.detachTemplate(sessionId).catch(() => {})
    unsubs.splice(0).forEach(fn => fn())
    try { client.close() } catch { /* 忽略 */ }
    statusSubs.clear()
    setStatus('unreachable', null)
  }

  return {
    sessionId,
    currentRevision: () => revisionOf(hooks.readSnapshot().templateJson),
    start,
    stop,
    onStatusChange(cb) {
      statusSubs.add(cb)
      cb(status, lastError)
      return () => statusSubs.delete(cb)
    },
  }
}

function describeError(err: unknown): string {
  if (err instanceof WormPrintError) {
    if (err.code === 'UNAUTHORIZED') return '客户端已连接但未配对：请在客户端设置里复制配对码'
    return err.message
  }
  return err instanceof Error ? err.message : '模板会话 attach 失败'
}

export { WormPrintError }
