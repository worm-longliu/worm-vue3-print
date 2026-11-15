import { describe, it, expect } from 'vitest'
import { bindChartData } from '../bind.js'
import { createDefaultChartOption } from '../defaults.js'
import { CHART_KINDS } from '../kinds.js'

const DATA = {
  trend: [
    { name: '一月', sales: 120, profit: 40 },
    { name: '二月', sales: 168, profit: 62 },
  ],
}

/** 出纸前数据已绑定：用真实绑定产物而不是模板里的 $data 占位 */
const boundOption = (type: string): Record<string, unknown> => {
  const patch = bindChartData(type, {
    chartOption: createDefaultChartOption(type),
    chartDataSource: 'trend',
    chartCategoryField: type === 'scatterChart' ? 'sales' : 'name',
    chartValueFields: ['sales', 'profit'],
  }, DATA)
  return (patch._chartOption as Record<string, unknown>) ?? {}
}
import { fitSvgRoot, mmToChartPx, renderChartElement, renderChartToSvg } from '../renderer.js'

const specOf = (type: string) => ({
  key: `${type}-1`,
  type,
  option: boundOption(type),
  widthMm: 100,
  heightMm: 60,
})

describe('SVG 渲染器', () => {
  it('十类图表都能渲染出带 viewBox 的 SVG', () => {
    for (const type of CHART_KINDS) {
      const svg = renderChartToSvg(specOf(type))
      expect(svg.startsWith('<svg'), type).toBe(true)
      expect(svg).toContain('viewBox')
      expect(svg).toContain('width="100%"')
    }
  })

  it('mm→px 换算与 SVG 根节点归一', () => {
    expect(mmToChartPx(25.4)).toBe(96)
    expect(mmToChartPx(0)).toBe(1)
    const normalized = fitSvgRoot('<svg width="10" height="20" viewBox="0 0 10 20"><g/></svg>', 96, 192)
    expect(normalized).toContain('width="100%"')
    expect(normalized).toContain('viewBox="0 0 96 192"')
  })

  it('非法 option 抛错（由调用方降级）', () => {
    expect(() => renderChartToSvg({ key: 'k', type: 'barChart', option: [] as any, widthMm: 10, heightMm: 10 })).toThrow()
  })
})

describe('通用渲染分派入口', () => {
  it('绑定后的 _chartOption 优先，输出 SVG', () => {
    const html = renderChartElement({ type: 'pieChart', title: '饼图', widthMm: 60, heightMm: 60, _chartOption: createDefaultChartOption('pieChart') } as any)
    expect(html.startsWith('<svg')).toBe(true)
  })

  it('缺 option 或 option 非法时回落标题文本占位', () => {
    expect(renderChartElement({ type: 'barChart', title: '标题' } as any)).toBe('<span>标题</span>')
    expect(renderChartElement({ type: 'barChart', title: 'X', chartOption: [1] } as any)).toBe('<span>X</span>')
  })
})
