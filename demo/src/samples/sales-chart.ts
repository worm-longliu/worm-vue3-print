// demo/src/samples/sales-chart.ts
// 示例十五：ECharts 图表元素——柱状图与饼图共用同一份数据源，
// chartOption 里 series/xAxis 的 data 写 `$data` 占位，由 core 绑定阶段按字段映射填真实数据。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

const { el } = createElementFactory('chart')

/** 图表数据源：顶层数组 trend，类目字段 name、数值字段 sales */
export const SALES_CHART_FIELDS: PrintBusinessField[] = [
  { id: 'sc-1', fieldKey: 'title', fieldLabel: '图表标题', fieldType: 'string', sortOrder: 1 },
  { id: 'sc-2', fieldKey: 'trend', fieldLabel: '销售趋势数据', fieldType: 'list', sortOrder: 2 },
]

export const SALES_CHART_DATA: Record<string, any> = {
  title: '2026 年一季度销售趋势',
  trend: [
    { name: '1 月', sales: 120 },
    { name: '2 月', sales: 168 },
    { name: '3 月', sales: 145 },
  ],
}

/** A4 纵向：标题 + 柱状图 + 饼图，图表固定高（core 按设计盒高结算，不做 autoHeight） */
const template: TemplateData = {
  unit: 'mm',
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  elements: [
    el('text', {
      left: 45, top: 10, width: 100, height: 8,
      fontSize: 14, fontWeight: 'bold', textAlign: 'center', formatter: '{title}',
    } as any),
    el('chart', {
      left: 45, top: 22, width: 100, height: 60,
      chartOption: {
        grid: { left: '8%', right: '8%', bottom: '12%', top: '18%' },
        xAxis: { type: 'category', data: ['$data'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: ['$data'], name: '销售额（万元）' }],
      },
      chartDataSource: 'trend',
      chartCategoryField: 'name',
      chartValueFields: ['sales'],
    } as any),
    el('chart', {
      left: 45, top: 92, width: 100, height: 60,
      chartOption: {
        tooltip: { trigger: 'item' },
        series: [{ type: 'pie', data: ['$data'], radius: '62%' }],
      },
      chartDataSource: 'trend',
      chartCategoryField: 'name',
      chartValueFields: ['sales'],
    } as any),
  ],
}

export const SALES_CHART_SAMPLE: SampleTemplate = {
  id: 'sales-chart',
  name: '销售趋势图表',
  group: '单据',
  desc: 'ECharts 图表元素：模板只存 chartOption 与字段映射，渲染时按 chartDataSource 绑定数据生成 SVG',
  paper: 'A4 纵向 · 190mm 版心',
  fields: SALES_CHART_FIELDS,
  data: SALES_CHART_DATA,
  template,
}
