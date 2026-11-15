// demo/src/samples/sales-chart.ts
// 示例：ECharts 图表元素——柱状图 / 环形图 / 折线图共用同一份数据源。
// 模板只存 chartOption 与字段映射，真实数据由 core 绑定阶段按字段注入。
// 顶层 plugins 清单走 strict 校验，作为宿主最佳实践样例（version 为插件描述符版本）。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createDefaultChartOption } from '@worm-vue3-print/echarts'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

const { el } = createElementFactory('chart')

/** 图表数据源：顶层数组 trend，类目字段 name、数值字段 sales/profit */
export const SALES_CHART_FIELDS: PrintBusinessField[] = [
  { id: 'sc-1', fieldKey: 'title', fieldLabel: '图表标题', fieldType: 'string', sortOrder: 1 },
  { id: 'sc-2', fieldKey: 'trend', fieldLabel: '销售趋势数据', fieldType: 'list', sortOrder: 2 },
]

export const SALES_CHART_DATA: Record<string, any> = {
  title: '2026 年一季度销售趋势',
  trend: [
    { name: '1 月', sales: 120, profit: 40 },
    { name: '2 月', sales: 168, profit: 62 },
    { name: '3 月', sales: 145, profit: 51 },
  ],
}

/** A4 纵向：标题 + 柱状图 + 环形图 + 折线图（图表固定高，core 按设计盒高结算） */
const template: TemplateData = {
  unit: 'mm',
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  plugins: [{ id: '@worm-vue3-print/echarts', version: '2' }],
  elements: [
    el('text', {
      left: 45, top: 10, width: 100, height: 8,
      fontSize: 14, fontWeight: 'bold', textAlign: 'center', formatter: '{title}',
    } as any),
    el('barChart', {
      left: 30, top: 22, width: 130, height: 60,
      chartOption: createDefaultChartOption('barChart'),
      chartDataSource: 'trend', chartCategoryField: 'name', chartValueFields: ['sales'],
    } as any),
    el('doughnutChart', {
      left: 30, top: 92, width: 60, height: 60,
      chartOption: createDefaultChartOption('doughnutChart'),
      chartDataSource: 'trend', chartCategoryField: 'name', chartValueFields: ['sales'],
    } as any),
    el('lineChart', {
      left: 100, top: 92, width: 60, height: 60,
      chartOption: createDefaultChartOption('lineChart'),
      chartDataSource: 'trend', chartCategoryField: 'name', chartValueFields: ['sales', 'profit'],
    } as any),
  ],
}

export const SALES_CHART_SAMPLE: SampleTemplate = {
  id: 'sales-chart',
  name: '销售趋势图表',
  group: '单据',
  desc: 'ECharts 图表元素：柱状图 / 环形图 / 折线图共用数据源，模板只存 chartOption 与字段映射',
  paper: 'A4 纵向 · 190mm 版心',
  fields: SALES_CHART_FIELDS,
  data: SALES_CHART_DATA,
  template,
}
