/** 插件 id：写入模板顶层 plugins 清单，也是 configurePlugin / 注册表查询的键 */
export const CHART_PLUGIN_ID = '@worm-vue3-print/echarts'

/** 本包支持的图表类型（图形化面板与常量导出共用；area 是 line 的填充形态） */
export const CHART_TYPES = ['bar', 'line', 'area', 'pie', 'scatter'] as const

export type ChartType = (typeof CHART_TYPES)[number]

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: '柱状图',
  line: '折线图',
  area: '面积图',
  pie: '饼图',
  scatter: '散点图',
}

/** 图形化面板可选配色（落 chartOption.color，ECharts 按系列循环取色） */
export const CHART_PALETTES = [
  { key: 'default', label: '默认蓝', colors: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de'] },
  { key: 'fresh', label: '清新绿', colors: ['#2f9e6e', '#5cc9a7', '#9ad6c1', '#f2c94c', '#4a90e2'] },
  { key: 'warm', label: '暖橙红', colors: ['#f2704e', '#f7a35c', '#f7d56d', '#c54e3f', '#8f5a4a'] },
  { key: 'purple', label: '紫灰', colors: ['#7b61ff', '#9b8cff', '#c3baff', '#596275', '#8d99ae'] },
] as const

export type ChartPaletteKey = (typeof CHART_PALETTES)[number]['key']

/**
 * 出厂图表 option（模板态）：数据维度一律写 `$data` 占位，由 core 绑定阶段按
 * chartDataSource + chartCategoryField/chartValueFields/chartSeriesField 注入真实数据，
 * 设计文件只存配置不存数据。
 */
export function createDefaultChartOption(type: ChartType = 'bar'): Record<string, unknown> {
  const base: Record<string, unknown> = {
    title: { text: '图表标题', left: 'center' },
    grid: { left: '8%', right: '8%', bottom: '12%', top: '18%', containLabel: true },
    tooltip: { trigger: type === 'pie' ? 'item' : 'axis' },
  }
  if (type === 'pie') {
    return {
      ...base,
      series: [{ type: 'pie', radius: '62%', name: '数量', data: ['$data'] }],
    }
  }
  const seriesType = type === 'area' ? 'line' : type
  const series: Record<string, unknown> = { type: seriesType, name: '数量', data: ['$data'] }
  if (type === 'area') series.areaStyle = {}
  return {
    ...base,
    xAxis: type === 'scatter' ? { type: 'value' } : { type: 'category', data: ['$data'] },
    yAxis: { type: 'value' },
    series: [series],
  }
}
