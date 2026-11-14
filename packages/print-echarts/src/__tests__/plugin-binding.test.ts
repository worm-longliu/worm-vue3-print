// P4：图表数据绑定实现已从 core 迁入本包（plugin.ts 的 binding.bind）。
// 断言沿用改造前 core/render/chart-bind.test.ts 的全部语义，确保零迁移等价。
import { describe, expect, it } from 'vitest'
import { bindData } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { bindChartOptions } from '../plugin.js'

/** 直接测绑定钩子：返回要合并进 options 的运行时字段 */
function boundOption(
  options: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, any> {
  return bindChartOptions(options, data)._chartOption as Record<string, any>
}

describe('图表插件数据绑定（P4 归位到包内）', () => {
  it('轴类图表：xAxis 类目与 series 数值按字段映射注入', () => {
    const option = boundOption({
      chartOption: {
        title: { text: '{title}' },
        xAxis: { type: 'category', data: ['$data'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: ['$data'], name: '金额' }],
      },
      chartDataSource: 'details',
      chartCategoryField: 'name',
      chartValueFields: ['amount'],
    }, {
      title: '销售',
      details: [{ name: 'A', amount: 10 }, { name: 'B', amount: '20' }],
    })
    expect(option.title.text).toBe('销售')
    expect(option.xAxis.data).toEqual(['A', 'B'])
    expect(option.series[0].data).toEqual([10, 20])
  })

  it('饼图：生成 { name, value } 数据项', () => {
    const option = boundOption({
      chartOption: { series: [{ type: 'pie', data: ['$data'] }] },
      chartCategoryField: 'name',
      chartValueFields: ['amount'],
    }, { details: [{ name: 'A', amount: 1 }, { name: 'B', amount: 2 }] })
    expect(option.series[0].data).toEqual([{ name: 'A', value: 1 }, { name: 'B', value: 2 }])
  })

  it('散点图：生成 [x, y] 数据对', () => {
    const option = boundOption({
      chartOption: { series: [{ type: 'scatter', data: ['$data'] }] },
      chartCategoryField: 'x',
      chartValueFields: ['y'],
    }, { rows: [{ x: 1, y: 2 }, { x: 3, y: 4 }] })
    expect(option.series[0].data).toEqual([[1, 2], [3, 4]])
  })

  it('seriesField：按字段分组生成多系列', () => {
    const option = boundOption({
      chartOption: {
        xAxis: { type: 'category', data: ['$data'] },
        series: [{ type: 'line', data: ['$data'] }],
      },
      chartCategoryField: 'month',
      chartValueFields: ['amount'],
      chartSeriesField: 'region',
    }, {
      rows: [
        { month: '1月', region: '华东', amount: 10 },
        { month: '2月', region: '华东', amount: 20 },
        { month: '1月', region: '华南', amount: 5 },
      ],
    })
    expect(option.xAxis.data).toEqual(['1月', '2月'])
    expect(option.series.map((s: any) => s.name)).toEqual(['华东', '华南'])
    // 华南缺 2 月 → null（不断崖成 0）
    expect(option.series[0].data).toEqual([10, 20])
    expect(option.series[1].data).toEqual([5, null])
  })

  it('未使用 $data 占位的手工 option 原样保留', () => {
    const option = boundOption({
      chartOption: { series: [{ type: 'bar', data: [1, 2, 3] }] },
      chartDataSource: 'rows',
      chartCategoryField: 'name',
      chartValueFields: ['amount'],
    }, { rows: [{ name: 'A', amount: 1 }] })
    expect(option.series[0].data).toEqual([1, 2, 3])
  })

  it('无数据源时不崩溃，保留求值后的 option', () => {
    const option = boundOption({
      chartOption: { xAxis: { data: ['$data'] }, series: [{ type: 'bar', data: ['$data'] }] },
      chartCategoryField: 'name',
      chartValueFields: ['amount'],
    }, {})
    expect(option.xAxis.data).toEqual(['$data'])
    expect(option.series[0].data).toEqual(['$data'])
  })

  it('主体只做通用分派：bindData 把插件补丁合并进元素 options', () => {
    const template = {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] },
      footer: { height: 0, elements: [] },
      elements: [{
        id: 'c1', type: 'chart',
        options: {
          left: 0, top: 0, width: 100, height: 60,
          chartOption: { xAxis: { data: ['$data'] }, series: [{ type: 'bar', data: ['$data'] }] },
          chartCategoryField: 'name', chartValueFields: ['amount'],
        },
      }],
    } as unknown as PrintTemplateData
    const bound = bindData(template, { rows: [{ name: 'A', amount: 7 }] })
    const option = (bound.elements[0]!.options as any)._chartOption
    expect(option.xAxis.data).toEqual(['A'])
    expect(option.series[0].data).toEqual([7])
  })
})
