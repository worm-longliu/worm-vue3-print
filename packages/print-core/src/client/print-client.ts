import {
  WsTransport,
  type TransportOptions,
  type TransportStatus,
  type ServerRequestHandler,
} from './transport.js'
import {
  MESSAGE_TYPES,
  type HelloResponsePayload,
  type PrinterInfo,
  type PrintOptions,
  type PrintSubmitRequest,
  type PrintSubmitHtmlRequest,
  type PrintSubmitResponsePayload,
  type PrintersListResponsePayload,
  type RenderedHtmlPages,
  type TemplateAttachRequest,
  type TemplateAttachResponsePayload,
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

  /**
   * 注册桌面端主动请求（template.get / template.apply 等模板会话协议）的处理器。
   * 传 null 注销；抛错时错误码（如 REVISION_CONFLICT）随失败响应帧回传桌面端。
   */
  setRequestHandler(handler: ServerRequestHandler | null): void {
    this.transport.setRequestHandler(handler)
  }

  /** 枚举本机打印机 */
  async listPrinters(): Promise<PrinterInfo[]> {
    const res = await this.transport.request<PrintersListResponsePayload>(
      MESSAGE_TYPES.PRINTERS_LIST,
      {},
    )
    return res.printers
  }

  /** 通用协议请求：承载 print/printers 之外的协议消息（如 template.attach） */
  request<T = unknown>(type: string, payload: unknown, timeoutMs?: number): Promise<T> {
    return this.transport.request<T>(type, payload, timeoutMs)
  }

  /** 模板会话：向桌面端注册本页（重连成功后需重新调用） */
  attachTemplate(payload: TemplateAttachRequest): Promise<TemplateAttachResponsePayload> {
    return this.request(MESSAGE_TYPES.TEMPLATE_ATTACH, payload)
  }

  /** 模板会话：注销本页（页面卸载时调用；连接关闭后桌面端也会自动回收） */
  detachTemplate(sessionId: string): Promise<Record<string, never>> {
    return this.request(MESSAGE_TYPES.TEMPLATE_DETACH, { sessionId })
  }

  /**
   * 提交静默打印任务。
   * @param templateJson core 模板 JSON
   * @param printData 业务数据
   * @param options 打印机/纸张/份数等；baseUrl 为相对图片资源基址，fontBaseUrl 为相对字体资源基址
   *   （字体常在 CDN/前端站点，与图片不在同一域时需单独指定）；timeoutMs 可单独放宽大任务
   * @param templateName 模板名称，透传给客户端用于任务记录
   */
  print(
    templateJson: Record<string, unknown>,
    printData?: Record<string, unknown> | Array<Record<string, unknown>>,
    options: PrintOptions & { baseUrl?: string; fontBaseUrl?: string; timeoutMs?: number } = {},
    templateName?: string,
  ): Promise<PrintSubmitResponsePayload> {
    const { baseUrl, fontBaseUrl, timeoutMs, ...print } = options
    const payload: PrintSubmitRequest = { templateJson, printData, baseUrl, fontBaseUrl, print }
    if (typeof templateName === 'string' && templateName.trim().length > 0) {
      payload.templateName = templateName
    }
    return this.transport.request<PrintSubmitResponsePayload>(
      MESSAGE_TYPES.PRINT_SUBMIT,
      payload,
      timeoutMs,
    )
  }

  /**
   * 提交浏览器侧预渲染结果静默打印（print.submitHtml）。
   *
   * 业务页先用 @worm-vue3-print/core/browser 的 renderHtmlPages 在浏览器内完成
   * 两遍渲染，再调用本方法把最终 HTML 直送客户端；客户端不再执行模板渲染。
   *
   * @param rendered renderHtmlPages 返回值（html/paperMm/continuous/pageCount）
   * @param options 打印机/纸张/份数等；timeoutMs 可单独放宽大任务
   * @param templateName 模板名称，透传给客户端用于任务记录
   */
  printHtml(
    rendered: RenderedHtmlPages,
    options: { timeoutMs?: number } & Omit<PrintOptions, 'paperSize' | 'margins' | 'landscape'> = {},
    templateName?: string,
  ): Promise<PrintSubmitResponsePayload> {
    const { timeoutMs, ...print } = options
    const payload: PrintSubmitHtmlRequest = {
      html: rendered.html,
      paperMm: rendered.paperMm,
      continuous: rendered.continuous,
      pageCount: rendered.pageCount,
      print,
    }
    if (typeof templateName === 'string' && templateName.trim().length > 0) {
      payload.templateName = templateName
    }
    return this.transport.request<PrintSubmitResponsePayload>(
      MESSAGE_TYPES.PRINT_SUBMIT_HTML,
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
