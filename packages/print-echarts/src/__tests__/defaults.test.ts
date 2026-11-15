import { describe, it, expect } from 'vitest'
import { createDefaultChartOption } from '../defaults.js'
import { CHART_KIND_DEFINITIONS } from '../kinds.js'

describe('出厂 option', () => {
  it('每个 kind 的 series[0].type 与 kind 语义一致（折线不落成柱）', () => {
    const expected: Record<string, string> = {
      barChart: 'bar', barHChart: 'bar', lineChart: 'line', areaChart: 'line',
      pieChart: 'pie', doughnutChart: 'pie', scatterChart: 'scatter',
      radarChart: 'radar', funnelChart: 'funnel', gaugeChart: 'gauge',
    }
    for (const def of CHART_KIND_DEFINITIONS) {
      const option = createDefaultChartOption(def.type) as Record<string, any>
      expect(option.series[0].type, def.type).toBe(expected[def.type])
    }
  })

  it('直角系按方向生成轴，面积图带 areaStyle，环形图带双半径', () => {
    const bar = createDefaultChartOption('barChart') as Record<string, any>
    expect(bar.xAxis).toMatchObject({ type: 'category', data: ['$data'] })
    expect(bar.yAxis).toMatchObject({ type: 'value' })
    const barH = createDefaultChartOption('barHChart') as Record<string, any>
    expect(barH.xAxis).toMatchObject({ type: 'value' })
    expect(barH.yAxis).toMatchObject({ type: 'category', data: ['$data'] })
    expect((createDefaultChartOption('areaChart') as Record<string, any>).series[0].areaStyle).toEqual({})
    expect((createDefaultChartOption('doughnutChart') as Record<string, any>).series[0].radius).toEqual(['40%', '70%'])
  })

  it('雷达/仪表盘/漏斗拿到合法初始形态', () => {
    expect((createDefaultChartOption('radarChart') as Record<string, any>).radar.indicator).toEqual([])
    expect((createDefaultChartOption('gaugeChart') as Record<string, any>).series[0]).toMatchObject({ min: 0, max: 100 })
    expect((createDefaultChartOption('funnelChart') as Record<string, any>).series[0].sort).toBe('descending')
  })

  it('未知 kind 回落柱状图而不是抛错', () => {
    expect((createDefaultChartOption('unknown') as Record<string, any>).series[0].type).toBe('bar')
  })
})
