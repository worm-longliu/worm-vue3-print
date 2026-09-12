import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WsTransport } from './transport.js'
import { WormPrintError } from './errors.js'
import { MESSAGE_TYPES } from './protocol.js'

// ─── 最小 WebSocket 替身 ───
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static failAll = false
  static lastToken: string | undefined
  url: string
  readyState = 0 // WebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((ev?: unknown) => void) | null = null
  sent: string[] = []
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  // 测试辅助：模拟服务端
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
  closeRemote() {
    this.readyState = 3
    this.onclose?.()
  }
  send(data: string) {
    this.sent.push(data)
    const frame = JSON.parse(data)
    if (frame.type === MESSAGE_TYPES.HELLO) {
      queueMicrotask(() =>
        this.emit({
          id: frame.id,
          ok: true,
          payload: {
            app: 'worm-print-client',
            version: '0.1.0',
            port: Number(new URL(this.url).port),
          },
        }),
      )
    }
  }
}

function setupTransport(opts?: { timeoutMs?: number; token?: string; ports?: number[] }) {
  FakeWebSocket.instances = []
  FakeWebSocket.failAll = false
  return new WsTransport({
    ...opts,
    // 注入测试替身（FakeWebSocket 结构兼容 WebSocket 构造器）
    WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
  })
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('WsTransport.connect', () => {
  it('首个端口握手失败时自动探测下一端口，直到成功', async () => {
    const t = setupTransport()
    const p = t.connect()
    // 第一个端口直接失败（客户端未运行）
    FakeWebSocket.instances[0]!.onerror?.(new Event('error'))
    FakeWebSocket.instances[0]!.closeRemote()
    // 让出微任务，使 connect 的 catch 推进并创建下一个候选端口
    await Promise.resolve()
    // 第二个端口成功
    FakeWebSocket.instances[1]!.open()
    const hello = await p
    expect(hello.app).toBe('worm-print-client')
    expect(hello.port).toBe(17522)
    expect(t.status).toBe('connected')
  })

  it('全部端口失败时以 CLIENT_NOT_RUNNING 拒绝', async () => {
    // 只探测 2 个端口并让两个实例依次失败，避免时序不稳定
    const t = setupTransport({ ports: [9001, 9002] })
    const p = t.connect()
    FakeWebSocket.instances[0]!.onerror?.(new Event('error'))
    await Promise.resolve()
    FakeWebSocket.instances[1]!.onerror?.(new Event('error'))
    await expect(p).rejects.toMatchObject({ code: 'CLIENT_NOT_RUNNING' })
  })

  it('开启 token 时连接 URL 携带查询参数', async () => {
    const t = setupTransport({ token: 'abc123' })
    const p = t.connect()
    expect(FakeWebSocket.instances[0]!.url).toContain('token=abc123')
    FakeWebSocket.instances[0]!.open()
    await p
  })
})

describe('WsTransport.request', () => {
  async function connectedTransport() {
    const t = setupTransport({ timeoutMs: 1000 })
    const p = t.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    return { t, ws: FakeWebSocket.instances[0]! }
  }

  it('成功响应按 id 匹配并 resolve payload', async () => {
    const { t, ws } = await connectedTransport()
    const pending = t.request<{ printers: [] }>(MESSAGE_TYPES.PRINTERS_LIST, {})
    const frame = JSON.parse(ws.sent.find(s => s.includes('printers.list'))!)
    ws.emit({ id: frame.id, ok: true, payload: { printers: [] } })
    await expect(pending).resolves.toEqual({ printers: [] })
  })

  it('服务端错误响应 reject 为带 code 的 WormPrintError', async () => {
    const { t, ws } = await connectedTransport()
    const pending = t.request(MESSAGE_TYPES.PRINT_SUBMIT, {})
    const frame = JSON.parse(ws.sent[ws.sent.length - 1]!)
    ws.emit({ id: frame.id, ok: false, error: { code: 'BUSY', message: '打印中' } })
    await expect(pending).rejects.toBeInstanceOf(WormPrintError)
    await expect(pending).rejects.toMatchObject({ code: 'BUSY' })
  })

  it('超时未响应以 CLIENT_TIMEOUT 拒绝', async () => {
    const { t } = await connectedTransport()
    vi.useFakeTimers()
    const pending = t.request(MESSAGE_TYPES.PRINTERS_LIST, {}, 500)
    // 先附加 rejection 订阅，再推进假定时器，避免触发 unhandled rejection
    const assertion = expect(pending).rejects.toMatchObject({ code: 'CLIENT_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(501)
    await assertion
  })
})
