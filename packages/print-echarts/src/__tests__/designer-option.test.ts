import { describe, it, expect } from 'vitest'
import { createDefaultChartOption } from '../defaults.js'
import { previewChartOption, readPaletteKey, syncSeriesCount } from '../designer/option-utils.js'

const preview = (type: string) => previewChartOption(type, createDefaultChartOption(type)) as Record<string, any>

describe('设计态预览占位', () => {
  it('直角系：类目与数值样例', () => {
    const bar = preview('barChart')
    expect(bar.xAxis.data).toEqual(['示例一', '示例二', '示例三'])
    expect(bar.series[0].data).toHaveLength(3)
    expect(typeof bar.series[0].data[0]).toBe('number')
  })

  it('饼图/漏斗生成 { name, value }', () => {
    expect(preview('pieChart').series[0].data[0]).toMatchObject({ name: '示例一', value: expect.any(Number) })
    expect(preview('funnelChart').series[0].data).toHaveLength(3)
  })

  it('散点生成 [x,y]，雷达生成 indicator + 行系列，仪表盘生成 { value }', () => {
    expect(Array.isArray(preview('scatterChart').series[0].data[0])).toBe(true)
    const radar = preview('radarChart')
    expect(radar.radar.indicator).toHaveLength(3)
    expect(radar.series[0].data[0]).toMatchObject({ name: '示例', value: expect.any(Array) })
    expect(preview('gaugeChart').series[0].data[0]).toMatchObject({ value: expect.any(Number) })
  })

  it('非法 option 返回空对象', () => {
    expect(previewChartOption('barChart', undefined)).toEqual({})
    expect(previewChartOption('barChart', [] as any)).toEqual({})
  })
})

describe('配色回读与 series 对齐', () => {
  it('readPaletteKey 命中预设或回落 default', () => {
    const palettes = [{ key: 'default', colors: ['#111', '#222'] }]
    expect(readPaletteKey({ color: ['#111', '#222'] }, palettes)).toBe('default')
    expect(readPaletteKey({ color: ['#999'] }, palettes)).toBe('default')
  })

  it('syncSeriesCount 按 kind 的 series 类型补足并保留自定义字段', () => {
    const line = syncSeriesCount({ series: [{ type: 'line', data: ['$data'], symbolSize: 4 }] }, 2, 'lineChart') as Record<string, any>
    expect(line.series).toHaveLength(2)
    expect(line.series[1].type).toBe('line')
    expect(line.series[1].symbolSize).toBe(4)
    expect(line.series[1].data).toEqual(['$data'])
  })
})
