// 配置窗口唯一桥接层：contextIsolation 开启，白名单暴露最小 API。
import { contextBridge, ipcRenderer } from 'electron'
import { SETTINGS_IPC } from '../shared/settings-protocol.js'

const api = {
  getState: () => ipcRenderer.invoke(SETTINGS_IPC.GET_STATE),
  saveConfig: (patch: unknown) => ipcRenderer.invoke(SETTINGS_IPC.SAVE_CONFIG, patch),
  listPrinters: () => ipcRenderer.invoke(SETTINGS_IPC.LIST_PRINTERS),
  testPrint: (printerName?: string) =>
    ipcRenderer.invoke(SETTINGS_IPC.TEST_PRINT, printerName),
  listHistory: () => ipcRenderer.invoke(SETTINGS_IPC.LIST_HISTORY),
  openPdfDir: () => ipcRenderer.invoke(SETTINGS_IPC.OPEN_PDF_DIR),
  onLog: (cb: (entry: unknown) => void) => {
    const listener = (_e: unknown, entry: unknown) => cb(entry)
    ipcRenderer.on(SETTINGS_IPC.LOG_EVENT, listener)
    return () => ipcRenderer.off(SETTINGS_IPC.LOG_EVENT, listener)
  },
  onJob: (cb: (record: unknown) => void) => {
    const listener = (_e: unknown, record: unknown) => cb(record)
    ipcRenderer.on(SETTINGS_IPC.JOB_EVENT, listener)
    return () => ipcRenderer.off(SETTINGS_IPC.JOB_EVENT, listener)
  },
}

contextBridge.exposeInMainWorld('wormPrint', api)
export type WormPrintApi = typeof api
