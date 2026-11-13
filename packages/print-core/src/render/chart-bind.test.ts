// print-core/src/render/chart-bind.test.ts
// 图表数据绑定：option 模板求值 + 数据源字段映射（$data 占位）
import { describe, it, expect } from 'vitest'
import { bindData } from './data-binder.js'
import type { TemplateData } from './types.js'

function chartTemplate(options: Record<string, any>): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{ id: 'c1', type: 'chart', options: { left: 0, top: 0, width: 100, height: 60, ...options } } as any],
  } as TemplateData
}

describe('图表数据绑定', () => {
  it('轴类图表：xAxis 类目与 series 数值按字段映射注入', () => {
    const template = chartTemplate({
      chartOption: {
        title: { text: '{title}' },
        xAxis: { type: 'category', data: ['$data'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: ['$data'], name: '金额' }],
      },
      chartDataSource: 'details',
      chartCategoryField: 'name',
      chartValueFields: ['amount'],
    })
    const bound = bindData(template, {
      title: '销售',
      details: [{ name: 'A', amount: 10 }, { name: 'B', amount: '20' }],
    })
    const option = (bound.elements[0]!.options as any)._chartOption
    expect(option.title.text).toBe('销售')
    expect(option.xAxis.data).toEqual(['A', 'B'])
    expect(option.series[0].data).toEqual([10, 20])
  })

  it('饼图：生成 { name, value } 数据项', () => {
    const template = chartTemplate({
      chartOption: {
        series: [{ type: 'pie', data: ['$data'] }],
      },
      chartCategoryField: 'name',
      chartValueFields: ['amount'],
    })
    const bound = bindData(template, { details: [{ name: 'A', amount: 1 }, { name: 'B', amount: 2 }] })
    const series = (bound.elements[0]!.options as any)._chartOption.series[0]
    expect(series.data).toEqual([{ name: 'A', value: 1 }, { name: 'B', value: 2 }])
  })

  it('散点图：生成 [x, y] 数据对', () => {
    const template = chartTemplate({
      chartOption: { series: [{ type: 'scatter', data: ['$data'] }] },
      chartCategoryField: 'x',
      chartValueFields: ['y'],
    })
    const bound = bindData(template, { rows: [{ x: 1, y: 2 }, { x: 3, y: 4 }] })
    const series = (bound.elements[0]!.options as any)._chartOption.series[0]
    expect(series.data).toEqual([[1, 2], [3, 4]])
  })

  it('seriesField：按字段分组生成多系列', () => {
    const template = chartTemplate({
      chartOption: {
        xAxis: { type: 'category', data: ['$data'] },
        series: [{ type: 'line', data: ['$data'] }],
      },
      chartCategoryField: 'month',
      chartValueFields: ['amount'],
      chartSeriesField: 'region',
    })
    const bound = bindData(template, {
      rows: [
        { month: '1月', region: '华东', amount: 10 },
        { month: '2月', region: '华东', amount: 20 },
        { month: '1月', region: '华南', amount: 5 },
      ],
    })
    const option = (bound.elements[0]!.options as any)._chartOption
    expect(option.xAxis.data).toEqual(['1月', '2月'])
    expect(option.series.map((s: any) => s.name)).toEqual(['华东', '华南'])
    // 华南缺 2 月 → null（不断崖成 0）
    expect(option.series[0].data).toEqual([10, 20])
    expect(option.series[1].data).toEqual([5, null])
  })

  it('未使用 $data 占位的手工 option 原样保留', () => {
    const template = chartTemplate({
      chartOption: { series: [{ type: 'bar', data: [1, 2, 3] }] },
      chartDataSource: 'rows',
      chartCategoryField: 'name',
      chartValueFields: ['amount'],
    })
    const bound = bindData(template, { rows: [{ name: 'A', amount: 1 }] })
    expect((bound.elements[0]!.options as any)._chartOption.series[0].data).toEqual([1, 2, 3])
  })

  it('无数据源时不崩溃，保留求值后的 option', () => {
    const template = chartTemplate({
      chartOption: { xAxis: { data: ['$data'] }, series: [{ type: 'bar', data: ['$data'] }] },
      chartCategoryField: 'name',
      chartValueFields: ['amount'],
    })
    const bound = bindData(template, {})
    const option = (bound.elements[0]!.options as any)._chartOption
    expect(option.xAxis.data).toEqual(['$data'])
    expect(option.series[0].data).toEqual(['$data'])
  })
})
