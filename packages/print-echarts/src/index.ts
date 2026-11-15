// @worm-vue3-print/echarts 入口：ECharts 图表元素可选包
// core / canvas 主包不引入 echarts；仅本包依赖图表库（peer: core、canvas、vue）。
//
// import 即注册：本入口加载时自动把一个「十 kind」插件描述符注册到 core 通用注册表，
// 并把设计器组件挂到同一描述符；宿主零改动即获得校验、绑定、三端出图与属性台 tab。
import './type-augmentation.js'
import { installChartDesigner } from './designer/index.js'

export { CHART_PLUGIN, registerChartPlugin, registerChartDesigner, registerChartExecutorBundle, uninstallChartPlugin } from './plugin.js'
export { CHART_PLUGIN_ID, CHART_PALETTES } from './constants.js'
export type { ChartPaletteKey } from './constants.js'
export { installChartDesigner, uninstallChartDesigner } from './designer/index.js'
export {
  configureChartPlugin,
  getChartPluginConfig,
  getChartPalettes,
  getSampleCategories,
  chartFactoryDefaults,
} from './config.js'
export type { ChartPluginConfig, ChartPaletteDefinition, ChartPalette } from './config.js'
export { CHART_KINDS, CHART_KIND_DEFINITIONS, getChartKindDefinition, resolveChartPanelFields } from './kinds.js'
export type { ChartFieldKey, ChartKindDefinition, ChartSeriesType } from './kinds.js'
export { createDefaultChartOption } from './defaults.js'
export { normalizeChartOption } from './normalize.js'
export { bindChartData } from './bind.js'
export { fitSvgRoot, mmToChartPx, renderChartElement, renderChartToSvg } from './renderer.js'
export type { ChartRenderSpec } from './renderer.js'

// 触发设计器注册（幂等；同 id 覆盖不会重复累积）
installChartDesigner()
