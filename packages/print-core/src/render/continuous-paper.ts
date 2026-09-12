// 连续纸出纸高度的最后一步组合（不依赖 DOM）。
// contentBottomMm：探针测得的内容区后代相对 .print-page 顶部的最大底边（mm，
// 已天然包含上边距/页眉/首页叠加的纵向偏移；flow-group 跟随区由真实引擎布局如实反映）。
import type { TemplateData } from './types.js'

/** 连续纸推导高度下限：1 英寸（25.4mm），避免过矮被打印驱动拒绝 */
export const MIN_CONTINUOUS_HEIGHT_MM = 25.4

export function composeContinuousHeight(template: TemplateData, contentBottomMm: number): number {
  const mb = template.margins?.bottom ?? 0
  const footerH = template.footer?.height ?? 0
  const height = Math.max(contentBottomMm, 0) + footerH + mb
  return Math.max(MIN_CONTINUOUS_HEIGHT_MM, Math.round(height * 100) / 100)
}
