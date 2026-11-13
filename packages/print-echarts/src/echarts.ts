// ECharts 按需注册（唯一引入图表库的位置）：仅注册本包支持的图表与组件。
// SSR 出图（renderer.ts）与设计器预览（designer/ChartElement.vue）共用同一份注册表，
// 主包 print-core / print-canvas 不得引入 echarts。
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  SVGRenderer,
])

export { echarts }
export type EChartsType = echarts.EChartsType
