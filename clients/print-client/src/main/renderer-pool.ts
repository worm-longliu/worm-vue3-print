// 隐藏窗口管理：常驻 worker 跑 core 渲染；每任务新建打印窗口承载最终 HTML 静默打印。
import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import {
  RENDER_REQUEST_CHANNEL,
  RENDER_RESPONSE_CHANNEL,
  type RenderJobSpec,
  type RenderJobResult,
  type RenderResponse,
} from '../shared/render-protocol.js'
import { ProtocolFailure } from './protocol-error.js'
import type { Logger } from './logger.js'

const RENDER_TIMEOUT_MS = 30_000

/** 打印 HTML 临时目录（标准 file:// 协议加载，打印完删除单文件） */
const PRINT_HTML_DIR = join(tmpdir(), 'worm-print-client')

interface PendingRender {
  resolve: (r: RenderJobResult) => void
  reject: (e: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

/** IPC 响应桥仅绑定一次（init 幂等重建 worker 时不重复注册） */
let bridgeBound = false

export class RendererPool {
  private worker: BrowserWindow | null = null
  private readonly pendings = new Map<string, PendingRender>()
  private initialized = false

  constructor(private readonly logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>) {}

  /** 幂等初始化：创建 worker、绑定响应与崩溃重建（打印内容走标准 file://，无需注册自定义协议） */
  async init(): Promise<void> {
    if (this.initialized) return

    if (!bridgeBound) {
      ipcMain.on(
        RENDER_RESPONSE_CHANNEL,
        (_event: IpcMainEvent, id: string, response: RenderResponse) => {
          this.onWorkerResponse(id, response)
        },
      )
      bridgeBound = true
    }

    await this.createWorker()
    this.initialized = true
  }

  private async createWorker(): Promise<void> {
    const worker = new BrowserWindow({
      show: false,
      webPreferences: {
        // 沙箱化：worker 主世界页面经 worker-preload 暴露的 wormRender 桥通信
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: join(__dirname, '../preload/worker-preload.cjs'),
      },
    })
    worker.webContents.on('render-process-gone', (_e, details) => {
      this.logger?.error('渲染 worker 进程崩溃', { reason: details.reason })
      this.failAll(new ProtocolFailure('INTERNAL', '渲染进程崩溃'))
      this.worker = null
      this.initialized = false
      void this.init()
    })
    await worker.loadURL(workerUrl())
    this.worker = worker
  }

  private onWorkerResponse(id: string, response: RenderResponse): void {
    const pending = this.pendings.get(id)
    if (!pending) return
    this.pendings.delete(id)
    clearTimeout(pending.timer)
    if (response.ok) pending.resolve(response.result)
    else pending.reject(new ProtocolFailure('INTERNAL', response.message))
  }

  /** 请求 worker 执行两遍渲染，配对响应；超时返回 RENDER_TIMEOUT */
  render(spec: RenderJobSpec, timeoutMs = RENDER_TIMEOUT_MS): Promise<RenderJobResult> {
    if (!this.worker) {
      return Promise.reject(new ProtocolFailure('INTERNAL', '渲染 worker 未就绪'))
    }
    const id = randomUUID()
    return new Promise<RenderJobResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendings.delete(id)
        reject(new ProtocolFailure('RENDER_TIMEOUT', `渲染超过 ${timeoutMs}ms`))
      }, timeoutMs)
      this.pendings.set(id, { resolve, reject, timer })
      this.worker!.webContents.send(RENDER_REQUEST_CHANNEL, id, spec)
    })
  }

  /** 枚举系统打印机（委托 worker WebContents） */
  async getPrintersAsync(): Promise<
    Array<{ name: string; isDefault?: boolean; status?: number }>
  > {
    if (!this.worker) throw new ProtocolFailure('INTERNAL', '渲染 worker 未就绪')
    return this.worker.webContents.getPrintersAsync()
  }

  /**
   * 新建隐藏打印窗口承载最终 HTML。
   * 采用标准 file:// 协议：HTML 写入临时目录后用原生 loadFile 加载，
   * 避免自定义 scheme 在部分环境 loadURL 报 ERR_FAILED；http(s) 图片仍正常加载。
   * 调用方负责打印完成后 win.close()（关闭时清理临时文件）。
   */
  async loadPrintHtml(html: string): Promise<BrowserWindow> {
    const id = randomUUID()
    mkdirSync(PRINT_HTML_DIR, { recursive: true })
    const filePath = join(PRINT_HTML_DIR, `${id}.html`)
    writeFileSync(filePath, html, 'utf8')
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    })
    win.on('closed', () => {
      rmSync(filePath, { force: true })
    })
    await win.loadFile(filePath)
    return win
  }

  async dispose(): Promise<void> {
    this.failAll(new ProtocolFailure('INTERNAL', '客户端正在关闭'))
    this.worker?.destroy()
    this.worker = null
    this.initialized = false
  }

  private failAll(err: unknown): void {
    for (const [, p] of this.pendings) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pendings.clear()
  }
}

// worker 页面构建产物：out/renderer/worker/index.html（dev 由 electron-vite dev server 提供）
function workerUrl(): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/worker/index.html`
  }
  return pathToFileURL(join(__dirname, '../renderer/worker/index.html')).toString()
}
