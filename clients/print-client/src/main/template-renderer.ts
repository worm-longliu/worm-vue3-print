// 视觉回读 bridge（TemplateRenderBridge 实现端）：模板 → core 完整管线（测量/分页/条码 SVG 回填）
// → 隐藏窗口载入最终 HTML → 滚动到目标页 → capturePage 截图。
// 渲染规格与静默打印同源（prepareDocument），窗口每请求一个、用完销毁（对齐 html-printer 模式）；
// 预览互不并发（SerialGate），避免隐藏窗口堆积。
import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { prepareDocument } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import type { PrintRuntime, PrintTemplateData } from '@worm-vue3-print/core'
import type { TemplateRenderBridge } from '@worm-vue3-print/mcp'
import type { Logger } from './logger.js'
import { SerialGate } from './serial-gate.js'
import { waitResourcesReady } from './html-printer.js'

/** 预览 HTML 临时目录（与 driver 的 DOM_HOST_DIR、html-printer 的目录分开，互不清理） */
const PREVIEW_HOST_DIR = join(tmpdir(), 'worm-print-client-preview')

/** 单次预览总预算：管线（测量+分页+探针）+ 截图；超了按 RENDER_TIMEOUT 归类 */
const PREVIEW_TIMEOUT_MS = 15_000

/** bridge 进程内错误码：不进 WS 协议帧，只供 print_preview_template 层映射可行动文案 */
type RenderBridgeErrorCode = 'RENDER_TIMEOUT' | 'RENDER_FAILED' | 'PAGE_OUT_OF_RANGE'

function bridgeError(code: RenderBridgeErrorCode, message: string): Error {
  const err = new Error(message)
  ;(err as Error & { code: string }).code = code
  return err
}

/** mm → CSS 像素（96dpi 口径）；高分屏物理像素随 deviceScaleFactor 翻倍，以截图实测值为准 */
function mmToPx(mm: number): number {
  return Math.round((mm / 25.4) * 96)
}

/** core 管线超时/失败 → bridge 约定的错误码 */
function classifyRenderError(err: unknown): never {
  const code = err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined
  const message = err instanceof Error ? err.message : String(err)
  if (code === 'CLIENT_TIMEOUT') {
    throw bridgeError('RENDER_TIMEOUT', '渲染超过 15s 未完成（模板可能过于复杂）')
  }
  throw bridgeError('RENDER_FAILED', message)
}

export interface TemplateRendererDeps {
  runtime: PrintRuntime
  logger?: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
}

export function createTemplateRenderer(deps: TemplateRendererDeps): TemplateRenderBridge {
  const gate = new SerialGate()

  return {
    renderTemplatePage: (input) => gate.run(async () => {
      const startedAt = Date.now()
      const { templateJson, printData, page, scale } = input

      // 1. core 完整管线：两遍式测量 → 分页 → 连续纸探针 → 条码 SVG 回填的最终 HTML
      // classifyRenderError 恒抛出（never），失败时不进入后续流程
      const prepared = await prepareDocument(
        {
          templateJson: templateJson as PrintTemplateData,
          ...(printData && typeof printData === 'object' ? { printData: printData as Record<string, unknown> } : {}),
          timeoutMs: PREVIEW_TIMEOUT_MS,
        },
        deps.runtime,
      ).catch(err => classifyRenderError(err))

      const pageCount = prepared.pageCount
      if (page < 1 || page > pageCount) {
        throw bridgeError('PAGE_OUT_OF_RANGE', `模板共 ${pageCount} 页，没有第 ${page} 页`)
      }

      // 2. 隐藏窗口载入完整 HTML，窗口内容尺寸 = 纸张 × scale（DIP 口径）
      const widthPx = mmToPx(prepared.paperMm.width) * scale
      const heightPx = mmToPx(prepared.paperMm.height) * scale
      mkdirSync(PREVIEW_HOST_DIR, { recursive: true })
      const file = join(PREVIEW_HOST_DIR, `${randomUUID()}.html`)
      writeFileSync(file, prepared.html, 'utf8')
      const win = new BrowserWindow({
        show: false,
        useContentSize: true,
        width: widthPx,
        height: heightPx,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      })
      try {
        await win.loadFile(file)
        // 页面与窗口同倍放大：只放大窗口会把纸张缩在左上角（页面仍是 794 CSS px 宽），
        // zoom 后才让纸张铺满截图区域，PNG 里每个 mm 的像素数 = scale × 96/25.4
        if (scale !== 1) win.webContents.setZoomFactor(scale)
        await waitResourcesReady(win.webContents)
        // 注入 core 的 DOM 执行器：元素几何测量只能走它，客户端不自行写测量逻辑
        await win.webContents.executeJavaScript(loadExecutorBundle().source, true)
        // 滚动到目标页（.print-page 纵向堆叠）；双 rAF 确保滚动后的合成帧落盘再截
        const pageCountInDoc = await win.webContents.executeJavaScript(
          `(async () => {
            const pages = document.querySelectorAll('.print-page')
            const target = pages[${page - 1}]
            if (!target) throw new Error('页面元素缺失：.print-page 第 ${page - 1} 项')
            window.scrollTo(0, target.offsetTop)
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
            return pages.length
          })()`,
          true,
        ) as number
        // 执行器签名带 pageIndex：多页时逐页取元素矩形会串页，这里只取当前页
        const measured = await win.webContents.executeJavaScript(
          `globalThis.__wormDom.readElementRects(document, ${page - 1})`,
          true,
        ) as Array<{ id: string; left: number; top: number; width: number; height: number }>
        if (pageCountInDoc !== pageCount) {
          deps.logger?.warn('预览页面数与分页结果不一致', { expect: pageCount, found: pageCountInDoc })
        }
        // CSS px → mm（96dpi 口径）
        const pxToMm = (px: number): number => Math.round((px / (96 / 25.4)) * 100) / 100
        const elementBoxes = measured.map(b => ({
          id: b.id,
          leftMm: pxToMm(b.left),
          topMm: pxToMm(b.top),
          widthMm: pxToMm(b.width),
          heightMm: pxToMm(b.height),
        }))
        const image = await win.webContents.capturePage()
        const png = image.toPNG()
        const size = image.getSize()
        deps.logger?.info('模板预览渲染完成', {
          page,
          pageCount,
          paperMm: prepared.paperMm,
          widthPx: size.width,
          heightPx: size.height,
          elements: elementBoxes.length,
          ms: Date.now() - startedAt,
        })
        return {
          pageCount,
          pageSizeMm: prepared.paperMm,
          pngBase64: Buffer.from(png).toString('base64'),
          widthPx: size.width,
          heightPx: size.height,
          mmPerPx: Math.round((1 / (96 / 25.4)) * 10000) / 10000,
          elementBoxes,
        }
      } finally {
        rmSync(file, { force: true })
        if (!win.isDestroyed()) win.destroy()
      }
    }),
  }
}
