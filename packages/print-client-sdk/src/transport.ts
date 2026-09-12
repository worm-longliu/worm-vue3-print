import {
  DEFAULT_PORT,
  PORT_SCAN_LIMIT,
  encodeRequest,
  decodeServerMessage,
  type ClientRequest,
  type HelloResponsePayload,
} from './protocol.js'
import { WormPrintError } from './errors.js'

export type TransportStatus = 'disconnected' | 'connecting' | 'connected'

export interface TransportOptions {
  /** 安全开关开启后的配对 token */
  token?: string
  /** 请求默认超时（毫秒），默认 15000 */
  timeoutMs?: number
  /** 覆盖探测端口列表（测试用）；默认 DEFAULT_PORT 起连续 PORT_SCAN_LIMIT 个 */
  ports?: number[]
  /** 注入 WebSocket 构造器（测试用） */
  WebSocketCtor?: typeof WebSocket
}

interface PendingRequest {
  resolve: (payload: unknown) => void
  reject: (err: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

/** 探测期间的内部信号：服务端明确拒绝鉴权，应停止端口探测 */
class AuthRejectedError extends Error {
  readonly code = 'UNAUTHORIZED' as const
  constructor(message: string) {
    super(message)
    this.name = 'AuthRejectedError'
  }
}

export class WsTransport {
  private ws: WebSocket | null = null
  private status_: TransportStatus = 'disconnected'
  private hello: HelloResponsePayload | null = null
  private pendings = new Map<string, PendingRequest>()
  private statusCbs = new Set<(s: TransportStatus) => void>()
  private manualClose = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private readonly ctor: typeof WebSocket
  private readonly defaultTimeout: number
  private opts: TransportOptions

  constructor(opts: TransportOptions = {}) {
    this.opts = opts
    this.ctor = opts.WebSocketCtor ?? WebSocket
    this.defaultTimeout = opts.timeoutMs ?? 15_000
  }

  get status(): TransportStatus {
    return this.status_
  }

  onStatus(cb: (s: TransportStatus) => void): () => void {
    this.statusCbs.add(cb)
    return () => this.statusCbs.delete(cb)
  }

  setToken(token: string | undefined): void {
    this.opts = { ...this.opts, token }
  }

  /** 依次探测端口并完成 hello 握手；全部失败抛 CLIENT_NOT_RUNNING */
  async connect(signal?: AbortSignal): Promise<HelloResponsePayload> {
    if (this.status_ === 'connected' && this.hello) return this.hello
    this.setStatus('connecting')
    const ports =
      this.opts.ports ?? Array.from({ length: PORT_SCAN_LIMIT }, (_, i) => DEFAULT_PORT + i)

    for (const port of ports) {
      if (signal?.aborted) throw new WormPrintError('CLIENT_NOT_RUNNING', '连接已取消')
      try {
        this.hello = await this.tryPort(port, signal)
        this.manualClose = false
        this.reconnectAttempts = 0
        this.setStatus('connected')
        return this.hello
      } catch (err) {
        if (err instanceof AuthRejectedError) {
          this.setStatus('disconnected')
          throw new WormPrintError(
            'UNAUTHORIZED',
            err.message || '配对 token 无效或来源未授权',
          )
        }
        // 该端口无客户端，继续探测下一个
      }
    }
    this.setStatus('disconnected')
    throw new WormPrintError(
      'CLIENT_NOT_RUNNING',
      '未发现运行中的打印客户端（已探测默认端口区间），请确认客户端已启动',
    )
  }

  /** 发送请求并等待同 id 响应 */
  request<T>(type: string, payload: unknown, timeoutMs?: number): Promise<T> {
    if (this.status_ !== 'connected' || !this.ws) {
      return Promise.reject(new WormPrintError('CLIENT_NOT_RUNNING', '打印客户端未连接'))
    }
    const raw = encodeRequest(type, payload)
    const frame = JSON.parse(raw) as ClientRequest
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendings.delete(frame.id)
        reject(new WormPrintError('CLIENT_TIMEOUT', `请求 ${type} 超时未响应`))
      }, timeoutMs ?? this.defaultTimeout)
      this.pendings.set(frame.id, {
        resolve: resolve as (p: unknown) => void,
        reject,
        timer,
      })
      this.ws!.send(raw)
    })
  }

  close(): void {
    this.manualClose = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.ws?.close()
    this.failAllPendings(new WormPrintError('CLIENT_NOT_RUNNING', '连接已关闭'))
    this.setStatus('disconnected')
  }

  // ─── 内部 ───

  private buildUrl(port: number): string {
    const url = new URL(`ws://127.0.0.1:${port}`)
    if (this.opts.token) url.searchParams.set('token', this.opts.token)
    return url.toString().replace(/\/$/, '')
  }

  private tryPort(port: number, signal?: AbortSignal): Promise<HelloResponsePayload> {
    return new Promise<HelloResponsePayload>((resolve, reject) => {
      const ws = new this.ctor(this.buildUrl(port))
      this.ws = ws
      let settled = false
      const cleanupAbort = () => {
        if (!settled) {
          settled = true
          reject(new Error('aborted'))
        }
      }
      signal?.addEventListener('abort', cleanupAbort, { once: true })

      ws.onopen = () => {
        ws.send(encodeRequest('hello', {}))
      }
      ws.onmessage = (ev: MessageEvent) => {
        const msg = decodeServerMessage(String(ev.data))
        if ('malformed' in msg) return
        if (msg.ok && isHello(msg.payload)) {
          if (settled) return
          settled = true
          this.bindLifecycle(ws)
          resolve(msg.payload as HelloResponsePayload)
        } else if (!msg.ok && msg.error.code === 'UNAUTHORIZED') {
          if (settled) return
          settled = true
          reject(new AuthRejectedError(msg.error.message))
        } else if (!settled) {
          settled = true
          reject(new Error('握手失败'))
        }
      }
      ws.onerror = () => {
        if (!settled) {
          settled = true
          reject(new Error('连接错误'))
        }
      }
      ws.onclose = () => {
        if (!settled) {
          settled = true
          reject(new Error('连接关闭'))
        }
      }
    })
  }

  /** 握手成功后绑定正式生命周期（消息分发、掉线重连） */
  private bindLifecycle(ws: WebSocket): void {
    ws.onmessage = (ev: MessageEvent) => {
      const msg = decodeServerMessage(String(ev.data))
      if ('malformed' in msg) return
      const pending = this.pendings.get(msg.id)
      if (!pending) return
      this.pendings.delete(msg.id)
      clearTimeout(pending.timer)
      if (msg.ok) {
        pending.resolve(msg.payload)
      } else {
        pending.reject(new WormPrintError(msg.error.code, msg.error.message))
      }
    }
    ws.onclose = () => {
      this.failAllPendings(new WormPrintError('CLIENT_NOT_RUNNING', '与客户端的连接中断'))
      this.hello = null
      this.ws = null
      if (!this.manualClose) this.scheduleReconnect()
    }
    ws.onerror = () => {
      /* onclose 负责收尾，避免重复处理 */
    }
  }

  private scheduleReconnect(): void {
    this.setStatus('connecting')
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts++, 10_000)
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => this.scheduleReconnect())
    }, delay)
  }

  private failAllPendings(err: unknown): void {
    for (const [, p] of this.pendings) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pendings.clear()
  }

  private setStatus(s: TransportStatus): void {
    if (this.status_ === s) return
    this.status_ = s
    for (const cb of this.statusCbs) cb(s)
  }
}

function isHello(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as Record<string, unknown>).app === 'worm-print-client'
  )
}
