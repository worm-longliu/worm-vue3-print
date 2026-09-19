// services/print-render/src/text-fit.integration.test.ts
// 端到端：文字溢出三种形式（截断 / 自动缩小 / 自适应行高）在真实 Chromium 排版下的行为。
// happy-dom 无排版引擎，二分字号只能在这里得到验证——本文件是「自动缩小真的放得下」的唯一证据。
import { describe, it, expect } from 'vitest'
import {
  applyTextFitSizes,
  bindData,
  createDomHostRuntime,
  generateHtml,
  getPaperDimensions,
  paperViewportPx,
  prepareDocument,
  PX_PER_MM,
} from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

/** 30 个汉字：20pt 下远超 40mm×12mm，6pt 下放得下，二分区间落在中间 */
const CONTENT = '这是一段用于验证自动缩小是否能够收敛到合适字号的较长文本内容'

/** 元素级：宽度 40mm、盒高 12mm、基准字号 20pt */
function elementTemplate(overrides: Record<string, any> = {}): PrintTemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [
      {
        id: 's1',
        type: 'text',
        options: { left: 0, top: 0, width: 40, height: 12, fontSize: 20, formatter: CONTENT, ...overrides },
      },
    ],
  } as unknown as PrintTemplateData
}

/** 单元格级：单行单列动态表格，列宽 30mm、行高 6mm、基准字号 12pt */
function cellTemplate(cellOverrides: Record<string, any> = {}): PrintTemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [
      {
        id: 'tb1',
        type: 'table',
        options: {
          left: 0, top: 0, width: 30,
          tableMode: 'dynamic',
          tableColWidths: [30],
          dataSource: 'items',
          tableRows: [
            {
              id: 'd', type: 'data', height: 6,
              cells: [{ id: 'd0', formatter: CONTENT, fontSize: 12, padding: 1, ...cellOverrides }],
            },
          ],
        },
      },
    ],
  } as unknown as PrintTemplateData
}

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

/** 取首个 print-element 的内联样式 */
function elementStyle(html: string): string {
  return /<div class="print-element"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? ''
}

describe('自动缩小（真实 Chromium 排版）', () => {
  it('元素级：测量趟二分出字号并回写，最终 HTML 采用缩小字号', async () => {
    const { html } = await prepareDocument(
      { templateJson: elementTemplate({ textFit: 'shrink' }), printData: {} },
      runtime,
    )
    const pt = Number(/font-size:([\d.]+)pt/.exec(elementStyle(html))?.[1])
    expect(pt).toBeGreaterThanOrEqual(6) // 默认下限
    expect(pt).toBeLessThan(20) // 基准字号
  }, 60000)

  it('元素级：按求得的字号复核确实放得下，且再大 1pt 就放不下', async () => {
    const bound = bindData(elementTemplate({ textFit: 'shrink' }), {})
    const capPx = 12 * PX_PER_MM
    await runtime.withSession({}, async (session) => {
      const viewport = paperViewportPx(getPaperDimensions(bound))
      const { fits } = await session.measure(
        generateHtml(bound, [], {}, { isMeasurementPass: true }),
        viewport,
      )
      expect(fits.map(f => f.key)).toEqual(['s1'])
      const fitted = fits[0].fontSizePt
      expect(fitted).toBeGreaterThanOrEqual(6)
      expect(fitted).toBeLessThan(20)
      applyTextFitSizes(bound, fits)

      // 把高度交给内容（自适应行高）：实测内容高度不得超过设计盒高 12mm
      const el = bound.elements[0]
      el.options.textFit = 'autoHeight'
      expect(el.options._fitFontSize).toBe(fitted)
      const ruler = await session.measure(
        generateHtml(bound, [], {}, { isMeasurementPass: true }),
        viewport,
      )
      expect(ruler.measurements[0].heightPx).toBeLessThanOrEqual(capPx + 1)

      // 再大 1pt 必然放不下 —— 收敛到的是「最大可放字号」，不是随便一个更小的值
      el.options._fitFontSize = fitted + 1
      const bigger = await session.measure(
        generateHtml(bound, [], {}, { isMeasurementPass: true }),
        viewport,
      )
      expect(bigger.measurements[0].heightPx).toBeGreaterThan(capPx)
    })
  }, 60000)

  it('单元格级：key 为 元素id#行类别#行:列，回写后 td 采用缩小字号', async () => {
    const template = cellTemplate({ textFit: 'shrink', shrinkMinFontSize: 6 })
    const { html } = await prepareDocument({ templateJson: template, printData: { items: [{}] } }, runtime)
    const tdStyle = /<td[^>]*style="([^"]*)"/.exec(html)?.[1] ?? ''
    const pt = Number(/font-size:([\d.]+)pt/.exec(tdStyle)?.[1])
    expect(tdStyle).toContain('font-size') // 防止正则空匹配后 NaN 静默通过
    expect(pt).toBeGreaterThanOrEqual(6)
    expect(pt).toBeLessThan(12)
  }, 60000)

  it('自适应行高：元素不写死高度，实测高度由内容决定', async () => {
    const template = elementTemplate({ textFit: 'autoHeight', height: 5 })
    const bound = bindData(template, {})
    const measureHtml = generateHtml(bound, [], {}, { isMeasurementPass: true })
    expect(elementStyle(measureHtml)).not.toContain('height:5mm')
    await runtime.withSession({}, async (session) => {
      const { fits, measurements } = await session.measure(
        measureHtml,
        paperViewportPx(getPaperDimensions(bound)),
      )
      expect(fits).toEqual([])
      expect(measurements[0].heightPx).toBeGreaterThan(5 * PX_PER_MM)
    })
  }, 60000)
})

describe('截断与缺省（无需二分）', () => {
  it('text 元素缺省为截断：字号原样，不产生缩小标记', () => {
    const html = generateHtml(bindData(elementTemplate(), {}), [], {}, { isMeasurementPass: true })
    expect(html).toContain('font-size:20pt')
    expect(html).not.toContain('data-fit="shrink"')
  })

  it('不换行（wordWrap:false）时以单行省略号收尾', () => {
    const html = generateHtml(
      bindData(elementTemplate({ wordWrap: false }), {}),
      [],
      {},
      { isMeasurementPass: true },
    )
    expect(html).toContain('white-space:nowrap;text-overflow:ellipsis;')
  })

  it('longText 缺省为自适应行高：放开裁剪且不写死高度', () => {
    const template = elementTemplate({ height: 9 })
    template.elements[0].type = 'longText'
    const html = generateHtml(bindData(template, {}), [], {}, { isMeasurementPass: true })
    expect(html).toContain('overflow:visible;')
    expect(html).not.toContain('height:9mm')
  })

  it('单元格缺省为自适应行高；设 wordWrap:false 时缺省转为截断', () => {
    const data = { items: [{}] }
    const auto = generateHtml(bindData(cellTemplate(), data), [], data, { isMeasurementPass: true })
    expect(auto).toContain('<td')
    expect(auto).not.toContain('class="cell-fit"')

    const clip = generateHtml(
      bindData(cellTemplate({ wordWrap: false }), data),
      [],
      data,
      { isMeasurementPass: true },
    )
    expect(clip).toContain('class="cell-fit"')
    expect(clip).toContain('text-overflow:ellipsis')
    expect(clip).not.toContain('data-fit="shrink"')
  })
})
