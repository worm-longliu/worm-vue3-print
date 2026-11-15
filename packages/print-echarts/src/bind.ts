// 图表数据绑定：把「类目 + 数值字段」的业务数据映射进模板 option。
// 每个 kind 用闭包固定自己的 type 后交给 data-binder 通用分派（插件拿不到元素类型入参）。
import { getChartKindDefinition } from './kinds.js'

function chartNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** 递归求值 `{字段}` 表达式；只保留 `$data` 占位（不能被求值抹平） */
function evaluateChartOption(node: unknown, data: Record<string, unknown>): unknown {
  if (typeof node === 'string') {
    if (node.startsWith('$data')) return node
    return node.includes('{') ? evaluateTemplate(node, data) : node
  }
  if (Array.isArray(node)) return node.map(item => evaluateChartOption(item, data))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = evaluateChartOption(value, data)
    }
    return out
  }
  return node
}

// core 的模板表达式求值：内置函数白名单与设计器同源
import { evaluateTemplate } from '@worm-vue3-print/core'

function hasDataPlaceholder(series: Record<string, unknown>): boolean {
  return Array.isArray(series.data) && (series.data as unknown[]).includes('$data')
}

/** 与表格/流式列表同口径的数据源解析：显式 dataSource → 顶层第一个数组 */
function resolveListSource(options: Record<string, unknown>, data: Record<string, unknown>): Record<string, any>[] {
  const explicit = options.dataSource
  if (typeof explicit === 'string' && Array.isArray(data[explicit])) return data[explicit] as Record<string, any>[]
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value as Record<string, any>[]
  }
  return []
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asFieldList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function seriesOf(option: Record<string, any>): Record<string, any>[] {
  return Array.isArray(option.series) ? option.series as Record<string, any>[] : []
}

function rowValue(row: Record<string, any>, field: string | undefined): number {
  return field ? chartNumber(row[field]) : 0
}

/** 类目值：类目轴可能是 xAxis 也可能是 yAxis（条形图），只替换仍带 `$data` 的那根 */
function writeCategories(option: Record<string, any>, categories: unknown[]): void {
  for (const key of ['xAxis', 'yAxis'] as const) {
    const raw = option[key]
    const axes = Array.isArray(raw) ? raw : raw ? [raw] : []
    for (const axis of axes) {
      if (axis && typeof axis === 'object' && Array.isArray(axis.data) && axis.data.includes('$data')) {
        axis.data = [...categories]
      }
    }
  }
}

function applyCartesian(
  option: Record<string, any>,
  rows: Record<string, any>[],
  categoryField: string | undefined,
  valueFields: string[],
  seriesField: string | undefined,
): void {
  const rawSeries = seriesOf(option)
  if (!rawSeries.some(hasDataPlaceholder)) return
  const categories = rows.map((row, index) => (categoryField ? row[categoryField] : index + 1))
  const fieldAt = (index: number): string => valueFields[Math.min(index, valueFields.length - 1)]!

  if (seriesField) {
    const template = rawSeries[0]!
    const groups = new Map<string, Map<string, number>>()
    for (const row of rows) {
      const name = String(row[seriesField] ?? '')
      const bucket = groups.get(name) ?? new Map<string, number>()
      const category = String(row[categoryField ?? ''])
      // 同一类目重复时按累加处理，避免静默丢点
      bucket.set(category, (bucket.get(category) ?? 0) + rowValue(row, fieldAt(0)))
      groups.set(name, bucket)
    }
    const distinctCategories = [...new Set(categories)]
    option.series = [...groups.entries()].map(([name, bucket]) => ({
      ...template,
      name,
      data: distinctCategories.map(category => bucket.get(String(category)) ?? null),
    }))
    writeCategories(option, distinctCategories)
    return
  }

  // 数值字段多于模板 series 时按最后一个模板补足（demo/面板的多值多系列依赖此行为）
  const template = rawSeries[rawSeries.length - 1]!
  while (rawSeries.length < valueFields.length) rawSeries.push({ ...template, data: ['$data'] })
  option.series = rawSeries.map((series, index) => {
    if (!hasDataPlaceholder(series)) return series
    return { ...series, data: rows.map(row => rowValue(row, fieldAt(index))) }
  })
  writeCategories(option, categories)
}

function applyPieLike(
  option: Record<string, any>,
  rows: Record<string, any>[],
  categoryField: string | undefined,
  valueField: string,
  sortDescending: boolean,
): void {
  const series = seriesOf(option)
  if (!series.some(hasDataPlaceholder)) return
  const data = rows.map(row => ({
    name: categoryField ? String(row[categoryField] ?? '') : '',
    value: rowValue(row, valueField),
  }))
  if (sortDescending) data.sort((a, b) => b.value - a.value)
  option.series = series.map(item => ({ ...item, data }))
}

function applyScatter(
  option: Record<string, any>,
  rows: Record<string, any>[],
  xField: string | undefined,
  valueFields: string[],
  bubble: boolean,
): void {
  const series = seriesOf(option)
  if (!series.some(hasDataPlaceholder)) return
  const yField = valueFields[0]!
  const sizeField = bubble ? valueFields[1] : undefined
  const sizes = sizeField ? rows.map(row => rowValue(row, sizeField)) : []
  const min = sizes.length > 0 ? Math.min(...sizes) : 0
  const max = sizes.length > 0 ? Math.max(...sizes) : 0
  const sizeOf = (value: number): number => (max === min ? 12 : Math.round(6 + ((value - min) / (max - min)) * 18))
  option.series = series.map(item => ({
    ...item,
    data: rows.map(row => {
      const value = [rowValue(row, xField), rowValue(row, yField)]
      if (!sizeField) return value
      return { value, symbolSize: sizeOf(rowValue(row, sizeField)) }
    }),
  }))
}

function niceMax(value: number): number {
  if (value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = magnitude >= 10 ? magnitude : 10
  return Math.ceil(value / step) * step
}

function applyRadar(
  option: Record<string, any>,
  rows: Record<string, any>[],
  categoryField: string | undefined,
  valueFields: string[],
): void {
  const series = seriesOf(option)
  if (!series.some(hasDataPlaceholder)) return
  const columnMax = valueFields.map(field => Math.max(0, ...rows.map(row => rowValue(row, field))))
  option.radar = {
    ...(option.radar ?? {}),
    // 维度 = 数值字段；max 取该列最大值上浮取整
    indicator: valueFields.map((field, index) => ({ name: field, max: niceMax(columnMax[index]!) })),
  }
  option.series = series.map(item => ({
    ...item,
    data: rows.map(row => ({
      name: categoryField ? String(row[categoryField] ?? '') : '',
      value: valueFields.map(field => rowValue(row, field)),
    })),
  }))
}

function applyGauge(option: Record<string, any>, rows: Record<string, any>[], valueField: string): void {
  const series = seriesOf(option)
  if (!series.some(hasDataPlaceholder)) return
  const first = rows[0] ?? {}
  option.series = series.map(item => ({ ...item, data: [{ value: rowValue(first, valueField), name: valueField }] }))
}

/**
 * 绑定入口：返回要合并进元素 options 的补丁（`_chartOption`）。
 * 没有可绑定数据、没有数值字段、或 option 里没有 `$data` 占位时原样保留（手写固定数据不被覆盖）。
 */
export function bindChartData(
  type: string,
  options: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const raw = options.chartOption
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const option = evaluateChartOption(raw, data) as Record<string, any>
  const valueFields = asFieldList(options.chartValueFields)
  if (valueFields.length === 0) return { _chartOption: option }
  const list = resolveListSource({ ...options, dataSource: options.chartDataSource ?? options.dataSource }, data)
  if (list.length === 0) return { _chartOption: option }

  const categoryField = asString(options.chartCategoryField)
  const def = getChartKindDefinition(type)
  switch (def?.seriesType) {
    case 'radar':
      applyRadar(option, list, categoryField, valueFields)
      break
    case 'gauge':
      applyGauge(option, list, valueFields[0]!)
      break
    case 'funnel':
      applyPieLike(option, list, categoryField, valueFields[0]!, true)
      break
    case 'pie':
      applyPieLike(option, list, categoryField, valueFields[0]!, false)
      break
    case 'scatter':
      applyScatter(option, list, categoryField, valueFields, options.chartBubble === true)
      break
    default:
      applyCartesian(option, list, categoryField, valueFields, asString(options.chartSeriesField))
      break
  }
  return { _chartOption: option }
}
