import { describe, it, expect } from 'vitest'
import { createDefaultChartOption } from '../defaults.js'
import {
  previewChartOption, readFunnelPadding, readPaletteKey, readRadarRadius,
  syncSeriesCount, writeFunnelPadding, writeRadarRadius,
} from '../designer/option-utils.js'

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

describe('留白读写（漏斗内边距 / 雷达半径）', () => {
  it('漏斗：百分比原样回读，px 与缺省按当前元素框折算', () => {
    const padding = readFunnelPadding(
      { series: [{ type: 'funnel', left: '5%', right: '25%', top: '6%', bottom: '6%' }] },
      60,
      60,
    )
    expect(padding).toEqual({ top: 6, right: 25, bottom: 6, left: 5 })

    // ECharts 内置 px 默认（left/right 80、top 60、bottom 65）折算到 60mm 框（227px）
    const legacy = readFunnelPadding({}, 60, 60)
    expect(legacy.left).toBeCloseTo(35.2, 1)
    expect(legacy.right).toBeCloseTo(35.2, 1)
    expect(legacy.top).toBeCloseTo(26.4, 1)
    expect(legacy.bottom).toBeCloseTo(28.6, 1)
  })

  it('漏斗：写回百分比并保留其它 option 字段', () => {
    const written = writeFunnelPadding(
      { title: { text: '漏斗' }, series: [{ type: 'funnel', data: ['$data'], gap: 2 }] },
      { top: 6, right: 20, bottom: 6, left: 5 },
    ) as Record<string, any>
    expect(written.series[0]).toMatchObject({ type: 'funnel', gap: 2, top: '6%', right: '20%', bottom: '6%', left: '5%' })
    expect(written.title.text).toBe('漏斗')
  })

  it('雷达：默认回读 ECharts 内置 50%，写回保留 indicator 等自定义字段', () => {
    expect(readRadarRadius({ radar: {} }, 60, 60)).toBe(50)
    expect(readRadarRadius({ radar: { radius: '75%' } }, 60, 60)).toBe(75)
    const written = writeRadarRadius({ radar: { indicator: [{ name: 'a', max: 10 }] } }, 80) as Record<string, any>
    expect(written.radar).toMatchObject({ radius: '80%', indicator: [{ name: 'a', max: 10 }] })
  })
})
