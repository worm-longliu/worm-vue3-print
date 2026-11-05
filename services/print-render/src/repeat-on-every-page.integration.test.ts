// services/print-render/src/repeat-on-every-page.integration.test.ts
// 端到端：元素 repeatOnEveryPage（每页重复，真实 Chromium + 真实分页）→ 首页保留设计位置，续页从页眉下方归一起排，
// 正文一/正文二各归其页。与 core 的声明级用例互补：那边钉住 sections 结构，这边钉住真实 PDF 文本。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createDomHostRuntime, renderPdf } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

const PT_PER_MM = 72 / 25.4
const A4_HEIGHT_MM = 297

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

/** A4 竖版：固定标题 top=0 h=10；正文 top=0 h=150 与 top=150 h=150 上下相切不聚类，稳定产出两页 */
const templateJson: PrintTemplateData = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  elements: [
    { id: 'fixed', type: 'text', options: { left: 0, top: 0, width: 100, height: 10, repeatOnEveryPage: true, formatter: '固定标题' } },
    { id: 'body-1', type: 'text', options: { left: 0, top: 0, width: 100, height: 150, formatter: '正文一' } },
    { id: 'body-2', type: 'text', options: { left: 0, top: 150, width: 100, height: 150, formatter: '正文二' } },
  ],
} as PrintTemplateData

const continuationTemplateJson: PrintTemplateData = {
  ...templateJson,
  header: {
    height: 20,
    elements: [{ id: 'page-header', type: 'text', options: { left: 0, top: 0, width: 100, height: 10, formatter: 'PAGE-HEADER' } }],
  },
  elements: [
    {
      id: 'fixed', type: 'text',
      options: { left: 0, top: 40, width: 100, height: 28, repeatOnEveryPage: true, formatter: '固定标题' },
    },
    {
      id: 'goodsTable', type: 'table',
      options: {
        left: 0, top: 31, width: 100,
        tableMode: 'dynamic', tableColWidths: [100], dataSource: 'items',
        tableRows: [
          {
            id: 'h', type: 'header', height: 10, repeatOnPage: true,
            cells: [{ id: 'h0', formatter: '明细表头', fontSize: 10, padding: 1 }],
          },
          {
            id: 'd', type: 'data', height: 30,
            cells: [{ id: 'd0', formatter: '{items.name}', fontSize: 10, padding: 1 }],
          },
        ],
      },
    },
  ],
} as PrintTemplateData

const comprehensiveTemplate = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../../demo/src/template-comprehensive-showcase.json', import.meta.url)),
  'utf8',
)) as PrintTemplateData
comprehensiveTemplate.elements.find(el => el.id === 'infoTable')!.options!.repeatOnEveryPage = true

const comprehensiveData = {
  doc: { no: 'ZH-20260921-008', date: '2026-09-21', warehouse: '华东一号仓（杭州）', keeper: '陈明' },
  items: Array.from({ length: 20 }, (_, index) => ({
    seq: index + 1,
    image: '',
    name: `商品${index + 1}`,
    spec: '规格',
    unit: '个',
    qty: 1,
    price: 10,
    amount: 10,
    barcode: `69000000000${String(index + 1).padStart(2, '0')}`,
    qrcode: `QR-${index + 1}`,
  })),
}

describe('repeatOnEveryPage 每页重复（真实 Chromium）', () => {
  it('两页 PDF 均含固定标题且正文各归其页', async () => {
    const { pdf, prepared } = await renderPdf({ templateJson, printData: {} }, runtime)
    expect(prepared.pageCount).toBe(2)
    expect((prepared.html.match(/固定标题/g) ?? []).length).toBe(2)

    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false })
    const doc = await task.promise
    expect(doc.numPages).toBe(2)
    // NFKC：Chromium PDF 的 ToUnicode 会把部分 CJK 字映射到兼容表意字符（如 面→⾯）
    const texts: string[] = []
    for (let i = 1; i <= 2; i++) {
      const content = await (await doc.getPage(i)).getTextContent()
      texts.push(content.items.map((it: any) => ('str' in it ? it.str : '')).join('').normalize('NFKC'))
    }
    await task.destroy()

    expect(texts[0]).toContain('固定标题')
    expect(texts[1]).toContain('固定标题')
    expect(texts[0]).toContain('正文一')
    expect(texts[1]).toContain('正文二')
  }, 60000)

  it('综合示例静态信息表在第二页从页眉下方起排，商品表头接在 16mm 后', async () => {
    const { pdf, prepared } = await renderPdf({
      templateJson: comprehensiveTemplate,
      printData: comprehensiveData,
    }, runtime)
    expect(prepared.pageCount).toBeGreaterThan(1)

    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false })
    const doc = await task.promise
    const content = await (await doc.getPage(2)).getTextContent()
    await task.destroy()
    const textItems = content.items.filter((item: any) => 'str' in item && item.str)
    const repeated = textItems.find((item: any) => item.str.normalize('NFKC').includes('单据编号'))
    const goodsHeader = textItems.find((item: any) => item.str.normalize('NFKC').includes('基础信息'))
    expect(repeated).toBeDefined()
    expect(goodsHeader).toBeDefined()

    const repeatedTopMm = 210 - repeated.transform[5] / PT_PER_MM
    const goodsHeaderTopMm = 210 - goodsHeader.transform[5] / PT_PER_MM
    expect(goodsHeaderTopMm - repeatedTopMm).toBeGreaterThanOrEqual(15)
    expect(goodsHeaderTopMm - repeatedTopMm).toBeLessThan(20)
  }, 60000)

  it('首页表格保持设计位置，续页明细表头位于重复区下方', async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({ name: `商品${index + 1}` }))
    const { pdf, prepared } = await renderPdf({
      templateJson: continuationTemplateJson,
      printData: { items },
    }, runtime)
    expect(prepared.pageCount).toBe(2)

    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false })
    const doc = await task.promise
    expect(doc.numPages).toBe(2)
    const firstContent = await (await doc.getPage(1)).getTextContent()
    const content = await (await doc.getPage(2)).getTextContent()
    await task.destroy()

    const firstTextItems = firstContent.items.filter((item: any) => 'str' in item && item.str)
    const firstRepeated = firstTextItems.find((item: any) => item.str.normalize('NFKC').includes('固定标题'))
    const firstTableHeader = firstTextItems.find((item: any) => item.str.normalize('NFKC').includes('明细表头'))
    expect(firstRepeated).toBeDefined()
    expect(firstTableHeader).toBeDefined()
    const firstRepeatedTopMm = A4_HEIGHT_MM - firstRepeated.transform[5] / PT_PER_MM
    const firstTableHeaderTopMm = A4_HEIGHT_MM - firstTableHeader.transform[5] / PT_PER_MM
    expect(firstRepeatedTopMm).toBeGreaterThanOrEqual(10 + 20 + 40)
    expect(firstTableHeaderTopMm).toBeLessThan(10 + 20 + 28 + 31)

    const textItems = content.items.filter((item: any) => 'str' in item && item.str)
    const pageHeader = textItems.find((item: any) => item.str.includes('PAGE-HEADER'))
    const repeated = textItems.find((item: any) => item.str.normalize('NFKC').includes('固定标题'))
    const tableHeader = textItems.find((item: any) => item.str.normalize('NFKC').includes('明细表头'))
    expect(pageHeader).toBeDefined()
    expect(repeated).toBeDefined()
    expect(tableHeader).toBeDefined()

    // pdfjs 的 y 轴从纸面左下角向上；正文内容区再叠加 10mm 上边距。
    const pageHeaderTopMm = A4_HEIGHT_MM - pageHeader.transform[5] / PT_PER_MM
    const repeatedTopMm = A4_HEIGHT_MM - repeated.transform[5] / PT_PER_MM
    const tableHeaderTopMm = A4_HEIGHT_MM - tableHeader.transform[5] / PT_PER_MM
    expect(pageHeaderTopMm).toBeLessThan(10 + 20)
    expect(repeatedTopMm).toBeGreaterThanOrEqual(10 + 20)
    expect(repeatedTopMm).toBeLessThan(10 + 20 + 40)
    expect(tableHeaderTopMm).toBeGreaterThanOrEqual(10 + 20 + 28)
  }, 60000)
})
