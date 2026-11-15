import { describe, it, expect } from 'vitest'
import { bindChartData } from '../bind.js'
import { createDefaultChartOption } from '../defaults.js'

const data = { trend: [{ name: '一月', sales: 120, profit: 40 }, { name: '二月', sales: 168, profit: 62 }] }

const bind = (type: string, patch: Record<string, unknown> = {}) => bindChartData(type, {
  chartOption: createDefaultChartOption(type),
  chartDataSource: 'trend',
  chartCategoryField: 'name',
  chartValueFields: ['sales'],
  ...patch,
}, data)._chartOption as Record<string, any>

describe('图表数据绑定', () => {
  it('直角坐标系：类目与多值多系列（字段多于 series 时自动补足）', () => {
    expect(bind('barChart').series[0].data).toEqual([120, 168])
    expect(bind('barChart').xAxis.data).toEqual(['一月', '二月'])
    const line = bind('lineChart', { chartValueFields: ['sales', 'profit'] })
    expect(line.series).toHaveLength(2)
    expect(line.series[1].data).toEqual([40, 62])
  })

  it('条形图把类目写进 yAxis、数值写进 xAxis 系列', () => {
    const opt = bind('barHChart')
    expect(opt.yAxis.data).toEqual(['一月', '二月'])
    expect(opt.series[0].data).toEqual([120, 168])
  })

  it('系列拆分字段：每个取值一个 series，同组类目累加', () => {
    const rows = { trend: [{ name: 'A', region: '东', sales: 1 }, { name: 'A', region: '东', sales: 2 }, { name: 'B', region: '西', sales: 3 }] }
    const opt = bindChartData('barChart', {
      chartOption: createDefaultChartOption('barChart'), chartDataSource: 'trend',
      chartCategoryField: 'name', chartValueFields: ['sales'], chartSeriesField: 'region',
    }, rows)._chartOption as Record<string, any>
    expect(opt.series.map((s: any) => s.name)).toEqual(['东', '西'])
    expect(opt.series[0].data).toEqual([3, null])
    expect(opt.xAxis.data).toEqual(['A', 'B'])
  })

  it('饼图/环形图生成 { name, value }，漏斗按数值降序', () => {
    expect(bind('pieChart').series[0].data).toEqual([{ name: '一月', value: 120 }, { name: '二月', value: 168 }])
    const funnel = bind('funnelChart')
    expect(funnel.series[0].data.map((item: any) => item.value)).toEqual([168, 120])
  })

  it('散点图 x/y 成对；气泡开启时第二数值字段作 symbolSize', () => {
    const scatter = bindChartData('scatterChart', {
      chartOption: createDefaultChartOption('scatterChart'), chartDataSource: 'trend',
      chartCategoryField: 'sales', chartValueFields: ['sales', 'profit'], chartBubble: true,
    }, data)._chartOption as Record<string, any>
    expect(scatter.series[0].data[0]).toMatchObject({ value: [120, 120], symbolSize: expect.any(Number) })
    const plain = bindChartData('scatterChart', {
      chartOption: createDefaultChartOption('scatterChart'), chartDataSource: 'trend',
      chartCategoryField: 'sales', chartValueFields: ['sales'],
    }, data)._chartOption as Record<string, any>
    expect(plain.series[0].data[0]).toEqual([120, 120])
  })

  it('雷达图：数值字段作维度，每行一个系列，max 上浮取整', () => {
    const radar = bindChartData('radarChart', {
      chartOption: createDefaultChartOption('radarChart'), chartDataSource: 'trend',
      chartCategoryField: 'name', chartValueFields: ['sales', 'profit'],
    }, data)._chartOption as Record<string, any>
    expect(radar.radar.indicator.map((item: any) => item.name)).toEqual(['sales', 'profit'])
    expect(radar.radar.indicator[0].max).toBeGreaterThanOrEqual(168)
    expect(radar.series[0].data).toEqual([
      { name: '一月', value: [120, 40] },
      { name: '二月', value: [168, 62] },
    ])
  })

  it('仪表盘：首行首值，min/max 沿用模板 option', () => {
    const gauge = bindChartData('gaugeChart', {
      chartOption: { ...createDefaultChartOption('gaugeChart'), series: [{ type: 'gauge', min: 0, max: 200, data: ['$data'] }] },
      chartDataSource: 'trend', chartValueFields: ['sales'],
    }, data)._chartOption as Record<string, any>
    expect(gauge.series[0].data).toEqual([{ value: 120, name: 'sales' }])
    expect(gauge.series[0]).toMatchObject({ min: 0, max: 200 })
  })

  it('手写真实数据（无 $data 占位）不被字段映射覆盖', () => {
    const handwritten = { series: [{ type: 'bar', data: [1, 2, 3] }] }
    const opt = bindChartData('barChart', {
      chartOption: handwritten, chartDataSource: 'trend',
      chartCategoryField: 'name', chartValueFields: ['sales'],
    }, data)._chartOption as Record<string, any>
    expect(opt.series[0].data).toEqual([1, 2, 3])
  })

  it('无数据源 / 无数值字段 / option 非法时原样返回', () => {
    expect(bindChartData('barChart', { chartOption: createDefaultChartOption('barChart'), chartValueFields: [] }, data)).toEqual({ _chartOption: expect.any(Object) })
    expect(bindChartData('barChart', { chartOption: createDefaultChartOption('barChart'), chartDataSource: 'none', chartValueFields: ['sales'] }, data)._chartOption).toBeTruthy()
    expect(bindChartData('barChart', { chartOption: 'bad' }, data)).toEqual({})
  })
})
