// demo/src/samples/echarts-test-case.ts
// 测试案例：ECharts 图表渲染链路端到端验证（区别于 sales-chart 业务样例）。
// 覆盖四种图表类型 + 数据绑定，加载后可在设计器画布、预览、打印三处确认 SVG 真正出图：
//   1. 柱状图  bar     —— xAxis 类目 + series 单系列，验证轴类绑定
//   2. 折线面积 line    —— series 带 areaStyle，验证同一份数据换形态
//   3. 饼图    pie     —— 验证 { name, value } 生成
//   4. 散点图  scatter —— 验证 [x, y] 数据对（独立数据源 scatter）
// 每个图表只用 $data 占位 + 字段映射，模板不写死任何业务数值。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

const { el } = createElementFactory('etc')

/** 字段树：标题（单值）+ 趋势数据（列表）+ 散点数据（列表） */
export const ECHARTS_TEST_FIELDS: PrintBusinessField[] = [
  { id: 'etc-1', fieldKey: 'title', fieldLabel: '案例标题', fieldType: 'string', sortOrder: 1 },
  { id: 'etc-2', fieldKey: 'trend', fieldLabel: '趋势数据', fieldType: 'list', sortOrder: 2 },
  { id: 'etc-3', fieldKey: 'scatter', fieldLabel: '散点数据', fieldType: 'list', sortOrder: 3 },
]

export const ECHARTS_TEST_DATA: Record<string, any> = {
  title: 'ECharts 渲染测试案例',
  trend: [
    { name: '一月', sales: 120, profit: 40 },
    { name: '二月', sales: 168, profit: 62 },
    { name: '三月', sales: 145, profit: 51 },
    { name: '四月', sales: 200, profit: 88 },
    { name: '五月', sales: 230, profit: 102 },
  ],
  scatter: [
    { x: 10, y: 20 },
    { x: 25, y: 35 },
    { x: 40, y: 55 },
    { x: 55, y: 48 },
    { x: 70, y: 78 },
    { x: 85, y: 92 },
  ],
}

const GRID = { left: '12%', right: '8%', bottom: '14%', top: '16%' }

/** A4 纵向：标题 + 2×2 图表网格，全部固定高度（core 按设计盒高结算） */
const template: TemplateData = {
  unit: 'mm',
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  elements: [
    el('text', {
      left: 10, top: 10, width: 190, height: 8,
      fontSize: 14, fontWeight: 'bold', textAlign: 'center', formatter: '{title}',
    } as any),
    // 1) 柱状图：xAxis 类目取 name，series 数值取 sales
    el('chart', {
      left: 10, top: 22, width: 90, height: 78,
      chartOption: {
        grid: GRID,
        title: { text: '柱状图（销售额）', left: 'center', top: 2, textStyle: { fontSize: 10 } },
        xAxis: { type: 'category', data: ['$data'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: ['$data'], name: '销售额', itemStyle: { color: '#165dff' } }],
      },
      chartDataSource: 'trend',
      chartCategoryField: 'name',
      chartValueFields: ['sales'],
    } as any),
    // 2) 折线面积图：同一 trend，series 取 profit 并加 areaStyle
    el('chart', {
      left: 110, top: 22, width: 90, height: 78,
      chartOption: {
        grid: GRID,
        title: { text: '折线面积图（利润）', left: 'center', top: 2, textStyle: { fontSize: 10 } },
        xAxis: { type: 'category', data: ['$data'] },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: ['$data'], name: '利润', smooth: true, areaStyle: {}, itemStyle: { color: '#36b37e' } }],
      },
      chartDataSource: 'trend',
      chartCategoryField: 'name',
      chartValueFields: ['profit'],
    } as any),
    // 3) 饼图：生成 { name, value }
    el('chart', {
      left: 10, top: 104, width: 90, height: 78,
      chartOption: {
        title: { text: '饼图（占比）', left: 'center', top: 2, textStyle: { fontSize: 10 } },
        tooltip: { trigger: 'item' },
        series: [{ type: 'pie', data: ['$data'], radius: '58%', label: { fontSize: 9 } }],
      },
      chartDataSource: 'trend',
      chartCategoryField: 'name',
      chartValueFields: ['sales'],
    } as any),
    // 4) 散点图：独立数据源 scatter，生成 [x, y]
    el('chart', {
      left: 110, top: 104, width: 90, height: 78,
      chartOption: {
        grid: GRID,
        title: { text: '散点图', left: 'center', top: 2, textStyle: { fontSize: 10 } },
        xAxis: { type: 'value', name: 'x', nameTextStyle: { fontSize: 9 } },
        yAxis: { type: 'value', name: 'y', nameTextStyle: { fontSize: 9 } },
        series: [{ type: 'scatter', data: ['$data'], symbolSize: 10, itemStyle: { color: '#ff7d00' } }],
      },
      chartDataSource: 'scatter',
      chartCategoryField: 'x',
      chartValueFields: ['y'],
    } as any),
  ],
}

export const ECHARTS_TEST_CASE_SAMPLE: SampleTemplate = {
  id: 'echarts-test-case',
  name: 'ECharts 渲染测试案例',
  group: '测试',
  desc: '端到端验证图表渲染：柱状 / 折线面积 / 饼图 / 散点四类图表均按 $data 占位 + 字段映射绑定，加载后可在设计器、预览、打印三处确认 SVG 出图',
  paper: 'A4 纵向 · 190mm 版心',
  fields: ECHARTS_TEST_FIELDS,
  data: ECHARTS_TEST_DATA,
  template,
}
