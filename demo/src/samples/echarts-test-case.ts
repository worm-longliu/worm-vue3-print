// demo/src/samples/echarts-test-case.ts
// 测试案例：十个图表元素端到端验证（画布 / 预览 / 打印同一份模板）。
// 每个 kind 一个元素，全部只用 $data 占位 + 字段映射，模板不写死业务数值：
//   直角系：柱状 / 条形 / 折线 / 面积   单系列类目绑定
//   饼系：饼图 / 环形图                 { name, value }
//   散点：x/y 数据对                    气泡用第二数值字段
//   雷达 / 漏斗 / 仪表盘                多维 / 降序 / 单值
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { CHART_KIND_DEFINITIONS, createDefaultChartOption } from '@worm-vue3-print/echarts'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

const { el } = createElementFactory('etc')

export const ECHARTS_TEST_FIELDS: PrintBusinessField[] = [
  { id: 'etc-1', fieldKey: 'title', fieldLabel: '案例标题', fieldType: 'string', sortOrder: 1 },
  { id: 'etc-2', fieldKey: 'trend', fieldLabel: '趋势数据', fieldType: 'list', sortOrder: 2 },
]

export const ECHARTS_TEST_DATA: Record<string, any> = {
  title: 'ECharts 十类图表测试案例',
  trend: [
    { name: '一月', sales: 120, profit: 40 },
    { name: '二月', sales: 168, profit: 62 },
    { name: '三月', sales: 145, profit: 51 },
    { name: '四月', sales: 200, profit: 88 },
    { name: '五月', sales: 230, profit: 102 },
  ],
}

/** 每个 kind 的数据映射：散点用数值字段作 x，其余用类目字段作 x/name */
function fieldsOf(type: string): Record<string, unknown> {
  if (type === 'scatterChart') return { chartCategoryField: 'sales', chartValueFields: ['sales', 'profit'], chartBubble: true }
  if (type === 'gaugeChart') return { chartValueFields: ['sales'] }
  if (type === 'radarChart') return { chartCategoryField: 'name', chartValueFields: ['sales', 'profit'] }
  if (type === 'pieChart' || type === 'doughnutChart' || type === 'funnelChart') {
    return { chartCategoryField: 'name', chartValueFields: ['sales'] }
  }
  return { chartCategoryField: 'name', chartValueFields: ['sales', 'profit'] }
}

const COLS = 2
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
      left: 45, top: 8, width: 100, height: 8,
      fontSize: 13, fontWeight: 'bold', textAlign: 'center', formatter: '{title}',
    } as any),
    ...CHART_KIND_DEFINITIONS.map((def, index) => {
      const col = index % COLS
      const row = Math.floor(index / COLS)
      return el(def.type as any, {
        left: 12 + col * 90,
        top: 20 + row * 50,
        width: 84,
        height: 44,
        chartOption: createDefaultChartOption(def.type),
        chartDataSource: 'trend',
        ...fieldsOf(def.type),
      } as any)
    }),
  ],
}

export const ECHARTS_TEST_CASE_SAMPLE: SampleTemplate = {
  id: 'echarts-test-case',
  name: 'ECharts 十类图表测试',
  group: '测试',
  desc: '柱状 / 条形 / 折线 / 面积 / 饼 / 环形 / 散点 / 雷达 / 漏斗 / 仪表盘十个元素，验证绑定与出图',
  paper: 'A4 纵向 · 190mm 版心',
  fields: ECHARTS_TEST_FIELDS,
  data: ECHARTS_TEST_DATA,
  template,
}
