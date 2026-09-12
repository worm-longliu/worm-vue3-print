// 客户端与桌面端共享的 WebSocket 协议唯一事实源。
// 帧：请求 { id, type, payload }；响应 { id, ok, payload | error }。

export const APP_ID = 'worm-print-client'
export const DEFAULT_PORT = 17521
export const PORT_SCAN_LIMIT = 20

/** 服务端可能返回的错误码 */
export type ServerErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'PRINTER_NOT_FOUND'
  | 'PRINTER_OFFLINE'
  | 'BUSY'
  | 'RENDER_TIMEOUT'
  | 'PRINT_FAILED'
  | 'INTERNAL'

/** SDK 本地产生的错误码（服务端不会发送） */
export type ClientErrorCode = 'CLIENT_TIMEOUT' | 'CLIENT_NOT_RUNNING'

export type ProtocolErrorCode = ServerErrorCode | ClientErrorCode

// ─── 基础帧 ───

export interface ClientRequest<T = unknown> {
  id: string
  type: string
  payload: T
}

export interface ServerOk<T = unknown> {
  id: string
  ok: true
  payload: T
}

export interface ServerError {
  id: string
  ok: false
  error: { code: ServerErrorCode; message: string }
}

export type ServerResponse<T = unknown> = ServerOk<T> | ServerError

/** 无法解析的服务端消息 */
export interface MalformedMessage {
  malformed: true
}

// ─── 业务消息 payload ───

export interface PrinterInfo {
  name: string
  isDefault: boolean
  /** 系统返回的打印机状态描述（如 idle、offline），无信息时为空串 */
  status: string
}

export interface HelloRequestPayload {}

export interface HelloResponsePayload {
  app: typeof APP_ID
  version: string
  port: number
}

export interface PrintersListResponsePayload {
  printers: PrinterInfo[]
}

/** 打印参数；长度单位均为微米（1mm = 1000μm） */
export interface PrintOptions {
  /** 缺省走系统默认打印机 */
  printerName?: string
  copies?: number
  /** 打印机驱动内已配置纸型名，针式打印机优先使用 */
  paperName?: string
  /**
   * 纸张覆盖项（微米）。
   * - 普通模板：缺省（或仅给 width）时以模板自带纸张（getPaperDimensions）为准；
   * - 连续纸模板（templateJson.paperSize === 'CONTINUOUS'）：高度缺省或 <=0 时按渲染探针
   *   测得的内容高度＋连续纸底边距推导实际纸高；显式 height>0 为配置覆盖（逃生门）。
   *   宽度缺省取模板 customWidth（默认 80mm）。
   */
  paperSize?: { width?: number; height?: number }
  landscape?: boolean
  /**
   * 页边距覆盖（微米）；缺省使用模板 margins。
   * 连续纸的末尾留白由模板连续纸底边距（默认 0）控制，已计入推导纸高。
   */
  margins?: { top: number; bottom: number; left: number; right: number }
  color?: boolean
  pageRanges?: Array<{ from: number; to: number }>
}

/** print.submit 请求 payload；templateJson 结构由 core 定义，这里保持松散耦合 */
export interface PrintSubmitRequest {
  templateJson: Record<string, unknown>
  printData?: Record<string, unknown>
  /** 相对路径图片资源解析基址 */
  baseUrl?: string
  print: PrintOptions
}

export interface PrintSubmitResponsePayload {
  jobId: string
}

// ─── 消息 type 常量 ───

export const MESSAGE_TYPES = {
  HELLO: 'hello',
  PRINTERS_LIST: 'printers.list',
  PRINT_SUBMIT: 'print.submit',
} as const

// ─── 编解码 ───

let seq = 0
function nextId(): string {
  seq = (seq + 1) % Number.MAX_SAFE_INTEGER
  return `${Date.now().toString(36)}-${seq.toString(36)}`
}

/** 编码请求帧为 JSON 字符串 */
export function encodeRequest<T>(type: string, payload: T): string {
  const frame: ClientRequest<T> = { id: nextId(), type, payload }
  return JSON.stringify(frame)
}

/** 解码服务端消息；任何非法输入统一返回 { malformed: true }，不抛异常 */
export function decodeServerMessage(raw: string): ServerResponse | MalformedMessage {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { malformed: true }
  }
  if (typeof data !== 'object' || data === null) return { malformed: true }
  const obj = data as Record<string, unknown>
  if (typeof obj.id !== 'string' || typeof obj.ok !== 'boolean') return { malformed: true }
  if (obj.ok) {
    return { id: obj.id, ok: true, payload: (obj.payload ?? {}) as unknown }
  }
  const err = obj.error as Record<string, unknown> | undefined
  if (!err || typeof err.code !== 'string' || typeof err.message !== 'string') {
    return { malformed: true }
  }
  return {
    id: obj.id,
    ok: false,
    error: { code: err.code as ServerErrorCode, message: err.message },
  }
}
