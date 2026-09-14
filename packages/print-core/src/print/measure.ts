import { pxToMm } from './units.js'
import type { RawMeasurement } from './types.js'
import type { MeasuredElement, TemplateData } from '../render/types.js'

/**
 * 原始测量 → 分页输入。三端共用：px→mm、表格行高、重复表头段高度。
 * repeatHeaderHeight = 前 `options._repeatHeaderCount` 个渲染行高之和。
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
    measured.set(item.id, {
      id: item.id,
      measuredHeight: pxToMm(item.heightPx),
      measuredRowHeights: rowHeights,
      repeatHeaderHeight:
        rowHeights && rowHeights.length > 0 && repeatCount > 0
          ? rowHeights.slice(0, repeatCount).reduce((sum, h) => sum + h, 0)
          : 0,
    })
  }
  return measured
}
