// P4：图表出纸实现已从 core 的 case 'chart' 迁入本包 render.html。
// 断言沿用改造前 core/render/chart-element.test.ts 的语义（含占位、尺寸、绑定产物优先）。
import { describe, expect, it } from 'vitest'
import { generateHtml, paginate } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import '../plugin.js'
import { renderChartElement } from '../plugin.js'
import { mmToChartPx } from '../renderer.js'

const baseSpec = (extra: Record<string, unknown> = {}) => ({
  type: 'chart',
  key: 'k1',
  widthMm: 100,
  heightMm: 60,
  ...extra,
})

function chartTemplate(options: Record<string, unknown> = {}): PrintTemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{
      id: 'chart-1', type: 'chart',
      options: { left: 10, top: 20, width: 100, height: 60, title: '图表', ...options },
    }],
  } as unknown as PrintTemplateData
}

describe('图表插件出图（P4 归位到包内）', () => {
  it('有 option 时输出内联 SVG，viewBox 按落纸 mm 换算', () => {
    const svg = renderChartElement(baseSpec({ chartOption: { series: [] } }))
    expect(svg).toContain('<svg')
    expect(svg).toContain(`viewBox="0 0 ${mmToChartPx(100)} ${mmToChartPx(60)}"`)
    expect(svg).toContain('width="100%"')
  })

  it('无 option 时降级为标题占位，不出空纸', () => {
    expect(renderChartElement(baseSpec({ title: '销售趋势' }))).toBe('<span>销售趋势</span>')
    expect(renderChartElement(baseSpec())).toBe('<span>图表</span>')
  })

  it('绑定产物 _chartOption 优先于模板 chartOption', () => {
    const svg = renderChartElement(baseSpec({
      chartOption: { title: { text: '原始标题' }, series: [] },
      _chartOption: { title: { text: '绑定后标题' }, series: [] },
    }))
    expect(svg).toContain('绑定后标题')
    expect(svg).not.toContain('原始标题')
  })

  it('非法 option（数组）按无 option 处理，不抛错', () => {
    expect(renderChartElement(baseSpec({ chartOption: [1, 2] }))).toBe('<span>图表</span>')
  })

  it('通用分派：最终趟 SVG 内联进元素盒，带 data-element-id', () => {
    const template = chartTemplate({ chartOption: { series: [] } })
    const html = generateHtml(template, paginate(template, new Map()))
    expect(html).toContain('<svg')
    expect(html).toContain('data-element-id="chart-1"')
  })

  it('通用分派：测量趟同样内联 SVG，带 data-measure-id', () => {
    const template = chartTemplate({ chartOption: { series: [] } })
    const html = generateHtml(template, [], undefined, { isMeasurementPass: true })
    expect(html).toContain('<svg')
    expect(html).toContain('data-measure-id="chart-1"')
    expect(html).not.toContain('data-element-id="chart-1"')
  })
})
