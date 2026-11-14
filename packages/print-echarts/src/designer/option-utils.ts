import type { ChartType } from '../constants.js'
import { getSampleCategories } from '../config.js'

/** 设计器预览用的示例数值：模板态的 `$data` 占位在无真实数据时替换成示例值；
 *  类目可由 configureChartPlugin({ sampleCategories }) 覆盖，缺省与 P0 逐字一致 */
const SAMPLE_VALUES = [12, 20, 15]

/** 纯 JSON 深拷贝（chartOption 契约为纯 JSON；异常时退化为浅拷贝，避免设计器崩溃） */
export function cloneChartOption<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

/**
 * 把 `$data` 占位替换为示例数据，保证设计器预览阶段（没有绑定数据）不报错、能看到图形。
 * - series.data 里的 `$data` → 数值样例（饼图同样接受数值）；
 * - xAxis.data 等其余位置的 `$data` → 类目样例。
 */
export function previewChartOption(option: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!option || typeof option !== 'object' || Array.isArray(option)) return {}
  return fillPlaceholders(cloneChartOption(option), false) as Record<string, unknown>
}

function fillPlaceholders(node: unknown, inSeries: boolean): unknown {
  if (Array.isArray(node)) {
    return node.flatMap((item): unknown[] =>
      item === '$data'
        ? (inSeries ? [...SAMPLE_VALUES] : [...getSampleCategories()])
        : [fillPlaceholders(item, inSeries)],
    )
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = fillPlaceholders(value, inSeries || key === 'series')
    }
    return out
  }
  return node
}

/** 读取 option 当前图表类型（series.type + areaStyle → area） */
export function readChartType(option: Record<string, unknown> | undefined): ChartType {
  const series = (Array.isArray(option?.series) ? option?.series : []) as Record<string, unknown>[]
  const first = series[0] ?? {}
  const type = String(first.type ?? 'bar')
  if (type === 'line') return first.areaStyle ? 'area' : 'line'
  if (type === 'pie' || type === 'scatter') return type
  return 'bar'
}

/** 按图表类型改写 option 的坐标系与 series 形态（保留 series 上的 name/颜色等自定义字段） */
export function withChartType(option: Record<string, unknown>, type: ChartType): Record<string, unknown> {
  const next = cloneChartOption(option)
  const rawSeries = (Array.isArray(next.series) ? next.series : []) as Record<string, unknown>[]
  const count = Math.max(rawSeries.length, 1)
  next.series = Array.from({ length: count }, (_, index) => {
    const base: Record<string, unknown> = { ...(rawSeries[index] ?? rawSeries[0] ?? {}) }
    delete base.areaStyle
    if (type === 'pie') return { ...base, type: 'pie', radius: base.radius ?? '62%', data: ['$data'] }
    if (type === 'scatter') return { ...base, type: 'scatter', data: ['$data'] }
    const series: Record<string, unknown> = { ...base, type: type === 'area' ? 'line' : type, data: ['$data'] }
    if (type === 'area') series.areaStyle = {}
    return series
  })
  if (type === 'pie') {
    delete next.xAxis
    delete next.yAxis
  } else if (type === 'scatter') {
    next.xAxis = { ...asObject(next.xAxis), type: 'value' }
    delete (next.xAxis as Record<string, unknown>).data
    next.yAxis = { ...asObject(next.yAxis), type: 'value' }
  } else {
    next.xAxis = { ...asObject(next.xAxis), type: 'category', data: ['$data'] }
    next.yAxis = { ...asObject(next.yAxis), type: 'value' }
  }
  return next
}

/** series 数量与数值字段对齐：多值多系列（core 绑定按 series 顺序取 chartValueFields） */
export function syncSeriesCount(option: Record<string, unknown>, count: number): Record<string, unknown> {
  const next = cloneChartOption(option)
  const rawSeries = (Array.isArray(next.series) ? next.series : []) as Record<string, unknown>[]
  const template = rawSeries[0] ?? { type: 'bar', data: ['$data'] }
  next.series = Array.from({ length: Math.max(count, 1) }, (_, index) => ({
    ...template,
    ...(rawSeries[index] ?? {}),
    data: ['$data'],
  }))
  return next
}

/** 读出与预设配色匹配的 palette key；无法匹配时归为 default */
export function readPaletteKey(option: Record<string, unknown> | undefined, palettes: readonly { key: string; colors: readonly string[] }[]): string {
  const color = Array.isArray(option?.color) ? (option?.color as unknown[]).map(String) : []
  const hit = palettes.find((palette) => palette.colors.every((c, i) => c === color[i]) && color.length === palette.colors.length)
  return hit?.key ?? 'default'
}

/** 工具：option 子节点可能是对象或数组（ECharts 两种写法都合法） */
export function asObject(node: unknown): Record<string, unknown> {
  if (Array.isArray(node)) return (node[0] && typeof node[0] === 'object' ? { ...(node[0] as Record<string, unknown>) } : {})
  return node && typeof node === 'object' ? { ...(node as Record<string, unknown>) } : {}
}
