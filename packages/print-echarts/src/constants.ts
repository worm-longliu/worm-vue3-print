/** 插件 id：写入模板顶层 plugins 清单，也是 configurePlugin / 注册表查询的键 */
export const CHART_PLUGIN_ID = '@worm-vue3-print/echarts'

/** 图形化面板可选配色（落 chartOption.color，ECharts 按系列循环取色） */
export const CHART_PALETTES = [
  { key: 'default', label: '默认蓝', colors: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de'] },
  { key: 'fresh', label: '清新绿', colors: ['#2f9e6e', '#5cc9a7', '#9ad6c1', '#f2c94c', '#4a90e2'] },
  { key: 'warm', label: '暖橙红', colors: ['#f2704e', '#f7a35c', '#f7d56d', '#c54e3f', '#8f5a4a'] },
  { key: 'purple', label: '紫灰', colors: ['#7b61ff', '#9b8cff', '#c3baff', '#596275', '#8d99ae'] },
] as const

export type ChartPaletteKey = (typeof CHART_PALETTES)[number]['key']

/** 设计态示例类目（模板态 $data 占位在无绑定数据时的替换值） */
export const FALLBACK_SAMPLE_CATEGORIES: readonly string[] = ['示例一', '示例二', '示例三']

/**
 * 漏斗图出厂内边距（%）：ECharts 内置默认是 px（left/right 80、top 60、bottom 65），
 * 小尺寸打印框里会把图形压到一半都不到。右侧留 25% 给外置标签与引导线，其余三边压到 5~6% 铺满。
 */
export const FUNNEL_PADDING_DEFAULTS = { top: 6, right: 25, bottom: 6, left: 5 } as const

/** 漏斗图四边内边距（%），对应 ECharts funnel series 的 top/right/bottom/left */
export interface FunnelPadding {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * 雷达图出厂半径（%）：ECharts 6 把 radar.radius 的默认值从 5.x 的 75% 调到 50%，
 * 70×60mm 的元素框里图形直径只剩短边一半，四周空得厉害；回到 75% 与 5.x 观感一致。
 */
export const RADAR_RADIUS_DEFAULT = 75

/** ECharts 内置雷达半径默认值（%），存量模板没写 radius 时面板按它回读 */
export const ECHARTS_RADAR_RADIUS_DEFAULT = 50

/** ECharts 内置漏斗内边距默认值（px），存量模板没写时面板按当前元素框折算成百分比回读 */
export const ECHARTS_FUNNEL_PADDING_PX = { top: 60, right: 80, bottom: 65, left: 80 } as const
