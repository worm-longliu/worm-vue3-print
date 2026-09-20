// print-core/src/render/barcode-dot.ts
// 条码「打印点对齐」：把条码最终尺寸吸附到打印机点阵网格上。
//
// 背景（实测）：元素框 56.4×14.1mm、CODE128C 79 模块时，单模块 0.318mm，在 203dpi
// （8 点/mm）下等于 2.55 个打印点。矢量几何在 PDF 里是精确的，但打印机/RIP 只能按整点
// 成像，非整数条宽会被各自取整（2 点或 3 点交替），再加边缘抗锯齿，出纸即「条宽忽宽忽窄、
// 边缘发灰」。标签软件之所以清楚，是因为它把窄条宽度定为整数个打印点（如 3 点 = 0.375mm）。
//
// 本模块只做纯计算：给定模块数与可用框（mm）、打印机分辨率（dpi），求出每模块点数与最终
// 尺寸（mm）。只要最终尺寸恰好等于整数个打印点，整条条码（含文本）的所有边界都落在点网格上。

/** 1 英寸 = 25.4mm */
export const MM_PER_INCH = 25.4

/**
 * 条码静区（quiet zone）宽度，单位：模块。
 * jsbarcode 默认 10，此前出图端被写死为 0（左右无静区），
 * EAN13/UPC/ITF14 等码制对静区有强制要求（EAN13 左 11 / 右 7 模块），缺失会直接扫不出。
 */
/**
 * jsbarcode 生成参数，单位统一为「模块」（1 模块 = 窄条宽度）；调用时需乘以
 * 每模块用户单位数（jsbarcode 的 width 选项）。设计器画布与出图端必须共用同一份，
 * 否则「设计态看到的条码」与「出纸的条码」不是同一个图形。
 */
export const BARCODE_QUIET_ZONE_MODULES = 10
/** 条高（模块） */
export const BARCODE_BAR_HEIGHT_MODULES = 30
/** 条码下方文本缺省高度（模块，相对条高，非绝对 pt） */
export const BARCODE_TEXT_FONT_SIZE_MODULES = 10
/** 文本区与条码图形之间的间距（模块） */
export const BARCODE_MARGIN_BOTTOM_MODULES = 2

export interface BarcodeDotLayout {
  /** 实际使用的打印机分辨率（点/英寸） */
  dpi: number
  /** 每模块占用的打印点数（整数） */
  dotsPerModule: number
  /** 条码图形最终宽度（mm），= dotsPerModule × 模块数（含左右静区） */
  widthMm: number
  /** 条码图形最终高度（mm），= dotsPerModule × 高度模块数 */
  heightMm: number
  /** 条码图形最终宽度（打印点数，整数） */
  widthDots: number
  /** 条码图形最终高度（打印点数，整数） */
  heightDots: number
}

export interface BarcodeDotLayoutInput {
  /** 总宽度（模块，含左右静区） */
  unitWidth: number
  /** 总高度（模块，条高 + 文本区 + 上下间距） */
  unitHeight: number
  /** 可用框宽度（mm） */
  boxWidthMm: number
  /** 可用框高度（mm） */
  boxHeightMm: number
  /** 打印机分辨率（点/英寸）；非正数或缺失视为「不对齐」 */
  dpi?: number
  /** 每模块最少点数，缺省 1（热敏建议 ≥2，否则单点宽过细易糊） */
  minDotsPerModule?: number
}

/**
 * 求条码的点阵对齐布局。
 *
 * 规则：每模块点数取「在可用框内能把条码完整放下」的最大整数点数——
 * 先按框宽反推，再用框高复核（高度不足时取更小者），且不低于 minDotsPerModule。
 *
 * 返回 null 表示「这次不做点对齐」，调用方应退回原有的按框缩放路径：
 * 未给 dpi、框尺寸未知，或框小到连 minDotsPerModule 都放不下（此时强行对齐会让条码
 * 溢出元素框，比缩放着印更糟）。
 */
export function resolveBarcodeDotLayout(input: BarcodeDotLayoutInput): BarcodeDotLayout | null {
  const dpi = input.dpi
  if (!dpi || !Number.isFinite(dpi) || dpi <= 0) return null
  if (!(input.boxWidthMm > 0) || !(input.boxHeightMm > 0)) return null

  const unitWidth = Math.max(1, Math.ceil(input.unitWidth))
  const unitHeight = Math.max(1, Math.ceil(input.unitHeight))
  const minDots = Math.max(1, Math.floor(input.minDotsPerModule ?? 1))

  const dotsPerMm = dpi / MM_PER_INCH
  const fitByWidth = Math.floor((input.boxWidthMm * dotsPerMm) / unitWidth)
  const fitByHeight = Math.floor((input.boxHeightMm * dotsPerMm) / unitHeight)
  const dotsPerModule = Math.min(fitByWidth, fitByHeight)
  if (dotsPerModule < minDots) return null

  const widthDots = unitWidth * dotsPerModule
  const heightDots = unitHeight * dotsPerModule
  return {
    dpi,
    dotsPerModule,
    widthDots,
    heightDots,
    widthMm: (widthDots * MM_PER_INCH) / dpi,
    heightMm: (heightDots * MM_PER_INCH) / dpi,
  }
}

/** mm → 打印点数（浮点，便于诊断输出） */
export function millimetersToDots(mm: number, dpi: number): number {
  return (mm * dpi) / MM_PER_INCH
}
