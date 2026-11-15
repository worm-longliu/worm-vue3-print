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
