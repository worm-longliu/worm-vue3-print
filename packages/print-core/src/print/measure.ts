import { pxToMm } from './units.js'
import type { RawMeasurement } from './types.js'
import type { MeasuredElement, TemplateData } from '../render/types.js'
import { resolveFlowLayoutMode } from '../render/flow-list.js'

/** 是否 dynamic 模式的流式列表：逐行高度写入 measuredFlowRowHeights，不占用表格通道 */
function isDynamicFlowList(element: { type?: string; printElementType?: { type?: string }; options?: Record<string, any> } | undefined): boolean {
  const type = element?.type ?? element?.printElementType?.type
  if (type !== 'flowList') return false
  return resolveFlowLayoutMode(element?.options?.flowLayoutMode) === 'dynamic'
}

/**
 * 原始测量 → 分页输入。三端共用：px→mm、表格行高、重复表头段高度。
 * repeatHeaderHeight = 前 `options._repeatHeaderCount` 个渲染行高之和。
 * dynamic 模式的 flowList 逐行高度归入 measuredFlowRowHeights；表格仍走 measuredRowHeights。
 */
export function normalizeMeasurements(
  raw: RawMeasurement[],
  template: TemplateData,
): Map<string, MeasuredElement> {
  const index = new Map(template.elements.map(el => [el.id, el]))
  const measured = new Map<string, MeasuredElement>()
  for (const item of raw) {
    const element = index.get(item.id)
    const repeatCount: number = element?.options?._repeatHeaderCount ?? 0
    const rowHeights = item.rowHeightsPx?.map(pxToMm)
    const dynamicFlow = isDynamicFlowList(element)
    measured.set(item.id, {
      id: item.id,
      measuredHeight: pxToMm(item.heightPx),
      ...(dynamicFlow ? { measuredFlowRowHeights: rowHeights } : { measuredRowHeights: rowHeights }),
      repeatHeaderHeight:
        rowHeights && rowHeights.length > 0 && repeatCount > 0
          ? rowHeights.slice(0, repeatCount).reduce((sum, h) => sum + h, 0)
          : 0,
    })
  }
  return measured
}
