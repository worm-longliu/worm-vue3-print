// print-canvas/src/render/browser-pagination.ts
// 浏览器内两遍渲染：隐藏 iframe 写入测量 HTML → 读取元素实测高度 →
// 复用 print-core 分页算法 → 生成最终多页 HTML（与 print-render 的 pdf-render 同款逻辑）。

import { bindData } from '../render/data-binder.js'
import { generateHtml } from '../render/html-generator.js'
import { paginate } from '../render/pagination-engine.js'
import { getPaperDimensions, isContinuousPaper } from '../render/types.js'
import { composeContinuousHeight } from '../render/continuous-paper.js'
import type {
  TemplateData as PrintTemplateData,
  MeasuredElement,
  PageLayout,
  CodeRenderer,
} from '../render/types.js'

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
  /** 最终纸张尺寸（mm，已含方向）；连续纸为探针推导后的高度，其余为模板纸张 */
  paperMm: { width: number; height: number }
  /** 模板是否连续纸 */
  continuous: boolean
}

export interface BrowserRenderOptions {
  /** 连续纸显式纸高覆盖（mm，宿主逃生门）；仅对 CONTINUOUS 生效，undefined 时探针推导 */
  paperHeightMm?: number
}

/**
 * 浏览器内完成「数据绑定 → 测量 → 分页 → 最终 HTML」全流程。
 * @param template 模板 JSON（设计器 TemplateData 结构兼容）
 * @param printData 业务数据
 * @param baseUrl 图片相对路径拼接前缀
 * @param codeRenderer 条码渲染器（browserCodeRenderer）
 * @param options 渲染选项（连续纸纸高覆盖等）
 */
export async function renderHtmlPages(
  template: PrintTemplateData,
  printData?: Record<string, any> | Record<string, any>[],
  baseUrl?: string,
  codeRenderer?: CodeRenderer,
  options?: BrowserRenderOptions,
): Promise<BrowserRenderResult> {
  // Step 1: 数据绑定
  const boundTemplate = bindData(template, printData, baseUrl)

  // Step 2: 第一遍测量（隐藏 iframe）
  const measuredElements = await measureElements(boundTemplate, codeRenderer)

  // Step 3: 分页计算（与服务端同一套算法；连续纸内容高 Infinity → 恒单页）
  const pageLayouts = paginate(boundTemplate, measuredElements)

  const continuous = isContinuousPaper(boundTemplate)
  const templatePaper = getPaperDimensions(boundTemplate)

  // Step 4: 连续纸推导最终纸高
  // 先用 297 设计高度生成一次最终单页 HTML 作为探针页，量出内容区最大底边，
  // 再组合出纸高（flow-group 跟随区/动态表格超高由真实引擎布局如实反映）。
  let pageHeightMm: number | undefined
  if (continuous) {
    const override = options?.paperHeightMm
    if (override && override > 0) {
      pageHeightMm = override
    } else {
      const probeHtml = generateHtml(
        boundTemplate,
        pageLayouts,
        printData as Record<string, any>,
        { codeRenderer },
      )
      const contentBottomMm = await probeContentBottomMm(probeHtml, templatePaper.width)
      pageHeightMm = composeContinuousHeight(boundTemplate, contentBottomMm)
    }
  }

  // Step 5: 最终 HTML（连续纸用推导高度再生成一次，@page/.print-page/footer 全部对齐）
  const html = generateHtml(boundTemplate, pageLayouts, printData as Record<string, any>, {
    codeRenderer,
    pageHeightMm,
  })

  return {
    html,
    pageCount: pageLayouts.length,
    pageLayouts,
    paperMm: { width: templatePaper.width, height: pageHeightMm ?? templatePaper.height },
    continuous,
  }
}

/**
 * 连续纸探针：把分页后的最终单页 HTML（纸高仍为 297）载入离屏 iframe，
 * 遍历 .content-area 全部后代取相对 .print-page 顶部的最大底边（mm）。
 * absolute 元素的几何位置不依赖纸高，overflow:hidden 不改变 getBoundingClientRect，
 * flow-group/动态表格/小计汇总/重叠均由引擎如实计算。
 *
 * 依赖真实布局：happy-dom 的 getBoundingClientRect 恒返回 0，本函数不走单测，
 * 正确性由设计器手工验证与真机打印清单保证。
 */
async function probeContentBottomMm(finalHtml: string, paperWidthMm: number): Promise<number> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${paperWidthMm}mm;height:297mm;` +
    'border:0;visibility:hidden;pointer-events:none;'
  document.body.appendChild(iframe)
  try {
    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    if (!win || !doc) throw new Error('无法创建连续纸探针 iframe')

    doc.open()
    doc.write(finalHtml)
    doc.close()

    await waitForRenderReady(win)

    const page = doc.querySelector('.print-page') as HTMLElement | null
    const area = doc.querySelector('.content-area') as HTMLElement | null
    if (!page || !area) return 0

    const pageRect = page.getBoundingClientRect()
    let maxBottom = 0
    area.querySelectorAll<HTMLElement>('*').forEach(node => {
      const r = node.getBoundingClientRect()
      // 仅统计可见且有面积的节点，避免空容器/折叠边框干扰
      if (r.height > 0) {
        maxBottom = Math.max(maxBottom, (r.bottom - pageRect.top) / PX_PER_MM)
      }
    })
    // content-area 自身（无绝对定位子元素时的兜底，如空模板）
    const ar = area.getBoundingClientRect()
    if (ar.height > 0) {
      maxBottom = Math.max(maxBottom, (ar.bottom - pageRect.top) / PX_PER_MM)
    }
    return maxBottom
  } finally {
    iframe.remove()
  }
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
