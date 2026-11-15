// @worm-vue3-print/echarts-common 入口：import 即把十类图表的 common 设计器 UI
// 注册进 @worm-vue3-print/plugin-kit 注册表，零框架宿主无需额外调用。
import './ui.js'

export { CHART_ELEMENT_UI, installChartCommonUI, uninstallChartCommonUI } from './ui.js'
