import { registerElementExtension, unregisterElementExtension } from '@worm-vue3-print/canvas'
import type { ElementOptions } from '@worm-vue3-print/core/designer'
import { chartFactoryDefaults } from '../config.js'
import { registerChartDesigner } from '../plugin.js'
import ChartElement from './ChartElement.vue'
import ChartPropertyGroup from './ChartPropertyGroup.vue'

export { default as ChartElement } from './ChartElement.vue'
export { default as ChartPropertyGroup } from './ChartPropertyGroup.vue'
export { createDefaultChartOption } from '../constants.js'

const CHART_OPTION_KEYS = [
  'chartOption', 'chartDataSource', 'chartCategoryField', 'chartValueFields', 'chartSeriesField',
] as const

/** R3 实例级判据：只有真的带图表专属属性的元素才显示「自定义属性」tab */
function chartHasProperties(element: unknown): boolean {
  const opts = (element as { options?: Record<string, unknown> } | null)?.options
  if (!opts || typeof opts !== 'object') return false
  return CHART_OPTION_KEYS.some(key => opts[key] !== undefined)
}

/** 包入口自注册后保存的「完整注销」句柄，供 uninstallEchartsDesignerExtension() 使用 */
let disposeAll: (() => void) | undefined

/**
 * 注册设计器图表扩展（§4.3 兼容别名，无限期保留）：
 * - core 通用注册表：一份 `defineElementPlugin` 描述符负责 kind / 绑定 / 出图 / 元数据 / 属性 tab；
 * - canvas 响应式注册表：保留旧 `registerElementExtension` 语义（素材卡、画布组件、默认选项）。
 *
 * 本函数在包入口 import 时自动执行一次（D7），宿主无需写任何注册代码；
 * 重复调用幂等，返回的句柄会**同时**注销 core 描述符与 canvas 注册项（P5 修复注销不对称）。
 */
export function installEchartsDesignerExtension(): () => void {
  const disposePlugin = registerChartDesigner({
    canvasComponent: ChartElement,
    materialCard: { label: '图表', icon: '▤' },
    propertyTab: {
      id: 'chart-properties',
      label: '自定义属性',
      icon: '▤',
      component: ChartPropertyGroup,
      hasProperties: chartHasProperties,
    },
  })
  registerElementExtension({
    type: 'chart',
    label: '图表',
    icon: '▤',
    canvasComponent: ChartElement,
    propertyComponent: ChartPropertyGroup,
    propertyTab: {
      label: '自定义属性',
      icon: '▤',
      component: ChartPropertyGroup,
      hasProperties: chartHasProperties,
      searchKeywords: ['图表', 'echarts', 'option', '配置', 'json', '数据源', '类目', '数值', '系列'],
    },
    defaultOptions: (partial?: Partial<ElementOptions>): Partial<ElementOptions> =>
      chartFactoryDefaults(partial as Record<string, unknown> | undefined) as unknown as Partial<ElementOptions>,
  })
  const dispose = (): void => {
    disposePlugin()
    unregisterElementExtension('chart')
    if (disposeAll === dispose) disposeAll = undefined
  }
  disposeAll = dispose
  return dispose
}

/** 完整卸载（core 描述符 + canvas 注册项）；供热更新与测试使用 */
export function uninstallEchartsDesignerExtension(): void {
  disposeAll?.()
  disposeAll = undefined
}
