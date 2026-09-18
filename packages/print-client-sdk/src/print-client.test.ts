import { describe, it, expect } from 'vitest'
import { PrintClient } from './print-client.js'
import { MESSAGE_TYPES } from './protocol.js'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
  send(data: string) {
    this.sent.push(data)
    const frame = JSON.parse(data)
    queueMicrotask(() => {
      if (frame.type === MESSAGE_TYPES.HELLO) {
        this.emit({ id: frame.id, ok: true, payload: { app: 'worm-print-client', version: '0.1.0', port: 17521 } })
      } else if (frame.type === MESSAGE_TYPES.PRINTERS_LIST) {
        this.emit({ id: frame.id, ok: true, payload: { printers: [{ name: 'PDF', isDefault: true, status: 'idle' }] } })
      } else if (frame.type === MESSAGE_TYPES.FONTS_LIST) {
        this.emit({ id: frame.id, ok: true, payload: { available: true, fonts: ['KaiTi', 'SimSun'] } })
      } else if (frame.type === MESSAGE_TYPES.PRINT_SUBMIT) {
        this.emit({ id: frame.id, ok: true, payload: { jobId: 'job-1' } })
      } else if (frame.type === MESSAGE_TYPES.PRINT_SUBMIT_HTML) {
        this.emit({ id: frame.id, ok: true, payload: { jobId: 'job-html-1' } })
      }
    })
  }
}

function makeClient() {
  FakeWebSocket.instances = []
  const client = new PrintClient({
    // 注入测试替身（FakeWebSocket 结构兼容 WebSocket 构造器）
    WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
  })
  return { client }
}

// 浏览器环境 localStorage 替身（happy-dom/vitest 默认提供；防御性兜底）
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  })
}

describe('PrintClient', () => {
  it('connect 后 listPrinters 返回打印机数组', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    const printers = await client.listPrinters()
    expect(printers).toEqual([{ name: 'PDF', isDefault: true, status: 'idle' }])
  })

  it('connect 后 listFonts 返回本机字体清单', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    await expect(client.listFonts()).resolves.toEqual({
      available: true,
      fonts: ['KaiTi', 'SimSun'],
    })
  })

  it('print 组装 print.submit payload 并返回 jobId', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    const ws = FakeWebSocket.instances[0]!
    const result = await client.print(
      { paperSize: 'A4' },
      { orderNo: 'A001' },
      { printerName: '热敏-80', copies: 2, baseUrl: 'http://example.com' },
    )
    expect(result.jobId).toBe('job-1')
    expect(lastSubmitPayload(ws)).toMatchObject({
      templateJson: { paperSize: 'A4' },
      printData: { orderNo: 'A001' },
      baseUrl: 'http://example.com',
      print: { printerName: '热敏-80', copies: 2 },
    })
  })

  it('print 传入第 4 参数 templateName 时写入 payload', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    const ws = FakeWebSocket.instances[0]!
    await client.print({ paperSize: 'A4' }, { orderNo: 'A001' }, {}, '采购收货单')
    const payload = lastSubmitPayload(ws) as Record<string, unknown>
    expect(payload.templateName).toBe('采购收货单')
  })

  it('print 不传 templateName 时 payload 不带该字段', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    const ws = FakeWebSocket.instances[0]!
    await client.print({ paperSize: 'A4' }, { orderNo: 'A001' }, {})
    const payload = lastSubmitPayload(ws) as Record<string, unknown>
    expect(payload).not.toHaveProperty('templateName')
  })

  it('print 传入空白 templateName 时 payload 不带该字段', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    const ws = FakeWebSocket.instances[0]!
    await client.print({ paperSize: 'A4' }, { orderNo: 'A001' }, {}, '   ')
    const payload = lastSubmitPayload(ws) as Record<string, unknown>
    expect(payload).not.toHaveProperty('templateName')
  })

  it('printHtml 组装 print.submitHtml payload 并返回 jobId', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    const ws = FakeWebSocket.instances[0]!
    const result = await client.printHtml(
      {
        html: '<html><body>x</body></html>',
        paperMm: { width: 80, height: 120.5 },
        continuous: false,
        pageCount: 2,
      },
      { printerName: '热敏-80', copies: 1 },
      '采购收货单',
    )
    expect(result.jobId).toBe('job-html-1')
    const frame = ws.sent.map(s => JSON.parse(s)).find(f => f.type === MESSAGE_TYPES.PRINT_SUBMIT_HTML)
    expect(frame.payload).toMatchObject({
      html: '<html><body>x</body></html>',
      paperMm: { width: 80, height: 120.5 },
      continuous: false,
      pageCount: 2,
      templateName: '采购收货单',
      print: { printerName: '热敏-80', copies: 1 },
    })
    // 纸张覆盖项不得进入 print（已固化在 HTML 中）
    expect(frame.payload.print).not.toHaveProperty('paperSize')
    expect(frame.payload.print).not.toHaveProperty('margins')
  })

  it('printHtml 缺省 templateName 时 payload 不带该字段', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    const ws = FakeWebSocket.instances[0]!
    await client.printHtml({ html: '<html></html>', paperMm: { width: 80, height: 297 } })
    const frame = ws.sent.map(s => JSON.parse(s)).find(f => f.type === MESSAGE_TYPES.PRINT_SUBMIT_HTML)
    expect(frame.payload).not.toHaveProperty('templateName')
    expect(frame.payload.continuous).toBeUndefined()
  })

  it('pair 写入 localStorage，重建客户端时自动带上 token', async () => {
    const { client } = makeClient()
    client.pair('tok-xyz')
    expect(PrintClient.loadStoredToken()).toBe('tok-xyz')
    const { client: client2 } = makeClient()
    const p = client2.connect()
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!
    expect(ws.url).toContain('token=tok-xyz')
    ws.open()
    await p
  })
})

// 测试辅助：从替身已发帧中取最后一个 print.submit 的 payload
function lastSubmitPayload(ws: FakeWebSocket): unknown {
  const frames = ws.sent.map(s => JSON.parse(s))
  return frames.find(f => f.type === MESSAGE_TYPES.PRINT_SUBMIT)?.payload
}
