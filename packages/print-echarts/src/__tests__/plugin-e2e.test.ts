// 真实 echarts 插件端到端：走 core 的 prepareDocument / renderPdf 两条路由，
// 断言十个 kind 都真正出 SVG（无文本占位），覆盖「拆分元素后仍能出纸」的回归。
import { describe, it, expect } from 'vitest'
import { prepareDocument, renderPdf } from '@worm-vue3-print/core'
import { createDefaultChartOption } from '../defaults.js'
import { CHART_KIND_DEFINITIONS } from '../kinds.js'
import './../plugin.js'

const MM_TO_PX = 96 / 25.4
const ROWS = 5
const COLS = 2

function template() {
  const elements = CHART_KIND_DEFINITIONS.map((def, index) => {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    return {
      id: `chart-${def.type}`,
      type: def.type,
      printElementType: { type: def.type, title: def.label },
      options: {
        left: 10 + col * 95,
        top: 10 + row * 55,
        width: 90,
        height: 45,
        chartOption: createDefaultChartOption(def.type),
        chartDataSource: 'trend',
        chartCategoryField: 'sales',
        chartValueFields: ['sales', 'profit'],
      },
    }
  })
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements,
  } as any
}

const DATA = {
  trend: [
    { name: '一月', sales: 120, profit: 40 },
    { name: '二月', sales: 168, profit: 62 },
    { name: '三月', sales: 145, profit: 51 },
  ],
}

function sessionOf() {
  return {
    renderCodes: async () => new Map<string, string>(),
    renderAssets: async () => new Map<string, string>(),
    measure: async () => ({
      measurements: Array.from({ length: 10 }, (_, index) => ({
        id: `chart-${CHART_KIND_DEFINITIONS[index]!.type}`,
        heightPx: Math.round(45 * MM_TO_PX),
      })),
      fits: [],
    }),
    probeContentBottom: async () => 0,
    toPdf: async () => new Uint8Array([9, 9, 9]),
  }
}

const runtime = {
  withSession: async (_options: unknown, fn: (session: unknown) => Promise<unknown>) => fn(sessionOf()),
} as any

const svgCount = (html: string): number => (html.match(/<svg\b/g) ?? []).length

describe('真实插件端到端出图', () => {
  it('prepareDocument：十个 kind 全部内联 SVG，无文本占位', async () => {
    const prepared = await prepareDocument({ templateJson: template(), printData: DATA }, runtime)
    expect(svgCount(prepared.html)).toBe(10)
    expect(prepared.html.match(/viewBox/g)?.length ?? 0).toBeGreaterThanOrEqual(10)
    expect(prepared.html).not.toContain('<span>图表</span>')
    for (const def of CHART_KIND_DEFINITIONS) {
      expect(prepared.html).toContain(`data-element-id="chart-${def.type}"`)
    }
  })

  it('renderPdf：PDF 与同一份含十图 HTML 一起返回', async () => {
    const result = await renderPdf({ templateJson: template(), printData: DATA }, runtime)
    expect(svgCount(result.prepared.html)).toBe(10)
    expect(result.pdf).toEqual(new Uint8Array([9, 9, 9]))
  })
})
