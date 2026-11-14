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
import { getChartPluginConfig } from './config.js'

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

/** 已追加过的宿主组件：echarts.use 是全局副作用，这里按引用去重避免重复注册 */
const appliedComponents = new Set<unknown>()

/**
 * 追加 configureChartPlugin({ components }) 声明的图表/组件构造器（P5）。
 * 惰性且幂等：未配置时零开销；改配置后下一次出图自动生效，无需重新注册插件。
 */
export function applyExtraComponents(): void {
  const extra = getChartPluginConfig().components ?? []
  const fresh = extra.filter(item => item != null && !appliedComponents.has(item))
  if (fresh.length === 0) return
  echarts.use(fresh as unknown as Parameters<typeof echarts.use>[0])
  for (const item of fresh) appliedComponents.add(item)
}

export { echarts }
export type EChartsType = echarts.EChartsType
