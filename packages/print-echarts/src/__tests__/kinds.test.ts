import { describe, it, expect } from 'vitest'
import { CHART_KINDS, CHART_KIND_DEFINITIONS, getChartKindDefinition, resolveChartPanelFields } from '../kinds.js'

describe('十类图表 kind 定义', () => {
  it('type/label/图标/seriesType 齐全且唯一', () => {
    expect(CHART_KIND_DEFINITIONS).toHaveLength(10)
    expect(new Set(CHART_KINDS).size).toBe(10)
    expect([...CHART_KINDS]).toEqual([
      'barChart', 'barHChart', 'lineChart', 'areaChart', 'pieChart',
      'doughnutChart', 'scatterChart', 'radarChart', 'funnelChart', 'gaugeChart',
    ])
    for (const def of CHART_KIND_DEFINITIONS) {
      expect(def.icon).toMatch(/^[A-Z]/)
      expect(def.fields.length).toBeGreaterThan(2)
      expect(def.notes.length).toBeGreaterThan(0)
      expect(def.defaultWidth).toBeGreaterThan(0)
      expect(def.defaultHeight).toBeGreaterThan(0)
    }
  })

  it('面板字段按 kind 裁剪', () => {
    expect(resolveChartPanelFields('barChart')).toEqual(expect.arrayContaining(['dataSource', 'categoryField', 'valueFields', 'stack', 'palette']))
    expect(resolveChartPanelFields('lineChart')).not.toContain('innerRadius')
    expect(resolveChartPanelFields('pieChart')).not.toContain('stack')
    expect(resolveChartPanelFields('doughnutChart')).toContain('innerRadius')
    expect(resolveChartPanelFields('scatterChart')).toContain('bubble')
    expect(resolveChartPanelFields('gaugeChart')).toContain('gaugeRange')
    expect(resolveChartPanelFields('gaugeChart')).not.toContain('categoryField')
    expect(resolveChartPanelFields('funnelChart')).toContain('padding')
    expect(resolveChartPanelFields('radarChart')).toContain('radius')
    expect(resolveChartPanelFields('barChart')).not.toContain('padding')
    expect(resolveChartPanelFields('unknown')).toEqual([])
  })

  it('未知 type 返回 undefined', () => {
    expect(getChartKindDefinition('chart')).toBeUndefined()
  })
})
