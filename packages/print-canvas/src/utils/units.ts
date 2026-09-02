// web/src/components/print/utils/units.ts

/** pt 转 mm */
export function ptToMm(pt: number): number {
  return pt / 2.83464566929
}

/** px 转 mm（基于 96dpi 屏幕） */
export function pxToMm(px: number): number {
  return px * (25.4 / 96)
}
