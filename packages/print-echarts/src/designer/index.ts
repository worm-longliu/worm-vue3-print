import { registerElementExtension } from '@worm-vue3-print/canvas'
import type { ElementOptions } from '@worm-vue3-print/core/designer'
import { createDefaultChartOption } from '../constants.js'
import ChartElement from './ChartElement.vue'
import ChartPropertyGroup from './ChartPropertyGroup.vue'

export { default as ChartElement } from './ChartElement.vue'
export { default as ChartPropertyGroup } from './ChartPropertyGroup.vue'
export { createDefaultChartOption } from '../constants.js'

/**
 * 注册设计器图表扩展（type='chart'）：
 * - 画布预览 ChartElement（浏览器态 echarts 实例，非 SSR）；
 * - 属性面板扩展分组 ChartPropertyGroup（图形化 + JSON 双模式）；
 * - 默认选项：宽 100mm × 高 60mm 固定高（core 渲染按设计盒高结算，不做 autoHeight）。
 *
 * 未安装本包时 canvas 不显示图表素材卡、遇到 chart 元素渲染占位；安装后由宿主在
 * 创建设计器前调用一次即可。
 */
export function installEchartsDesignerExtension(): void {
  registerElementExtension({
    type: 'chart',
    label: '图表',
    icon: '▤',
    canvasComponent: ChartElement,
    propertyComponent: ChartPropertyGroup,
    defaultOptions: (partial?: Partial<ElementOptions>): Partial<ElementOptions> => ({
      width: 100,
      height: 60,
      chartOption: createDefaultChartOption('bar'),
      ...partial,
    }),
  })
}
