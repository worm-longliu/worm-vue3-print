// 设计器侧注册入口：一个插件描述符 + 十个 kind 共用画布组件与图形化属性面板。
// 宿主 import 包入口即自动执行一次（与旧版一致），无需手写注册代码。
import { registerChartPlugin, uninstallChartPlugin } from '../plugin.js'
import ChartElement from './ChartElement.vue'
import ChartPropertyGroup from './ChartPropertyGroup.vue'

export { default as ChartElement } from './ChartElement.vue'
export { default as ChartPropertyGroup } from './ChartPropertyGroup.vue'

const CHART_OPTION_KEYS = [
  'chartOption', 'chartDataSource', 'chartCategoryField', 'chartValueFields', 'chartSeriesField', 'chartBubble',
] as const

/** 实例级判据：只有真的带图表专属属性的元素才显示「自定义属性」tab */
function chartHasProperties(element: unknown): boolean {
  const opts = (element as { options?: Record<string, unknown> } | null)?.options
  if (!opts || typeof opts !== 'object') return false
  return CHART_OPTION_KEYS.some(key => opts[key] !== undefined)
}

const SEARCH_KEYWORDS = [
  '图表', 'echarts', 'option', '配置', '数据源', '类目', '数值', '系列', '柱状', '条形',
  '折线', '面积', '饼', '环形', '散点', '雷达', '漏斗', '仪表',
]

/** 注册设计器能力（素材卡分组 / 画布组件 / 自定义属性 tab）；返回注销句柄 */
export function installChartDesigner(): () => void {
  return registerChartPlugin({
    canvasComponent: ChartElement,
    // 一个插件十张素材卡：标签与图标来自每个 kind，materialCard 只承载分组
    materialCard: { group: '图表' },
    propertyTab: {
      id: 'chart-properties',
      label: '自定义属性',
      icon: 'ChartColumn',
      component: ChartPropertyGroup,
      hasProperties: chartHasProperties,
      searchKeywords: SEARCH_KEYWORDS,
    },
  })
}

/** 完整卸载（供测试与热更新） */
export function uninstallChartDesigner(): void {
  uninstallChartPlugin()
}

// 包入口 import 即生效（D7）
installChartDesigner()
