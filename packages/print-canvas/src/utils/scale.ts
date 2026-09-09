// web/src/components/print/utils/scale.ts
// 缩放计算纯函数

/** 最小缩放百分比,低于此值画布难以查看与操作;放大方向不设上限 */
export const MIN_SCALE_PERCENT = 25

/** 将缩放百分比钳制到允许范围:仅保留下限,放大不设上限 */
export function clampScalePercent(percent: number): number {
  return Math.max(MIN_SCALE_PERCENT, percent)
}

/**
 * 滚轮缩放:乘性步进(默认 ×1.1 / ÷1.1),大倍数下仍保持平滑手感,
 * 返回取整后的百分比,避免浮点累加产生脏显示(如 110.00000001)
 * @param percent 当前缩放百分比
 * @param direction 1 放大,-1 缩小
 */
export function nextWheelScale(percent: number, direction: 1 | -1, factor = 1.1): number {
  const next = direction > 0 ? percent * factor : percent / factor
  return clampScalePercent(Math.round(next))
}

/** 计算适应窗口的缩放百分比,仅钳制最小缩放,放大不设上限 */
export function computeFitScale(
  containerW: number,
  containerH: number,
  paperW: number,
  paperH: number,
  ratio = 0.9,
): number {
  if (paperW <= 0 || paperH <= 0) return 100
  const fit = Math.min(containerW / paperW, containerH / paperH) * ratio
  const pct = Math.round(fit * 100)
  return clampScalePercent(pct)
}
