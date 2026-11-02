// 协议消息分发：type → 业务处理。未知消息按协议返回 INVALID_REQUEST。
// 打印链路四类消息保持既有行为；模板会话三类消息由注册表把关（含连接与 Origin 上下文）。
import { MESSAGE_TYPES } from '@worm-vue3-print/core/client'
import type { PrinterService } from './printer-service.js'
import type { PrintEngine } from './print-engine.js'
import type { TemplateSessionRegistry } from './template-sessions.js'
import { ProtocolFailure } from './protocol-error.js'
import type { MessageHandler } from './ws-server.js'

export interface MessageHandlerDeps {
  appId: string
  version: string
  getPort: () => number
  printerService: PrinterService
  printEngine: PrintEngine
  /** 模板会话注册表（template.attach/detach/get/apply 路由） */
  templateSessions: TemplateSessionRegistry
}

export function makeMessageHandler(deps: MessageHandlerDeps): MessageHandler {
  return async (type, payload, ctx) => {
    switch (type) {
      case MESSAGE_TYPES.HELLO:
        return { app: deps.appId, version: deps.version, port: deps.getPort() }
      case MESSAGE_TYPES.PRINTERS_LIST:
        return { printers: await deps.printerService.list() }
      case MESSAGE_TYPES.PRINT_SUBMIT:
        return deps.printEngine.submit(payload)
      case MESSAGE_TYPES.PRINT_SUBMIT_HTML:
        return deps.printEngine.submitHtml(payload)
      case MESSAGE_TYPES.TEMPLATE_ATTACH:
        return deps.templateSessions.attach(payload, ctx)
      case MESSAGE_TYPES.TEMPLATE_DETACH:
        return deps.templateSessions.detach(payload, ctx)
      default:
        throw new ProtocolFailure('INVALID_REQUEST', `未知消息类型：${type}`)
    }
  }
}
