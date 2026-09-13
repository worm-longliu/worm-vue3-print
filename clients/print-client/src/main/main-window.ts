// 配置窗口：注册设置 IPC、推送实时日志与任务事件；单例窗口。
import { BrowserWindow, ipcMain, app } from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { SETTINGS_IPC } from '../shared/settings-protocol.js'
import type { ConfigStore, AppConfig } from './config.js'
import { generatePairingToken } from './config.js'
import type { Logger, LogEntry } from './logger.js'
import type { JobHistoryStore, JobRecord } from './job-history.js'
import type { PrinterService } from './printer-service.js'
import type { PrintEngine } from './print-engine.js'
import { TEST_TEMPLATE } from './test-template.js'

export interface MainWindowDeps {
  configStore: ConfigStore
  logger: Logger
  history: JobHistoryStore
  printerService: PrinterService
  printEngine: PrintEngine
  getPort: () => number
}

export class MainWindowManager {
  private win: BrowserWindow | null = null

  constructor(private readonly deps: MainWindowDeps) {}

  registerIpc(): void {
    ipcMain.handle(SETTINGS_IPC.GET_STATE, () => ({
      config: this.deps.configStore.current,
      port: this.deps.getPort(),
      version: app.getVersion(),
    }))

    ipcMain.handle(SETTINGS_IPC.SAVE_CONFIG, (_e, patch: Partial<AppConfig>) => {
      const next = { ...patch }
      // 首次开启安全开关时自动生成 token
      if (next.securityEnabled && !this.deps.configStore.current.pairingToken) {
        next.pairingToken = generatePairingToken()
      }
      const restartNeeded =
        next.port !== undefined && next.port !== this.deps.getPort()
      // 端口变更需重启生效：仍保存，UI 展示提示
      const saved = this.deps.configStore.update(next)
      this.deps.logger.setLevel(saved.logLevel)
      app.setLoginItemSettings({ openAtLogin: saved.autoStart })
      if (restartNeeded) this.deps.logger.info('端口已变更，需重启客户端生效', { port: saved.port })
      else this.deps.logger.info('配置已更新')
      return saved
    })

    ipcMain.handle(SETTINGS_IPC.LIST_PRINTERS, () => this.deps.printerService.list())

    ipcMain.handle(SETTINGS_IPC.TEST_PRINT, async (_e, printerName?: string) => {
      await this.deps.printEngine.submit({
        templateJson: TEST_TEMPLATE,
        printData: {},
        print: { printerName },
      })
    })

    ipcMain.handle(SETTINGS_IPC.LIST_HISTORY, () =>
      this.deps.history.list().slice(-200).reverse(),
    )
  }

  /** 实时事件推送到已打开的窗口 */
  bindPushEvents(): void {
    this.deps.logger.onLog((entry: LogEntry) => {
      this.win?.webContents.send(SETTINGS_IPC.LOG_EVENT, entry)
    })
    this.deps.printEngine.onSettled((record: JobRecord) => {
      this.win?.webContents.send(SETTINGS_IPC.JOB_EVENT, record)
    })
  }

  show(): void {
    if (this.win) {
      if (this.win.isMinimized()) this.win.restore()
      if (!this.win.isVisible()) this.win.show()
      this.win.focus()
      return
    }
    this.win = new BrowserWindow({
      width: 860,
      height: 640,
      minWidth: 720,
      minHeight: 520,
      title: 'worm-vue3-print 打印客户端设置',
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        // 沙箱 preload 恒按 CJS 加载（规避包内 type:module 下 .js/.cjs 的 ESM 歧义），
        // 且本 preload 仅使用 electron（ipcRenderer/contextBridge），沙箱完全兼容，也更安全。
        sandbox: true,
      },
    })
    this.win.webContents.on('did-fail-load', (_e, code, desc) =>
      console.error('[settings] 页面加载失败', code, desc),
    )
    this.win.webContents.on('render-process-gone', (_e, d) =>
      console.error('[settings] 渲染进程消失', JSON.stringify(d)),
    )
    this.win.on('close', e => {
      // 关闭按钮仅隐藏到托盘，应用继续驻留；真正退出走托盘菜单（最终 app.exit 强退，不经过此处）
      e.preventDefault()
      this.win?.hide()
    })
    const url = process.env.ELECTRON_RENDERER_URL
      ? `${process.env.ELECTRON_RENDERER_URL}/renderer/index.html`
      : pathToFileURL(join(__dirname, '../renderer/renderer/index.html')).toString()
    void this.win.loadURL(url)
  }
}
