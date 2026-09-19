// 端到端：拼版打印 → 真实 Chromium 出 PDF → pdfjs 断言页尺寸与分张归属
import { describe, it, expect } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  renderPdf as coreRenderPdf,
  prepareDocument,
  createDomHostRuntime,
} from '@worm-vue3-print/core'
import type { PrintTemplateData, TilingOptions } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

const PT_PER_MM = 72 / 25.4

const TILING: TilingOptions = {
  enabled: true,
  columns: 2,
  gapX: 2,
  gapY: 2,
  sheetPaperSize: 'A4',
  sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
}

/** 70×40mm 标签模板（拼版到 A4，2 列 × 6 行 = 每张 12 格） */
function labelTemplate(tiling: TilingOptions = TILING): PrintTemplateData {
  return {
    paperSize: 'CUSTOM',
    orientation: 'portrait',
    customWidth: 70,
    customHeight: 40,
    margins: { top: 3, right: 3, bottom: 3, left: 3 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [
      { id: 't1', type: 'text', options: { left: 0, top: 0, width: 60, height: 8, formatter: '{title}' } },
    ],
    tiling,
  } as PrintTemplateData
}

/** n 条数据：标题为 L01…Ln（便于按文本断言分张归属） */
function labelList(n: number) {
  return Array.from({ length: n }, (_, i) => ({ title: `L${String(i + 1).padStart(2, '0')}` }))
}

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

interface PdfPage {
  widthMm: number
  heightMm: number
  text: string
}

/** 用 pdfjs 解析 PDF：逐页取尺寸（mm）与文本。坐标/尺寸均为标准 pt 且按页重置 */
async function parsePdf(buf: Buffer): Promise<PdfPage[]> {
  // pdfjs v6：析构入口在 loadingTask 上，PDFDocumentProxy 已无 destroy()
  const task = getDocument({ data: new Uint8Array(buf), useSystemFonts: false })
  const doc = await task.promise
  const pages: PdfPage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const { items } = await page.getTextContent()
    pages.push({
      widthMm: viewport.width / PT_PER_MM,
      heightMm: viewport.height / PT_PER_MM,
      text: items.map(it => ('str' in it ? it.str : '')).join(''),
    })
  }
  await task.destroy()
  return pages
}

describe('拼版打印端到端', () => {
  it('12 条 + A4 2 列 → 1 张、页尺寸 210×297（容差 ±0.5mm）', async () => {
    const job = { templateJson: labelTemplate(), printData: labelList(12) }
    const { pdf } = await coreRenderPdf(job, runtime)
    const pages = await parsePdf(Buffer.from(pdf))
    expect(pages).toHaveLength(1)
    // 容差必须有：存在 mm↔pt 舍入（210mm 会读成 210.2mm）
    expect(Math.abs(pages[0].widthMm - 210)).toBeLessThan(0.5)
    expect(Math.abs(pages[0].heightMm - 297)).toBeLessThan(0.5)
  }, 90000)

  it('13 条 → 2 张，且分张归属正确（第 1 张 L01/L12、第 2 张 L13）', async () => {
    const job = { templateJson: labelTemplate(), printData: labelList(13) }
    const { pdf } = await coreRenderPdf(job, runtime)
    const pages = await parsePdf(Buffer.from(pdf))
    expect(pages).toHaveLength(2)
    expect(pages[0].text).toContain('L01')
    expect(pages[0].text).toContain('L12')
    expect(pages[0].text).not.toContain('L13')
    expect(pages[1].text).toContain('L13')
    expect(pages[1].text).not.toContain('L01')
  }, 90000)

  it('自定义目标纸 100×150 → 页尺寸随之为 100×150', async () => {
    const job = {
      templateJson: labelTemplate({
        enabled: true,
        columns: 1,
        gapX: 0,
        gapY: 0,
        sheetPaperSize: 'CUSTOM',
        sheetCustomWidth: 100,
        sheetCustomHeight: 150,
        sheetMargin: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
      printData: labelList(2),
    }
    const { pdf } = await coreRenderPdf(job, runtime)
    const pages = await parsePdf(Buffer.from(pdf))
    expect(pages).toHaveLength(1)
    expect(Math.abs(pages[0].widthMm - 100)).toBeLessThan(0.5)
    expect(Math.abs(pages[0].heightMm - 150)).toBeLessThan(0.5)
  }, 90000)

  it('12 格落在 2×6 网格上（print media 实测坐标）', async () => {
    const prepared = await prepareDocument(
      { templateJson: labelTemplate(), printData: labelList(12) },
      runtime,
    )
    const pool = BrowserPool.getInstance()
    const page = await pool.acquire()
    let rects: Array<{ leftMm: number; topMm: number; wMm: number; hMm: number }> = []
    try {
      await page.setContent(prepared.html, { waitUntil: 'domcontentloaded' })
      await page.emulateMedia({ media: 'print' })
      rects = await page.evaluate(() => {
        const PX_PER_MM = 96 / 25.4
        return Array.from(document.querySelectorAll('.print-tile')).map(el => {
          const r = el.getBoundingClientRect()
          return {
            leftMm: r.left / PX_PER_MM,
            topMm: r.top / PX_PER_MM,
            wMm: r.width / PX_PER_MM,
            hMm: r.height / PX_PER_MM,
          }
        })
      })
    } finally {
      await pool.release(page)
    }

    expect(rects).toHaveLength(12)
    // 行优先：列距 72mm（70+2）、行距 42mm（40+2）、起始 (10,10)
    const expected = Array.from({ length: 12 }, (_, i) => ({
      leftMm: 10 + (i % 2) * 72,
      topMm: 10 + Math.floor(i / 2) * 42,
    }))
    rects.forEach((r, i) => {
      expect(Math.abs(r.leftMm - expected[i].leftMm)).toBeLessThan(0.5)
      expect(Math.abs(r.topMm - expected[i].topMm)).toBeLessThan(0.5)
      expect(Math.abs(r.wMm - 70)).toBeLessThan(0.5)
      expect(Math.abs(r.hMm - 40)).toBeLessThan(0.5)
    })
  }, 90000)
})
