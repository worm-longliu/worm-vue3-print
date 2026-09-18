// 协议消息分发：type → 业务处理。未知消息按协议返回 INVALID_REQUEST。
import { MESSAGE_TYPES } from '@worm-vue3-print/client'
import type { PrinterService } from './printer-service.js'
import type { PrintEngine } from './print-engine.js'
import { ProtocolFailure } from './protocol-error.js'
import type { MessageHandler } from './ws-server.js'

export interface MessageHandlerDeps {
  appId: string
  version: string
  getPort: () => number
  printerService: PrinterService
  printEngine: PrintEngine
}

export function makeMessageHandler(deps: MessageHandlerDeps): MessageHandler {
  return async (type, payload) => {
    switch (type) {
      case MESSAGE_TYPES.HELLO:
        return { app: deps.appId, version: deps.version, port: deps.getPort() }
      case MESSAGE_TYPES.PRINTERS_LIST:
        return { printers: await deps.printerService.list() }
      case MESSAGE_TYPES.PRINT_SUBMIT:
        return deps.printEngine.submit(payload)
      case MESSAGE_TYPES.PRINT_SUBMIT_HTML:
        return deps.printEngine.submitHtml(payload)
      default:
        throw new ProtocolFailure('INVALID_REQUEST', `未知消息类型：${type}`)
    }
  }
}
