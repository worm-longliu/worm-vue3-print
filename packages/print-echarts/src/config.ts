// ECharts 插件配置的唯一读取点：configurePlugin 是惰性的，可在注册前后任意时刻写入，
// 描述符在调用时读取快照，因此不需要「改配置 → 注销 → 重注册」。
import { configurePlugin, getPluginConfig } from '@worm-vue3-print/core/designer'
import { CHART_PALETTES, CHART_PLUGIN_ID, FALLBACK_SAMPLE_CATEGORIES } from './constants.js'
import { getChartKindDefinition } from './kinds.js'
import { createDefaultChartOption } from './defaults.js'

export interface ChartPaletteDefinition {
  label?: string
  colors: readonly string[]
}

/** 可通过 configureChartPlugin() 写入的全部配置键（均可选，缺省走出厂默认） */
export interface ChartPluginConfig {
  /** 新建图表元素的默认宽度（mm）；kind 自带默认尺寸，配置优先 */
  defaultWidth?: number
  /** 新建图表元素的默认高度（mm） */
  defaultHeight?: number
  /** 覆盖同名预设配色或新增配色：key → { label, colors } */
  palettes?: Readonly<Record<string, ChartPaletteDefinition>>
  /** 追加的 ECharts 图表/组件构造器，交给 echarts.use（如 GaugeChart、MarkLineComponent） */
  components?: readonly unknown[]
  /** 设计态示例类目（模板态 $data 占位在无绑定数据时的替换值） */
  sampleCategories?: readonly string[]
}

export function configureChartPlugin(config: ChartPluginConfig): void {
  configurePlugin(CHART_PLUGIN_ID, config as Record<string, unknown>)
}

export function getChartPluginConfig(): ChartPluginConfig {
  return getPluginConfig(CHART_PLUGIN_ID) as ChartPluginConfig
}

export interface ChartPalette {
  key: string
  label: string
  colors: readonly string[]
}

/** 预设配色 ∪ 自定义配色：同名以自定义为准，新增 key 追加在末尾 */
export function getChartPalettes(): ChartPalette[] {
  const overrides = getChartPluginConfig().palettes ?? {}
  const builtin: ChartPalette[] = CHART_PALETTES.map(palette => {
    const custom = overrides[palette.key]
    return custom
      ? { key: palette.key, label: custom.label ?? palette.label, colors: custom.colors }
      : { key: palette.key, label: palette.label, colors: palette.colors }
  })
  const extra: ChartPalette[] = Object.entries(overrides)
    .filter(([key]) => !CHART_PALETTES.some(palette => palette.key === key))
    .map(([key, value]) => ({ key, label: value.label ?? key, colors: value.colors }))
  return [...builtin, ...extra]
}

/** 设计态示例类目；未配置时与 P0 行为一致 */
export function getSampleCategories(): readonly string[] {
  const custom = getChartPluginConfig().sampleCategories
  return Array.isArray(custom) && custom.length > 0 ? custom : FALLBACK_SAMPLE_CATEGORIES
}

/** 某 kind 的元素出厂默认选项：core 元素工厂与 canvas 素材卡共用同一份 */
export function chartFactoryDefaults(type: string, partial?: Record<string, unknown>): Record<string, unknown> {
  const config = getChartPluginConfig()
  const def = getChartKindDefinition(type)
  return {
    width: typeof config.defaultWidth === 'number' ? config.defaultWidth : def?.defaultWidth ?? 100,
    height: typeof config.defaultHeight === 'number' ? config.defaultHeight : def?.defaultHeight ?? 60,
    title: def?.label ?? '图表',
    chartOption: createDefaultChartOption(type),
    chartDataSource: '',
    chartCategoryField: 'name',
    chartValueFields: ['value'],
    chartSeriesField: '',
    ...partial,
  }
}
