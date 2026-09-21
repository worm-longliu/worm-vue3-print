import type { ServerErrorCode } from '@worm-vue3-print/core/client'

/** 处理器抛出本错误时，WS 层以其 code 回协议错误帧；其他异常统一为 INTERNAL */
export class ProtocolFailure extends Error {
  constructor(
    readonly code: ServerErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ProtocolFailure'
  }
}
