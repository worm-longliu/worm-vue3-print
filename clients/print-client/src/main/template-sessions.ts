// 模板会话注册表：浏览器 template.attach/detach 绑定，桌面端 template.get/apply 实时读写。
// 仅驻留内存：客户端退出或页面关闭即失效，不落盘、不持久化。
import type { WebSocket } from 'ws'
import {
  MESSAGE_TYPES,
  WormPrintError,
  type TemplateAttachRequest,
  type TemplateAttachResponsePayload,
  type TemplateGetResponsePayload,
  type TemplateApplyRequest,
  type TemplateApplyResponsePayload,
} from '@worm-vue3-print/core/client'
import type { OpenTemplateSession, GetOpenTemplateResult } from '@worm-vue3-print/mcp'
import type { Logger } from './logger.js'
import { ProtocolFailure } from './protocol-error.js'

export { type OpenTemplateSession }

const MAX_SESSIONS = 32
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/
const NAME_LIMIT = 120
const URL_LIMIT = 512
const GET_TIMEOUT_MS = 5_000
const APPLY_TIMEOUT_MS = 10_000

/** 桌面端 → 浏览器请求通道（由 WsServer 提供） */
export interface TemplateRequestBroker {
  request(ws: WebSocket, type: string, payload: unknown, timeoutMs: number): Promise<unknown>
  rejectPendingsOf(ws: WebSocket, message?: string): void
}

interface BoundSession {
  sessionId: string
  name: string
  url: string
  templateName?: string
  lastActiveAt: number
  ws: WebSocket
  origin: string
  /** 同一会话 get/apply 串行：后到请求排进链尾 */
  chain: Promise<unknown>
}

export interface AttachContext {
  ws: WebSocket
  origin?: string
}

/** origin+pathname 保留、query/hash 丢弃并截断 */
function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.origin}${u.pathname === '' ? '/' : u.pathname}`.slice(0, URL_LIMIT)
  } catch {
    return raw.slice(0, URL_LIMIT)
  }
}

export class TemplateSessionRegistry {
  private sessions = new Map<string, BoundSession>()
  private broker: TemplateRequestBroker | null = null

  constructor(private readonly logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>) {}

  connectBroker(broker: TemplateRequestBroker): void {
    this.broker = broker
  }

  get size(): number {
    return this.sessions.size
  }

  // ─── 浏览器 → 桌面端 ───

  /** template.attach：校验、Origin 绑定、同源重连替换、上限 */
  async attach(payload: unknown, ctx: AttachContext): Promise<TemplateAttachResponsePayload> {
    const p = payload as Partial<TemplateAttachRequest> | null
    const origin = ctx.origin
    if (!origin) throw new ProtocolFailure('UNAUTHORIZED', '模板会话必须携带 Origin（未提供来源的页面拒绝 attach）')
    if (!p || typeof p !== 'object'
      || typeof p.sessionId !== 'string'
      || typeof p.name !== 'string'
      || typeof p.url !== 'string') {
      throw new ProtocolFailure('INVALID_REQUEST', 'template.attach 需要 sessionId/name/url 字符串字段')
    }
    if (!SESSION_ID_RE.test(p.sessionId)) {
      throw new ProtocolFailure('INVALID_REQUEST', 'sessionId 必须是 16–128 位 [A-Za-z0-9_-] 随机串')
    }
    // 每个浏览器连接最多绑定一个模板会话：已绑定其他 sessionId 直接拒绝，不新增也不覆盖
    for (const [id, bound] of this.sessions) {
      if (bound.ws === ctx.ws && id !== p.sessionId) {
        throw new ProtocolFailure('INVALID_REQUEST', `该页面已绑定会话 ${id}：一个连接只能绑定一个模板会话，请先 detach`)
      }
    }
    const existing = this.sessions.get(p.sessionId)
    // 上限只卡「新增会话」：同 sessionId 的同源重连/本连接重签不算新增，不被 BUSY 拒
    if (!existing && this.size >= MAX_SESSIONS) {
      throw new ProtocolFailure('BUSY', `模板会话已达上限 ${MAX_SESSIONS} 个：请关闭不用的设计器页面后重试`)
    }
    if (existing && existing.ws !== ctx.ws) {
      if (existing.origin !== origin) {
        throw new ProtocolFailure('UNAUTHORIZED', `会话 ${p.sessionId} 已被其他 Origin 绑定，拒绝替换`)
      }
      // 同源重连：替换旧连接，旧连接未决请求按断开处理
      this.broker?.rejectPendingsOf(existing.ws, '该页面开了新连接，旧连接已让位')
      this.logger?.info('模板会话重连替换', { sessionId: p.sessionId })
    }

    const name = p.name.slice(0, NAME_LIMIT)
    const url = normalizeUrl(p.url)
    const session: BoundSession = {
      sessionId: p.sessionId,
      name,
      url,
      ...(typeof p.templateName === 'string' && p.templateName.trim()
        ? { templateName: p.templateName.slice(0, NAME_LIMIT) }
        : {}),
      lastActiveAt: Date.now(),
      ws: ctx.ws,
      origin,
      chain: Promise.resolve(),
    }
    this.sessions.set(p.sessionId, session)
    return { sessionId: p.sessionId }
  }

  /** template.detach：主动注销当前连接绑定的会话（best-effort） */
  async detach(_payload: unknown, ctx: AttachContext): Promise<Record<string, never>> {
    for (const [id, s] of this.sessions) {
      if (s.ws === ctx.ws) this.sessions.delete(id)
    }
    return {}
  }

  // ─── 桌面端 → 浏览器 ───

  list(): OpenTemplateSession[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map(s => ({
        sessionId: s.sessionId,
        name: s.name,
        url: s.url,
        ...(s.templateName ? { templateName: s.templateName } : {}),
        lastActiveAt: s.lastActiveAt,
      }))
  }

  /** MCP 桥接口（TemplateSessionBridge）的会话清单别名 */
  listSessions(): OpenTemplateSession[] {
    return this.list()
  }

  private byId(sessionId: string): BoundSession {
    const s = this.sessions.get(sessionId)
    if (!s) throw new WormPrintError('SESSION_NOT_FOUND', '模板会话不存在或已关闭')
    return s
  }

  private get broker1(): TemplateRequestBroker {
    if (!this.broker) throw new WormPrintError('SESSION_DISCONNECTED', '本地服务尚未连接浏览器通道')
    return this.broker
  }

  /**
   * 挂到会话的串行链：同一会话的 get/apply 依序发往浏览器，
   * 前一个未结束时后一个不会先发出（不影响其他会话并行）。
   */
  private chained<T>(s: BoundSession, run: () => Promise<T>): Promise<T> {
    const result = s.chain.then(run, run)
    s.chain = result.catch(() => undefined)
    return result
  }

  /**
   * template.get：页面实时快照，5s 超时。single-connection 语义由 MCP 工具层先行解析。
   */
  async getTemplate(sessionId: string): Promise<GetOpenTemplateResult> {
    const s = this.byId(sessionId)
    const queuedAt = Date.now()
    return this.chained(s, async () => {
      const roundTripStartedAt = Date.now()
      s.lastActiveAt = roundTripStartedAt
      const result = (await this.broker1
        .request(s.ws, MESSAGE_TYPES.TEMPLATE_GET, {}, GET_TIMEOUT_MS).finally(() => {
          this.logger?.debug('模板会话请求完成', {
            operation: 'get', sessionId,
            queueMs: roundTripStartedAt - queuedAt,
            roundTripMs: Date.now() - roundTripStartedAt,
          })
        })) as TemplateGetResponsePayload
      return {
        session: {
          sessionId: s.sessionId,
          name: s.name,
          url: s.url,
          ...(s.templateName ? { templateName: s.templateName } : {}),
          lastActiveAt: s.lastActiveAt,
        },
        revision: result.revision,
        templateJson: result.templateJson,
        ...(result.fields !== undefined ? { fields: result.fields } : {}),
        ...(result.printData !== undefined ? { printData: result.printData } : {}),
      }
    })
  }

  /**
   * template.apply：与 get 共用同一串行链；10s 超时。
   * revision 冲突 / 模板不合法由浏览器判定后按协议错误码回传。
   */
  async applyTemplate(input: {
    sessionId: string
    baseRevision: string
    templateJson: unknown
    reason?: string
  }): Promise<TemplateApplyResponsePayload> {
    const s = this.byId(input.sessionId)
    const payload: TemplateApplyRequest = {
      baseRevision: input.baseRevision,
      templateJson: input.templateJson,
      ...(input.reason ? { reason: input.reason } : {}),
    }
    const queuedAt = Date.now()
    return this.chained(s, async () => {
      const roundTripStartedAt = Date.now()
      s.lastActiveAt = roundTripStartedAt
      return (await this.broker1
        .request(s.ws, MESSAGE_TYPES.TEMPLATE_APPLY, payload, APPLY_TIMEOUT_MS).finally(() => {
          this.logger?.debug('模板会话请求完成', {
            operation: 'apply', sessionId: input.sessionId,
            queueMs: roundTripStartedAt - queuedAt,
            roundTripMs: Date.now() - roundTripStartedAt,
          })
        })) as TemplateApplyResponsePayload
    })
  }

  /** 连接断开：自动移除该连接上绑定的所有会话 */
  handleDisconnect(ws: WebSocket): void {
    for (const [id, s] of this.sessions) {
      if (s.ws === ws) {
        this.sessions.delete(id)
        this.logger?.info('模板会话已随页面断开移除', { sessionId: id })
      }
    }
  }

  /** 客户端退出：清空会话并拒绝未决请求 */
  stop(): void {
    for (const [, s] of this.sessions) {
      this.broker?.rejectPendingsOf(s.ws, '客户端正在退出')
    }
    this.sessions.clear()
  }
}
