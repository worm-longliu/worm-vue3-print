// 桌面客户端内部工具库：只导出，不启动任何 transport。
import { version } from './version.js'

export { version }
export { createDesktopPrintMcpServer } from './server.js'
export { TOOLS } from './tools.js'
export { createTemplateSessionTools, unwrapTemplateShell } from './template-session-tools.js'
export type {
  TemplateSessionBridge,
  OpenTemplateSession,
  GetOpenTemplateResult,
} from './template-session-tools.js'
export type { ToolDef, ToolResult } from './tool-types.js'
export { asText, asError } from './tool-types.js'
