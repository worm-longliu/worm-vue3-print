// print-core/src/render/chart-element.test.ts
// 图表元素出纸：内联 SVG（矢量）、缺渲染器/渲染失败降级占位、_chartOption 优先
import { describe, it, expect } from 'vitest'
import { generateHtml } from './html-generator.js'
import { paginate } from './pagination-engine.js'
import type { ChartRenderer, TemplateData } from './types.js'

const singlePage = [{ pageIndex: 0, sections: [] }] as any

function chartTemplate(options: Record<string, any> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{ id: 'chart-1', type: 'chart', options: { left: 10, top: 20, width: 100, height: 60, title: '图表', ...options } } as any],
  } as TemplateData
}

const stubRenderer = (onRender?: () => void): ChartRenderer => ({
  render(spec) {
    onRender?.()
    return `<svg data-chart="stub" data-w-mm="${spec.widthMm}" data-h-mm="${spec.heightMm}" viewBox="0 0 100 60"></svg>`
  },
})

describe('图表元素出纸', () => {
  it('最终趟：图表 SVG 内联进元素盒，带 data-element-id', () => {
    const template = chartTemplate({ chartOption: { series: [] } })
    const html = generateHtml(template, paginate(template, new Map()), undefined, {
      chartRenderer: stubRenderer(),
    })
    expect(html).toContain('<svg data-chart="stub"')
    expect(html).toContain('data-element-id="chart-1"')
    expect(html).toContain('data-w-mm="100"')
    expect(html).toContain('data-h-mm="60"')
  })

  it('测量趟：同样内联图表 SVG（固定高，不依赖 SVG 内布局），带 data-measure-id', () => {
    const html = generateHtml(chartTemplate({ chartOption: { series: [] } }), singlePage, undefined, {
      isMeasurementPass: true,
      chartRenderer: stubRenderer(),
    })
    expect(html).toContain('<svg data-chart="stub"')
    expect(html).toContain('data-measure-id="chart-1"')
    expect(html).not.toContain('data-element-id="chart-1"')
  })

  it('缺渲染器：降级为标题占位文本，不出现空纸', () => {
    const template = chartTemplate({ chartOption: { series: [] }, title: '销售趋势' })
    const html = generateHtml(template, paginate(template, new Map()))
    expect(html).not.toContain('<svg data-chart')
    expect(html).toContain('销售趋势')
  })

  it('渲染器抛错：降级占位，不中断整页渲染', () => {
    const template = chartTemplate({ chartOption: { series: [] }, title: '图表' })
    const html = generateHtml(template, paginate(template, new Map()), undefined, {
      chartRenderer: { render() { throw new Error('render failed') } },
    })
    expect(html).not.toContain('<svg data-chart')
    expect(html).toContain('data-element-id="chart-1"')
  })

  it('绑定产物 _chartOption 优先于模板 chartOption', () => {
    let captured: unknown
    const template = chartTemplate({
      chartOption: { title: { text: '原始' } },
      _chartOption: { title: { text: '绑定后' } },
    })
    const html = generateHtml(
      template,
      paginate(template, new Map()),
      undefined,
      {
        chartRenderer: {
          render(spec) {
            captured = spec.option
            return '<svg data-chart="stub"></svg>'
          },
        },
      },
    )
    expect(html).toContain('<svg data-chart="stub"')
    expect(captured).toEqual({ title: { text: '绑定后' } })
  })
})
