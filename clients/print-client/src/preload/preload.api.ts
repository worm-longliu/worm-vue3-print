// renderer 侧 window.wormPrint 的全局类型声明（仅类型，无运行时代码）。
import type { AppConfig, LogLevel } from '../main/config.js'
import type { LogEntry } from '../main/logger.js'
import type { JobRecord } from '../main/job-history.js'
import type { PrinterInfo } from '@worm-vue3-print/client'

declare global {
  interface Window {
    wormPrint: {
      getState: () => Promise<{ config: AppConfig; port: number; version: string }>
      saveConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>
      listPrinters: () => Promise<PrinterInfo[]>
      testPrint: (printerName?: string) => Promise<void>
      listHistory: () => Promise<JobRecord[]>
      onLog: (cb: (entry: LogEntry) => void) => () => void
      onJob: (cb: (record: JobRecord) => void) => () => void
    }
  }
}

export type { LogLevel }
