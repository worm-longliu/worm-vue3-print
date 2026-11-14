// @worm-vue3-print/echarts 入口：ECharts 图表元素可选包
// core / canvas 主包不引入 echarts；仅本包依赖图表库（peer: core、canvas、vue）。
//
// P4 起「import 即注册」：本入口加载时自动把 defineElementPlugin 描述符注册到 core 通用
// 注册表，并把设计器组件挂到同一描述符；宿主零改动即获得校验、绑定、三端出图与属性台 tab。
import './type-augmentation.js'
import { installEchartsDesignerExtension } from './designer/index.js'

export { createChartRenderer, renderChartToSvg } from './renderer.js'
export { installEchartsDesignerExtension, uninstallEchartsDesignerExtension } from './designer/index.js'
export {
  configureChartPlugin,
  getChartPluginConfig,
  getChartPalettes,
  getSampleCategories,
  chartFactoryDefaults,
} from './config.js'
export type { ChartPluginConfig, ChartPaletteDefinition, ChartPalette } from './config.js'
export {
  CHART_PALETTES,
  CHART_TYPE_LABELS,
  CHART_TYPES,
  createDefaultChartOption,
} from './constants.js'
export type { ChartPaletteKey, ChartType } from './constants.js'
export {
  CHART_PLUGIN,
  CHART_PLUGIN_ID,
  CHART_PLUGIN_TYPE,
  CHART_LEGACY_ALIASES,
  registerChartPlugin,
  registerChartDesigner,
  registerChartExecutorBundle,
  uninstallChartPlugin,
  bindChartOptions,
  renderChartElement,
} from './plugin.js'
export { fitSvgRoot, mmToChartPx } from './renderer.js'

// 触发自动注册（幂等；同 id 覆盖不会重复累积）
installEchartsDesignerExtension()
