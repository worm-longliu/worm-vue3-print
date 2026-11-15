// 设计态 option 工具：预览占位替换、配色回读与 series 数量对齐。
// 跨类型切换（readChartType/withChartType）已随「拆分元素类型」整体删除。
import { getSampleCategories } from '../config.js'
import { getChartKindDefinition, resolveChartPanelFields } from '../kinds.js'
import type { ChartFieldKey } from '../kinds.js'

export type { ChartFieldKey }
export { resolveChartPanelFields }

/** 设计器预览用的示例数值：模板态 `$data` 占位在无真实数据时替换成示例值 */
const SAMPLE_VALUES = [12, 20, 15]

export function cloneChartOption<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

/**
 * 把 `$data` 占位替换为示例数据，保证设计器预览（没有绑定数据）不报错、能看到图形。
 * 按 kind 生成合法形态：直角系用类目/数值、饼漏斗用 {name,value}、散点用 [x,y]、
 * 雷达生成 indicator + 行系列、仪表盘生成 {value}——否则 setOption 会因形态非法而空白。
 */
export function previewChartOption(type: string, option: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!option || typeof option !== 'object' || Array.isArray(option)) return {}
  const next = cloneChartOption(option) as Record<string, any>
  const def = getChartKindDefinition(type)
  const categories = [...getSampleCategories()]
  const values = [...SAMPLE_VALUES]

  const series = Array.isArray(next.series) ? next.series as Record<string, any>[] : []
  const replaceSeriesData = (mapper: (item: Record<string, any>) => unknown): void => {
    for (const item of series) {
      if (Array.isArray(item.data) && item.data.includes('$data')) item.data = mapper(item)
    }
  }
  const replaceAxisData = (): void => {
    for (const key of ['xAxis', 'yAxis'] as const) {
      const axes = Array.isArray(next[key]) ? next[key] : next[key] ? [next[key]] : []
      for (const axis of axes) {
        if (axis && Array.isArray(axis.data) && axis.data.includes('$data')) axis.data = [...categories]
      }
    }
  }

  switch (def?.seriesType) {
    case 'pie':
      replaceSeriesData(() => categories.map((name, index) => ({ name, value: values[index] ?? 10 })))
      break
    case 'funnel':
      replaceSeriesData(() => categories.map((name, index) => ({ name, value: values[index] ?? 10 })))
      break
    case 'scatter':
      replaceSeriesData(() => values.map(value => [value, value + 6]))
      break
    case 'radar':
      next.radar = {
        ...(next.radar ?? {}),
        indicator: categories.map(name => ({ name, max: 30 })),
      }
      replaceSeriesData(() => [{ name: '示例', value: values }])
      break
    case 'gauge':
      replaceSeriesData(() => [{ value: values[0] ?? 40, name: '数量' }])
      break
    default:
      replaceSeriesData(() => [...values])
      replaceAxisData()
      break
  }
  return next
}

/** 读出与预设配色匹配的 palette key；无法匹配时归为 default */
export function readPaletteKey(
  option: Record<string, unknown> | undefined,
  palettes: readonly { key: string; colors: readonly string[] }[],
): string {
  const color = Array.isArray(option?.color) ? (option?.color as unknown[]).map(String) : []
  const hit = palettes.find(palette => palette.colors.every((c, i) => c === color[i]) && color.length === palette.colors.length)
  return hit?.key ?? 'default'
}

/** 工具：option 子节点可能是对象或数组（ECharts 两种写法都合法） */
export function asObject(node: unknown): Record<string, unknown> {
  if (Array.isArray(node)) return node[0] && typeof node[0] === 'object' ? { ...(node[0] as Record<string, unknown>) } : {}
  return node && typeof node === 'object' ? { ...(node as Record<string, unknown>) } : {}
}

/** series 数量与数值字段对齐：多值多系列（core 绑定按 series 顺序取 chartValueFields） */
export function syncSeriesCount(option: Record<string, unknown>, count: number, type: string): Record<string, unknown> {
  const next = cloneChartOption(option)
  const rawSeries = (Array.isArray(next.series) ? next.series : []) as Record<string, unknown>[]
  const def = getChartKindDefinition(type)
  const template = rawSeries[0] ?? { type: def?.seriesType === 'line' ? 'line' : 'bar', data: ['$data'] }
  next.series = Array.from({ length: Math.max(count, 1) }, (_, index) => ({
    ...template,
    ...(rawSeries[index] ?? {}),
    data: ['$data'],
  }))
  return next
}
