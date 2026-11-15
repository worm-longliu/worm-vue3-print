// 十类图表的出厂 option（模板态）：数据维度一律写 `$data` 占位，由插件绑定阶段按
// chartDataSource + chartCategoryField/chartValueFields/chartSeriesField 注入真实数据。
import { getChartKindDefinition } from './kinds.js'

const GRID = { left: '8%', right: '8%', bottom: '12%', top: '18%', containLabel: true }

/** 按 kind 生成出厂 option；series.type 与 kind 语义一致（折线图不会落成柱状图） */
export function createDefaultChartOption(type: string): Record<string, unknown> {
  const def = getChartKindDefinition(type)
  const title = { text: '' }
  switch (def?.seriesType) {
    case 'pie':
      return {
        title,
        tooltip: { trigger: 'item' },
        series: [{
          type: 'pie', name: '数量', data: ['$data'],
          radius: type === 'doughnutChart' ? ['40%', '70%'] : '62%',
        }],
      }
    case 'scatter':
      return {
        title, grid: GRID, tooltip: { trigger: 'axis' },
        xAxis: { type: 'value' }, yAxis: { type: 'value' },
        series: [{ type: 'scatter', name: '数量', data: ['$data'], symbolSize: 8 }],
      }
    case 'radar':
      return {
        title, tooltip: { trigger: 'item' },
        // indicator 由绑定阶段按 chartValueFields 生成；设计态预览见 previewChartOption
        radar: { indicator: [] },
        series: [{ type: 'radar', name: '数量', data: ['$data'] }],
      }
    case 'funnel':
      return {
        title, tooltip: { trigger: 'item' }, legend: { show: false },
        series: [{ type: 'funnel', name: '数量', data: ['$data'], sort: 'descending' }],
      }
    case 'gauge':
      return {
        title, tooltip: { trigger: 'item' },
        series: [{ type: 'gauge', name: '数量', min: 0, max: 100, data: [{ value: 0, name: '数量' }] }],
      }
    default: {
      const horizontal = def?.orientation === 'horizontal'
      const isArea = def?.seriesType === 'line' && type === 'areaChart'
      const seriesType = def?.seriesType === 'line' ? 'line' : 'bar'
      return {
        title, grid: GRID, tooltip: { trigger: 'axis' },
        xAxis: horizontal ? { type: 'value' } : { type: 'category', data: ['$data'] },
        yAxis: horizontal ? { type: 'category', data: ['$data'] } : { type: 'value' },
        series: [{ type: seriesType, name: '数量', data: ['$data'], ...(isArea ? { areaStyle: {} } : {}) }],
      }
    }
  }
}
