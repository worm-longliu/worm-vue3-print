// web/src/components/print/utils/default-config.ts
import type { TemplateData } from '../types.js'

export const PAPER_PRESETS: Record<string, { width: number; height: number }> = {
  A4:  { width: 210, height: 297 },
  A3:  { width: 297, height: 420 },
  A5:  { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  // 连续纸：默认 80mm 热敏；高度仅为设计画布高度，出纸按内容推导
  CONTINUOUS: { width: 80, height: 297 },
}

/**
 * 获取纸张原始宽高（mm，未应用方向）
 * CUSTOM 时读取 customWidth/customHeight，缺省回退 A4；
 * CONTINUOUS 时宽度取 customWidth（缺省 80），高度固定 297（仅设计画布），方向强制纵向。
 */
export function getPaperDimensions(t: Pick<TemplateData, 'paperSize' | 'orientation' | 'customWidth' | 'customHeight'>): { width: number; height: number } {
  let base: { width: number; height: number }
  if (t.paperSize === 'CUSTOM' || t.paperSize === 'CONTINUOUS') {
    base = {
      width: t.customWidth ?? (t.paperSize === 'CONTINUOUS' ? 80 : 210),
      height: t.customHeight ?? 297,
    }
  } else {
    base = PAPER_PRESETS[t.paperSize] || PAPER_PRESETS['A4']!
  }
  return t.orientation === 'landscape' && t.paperSize !== 'CONTINUOUS'
    ? { width: base.height, height: base.width }
    : base
}
