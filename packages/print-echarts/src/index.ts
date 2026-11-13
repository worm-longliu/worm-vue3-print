// @worm-vue3-print/echarts 入口：ECharts 图表元素可选包
// core / canvas 主包不引入 echarts；仅本包依赖图表库（peer: core、canvas、vue）。
export { createChartRenderer, renderChartToSvg } from './renderer.js'
export { installEchartsDesignerExtension } from './designer/index.js'
export {
  CHART_PALETTES,
  CHART_TYPE_LABELS,
  CHART_TYPES,
  createDefaultChartOption,
} from './constants.js'
export type { ChartPaletteKey, ChartType } from './constants.js'
