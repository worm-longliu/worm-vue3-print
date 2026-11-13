import { describe, expect, it } from 'vitest'
import { CHART_PALETTES, createDefaultChartOption } from '../constants.js'
import {
  asObject,
  previewChartOption,
  readChartType,
  readPaletteKey,
  syncSeriesCount,
  withChartType,
} from '../designer/option-utils.js'

describe('设计器图表 option 工具', () => {
  it('previewChartOption 把 $data 占位替换为示例数据（不修改原对象）', () => {
    const raw = createDefaultChartOption('bar')
    const preview = previewChartOption(raw)
    expect((preview.xAxis as Record<string, unknown>).data).toEqual(['示例一', '示例二', '示例三'])
    expect(((preview.series as Record<string, unknown>[])[0]!).data).toEqual([12, 20, 15])
    // 模板态占位保持不变，避免预览污染设计文件
    expect(((raw.series as Record<string, unknown>[])[0]!).data).toEqual(['$data'])
  })

  it('withChartType 切换面积/饼/散点的坐标系与 series 形态', () => {
    const bar = createDefaultChartOption('bar')
    expect(readChartType(bar)).toBe('bar')

    const area = withChartType(bar, 'area')
    expect(readChartType(area)).toBe('area')
    expect(((area.series as Record<string, unknown>[])[0]!).areaStyle).toBeTruthy()

    const pie = withChartType(bar, 'pie')
    expect(pie.xAxis).toBeUndefined()
    expect(((pie.series as Record<string, unknown>[])[0]!).type).toBe('pie')

    const scatter = withChartType(bar, 'scatter')
    expect(asObject(scatter.xAxis).type).toBe('value')
    expect(((scatter.series as Record<string, unknown>[])[0]!).type).toBe('scatter')
  })

  it('syncSeriesCount 按数值字段数对齐 series 且保留 $data 占位', () => {
    const option = syncSeriesCount(createDefaultChartOption('bar'), 3)
    const series = option.series as Record<string, unknown>[]
    expect(series).toHaveLength(3)
    for (const item of series) expect(item.data).toEqual(['$data'])
  })

  it('readPaletteKey 命中预设配色', () => {
    const option = { ...createDefaultChartOption('bar'), color: [...CHART_PALETTES[1]!.colors] }
    expect(readPaletteKey(option, CHART_PALETTES)).toBe('fresh')
    expect(readPaletteKey(createDefaultChartOption('bar'), CHART_PALETTES)).toBe('default')
  })
})
