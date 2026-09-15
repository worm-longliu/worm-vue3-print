// 配置窗口：注册设置 IPC、推送实时日志与任务事件；单例窗口。
import { BrowserWindow, ipcMain, app, shell, dialog } from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { SETTINGS_IPC } from '../shared/settings-protocol.js'
import type { ConfigStore, AppConfig } from './config.js'
import { generatePairingToken } from './config.js'
import { applyAutoStart } from './auto-start.js'
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
  /** 保留 PDF 的输出目录（排查用） */
  getPdfDir: () => string
}

export class MainWindowManager {
  private win: BrowserWindow | null = null

  constructor(private readonly deps: MainWindowDeps) {}

  registerIpc(): void {
    ipcMain.handle(SETTINGS_IPC.GET_STATE, () => ({
      config: this.deps.configStore.current,
      port: this.deps.getPort(),
      version: app.getVersion(),
      pdfDir: this.deps.getPdfDir(),
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
      applyAutoStart(app, saved.autoStart, this.deps.logger)
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

    ipcMain.handle(SETTINGS_IPC.OPEN_PDF_DIR, async (_e, dir?: string) => {
      // 未传或传入非法值时回退到当前实际生效的输出目录
      const target = typeof dir === 'string' && dir.trim() ? dir.trim() : this.deps.getPdfDir()
      // 目录可能还没创建（还没跑过保留 PDF 的打印任务），先确保存在再打开
      try {
        mkdirSync(target, { recursive: true })
      } catch (e) {
        throw new Error(`无法创建目录（${target}）：${(e as Error).message}`)
      }
      const err = await shell.openPath(target)
      if (err) throw new Error(`打开目录失败：${err}（路径：${target}）`)
      this.deps.logger.info('已打开 PDF 目录', { dir: target })
      return target
    })

    ipcMain.handle(SETTINGS_IPC.PICK_PDF_DIR, async () => {
      const options = {
        title: '选择 PDF 保存目录',
        defaultPath: this.deps.getPdfDir(),
        properties: ['openDirectory', 'createDirectory'] as const,
      }
      const result = this.win
        ? await dialog.showOpenDialog(this.win, options)
        : await dialog.showOpenDialog(options)
      return result.canceled || result.filePaths.length === 0 ? '' : result.filePaths[0]
    })

    ipcMain.handle(SETTINGS_IPC.OPEN_PDF_FILE, async (_e, path?: unknown) => {
      const file = typeof path === 'string' ? path.trim() : ''
      if (!file) throw new Error('缺少 PDF 文件路径')
      if (!existsSync(file) || !statSync(file).isFile()) {
        throw new Error('PDF 文件已不存在，可能已随打印任务自动清理')
      }
      shell.showItemInFolder(file)
      this.deps.logger.info('已在目录中定位 PDF', { path: file })
    })
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
