// 打印落纸 96dpi 换算：1in = 25.4mm = 96px。
// 渲染器与设计器面板共用同一份换算，避免两处各写一遍。
const PX_PER_MM = 96 / 25.4

/** mm → 逻辑像素（至少 1px，避免空尺寸 option 让 echarts 抛错） */
export function mmToChartPx(mm: number): number {
  const value = Number.isFinite(mm) ? mm : 0
  return Math.max(1, Math.round(value * PX_PER_MM))
}
