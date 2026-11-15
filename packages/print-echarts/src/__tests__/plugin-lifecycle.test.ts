import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearElementPlugins, getElementPlugin, getElementPluginById } from '@worm-vue3-print/core/designer'
import { configureChartPlugin, getChartPalettes } from '../config.js'
import { CHART_PLUGIN_ID, CHART_PLUGIN, registerChartPlugin, uninstallChartPlugin } from '../plugin.js'
import { CHART_KINDS } from '../kinds.js'

beforeEach(() => {
  clearElementPlugins()
  registerChartPlugin()
})

afterEach(() => {
  clearElementPlugins()
  // 还原版本级配置，避免测试间串味
  configureChartPlugin({ defaultWidth: undefined as any, defaultHeight: undefined as any, palettes: undefined as any })
})

describe('插件自注册与多 kind', () => {
  it('一个插件 id 下十个 kind 都能按 type 解析到', () => {
    expect(getElementPluginById(CHART_PLUGIN_ID)).toBe(CHART_PLUGIN)
    for (const type of CHART_KINDS) {
      const plugin = getElementPlugin(type)
      expect(plugin?.id).toBe(CHART_PLUGIN_ID)
      expect(plugin?.kind.type).toBe(type)
      expect(plugin?.kind.fixedHeight).toBe(true)
      expect(plugin?.render?.html).toBeTypeOf('function')
    }
  })

  it('每个 kind 的出厂默认尺寸/标签按定义生效', () => {
    expect(getElementPlugin('barChart')?.kind.defaultOptions?.()).toMatchObject({ width: 100, height: 60, title: '柱状图' })
    expect(getElementPlugin('pieChart')?.kind.defaultOptions?.()).toMatchObject({ width: 60, height: 60, title: '饼图' })
    expect(getElementPlugin('gaugeChart')?.kind.defaultOptions?.()).toMatchObject({ width: 60, height: 60 })
  })

  it('kind 级 binding 各自绑定（柱状图与雷达图处理结果不同）', () => {
    const data = { trend: [{ name: 'A', sales: 10, profit: 4 }] }
    const base = { chartOption: { series: [{ type: 'bar', data: ['$data'] }] }, chartDataSource: 'trend', chartCategoryField: 'name', chartValueFields: ['sales'] }
    const bar = getElementPlugin('barChart')!.binding!.bind({ ...base }, data) as Record<string, any>
    expect(bar._chartOption.series[0].data).toEqual([10])
    const radar = getElementPlugin('radarChart')!.binding!.bind({ ...base, chartOption: { radar: { indicator: [] }, series: [{ type: 'radar', data: ['$data'] }] } }, data) as Record<string, any>
    expect(radar._chartOption.radar.indicator[0].name).toBe('sales')
  })

  it('configureChartPlugin 惰性生效：尺寸/配色即时影响出厂默认', () => {
    configureChartPlugin({ defaultWidth: 120, defaultHeight: 70, palettes: { brand: { label: '品牌色', colors: ['#F2704E'] } } })
    expect(getElementPlugin('barChart')?.kind.defaultOptions?.()).toMatchObject({ width: 120, height: 70 })
    expect(getChartPalettes().some(palette => palette.key === 'brand')).toBe(true)
    configureChartPlugin({ defaultWidth: undefined as any, defaultHeight: undefined as any, palettes: undefined as any })
    expect(getElementPlugin('barChart')?.kind.defaultOptions?.()).toMatchObject({ width: 100, height: 60 })
  })

  it('uninstall 后十个 type 全部回落', () => {
    uninstallChartPlugin()
    for (const type of CHART_KINDS) expect(getElementPlugin(type)).toBeUndefined()
  })

  it('重复注册幂等：不产生重复 kind', () => {
    registerChartPlugin()
    registerChartPlugin()
    expect(getElementPluginById(CHART_PLUGIN_ID)?.kinds).toHaveLength(10)
  })
})
