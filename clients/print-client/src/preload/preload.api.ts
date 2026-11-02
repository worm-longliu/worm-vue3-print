// renderer 侧 window.wormPrint 的全局类型声明（仅类型，无运行时代码）。
import type { AppConfig, LogLevel } from '../main/config.js'
import type { LogEntry } from '../main/logger.js'
import type { JobRecord } from '../main/job-history.js'
import type { PrinterInfo } from '@worm-vue3-print/core/client'

/** AI 助手（MCP）状态：设置页「AI 助手」区展示 */
export interface McpState {
  enabled: boolean
  /** 实际本地回环 URL：http://127.0.0.1:<实际端口>/mcp */
  url: string
  /** pairingToken 已就绪（开启 MCP 即展示 Bearer 配置） */
  tokenReady: boolean
  sessions: Array<{
    sessionId: string
    name: string
    url: string
    templateName?: string
    lastActiveAt: number
  }>
}

declare global {
  interface Window {
    wormPrint: {
      getState: () => Promise<{
        config: AppConfig
        port: number
        version: string
        pdfDir: string
        mcp: McpState
      }>
      getMcpState: () => Promise<McpState>
      saveConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>
      listPrinters: () => Promise<PrinterInfo[]>
      testPrint: (printerName?: string) => Promise<void>
      listHistory: () => Promise<JobRecord[]>
      openPdfDir: (dir?: string) => Promise<string>
      pickPdfDir: () => Promise<string>
      /** 在文件管理器中定位（选中）该 PDF 文件 */
      openPdfFile: (path: string) => Promise<void>
      onLog: (cb: (entry: LogEntry) => void) => () => void
      onJob: (cb: (record: JobRecord) => void) => () => void
    }
  }
}

export type { LogLevel }
