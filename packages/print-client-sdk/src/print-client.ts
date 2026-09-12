import { WsTransport, type TransportOptions, type TransportStatus } from './transport.js'
import {
  MESSAGE_TYPES,
  type HelloResponsePayload,
  type PrinterInfo,
  type PrintOptions,
  type PrintSubmitRequest,
  type PrintSubmitResponsePayload,
  type PrintersListResponsePayload,
} from './protocol.js'

const TOKEN_STORAGE_KEY = 'worm-print-client:token'

export interface PrintClientOptions {
  /** 配对 token；不传则自动读取 localStorage 中 pair() 保存的值 */
  token?: string
  /** 单请求默认超时 ms，默认 15000 */
  timeoutMs?: number
  /** @internal 注入 WebSocket 构造器（测试用） */
  WebSocketCtor?: typeof WebSocket
}

export class PrintClient {
  private readonly transport: WsTransport

  constructor(opts: PrintClientOptions = {}) {
    const token = opts.token ?? PrintClient.loadStoredToken() ?? undefined
    const transportOpts: TransportOptions = {
      token,
      timeoutMs: opts.timeoutMs,
      WebSocketCtor: opts.WebSocketCtor,
    }
    this.transport = new WsTransport(transportOpts)
  }

  get status(): TransportStatus {
    return this.transport.status
  }

  /** 连接本机客户端（自动端口探测 + 掉线重连） */
  connect(signal?: AbortSignal): Promise<HelloResponsePayload> {
    return this.transport.connect(signal)
  }

  onStatusChange(cb: (s: TransportStatus) => void): () => void {
    return this.transport.onStatus(cb)
  }

  /** 枚举本机打印机 */
  async listPrinters(): Promise<PrinterInfo[]> {
    const res = await this.transport.request<PrintersListResponsePayload>(
      MESSAGE_TYPES.PRINTERS_LIST,
      {},
    )
    return res.printers
  }

  /**
   * 提交静默打印任务。
   * @param templateJson core 模板 JSON
   * @param printData 业务数据
   * @param options 打印机/纸张/份数等；baseUrl 为相对图片资源基址；timeoutMs 可单独放宽大任务
   */
  print(
    templateJson: Record<string, unknown>,
    printData?: Record<string, unknown>,
    options: PrintOptions & { baseUrl?: string; timeoutMs?: number } = {},
  ): Promise<PrintSubmitResponsePayload> {
    const { baseUrl, timeoutMs, ...print } = options
    const payload: PrintSubmitRequest = { templateJson, printData, baseUrl, print }
    return this.transport.request<PrintSubmitResponsePayload>(
      MESSAGE_TYPES.PRINT_SUBMIT,
      payload,
      timeoutMs,
    )
  }

  /** 保存配对 token（localStorage），并即时更新当前连接的鉴权参数（下次连接生效） */
  pair(token: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    this.transport.setToken(token)
  }

  static loadStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY)
    } catch {
      return null
    }
  }

  close(): void {
    this.transport.close()
  }
}
