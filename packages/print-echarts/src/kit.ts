// @worm-vue3-print/echarts/kit —— 框架无关纯 TS 子路径。
//
// 与包入口的区别：本文件不 import 任何 .vue 组件，也不读磁盘，供零框架宿主（common）
// 或自定义宿主构建自己的设计器 UI。import 即注册十 kind 到 core 插件注册表；
// 设计器 Vue 组件仍只在包入口（index.ts）注册。
import './type-augmentation.js'
import './plugin.js'

export { CHART_PLUGIN, registerChartPlugin, registerChartDesigner, registerChartExecutorBundle, uninstallChartPlugin } from './plugin.js'
export {
  CHART_PLUGIN_ID,
  CHART_PALETTES,
  ECHARTS_FUNNEL_PADDING_PX,
  ECHARTS_RADAR_RADIUS_DEFAULT,
  FALLBACK_SAMPLE_CATEGORIES,
  FUNNEL_PADDING_DEFAULTS,
  RADAR_RADIUS_DEFAULT,
} from './constants.js'
export type { ChartPaletteKey, FunnelPadding } from './constants.js'
export {
  chartFactoryDefaults,
  configureChartPlugin,
  getChartPalettes,
  getChartPluginConfig,
  getSampleCategories,
} from './config.js'
export type { ChartPalette, ChartPaletteDefinition, ChartPluginConfig } from './config.js'
export { CHART_KINDS, CHART_KIND_DEFINITIONS, getChartKindDefinition, resolveChartPanelFields } from './kinds.js'
export type { ChartFieldKey, ChartKindDefinition, ChartSeriesType } from './kinds.js'
export { createDefaultChartOption } from './defaults.js'
export { normalizeChartOption } from './normalize.js'
export { bindChartData } from './bind.js'
export { fitSvgRoot, mmToChartPx, renderChartElement, renderChartToSvg } from './renderer.js'
export type { ChartRenderSpec } from './renderer.js'
// 面板读写工具是纯 TS（无 Vue），common 适配包与 Vue 面板共用同一份口径
export {
  asObject,
  cloneChartOption,
  previewChartOption,
  readFunnelPadding,
  readPaletteKey,
  readRadarRadius,
  syncSeriesCount,
  writeFunnelPadding,
  writeRadarRadius,
} from './designer/option-utils.js'
