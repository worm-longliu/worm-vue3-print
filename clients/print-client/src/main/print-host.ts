// 打印机枚举专用常驻隐藏窗口：不承载模板 HTML，只提供一个 webContents。
import { BrowserWindow } from 'electron'

let host: BrowserWindow | null = null

export function getPrintHostWindow(): BrowserWindow {
  if (host && !host.isDestroyed()) return host
  host = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  void host.loadURL('about:blank')
  return host
}

export function destroyPrintHostWindow(): void {
  if (host && !host.isDestroyed()) host.destroy()
  host = null
}
