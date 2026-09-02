// print-canvas/src/render/browser-pagination.ts
// 浏览器内两遍渲染：隐藏 iframe 写入测量 HTML → 读取元素实测高度 →
// 复用 print-core 分页算法 → 生成最终多页 HTML（与 print-render 的 pdf-render 同款逻辑）。

import {
  bindData,
  generateHtml,
  paginate,
  getPaperDimensions,
} from '@worm-vue3-print/core'
import type {
  PrintTemplateData,
  MeasuredElement,
  PageLayout,
  CodeRenderer,
} from '@worm-vue3-print/core'

/** 96dpi 下 1mm ≈ 3.78px（与服务端 page.evaluate 一致） */
const PX_PER_MM = 3.7795275591
/** 字体/图片等待兜底超时 */
const READY_TIMEOUT_MS = 3000

export interface BrowserRenderResult {
  /** 最终多页 HTML 字符串 */
  html: string
  /** 总页数 */
  pageCount: number
  /** 分页布局（调试/高级用途） */
  pageLayouts: PageLayout[]
}

/**
 * 浏览器内完成「数据绑定 → 测量 → 分页 → 最终 HTML」全流程。
 * @param template 模板 JSON（设计器 TemplateData 结构兼容）
 * @param printData 业务数据
 * @param baseUrl 图片相对路径拼接前缀
 * @param codeRenderer 条码渲染器（browserCodeRenderer）
 */
export async function renderHtmlPages(
  template: PrintTemplateData,
  printData?: Record<string, any> | Record<string, any>[],
  baseUrl?: string,
  codeRenderer?: CodeRenderer,
): Promise<BrowserRenderResult> {
  // Step 1: 数据绑定
  const boundTemplate = bindData(template, printData, baseUrl)

  // Step 2: 第一遍测量（隐藏 iframe）
  const measuredElements = await measureElements(boundTemplate, codeRenderer)

  // Step 3: 分页计算（与服务端同一套算法）
  const pageLayouts = paginate(boundTemplate, measuredElements)

  // Step 4: 最终多页 HTML
  const html = generateHtml(boundTemplate, pageLayouts, printData as Record<string, any>, {
    codeRenderer,
  })

  return { html, pageCount: pageLayouts.length, pageLayouts }
}

// ─── 隐藏 iframe 测量 ───

/** 渲染测量模式 HTML 到离屏 iframe，读取每个元素的实际高度（mm） */
async function measureElements(
  template: PrintTemplateData,
  codeRenderer?: CodeRenderer,
): Promise<Map<string, MeasuredElement>> {
  const paper = getPaperDimensions(template)
  const measureHtml = generateHtml(template, [], undefined, {
    isMeasurementPass: true,
    codeRenderer,
  })

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  // 禁用 display:none（会导致 offsetHeight=0）；移出视口 + 不可见即可
  iframe.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${paper.width}mm;height:${paper.height}mm;` +
    'border:0;visibility:hidden;pointer-events:none;'
  document.body.appendChild(iframe)

  try {
    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    if (!win || !doc) throw new Error('无法创建测量 iframe')

    doc.open()
    doc.write(measureHtml)
    doc.close()

    await waitForRenderReady(win)

    const measurements = readMeasurements(doc)

    // 转换为 Map（表格元素补算重复表头段高度），与服务端 pdf-render 一致
    const measuredMap = new Map<string, MeasuredElement>()
    const elementIndex = new Map(template.elements.map(el => [el.id, el]))
    for (const m of measurements) {
      const el = elementIndex.get(m.id)
      const repeatCount: number = el?.options?._repeatHeaderCount ?? 0
      measuredMap.set(m.id, {
        id: m.id,
        measuredHeight: m.height,
        measuredRowHeights: m.rowHeights,
        repeatHeaderHeight: m.rowHeights && repeatCount > 0
          ? m.rowHeights.slice(0, repeatCount).reduce((s: number, h: number) => s + h, 0)
          : 0,
      })
    }
    return measuredMap
  } finally {
    iframe.remove()
  }
}

/** 等待 iframe 文档加载完成、字体就绪、图片解码完成（带超时兜底） */
function waitForRenderReady(win: Window): Promise<void> {
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }
    const timer = setTimeout(finish, READY_TIMEOUT_MS)

    const run = async () => {
      try {
        const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts
        if (fonts?.ready) {
          await Promise.race([fonts.ready, timeout(READY_TIMEOUT_MS)])
        }
        await Promise.race([waitForImages(win.document), timeout(READY_TIMEOUT_MS)])
      } catch {
        // 测量兜底：即使资源加载失败也继续
      } finally {
        clearTimeout(timer)
        finish()
      }
    }

    if (win.document.readyState === 'complete') {
      void run()
    } else {
      win.addEventListener('load', () => void run(), { once: true })
      // load 事件意外缺失时兜底
      setTimeout(finish, READY_TIMEOUT_MS)
    }
  })
}

function timeout(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

/** 等待文档内全部图片完成（成功或失败均放行） */
function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images ?? [])
  return Promise.all(
    imgs.map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  ).then(() => undefined)
}

/** 读取 [data-measure-id] 元素高度与表格行高（逻辑同服务端 page.evaluate） */
function readMeasurements(doc: Document): Array<{
  id: string
  height: number
  rowHeights?: number[]
}> {
  const result: Array<{ id: string; height: number; rowHeights?: number[] }> = []
  const elements = doc.querySelectorAll('[data-measure-id]')
  for (const el of elements) {
    const htmlEl = el as HTMLElement
    const id = htmlEl.getAttribute('data-measure-id')
    if (!id) continue
    const heightPx = htmlEl.offsetHeight

    const table = htmlEl.querySelector('table.print-table')
    if (table) {
      const rowHeights: number[] = []
      const rows = table.querySelectorAll('tbody > tr[data-row-index]')
      for (const row of rows) {
        rowHeights.push((row as HTMLElement).offsetHeight / PX_PER_MM)
      }
      result.push({ id, height: heightPx / PX_PER_MM, rowHeights })
    } else {
      result.push({ id, height: heightPx / PX_PER_MM })
    }
  }
  return result
}
