// web/src/components/print/utils/scale.ts
// 缩放计算纯函数

/** 计算适应窗口的缩放百分比,clamp 到 [50,200] */
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
  return Math.min(200, Math.max(50, pct))
}
