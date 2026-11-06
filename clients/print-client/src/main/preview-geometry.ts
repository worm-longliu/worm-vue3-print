// 预览截图几何纯函数：换算口径只在这里定义一次，模板渲染 bridge 与单测共用。
// 截图的 mmPerPx 必须来自「纸张毫米宽 ÷ 截图实际像素宽」，因为实际像素尺寸
// 受 deviceScaleFactor / zoom / scale 影响，与 96dpi 换算出的 CSS px 不一致。

/** round4：预览几何输出统一保留 4 位小数 */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * 1 个截图像素对应的毫米数：pageWidthMm / widthPx。
 * 入参非正或非有限时返回 undefined（调用方自查返回值；bridge 在导出字段时按此省略）。
 */
export function computeMmPerPx(pageWidthMm: number, widthPx: number): number | undefined {
  if (!Number.isFinite(pageWidthMm) || !Number.isFinite(widthPx) || pageWidthMm <= 0 || widthPx <= 0) {
    return undefined
  }
  return round4(pageWidthMm / widthPx)
}
