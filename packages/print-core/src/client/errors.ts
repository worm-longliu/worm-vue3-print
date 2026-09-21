import type { ProtocolErrorCode } from './protocol.js'

/** 协议/SDK 错误：携带可程序化处理的错误码 */
export class WormPrintError extends Error {
  readonly code: ProtocolErrorCode
  constructor(code: ProtocolErrorCode, message: string) {
    super(message)
    this.name = 'WormPrintError'
    this.code = code
  }
}
