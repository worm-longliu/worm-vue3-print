import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { EXECUTOR_TARGETS, toElectronPrintToPdfOptions } from '@worm-vue3-print/core'
import type {
  DriverFactory,
  ExecutorBundle,
  ExecutorMethod,
  PageDriver,
  PdfTargetSpec,
  ViewportPx,
} from '@worm-vue3-print/core'

/** 模板 HTML 临时目录（隐藏窗口顶层文档） */
const DOM_HOST_DIR = join(tmpdir(), 'worm-print-client')

/**
 * Electron driver：每任务一个隐藏窗口承载模板 HTML（顶层文档）。
 * core 生成的 HTML 是 mm 绝对定位，测量不依赖窗口尺寸，因此 open(viewport) 为 no-op。
 */
export function createElectronDriverFactory(): DriverFactory {
  return {
    async createDriver(): Promise<PageDriver> {
      const win = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      })
      let currentFile = ''
      let injected = false

      const clearFile = (): void => {
        if (!currentFile) return
        rmSync(currentFile, { force: true })
        currentFile = ''
      }

      return {
        async open(_viewport: ViewportPx): Promise<void> {
          // 测量容器由 HTML 的 mm 尺寸决定
        },
        async setContent(html: string): Promise<void> {
          mkdirSync(DOM_HOST_DIR, { recursive: true })
          clearFile()
          currentFile = join(DOM_HOST_DIR, `${randomUUID()}.html`)
          writeFileSync(currentFile, html, 'utf8')
          await win.loadFile(currentFile)
          injected = false
        },
        async injectExecutor(bundle: ExecutorBundle): Promise<void> {
          if (injected) return
          await win.webContents.executeJavaScript(bundle.source, true)
          injected = true
        },
        async evaluate<T>(method: ExecutorMethod, args: unknown[] = []): Promise<T> {
          const target = EXECUTOR_TARGETS[method]
          const callArgs = target === 'none'
            ? '...payload'
            : `${target === 'window' ? 'window' : 'document'}, ...payload`
          const code = `(() => {
            const dom = globalThis.__wormDom
            if (!dom) throw new Error('DOM 执行器未注入')
            const fn = dom[${JSON.stringify(method)}]
            if (typeof fn !== 'function') throw new Error('执行器缺少方法：' + ${JSON.stringify(method)})
            const payload = ${JSON.stringify(args)}
            return fn(${callArgs})
          })()`
          return win.webContents.executeJavaScript(code, true) as Promise<T>
        },
        async pdf(_html: string, spec: PdfTargetSpec): Promise<Uint8Array> {
          // 文档已由会话载入并等待就绪，直接出图
          return new Uint8Array(await win.webContents.printToPDF(toElectronPrintToPdfOptions(spec)))
        },
        async close(): Promise<void> {
          clearFile()
          if (!win.isDestroyed()) win.destroy()
        },
      }
    },
  }
}
