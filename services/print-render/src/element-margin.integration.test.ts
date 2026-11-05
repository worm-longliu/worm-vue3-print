import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createDomHostRuntime, prepareDocument, renderPdf } from '@worm-vue3-print/core'
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

function textTemplate(margin: Record<string, number>, rotate = 0): PrintTemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    elements: [{
      id: 'text', type: 'text',
      options: { left: 10, top: 20, width: 40, height: 8, formatter: 'MARGIN-TEXT', rotate, ...margin },
    }],
  } as PrintTemplateData
}

async function pdfTextItem(pdf: Uint8Array, text: string): Promise<any> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false })
  const doc = await task.promise
  const content = await (await doc.getPage(1)).getTextContent()
  const item = content.items.find((it: any) => 'str' in it && it.str.includes(text))
  await task.destroy()
  if (!item) throw new Error(`PDF 缺少文本 ${text}`)
  return item
}

describe('元素四向外边距真实 PDF 几何', () => {
  it('左/上边距移动文本，右/下边距不移动文本或改变框尺寸', async () => {
    const base = await renderPdf({ templateJson: textTemplate({}), printData: {} }, runtime)
    const all = await renderPdf({
      templateJson: textTemplate({ marginTop: 4, marginRight: 7, marginBottom: 9, marginLeft: 5 }),
      printData: {},
    }, runtime)
    const rightBottom = await renderPdf({
      templateJson: textTemplate({ marginRight: 7, marginBottom: 9 }), printData: {},
    }, runtime)
    const [baseItem, allItem, rightBottomItem] = await Promise.all([
      pdfTextItem(base.pdf, 'MARGIN-TEXT'),
      pdfTextItem(all.pdf, 'MARGIN-TEXT'),
      pdfTextItem(rightBottom.pdf, 'MARGIN-TEXT'),
    ])
    expect((allItem.transform[4] - baseItem.transform[4]) / PT_PER_MM).toBeCloseTo(5, 1)
    expect((allItem.transform[5] - baseItem.transform[5]) / PT_PER_MM).toBeCloseTo(-4, 1)
    expect(rightBottomItem.transform[4]).toBeCloseTo(baseItem.transform[4], 1)
    expect(rightBottomItem.transform[5]).toBeCloseTo(baseItem.transform[5], 1)
    expect(all.prepared.html).toContain('width:40mm')
    expect(all.prepared.html).toContain('height:8mm')
  }, 120000)

  it('旋转文本仍只按左/上边距平移', async () => {
    const base = await renderPdf({ templateJson: textTemplate({}, 90), printData: {} }, runtime)
    const all = await renderPdf({
      templateJson: textTemplate({ marginTop: 4, marginRight: 7, marginBottom: 9, marginLeft: 5 }, 90),
      printData: {},
    }, runtime)
    const [baseItem, allItem] = await Promise.all([
      pdfTextItem(base.pdf, 'MARGIN-TEXT'), pdfTextItem(all.pdf, 'MARGIN-TEXT'),
    ])
    // Chromium 旋转文本的落点按 CSS 像素取整：5mm→18px、4mm→15px（1px=0.75pt）。
    expect(allItem.transform[4] - baseItem.transform[4]).toBeCloseTo(18 * 0.75, 3)
    expect(allItem.transform[5] - baseItem.transform[5]).toBeCloseTo(-15 * 0.75, 3)
  }, 120000)

  it('连续纸高度只增加根元素 marginBottom', async () => {
    const continuous = textTemplate({})
    continuous.paperSize = 'CONTINUOUS'
    continuous.customWidth = 80
    continuous.margins = { top: 2, right: 2, bottom: 2, left: 2 }
    const withBottom = structuredClone(continuous)
    withBottom.elements[0]!.options.marginBottom = 9
    const baseline = await prepareDocument({ templateJson: continuous, printData: {} }, runtime)
    const withMargin = await prepareDocument({ templateJson: withBottom, printData: {} }, runtime)
    expect(withMargin.paperMm.height - baseline.paperMm.height).toBeCloseTo(9, 2)
  }, 120000)

  it('负边距形成可见重叠且保留各自 z-index', async () => {
    const template = textTemplate({})
    template.elements = [
      { id: 'a', type: 'text', options: {
        left: 20, top: 20, width: 40, height: 8, formatter: 'OVERLAP', zIndex: 1,
      } },
      { id: 'b', type: 'text', options: {
        left: 20, top: 20, width: 40, height: 8, formatter: 'OVERLAP', zIndex: 2,
        marginLeft: -8, marginTop: -2,
      } },
    ] as PrintTemplateData['elements']
    const { pdf, prepared } = await renderPdf({ templateJson: template, printData: {} }, runtime)
    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false })
    const doc = await task.promise
    const content = await (await doc.getPage(1)).getTextContent()
    const items = content.items.filter((item: any) => 'str' in item && item.str.includes('OVERLAP'))
    await task.destroy()
    expect(items).toHaveLength(2)
    const [a, b] = items as any[]
    const xOverlap = a.transform[4] < b.transform[4] + b.width && b.transform[4] < a.transform[4] + a.width
    const yOverlap = a.transform[5] < b.transform[5] + b.height && b.transform[5] < a.transform[5] + a.height
    expect(xOverlap).toBe(true)
    expect(yOverlap).toBe(true)
    expect(prepared.html).toContain('height:8mm;z-index:1;">OVERLAP')
    expect(prepared.html).toContain('height:8mm;z-index:2;margin-top:-2mm;margin-left:-8mm;">OVERLAP')
  }, 120000)

  it('表格末页跟随备注保留自身边距并位于最后商品之下', async () => {
    const template = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      elements: [{
        id: 'tbl-1', type: 'table',
        options: {
          left: 0, top: 0, width: 100, height: 650,
          marginTop: 30, marginBottom: 20,
          tableMode: 'dynamic', tableColWidths: [100], dataSource: 'items',
          tableRows: [
            { id: 'h', type: 'header', height: 50, repeatOnPage: true,
              cells: [{ id: 'h0', formatter: '品名', fontSize: 10, padding: 1 }] },
            { id: 'd', type: 'data', height: 50,
              cells: [{ id: 'd0', formatter: '{items.name}', fontSize: 10, padding: 1 }] },
          ],
        },
      }, {
        id: 'follow-1', type: 'text',
        options: {
          left: 15, top: 705, width: 80, height: 8,
          marginTop: 5, marginBottom: 2, marginLeft: 1, formatter: '跟随备注',
        },
      }],
    } as PrintTemplateData
    const items = Array.from({ length: 12 }, (_, index) => ({ name: `商品${index + 1}` }))
    const { pdf, prepared } = await renderPdf({ templateJson: template, printData: { items } }, runtime)
    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false })
    const doc = await task.promise
    expect(doc.numPages).toBe(prepared.pageCount)
    const content = await (await doc.getPage(doc.numPages)).getTextContent()
    const textItems = content.items.filter((item: any) => 'str' in item && item.str)
    const product = textItems.find((item: any) => item.str.normalize('NFKC').includes('商品12'))
    const follow = textItems.find((item: any) => item.str.normalize('NFKC').includes('跟随备注'))
    await task.destroy()
    expect(product).toBeDefined()
    expect(follow).toBeDefined()
    const productTop = A4_HEIGHT_MM - product.transform[5] / PT_PER_MM
    const followTop = A4_HEIGHT_MM - follow.transform[5] / PT_PER_MM
    expect(followTop).toBeGreaterThan(productTop)
  }, 120000)
})
