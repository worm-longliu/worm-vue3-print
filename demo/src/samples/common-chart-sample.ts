// demo/src/samples/common-chart-sample.ts
// demo-common 专用图表样例（单一来源）：不 import ECharts 运行时，模板里直接写 chartOption，
// 供 demo-common/scripts/sync-demo-samples.mjs 打包求值后同步进 common 宿主。
// 只使用 @worm-vue3-print/echarts 的十类 kind 数据契约（chartOption + chart* 字段映射），
// 与 demo 的销售图表/十类总览保持同口径，但不需要在求值阶段拉起图表库。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/common/vue3'
import type { SampleTemplate } from './types'

const FIELDS: PrintBusinessField[] = [
  { id: 'cc-1', fieldKey: 'title', fieldLabel: '图表标题', fieldType: 'string', sortOrder: 1 },
  { id: 'cc-2', fieldKey: 'trend', fieldLabel: '趋势数据', fieldType: 'list', sortOrder: 2 },
]

const DATA: Record<string, any> = {
  title: '2026 年销售趋势',
  trend: [
    { name: '1 月', sales: 120, profit: 40 },
    { name: '2 月', sales: 168, profit: 62 },
    { name: '3 月', sales: 145, profit: 51 },
    { name: '4 月', sales: 200, profit: 88 },
  ],
}

const text = {
  id: 'cc-title',
  type: 'text',
  printElementType: { type: 'text', title: '文本' },
  options: {
    left: 10, top: 8, width: 190, height: 8,
    fontSize: 14, fontWeight: 'bold', textAlign: 'center', formatter: '{title}',
  },
}

/** 柱状图：类目 + 双数值字段，series.data 保留 $data 占位由绑定阶段注入 */
const barChart = {
  id: 'cc-bar',
  type: 'barChart',
  printElementType: { type: 'barChart', title: '柱状图' },
  options: {
    left: 10, top: 20, width: 90, height: 55,
    chartOption: {
      title: { text: '销售额与利润' },
      tooltip: { trigger: 'axis' },
      grid: { left: '8%', right: '8%', bottom: '12%', top: '18%', containLabel: true },
      xAxis: { type: 'category', data: ['$data'] },
      yAxis: { type: 'value' },
      series: [
        { type: 'bar', name: '销售额', data: ['$data'] },
        { type: 'bar', name: '利润', data: ['$data'] },
      ],
    },
    chartDataSource: 'trend',
    chartCategoryField: 'name',
    chartValueFields: ['sales', 'profit'],
  },
}

/** 饼图：类目 + 首数值 → { name, value } */
const pieChart = {
  id: 'cc-pie',
  type: 'pieChart',
  printElementType: { type: 'pieChart', title: '饼图' },
  options: {
    left: 110, top: 20, width: 90, height: 55,
    chartOption: {
      title: { text: '销售额占比' },
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', name: '销售额', data: ['$data'], radius: '62%' }],
    },
    chartDataSource: 'trend',
    chartCategoryField: 'name',
    chartValueFields: ['sales'],
  },
}

/** A4 纵向：标题 + 柱状图 + 饼图，两个图表共用顶层 trend 数据源 */
const template: TemplateData = {
  unit: 'mm',
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  plugins: [{ id: '@worm-vue3-print/echarts', version: '2' }],
  elements: [text, barChart, pieChart] as TemplateData['elements'],
}

export const COMMON_CHART_SAMPLE: SampleTemplate = {
  id: 'common-chart',
  name: '图表元素（common 宿主）',
  group: '图表',
  desc: '柱状图与饼图共用一份趋势数据；由 @worm-vue3-print/echarts-common 提供静态 SVG 画布与图形化属性面板',
  paper: 'A4 纵向 · 190mm 版心',
  fields: FIELDS,
  data: DATA,
  template,
}
