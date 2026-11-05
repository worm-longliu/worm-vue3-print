// 出纸通路（当前接线）：把 core 产出的最终 HTML 直接送进 Chromium 原生打印管线（webContents.print），
// 与浏览器 window.print() 同源——页面几何来自 HTML 里的 @page，纸张由本模块按 core 算出的
// paperMm 显式声明（Electron 的 pageSize 单位是**微米**，与协议同源；注意 printToPDF 用英寸）。
//
// 与 PDF 通路的取舍：
// - PDF 通路把纸张声明的责任交给出纸命令（只有 macOS / Linux 的 `lp`，Windows 那条借外部
//   SumatraPDF 的路已随依赖移除），纸型可能被队列默认表单接走；
// - 本通路纸张是显式的，Chromium 会把它折进 DEVMODE 交给驱动校验，代价是驱动可能把自定义
//   尺寸夹回自己的表单（实测标签机 Peweglow SU7 会夹回 80×60，Microsoft Print to PDF 直接回滚 A4）。
// 出纸前会把参数落日志，成品尺寸不对时先据此分辨「客户端声明了什么」。
import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { millimetersToMicrometers } from '@worm-vue3-print/core'
import type { PrintOptions } from '@worm-vue3-print/core/client'
import { ProtocolFailure } from './protocol-error.js'
import type { Logger } from './logger.js'

/** 隐藏窗口载入 HTML 的临时目录（与 core driver 的目录分开，避免互相清理） */
const HTML_HOST_DIR = join(tmpdir(), 'worm-print-client-html')

/** 字体/图片就绪等待上限：超时不阻塞出纸，按当前版面打印 */
const FONTS_READY_TIMEOUT_MS = 5_000

/**
 * print() 回调兜底超时：虚拟打印机即便 silent 也可能弹保存对话框导致回调永不触发，
 * 不能因此永久占用串行锁。
 */
const PRINT_CALLBACK_TIMEOUT_MS = 60_000

/** 与 Electron WebContentsPrintOptions 对齐的结构（不引 electron 类型，便于单测） */
export interface WebPrintOptions {
  silent: boolean
  printBackground: boolean
  copies: number
  deviceName?: string
  landscape?: boolean
  color?: boolean
  /** 纸张尺寸，单位微米 */
  pageSize: { width: number; height: number }
  margins: { marginType: 'none' | 'default' | 'printableArea' }
  pageRanges?: Array<{ from: number; to: number }>
}

/**
 * 任务打印参数 + core 纸型 → Electron 打印选项。
 * 边距一律 `none`：core 的 HTML 用 @page 与元素 mm 定位自控版面，协议里的 margins 覆盖项
 * 在 PDF 路由同样不被消费，这里不引入第二种边距口径。
 */
export function buildWebPrintOptions(
  print: PrintOptions,
  paperMm: { width: number; height: number },
): WebPrintOptions {
  const options: WebPrintOptions = {
    silent: true,
    printBackground: true,
    copies: print.copies && print.copies > 0 ? Math.trunc(print.copies) : 1,
    pageSize: {
      width: millimetersToMicrometers(paperMm.width),
      height: millimetersToMicrometers(paperMm.height),
    },
    margins: { marginType: 'none' },
  }
  if (print.printerName) options.deviceName = print.printerName
  if (typeof print.landscape === 'boolean') options.landscape = print.landscape
  if (typeof print.color === 'boolean') options.color = print.color
  if (print.pageRanges && print.pageRanges.length > 0) options.pageRanges = print.pageRanges
  return options
}

/** 等待字体与图片就绪（带兜底超时，不阻塞打印） */
export async function waitResourcesReady(wc: Electron.WebContents): Promise<void> {
  await Promise.race([
    wc.executeJavaScript(
      `Promise.all([document.fonts ? document.fonts.ready : true,`
        + ` Promise.all(Array.from(document.images).filter(i => !i.complete)`
        + `   .map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })))])`,
    ),
    new Promise<void>(resolve => setTimeout(resolve, FONTS_READY_TIMEOUT_MS)),
  ])
}

/** webContents.print 的回调式 API 包成 Promise；失败按打印机离线/通用失败归类 */
function silentPrint(wc: Electron.WebContents, options: WebPrintOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(
        new ProtocolFailure(
          'PRINT_FAILED',
          `打印超过 ${PRINT_CALLBACK_TIMEOUT_MS / 1000}s 未返回（虚拟打印机可能需要人工交互，或驱动无响应）`,
        ),
      )
    }, PRINT_CALLBACK_TIMEOUT_MS)
    wc.print(options as Electron.WebContentsPrintOptions, (success, failureReason) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (success) {
        resolve()
        return
      }
      const reason = String(failureReason ?? '').toLowerCase()
      const offline = reason.includes('offline') || reason.includes('unavailable') || reason.includes('not available')
      reject(
        new ProtocolFailure(
          offline ? 'PRINTER_OFFLINE' : 'PRINT_FAILED',
          failureReason ? `打印失败：${failureReason}` : '打印失败',
        ),
      )
    })
  })
}

/**
 * 用隐藏窗口载入 HTML 并静默打印。每次任务一个窗口，打印结束即销毁
 * （常驻的打印宿主窗口只用于枚举打印机，不承载文档）。
 */
export async function printHtmlDocument(
  html: string,
  options: WebPrintOptions,
  logger?: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>,
): Promise<void> {
  mkdirSync(HTML_HOST_DIR, { recursive: true })
  const file = join(HTML_HOST_DIR, `${randomUUID()}.html`)
  writeFileSync(file, html, 'utf8')
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  try {
    await win.loadFile(file)
    await waitResourcesReady(win.webContents)
    logger?.info('Chromium 原生打印参数', {
      deviceName: options.deviceName,
      pageSize: options.pageSize,
      copies: options.copies,
      landscape: options.landscape,
    })
    await silentPrint(win.webContents, options)
  } finally {
    rmSync(file, { force: true })
    if (!win.isDestroyed()) win.destroy()
  }
}
