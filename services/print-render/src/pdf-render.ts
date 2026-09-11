// services/print-render/src/pdf-render.ts
// 两遍渲染流程：测量 → 分页 → 最终 PDF
// 渲染管线（数据绑定/HTML 生成/分页算法）来自同构包 @worm-vue3-print/core，
// 本文件仅保留 Playwright 测量与 PDF 输出，条码经 bwip-js CodeRenderer 注入。

import { BrowserPool } from './browser-pool.js'
import { renderBarcodeSvg } from './barcode-renderer.js'
import {
  bindData,
  generateHtml,
  paginate,
  getPaperDimensions,
} from '@worm-vue3-print/core'
import type {
  RenderRequest,
  MeasuredElement,
  CodeRenderer,
} from '@worm-vue3-print/core'

/** bwip-js 条码渲染器（Node 侧 CodeRenderer 实现） */
const bwipCodeRenderer: CodeRenderer = {
  render: (value, cellType, opts) => renderBarcodeSvg(value, cellType, opts),
}

const RENDER_TIMEOUT_MS = 30000

// ─── 公共 API ───

/**
 * 两遍渲染生成 PDF。
 *
 * 流程：
 * 1. 数据绑定：变量替换
 * 2. 第一遍：渲染测量 HTML → 获取元素实际高度
 * 3. 分页计算：基于实测高度执行分页算法
 * 4. 第二遍：渲染最终 HTML → 生成 PDF
 */
export async function renderPdf(request: RenderRequest): Promise<Buffer> {
  const template = request.templateJson
  const printData = request.printData

  // Step 1: 数据绑定
  const boundTemplate = bindData(template, printData, request.baseUrl)

  // Step 2: 第一遍测量
  const measuredElements = await measureElements(boundTemplate)

  // Step 3: 分页计算
  const pageLayouts = paginate(boundTemplate, measuredElements)

  // Step 4: 第二遍生成 PDF
  const pdfBuffer = await generateFinalPdf(boundTemplate, pageLayouts, printData)

  return pdfBuffer
}

// ─── 截图渲染 ───

/**
 * 单遍渲染生成 PNG 截图（不分页，用于设计器叠层对比）。
 */
export async function renderScreenshot(request: RenderRequest): Promise<Buffer> {
  const template = request.templateJson
  const printData = request.printData

  // 数据绑定
  const boundTemplate = bindData(template, printData, request.baseUrl)

  const pool = BrowserPool.getInstance()
  const page = await pool.acquire()

  try {
    // 测量模式 HTML（不分页，单页完整渲染）
    const html = generateHtml(boundTemplate, [], undefined, {
      isMeasurementPass: true,
      codeRenderer: bwipCodeRenderer,
    })
    await page.setContent(html, { waitUntil: 'networkidle' })

    // 等待字体加载
    await page.waitForFunction(() => document.fonts.ready, { timeout: RENDER_TIMEOUT_MS })

    // 全页截图
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true,
      omitBackground: false,
    }) as Buffer

    return screenshot
  } finally {
    await pool.release(page)
  }
}

// ─── 第一遍：测量 ───

/**
 * 渲染测量模式 HTML，获取每个元素的实际高度（mm）。
 */
async function measureElements(
  template: import('@worm-vue3-print/core').PrintTemplateData,
): Promise<Map<string, MeasuredElement>> {
  const pool = BrowserPool.getInstance()
  const page = await pool.acquire()

  try {
    // 生成测量模式 HTML（不分页，单页连续区域）
    const html = generateHtml(template, [], undefined, {
      isMeasurementPass: true,
      codeRenderer: bwipCodeRenderer,
    })
    await page.setContent(html, { waitUntil: 'networkidle' })

    // 等待字体加载完成
    await page.waitForFunction(() => document.fonts.ready, { timeout: RENDER_TIMEOUT_MS })

    // 测量所有带 data-measure-id 的元素
    const measurements = await page.evaluate(() => {
      const PX_PER_MM = 3.7795275591 // 96dpi 下 1mm ≈ 3.78px
      const result: Array<{
        id: string
        height: number
        rowHeights?: number[]
      }> = []

      // 测量普通元素
      const elements = document.querySelectorAll('[data-measure-id]')
      for (const el of elements) {
        const htmlEl = el as HTMLElement
        const id = htmlEl.getAttribute('data-measure-id')!
        const heightPx = htmlEl.offsetHeight

        // 检查是否为表格元素
        const table = htmlEl.querySelector('table.print-table')
        if (table) {
          const rowHeights: number[] = []
          const rows = table.querySelectorAll('tbody > tr[data-row-index]')
          for (const row of rows) {
            rowHeights.push((row as HTMLElement).offsetHeight)
          }
          result.push({
            id,
            height: heightPx / PX_PER_MM,
            rowHeights: rowHeights.map(h => h / PX_PER_MM),
          })
        } else {
          result.push({ id, height: heightPx / PX_PER_MM })
        }
      }

      return result
    })

    // 转换为 Map（表格元素补算重复表头段高度）
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
    await pool.release(page)
  }
}

// ─── 第二遍：最终 PDF ───

/**
 * 按分页结果生成最终 PDF。
 */
async function generateFinalPdf(
  template: import('@worm-vue3-print/core').PrintTemplateData,
  pageLayouts: import('@worm-vue3-print/core').PageLayout[],
  printData?: Record<string, any>,
): Promise<Buffer> {
  const pool = BrowserPool.getInstance()
  const page = await pool.acquire()

  try {
    // 生成最终 HTML
    const html = generateHtml(template, pageLayouts, printData, {
      codeRenderer: bwipCodeRenderer,
    })
    await page.setContent(html, { waitUntil: 'networkidle' })

    // 等待字体加载
    await page.waitForFunction(() => document.fonts.ready, { timeout: RENDER_TIMEOUT_MS })

    // 纸张尺寸
    const paper = getPaperDimensions(template)

    // 生成 PDF（margin=0，边距由 HTML padding 控制）
    const pdfBuffer = await page.pdf({
      width: `${paper.width}mm`,
      height: `${paper.height}mm`,
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await pool.release(page)
  }
}
