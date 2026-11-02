// 库入口：只导出，不启动任何 transport（stdio 启动在 ./stdio.ts，桌面 HTTP 接线在宿主进程）。
import { version } from './version.js'

export { version }
export { createPrintMcpServer } from './server.js'
export { TOOLS } from './tools.js'
export { createDesktopPrintTools, DESKTOP_BLOCKED_TOOL_NAMES } from './desktop-tools.js'
export { createTemplateSessionTools, unwrapTemplateShell } from './template-session-tools.js'
export type {
  TemplateSessionBridge,
  OpenTemplateSession,
  GetOpenTemplateResult,
} from './template-session-tools.js'
export type { ToolDef, ToolResult } from './tool-types.js'
export { asText, asError } from './tool-types.js'
export { resolveTemplateSource } from './template-source.js'
export { readConfig } from './config.js'
