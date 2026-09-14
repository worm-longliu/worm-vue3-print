/** 96dpi 下 1mm 的 CSS 像素数；浏览器测量与服务端视口必须共用同一常量 */
export const PX_PER_MM = 3.7795275591
/** 1mm = 1000µm（协议与任务记录使用微米） */
export const MICROMETERS_PER_MM = 1000
/** 1in = 25.4mm = 25400µm（Electron printToPDF 的 pageSize 使用英寸） */
export const MM_PER_INCH = 25.4
export const MICROMETERS_PER_INCH = 25400

export function pxToMm(px: number): number {
  return px / PX_PER_MM
}

export function mmToPx(mm: number): number {
  return Math.round(mm * PX_PER_MM)
}

export function millimetersToMicrometers(mm: number): number {
  return Math.round(mm * MICROMETERS_PER_MM)
}

export function micrometersToMillimeters(um: number): number {
  return um / MICROMETERS_PER_MM
}

export function millimetersToInches(mm: number): number {
  return mm / MM_PER_INCH
}
