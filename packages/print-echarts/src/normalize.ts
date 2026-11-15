// 出图前按 kind 做「最小形态归一」：只动形态相关键（series.type / 轴方向 / areaStyle /
// 饼环半径 / 漏斗排序 / 雷达与仪表盘 type），颜色、标题、手写样式与 data 一律保留。
import { getChartKindDefinition } from './kinds.js'

function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(item => ({ ...(item as Record<string, unknown>) }))
  return []
}

function normalizeCategoryAxis(axis: Record<string, unknown>, horizontal: boolean): Record<string, unknown> {
  const next: Record<string, unknown> = { ...axis, type: horizontal ? 'value' : 'category' }
  if (horizontal) delete next.data
  else if (!Array.isArray(next.data)) next.data = ['$data']
  return next
}

function normalizeValueAxis(axis: Record<string, unknown>, horizontal: boolean): Record<string, unknown> {
  const next: Record<string, unknown> = { ...axis, type: horizontal ? 'category' : 'value' }
  if (horizontal && !Array.isArray(next.data)) next.data = ['$data']
  if (!horizontal) delete next.data
  return next
}

/** 轴可能是对象也可能是数组（手写 chartOption 的合法写法），数组逐项归一 */
function mapAxes(value: unknown, fn: (axis: Record<string, unknown>) => Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map(item => fn({ ...(item as Record<string, unknown>) }))
  if (value && typeof value === 'object') return fn({ ...(value as Record<string, unknown>) })
  // 手写 option 可能压根没写轴：直角系必须补一根，否则归一后仍是空图
  return fn({})
}

export function normalizeChartOption(type: string, option: Record<string, unknown>): Record<string, unknown> {
  const def = getChartKindDefinition(type)
  if (!def) return option
  const next = structuredClone(option) as Record<string, any>
  const series = asArray(next.series)
  if (series.length === 0) return next

  if (def.seriesType === 'pie') {
    next.series = series.map(item => ({
      ...item,
      type: 'pie',
      ...(type === 'doughnutChart' ? { radius: item.radius ?? ['40%', '70%'] } : {}),
    }))
    delete next.xAxis
    delete next.yAxis
    return next
  }
  if (def.seriesType === 'scatter') {
    next.series = series.map(item => ({ ...item, type: 'scatter' }))
    next.xAxis = mapAxes(next.xAxis, axis => ({ ...axis, type: 'value', data: undefined }))
    next.yAxis = mapAxes(next.yAxis, axis => ({ ...axis, type: 'value', data: undefined }))
    return next
  }
  if (def.seriesType === 'radar') {
    next.series = series.map(item => ({ ...item, type: 'radar' }))
    return next
  }
  if (def.seriesType === 'funnel') {
    next.series = series.map(item => ({ ...item, type: 'funnel', sort: 'descending' }))
    return next
  }
  if (def.seriesType === 'gauge') {
    next.series = series.map(item => ({ ...item, type: 'gauge' }))
    return next
  }

  // 直角坐标系：柱状/条形/折线/面积
  const horizontal = def.orientation === 'horizontal'
  const seriesType = def.seriesType === 'line' ? 'line' : 'bar'
  next.xAxis = mapAxes(next.xAxis, axis => normalizeCategoryAxis(axis, horizontal))
  next.yAxis = mapAxes(next.yAxis, axis => normalizeValueAxis(axis, horizontal))
  next.series = series.map(item => {
    const shape: Record<string, unknown> = { ...item, type: seriesType }
    if (type === 'areaChart') shape.areaStyle = item.areaStyle ?? {}
    else delete shape.areaStyle
    return shape
  })
  return next
}
