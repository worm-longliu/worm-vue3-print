// 仅绑定回环地址的 WebSocket 服务：端口递增、握手鉴权、JSON 协议帧分发。
import { WebSocketServer, WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import type { ServerErrorCode } from '@worm-vue3-print/client'
import type { Logger } from './logger.js'
import { ProtocolFailure } from './protocol-error.js'

export type AccessFn = (input: { origin?: string; token?: string }) =>
  | { ok: true }
  | { ok: false; code: 'UNAUTHORIZED'; message: string }

export type MessageHandler = (type: string, payload: unknown) => Promise<unknown>

export interface WsServerOptions {
  preferredPort: number
  scanLimit?: number
  host?: string
  handler: MessageHandler
  checkAccess: AccessFn
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>
}

const UNAUTHORIZED_CLOSE_CODE = 4401

export class WsServer {
  private wss: WebSocketServer | null = null
  private actualPort = 0

  constructor(private readonly opts: WsServerOptions) {}

  /** 启动服务；端口被占用时自动 +1；全部失败抛错 */
  async start(): Promise<number> {
    const limit = this.opts.scanLimit ?? 20
    for (let offset = 0; offset < limit; offset++) {
      const port = this.opts.preferredPort + offset
      try {
        await this.listen(port)
        this.actualPort = port
        this.opts.logger?.info(`WebSocket 服务已监听 ws://127.0.0.1:${port}`)
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

  async stop(): Promise<void> {
    await new Promise<void>(resolve => {
      if (!this.wss) return resolve()
      const wss = this.wss
      for (const ws of wss.clients) ws.terminate()
      wss.close(() => resolve())
    })
    this.wss = null
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: this.opts.host ?? '127.0.0.1', port })
      this.wss = wss
      wss.once('listening', () => {
        wss.off('error', reject)
        resolve()
      })
      wss.once('error', reject)
      wss.on('connection', (ws, req) => {
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
        this.bindConnection(ws)
      })
    })
  }

  private bindConnection(ws: WebSocket): void {
    ws.on('message', async raw => {
      let frame: { id?: unknown; type?: unknown; payload?: unknown }
      try {
        frame = JSON.parse(raw.toString())
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
        const result = await this.opts.handler(frame.type, frame.payload)
        ws.send(JSON.stringify({ id: frame.id, ok: true, payload: result ?? {} }))
      } catch (err) {
        const code = extractErrorCode(err)
        const message = err instanceof Error ? err.message : '内部错误'
        this.opts.logger?.error('消息处理失败', { type: frame.type, code, message })
        ws.send(JSON.stringify({ id: frame.id, ok: false, error: { code, message } }))
      }
    })
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
export function describeAddress(wss: WebSocketServer): number {
  return (wss.address() as AddressInfo).port
}
