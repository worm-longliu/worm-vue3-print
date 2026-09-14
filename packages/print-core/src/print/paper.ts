import { mmToPx } from './units.js'
import type { HeightSource, PaperMm, ViewportPx } from './types.js'

/** 宿主纸张覆盖（mm）；字段为 0 或负数视为未提供 */
export interface PaperOverride {
  width?: number
  height?: number
}

export interface ResolvePaperInput {
  /** core 计算出的纸尺寸：连续纸为探针推导高度，其余为模板纸张 */
  paperMm: PaperMm
  continuous: boolean
  override?: PaperOverride
}

function positive(value: number | undefined): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined
}

/** 连续纸 HTML 纸高逃生门：显式 paperHeightMm 优先于协议覆盖高度 */
export function escapeHeightMm(input: { paperHeightMm?: number; override?: PaperOverride }): number | undefined {
  return positive(input.paperHeightMm) ?? positive(input.override?.height)
}

/**
 * 应用宿主覆盖并给出纸高来源。
 * 连续纸仅覆盖宽度时，高度仍取推导值且来源保持 derived（不可降级为 config）。
 */
export function resolvePaperMm(input: ResolvePaperInput): { paperMm: PaperMm; heightSource: HeightSource } {
  const width = positive(input.override?.width) ?? input.paperMm.width
  const overrideHeight = positive(input.override?.height)
  if (input.continuous) {
    return overrideHeight
      ? { paperMm: { width, height: overrideHeight }, heightSource: 'config' }
      : { paperMm: { width, height: input.paperMm.height }, heightSource: 'derived' }
  }
  return { paperMm: { width, height: overrideHeight ?? input.paperMm.height }, heightSource: 'config' }
}

/** 测量容器尺寸（CSS px）；三端必须使用同一结果 */
export function paperViewportPx(paper: PaperMm): ViewportPx {
  return { width: mmToPx(paper.width), height: mmToPx(paper.height) }
}
