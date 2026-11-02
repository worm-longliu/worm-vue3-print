// 仅绑定回环地址的本地服务：同一 127.0.0.1 端口承载 HTTP（/mcp）与 WebSocket（打印 + 模板会话）。
// 端口递增、握手鉴权、JSON 协议帧分发保持既有行为；双向帧方向判定见本文件「响应路由」。
import { createServer } from 'node:http'
import type { Server as HttpServer, IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import type { ServerErrorCode } from '@worm-vue3-print/core/client'
import { SERVER_REQUEST_ID_PREFIX } from '@worm-vue3-print/core/client'
import type { Logger } from './logger.js'
import { ProtocolFailure } from './protocol-error.js'

export type AccessFn = (input: { origin?: string; token?: string }) =>
  | { ok: true }
  | { ok: false; code: 'UNAUTHORIZED'; message: string }

/** 浏览器 → 桌面端请求：ctx 携带发起连接（模板 attach 需绑定 Origin 与连接） */
export type MessageHandler = (
  type: string,
  payload: unknown,
  ctx: { ws: WebSocket; origin?: string },
) => Promise<unknown>

/** /mcp 的完整处理器：开关、Bearer 鉴权、体上限与 MCP 分发都由宿主注入方掌握 */
export type McpHttpHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

export interface WsServerOptions {
  preferredPort: number
  scanLimit?: number
  host?: string
  handler: MessageHandler
  checkAccess: AccessFn
  /** 存在时 /mcp 交给该处理器；缺失时 /mcp 一律 404 */
  handleMcp?: McpHttpHandler
  /** WebSocket 单帧与 POST /mcp 请求体共用上限；比照模板写回 4 MiB */
  maxPayloadBytes?: number
  /** 连接关闭回调（模板会话注册表据此移除该连接绑定的会话） */
  onConnectionClose?: (ws: WebSocket) => void
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>
}

const UNAUTHORIZED_CLOSE_CODE = 4401
const DEFAULT_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024

interface PendingClientRequest {
  resolve: (payload: unknown) => void
  reject: (err: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

interface ConnState {
  /** 桌面端 → 浏览器请求的 pending 表（id → 等待者） */
  pendings: Map<string, PendingClientRequest>
}

export class WsServer {
  private wss: WebSocketServer | null = null
  private http: HttpServer | null = null
  private actualPort = 0
  private stopping = false
  private conns = new WeakMap<WebSocket, ConnState>()
  private requestSeq = 0
  private readonly maxPayloadBytes: number

  constructor(private readonly opts: WsServerOptions) {
    this.maxPayloadBytes = opts.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES
  }

  /** 启动服务；端口被占用时自动 +1；全部失败抛错 */
  async start(): Promise<number> {
    const limit = this.opts.scanLimit ?? 20
    for (let offset = 0; offset < limit; offset++) {
      const port = this.opts.preferredPort + offset
      try {
        await this.listen(port)
        this.actualPort = port
        this.opts.logger?.info(
          `本地服务已监听 127.0.0.1:${port}（ws 打印协议 + HTTP /mcp${this.opts.handleMcp ? '' : ' 未接线'}）`,
        )
        return port
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
      }
    }
    throw new Error(
      `端口 ${this.opts.preferredPort}–${this.opts.preferredPort + limit - 1} 均被占用`,
    )
  }

  get port(): number {
    return this.actualPort
  }

  /**
   * 桌面端 → 浏览器请求：带方向前缀 id，挂到该连接的 pending 表并等待响应帧。
   * 连接关闭或会话替换时未决请求以 SESSION_DISCONNECTED 拒绝。
   */
  requestClient(ws: WebSocket, type: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    const conn = this.conns.get(ws)
    if (!conn || ws.readyState !== 1) {
      return Promise.reject(new SessionDisconnected('目标页面连接不可用'))
    }
    this.requestSeq = (this.requestSeq + 1) % Number.MAX_SAFE_INTEGER
    const id = `${SERVER_REQUEST_ID_PREFIX}${Date.now().toString(36)}-${this.requestSeq.toString(36)}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        conn.pendings.delete(id)
        reject(Object.assign(
          new Error(`浏览器未在 ${timeoutMs}ms 内响应 ${type}（页面可能卡顿，可重试）`),
          { code: 'CLIENT_TIMEOUT' },
        ))
      }, timeoutMs)
      conn.pendings.set(id, {
        resolve: resolve as (p: unknown) => void,
        reject,
        timer,
      })
      ws.send(JSON.stringify({ id, type, payload }))
    })
  }

  /** 会话替换旧连接时，把该连接上未决的桌面端请求按断开处理 */
  rejectPendingsOf(ws: WebSocket, message = '目标页面已断开'): void {
    const conn = this.conns.get(ws)
    if (!conn) return
    for (const [, p] of conn.pendings) {
      clearTimeout(p.timer)
      p.reject(new SessionDisconnected(message))
    }
    conn.pendings.clear()
  }

  async stop(): Promise<void> {
    this.stopping = true
    await new Promise<void>(resolve => {
      if (!this.wss) return resolve()
      const wss = this.wss
      for (const ws of wss.clients) {
        this.rejectPendingsOf(ws, '客户端正在退出')
        ws.terminate()
      }
      wss.close(() => resolve())
    })
    await new Promise<void>(resolve => {
      if (!this.http) return resolve()
      const http = this.http
      // keep-alive socket 不关会拖住 close 回调；拒绝新连接后强清
      http.closeAllConnections?.()
      http.close(() => resolve())
    })
    this.wss = null
    this.http = null
    this.stopping = false
  }

  // ─── 内部 ───

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // noServer：HTTP 与 WebSocket 共用一个端口，join 由本类分发
      const wss = new WebSocketServer({ noServer: true, maxPayload: this.maxPayloadBytes })
      const http = createServer((req, res) => {
        this.handleHttpRequest(port, req, res)
      })
      http.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(port, wss, req, socket, head)
      })
      this.wss = wss
      this.http = http
      http.once('error', reject)
      http.listen(port, this.opts.host ?? '127.0.0.1', () => {
        http.off('error', reject)
        resolve()
      })
    })
  }

  /** Host 必须 127.0.0.1:<实际端口>：防跨源网页与 DNS rebinding */
  private hostAllowed(port: number, req: IncomingMessage): boolean {
    return req.headers.host === `127.0.0.1:${port}`
  }

  private handleHttpRequest(port: number, req: IncomingMessage, res: ServerResponse): void {
    if (this.stopping) {
      this.reply(res, 503, { error: '服务正在关闭' })
      return
    }
    if (!this.hostAllowed(port, req)) {
      this.reply(res, 403, { error: 'Host 不合法：本地服务只接受 127.0.0.1 访问' })
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname === '/mcp' && this.opts.handleMcp) {
      this.opts.handleMcp(req, res).catch(err => {
        this.opts.logger?.error('/mcp 处理失败', { message: (err as Error).message })
        if (!res.headersSent) this.reply(res, 500, { error: 'MCP 处理失败' })
        else res.end()
      })
      return
    }
    this.reply(res, 404, { error: '未找到资源' })
  }

  private handleUpgrade(
    port: number,
    wss: WebSocketServer,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    if (this.stopping || !this.hostAllowed(port, req)) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws, request) => {
      this.onConnection(ws, request)
    })
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    // 鉴权：token 走查询参数，Origin 来自握手头
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const access = this.opts.checkAccess({
      origin: req.headers.origin,
      token: url.searchParams.get('token') ?? undefined,
    })
    if (!access.ok) {
      ws.send(
        JSON.stringify({
          id: '',
          ok: false,
          error: { code: access.code, message: access.message },
        }),
      )
      ws.close(UNAUTHORIZED_CLOSE_CODE, access.code)
      return
    }
    this.conns.set(ws, { pendings: new Map() })
    const origin = req.headers.origin
    ws.on('message', raw => void this.onFrame(ws, raw, origin))
    // 无监听的 error 会变成未捕获异常（如超过 maxPayload 的 1009），必须挂住
    ws.on('error', err => {
      this.opts.logger?.debug('连接错误', { message: (err as Error).message })
      this.rejectPendingsOf(ws, '连接错误')
    })
    ws.on('close', () => {
      this.rejectPendingsOf(ws, '模板页面已断开')
      this.opts.onConnectionClose?.(ws)
    })
  }

  /** 帧方向判定：浏览器应答（含布尔 ok）→ pending 表；带 id/type/payload → 请求派发 */
  private async onFrame(ws: WebSocket, raw: unknown, origin?: string): Promise<void> {
    let data: unknown
    try {
      data = JSON.parse((raw as { toString(): string }).toString())
    } catch {
      ws.send(
        JSON.stringify({
          id: '',
          ok: false,
          error: { code: 'INVALID_REQUEST', message: '非法 JSON' },
        }),
      )
      return
    }
    const frame = data as Record<string, unknown>
    if (typeof frame.ok === 'boolean') {
      // 浏览器应答帧：路由到该连接的 pending 表；id 不存在则忽略（不能当业务请求）
      const conn = this.conns.get(ws)
      const id = typeof frame.id === 'string' ? frame.id : ''
      const pending = conn?.pendings.get(id)
      if (!conn || !pending) {
        this.opts.logger?.debug('收到无主的应答帧，忽略', { id })
        return
      }
      conn.pendings.delete(id)
      clearTimeout(pending.timer)
      if (frame.ok) pending.resolve(frame.payload ?? {})
      else {
        const err = frame.error as { code?: unknown; message?: unknown } | undefined
        pending.reject(
          Object.assign(
            new Error(
              typeof err?.message === 'string' ? err.message : '浏览器返回失败',
            ),
            { code: typeof err?.code === 'string' ? err.code : 'INTERNAL' },
          ),
        )
      }
      return
    }
    if (
      typeof frame.id !== 'string' ||
      typeof frame.type !== 'string' ||
      typeof frame.payload !== 'object' ||
      frame.payload === null
    ) {
      ws.send(
        JSON.stringify({
          id: typeof frame.id === 'string' ? frame.id : '',
          ok: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '帧必须包含字符串 id/type 与对象 payload',
          },
        }),
      )
      return
    }
    try {
      const result = await this.opts.handler(frame.type, frame.payload, { ws, origin })
      ws.send(JSON.stringify({ id: frame.id, ok: true, payload: result ?? {} }))
    } catch (err) {
      const code = extractErrorCode(err)
      const message = err instanceof Error ? err.message : '内部错误'
      this.opts.logger?.error('消息处理失败', { type: frame.type, code, message })
      ws.send(JSON.stringify({ id: frame.id, ok: false, error: { code, message } }))
    }
  }

  private reply(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
}

/** 桌面端 → 浏览器链路的断开/超时信号；code 供表现为协议文案 */
export class SessionDisconnected extends Error {
  readonly code = 'SESSION_DISCONNECTED'
  constructor(message: string) {
    super(message)
    this.name = 'SessionDisconnected'
  }
}

/** 业务处理器抛出 ProtocolFailure 时透传其 code；其余异常统一 INTERNAL */
function extractErrorCode(err: unknown): ServerErrorCode {
  if (err instanceof ProtocolFailure) return err.code
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code
    if (typeof code === 'string') return code as ServerErrorCode
  }
  return 'INTERNAL'
}

// 供外部读取监听地址（保留以备排查）
export function describeAddress(http: HttpServer): number {
  return (http.address() as AddressInfo).port
}
