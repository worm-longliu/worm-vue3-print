// ECharts 插件配置的唯一读取点（P5）。
// configurePlugin 是惰性的：配置可在注册前后任意时刻写入，描述符在调用时读取快照，
// 因此不需要「改配置 → 注销 → 重注册」，也不存在注册时序竞态。
import { configurePlugin, getPluginConfig } from '@worm-vue3-print/core/designer'
import {
  CHART_PALETTES,
  CHART_PLUGIN_ID,
  CHART_TYPES,
  createDefaultChartOption,
} from './constants.js'
import type { ChartType } from './constants.js'

export interface ChartPaletteDefinition {
  label?: string
  colors: readonly string[]
}

/** 可通过 configureChartPlugin() 写入的全部配置键（均为可选，缺省走出厂默认） */
export interface ChartPluginConfig {
  /** 新建图表元素的默认宽度（mm） */
  defaultWidth?: number
  /** 新建图表元素的默认高度（mm） */
  defaultHeight?: number
  /** 新建图表元素的默认类型；非法值回落出厂态 */
  defaultChartType?: ChartType
  /** 覆盖出厂 chartOption（优先于 defaultChartType） */
  defaultChartOption?: Record<string, unknown>
  /** 追加的 ECharts 图表/组件构造器，交给 echarts.use（如 GaugeChart、MarkLineComponent） */
  components?: readonly unknown[]
  /** 覆盖同名预设配色或新增配色：key → { label, colors } */
  palettes?: Readonly<Record<string, ChartPaletteDefinition>>
  /** 设计态示例类目（模板态 $data 占位在无绑定数据时的替换值） */
  sampleCategories?: readonly string[]
}

/** 写入插件配置；可在注册前调用，多次调用按键合并 */
export function configureChartPlugin(config: ChartPluginConfig): void {
  configurePlugin(CHART_PLUGIN_ID, config as Record<string, unknown>)
}

/** 读取插件配置快照 */
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
  const builtin: ChartPalette[] = CHART_PALETTES.map((palette) => {
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

const FALLBACK_SAMPLE_CATEGORIES: readonly string[] = ['示例一', '示例二', '示例三']

/** 设计态示例类目；未配置时与 P0 行为逐字一致 */
export function getSampleCategories(): readonly string[] {
  const custom = getChartPluginConfig().sampleCategories
  return Array.isArray(custom) && custom.length > 0 ? custom : FALLBACK_SAMPLE_CATEGORIES
}

/**
 * 元素出厂默认选项：core 元素工厂与 canvas 素材卡共用同一份，
 * 避免 P4 之前「两处各写一份 100/60/bar」的漂移。
 */
export function chartFactoryDefaults(partial?: Record<string, unknown>): Record<string, unknown> {
  const config = getChartPluginConfig()
  const width = typeof config.defaultWidth === 'number' ? config.defaultWidth : 100
  const height = typeof config.defaultHeight === 'number' ? config.defaultHeight : 60
  const chartType = typeof config.defaultChartType === 'string'
    && (CHART_TYPES as readonly string[]).includes(config.defaultChartType)
    ? config.defaultChartType
    : undefined
  const option = config.defaultChartOption && typeof config.defaultChartOption === 'object'
    ? config.defaultChartOption
    : chartType
      ? createDefaultChartOption(chartType)
      : {
          // 与旧 core createDefaultOptions('chart') 逐字一致（设计文件出厂态）
          title: { text: '销售趋势', left: 'center' },
          grid: { left: '8%', right: '8%', bottom: '12%', top: '18%' },
          xAxis: { type: 'category', data: ['$data'] },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: ['$data'], name: '数量' }],
        }
  return {
    width,
    height,
    title: '图表',
    chartOption: option,
    chartDataSource: '',
    chartCategoryField: 'name',
    chartValueFields: ['value'],
    chartSeriesField: '',
    ...partial,
  }
}
