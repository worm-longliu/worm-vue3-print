// print-core/src/render/barcode-dot.ts
// 条码「落纸尺寸」的统一算法：条宽决定首选尺寸，打印机 DPI 决定它必须落在点阵网格上，
// 可用框不足时等比缩小。设计器画布 / 浏览器出图 / Playwright 服务端三端共用同一份，
// 否则「设计态看到的条码」与「出纸的条码」不是同一个图形。
//
// 背景（实测）：元素框 56.4×14.1mm、CODE128C 79 模块时，把条码拉伸到填满元素框会得到
// 单模块 0.318mm，在 203dpi（≈8 点/mm）下是 2.55 个打印点。矢量几何在 PDF 里是精确的，
// 但打印机/RIP 只能按整点成像，非整数条宽会被各自取整（2 点或 3 点交替），再加边缘抗锯齿，
// 出纸即「条宽忽宽忽窄、边缘发灰」。标签软件之所以清楚，是因为它把窄条宽度定为整数个打印点
// （如 3 点 = 0.375mm）。
//
// 由此定下三条规则（本次统一的核心）：
// 1. 首选尺寸来自条宽：每模块 = 每模块用户单位数 × BARCODE_MODULE_WIDTH_MM；可用框装得下就不
//    放大——放大到填满必然得到非整数条宽，正是要消除的现象；
// 2. 给了 DPI 时优先适配点阵：首选尺寸吸附到「每模块整数个打印点」，DPI 的优先级高于条宽的
//    精确毫米值（条宽 0.25mm 在 300dpi 下取 3 点 = 0.254mm）；
// 3. 可用框放不下首选尺寸时等比缩小：有点阵时按整数点逐级缩小以保住点对齐；连 1 点/模块都
//    放不下才退回连续等比缩放（此时已无法点对齐，宁可缩小也不让条码溢出可用框）。

/** 1 英寸 = 25.4mm */
export const MM_PER_INCH = 25.4

/**
 * 以下 jsbarcode 生成参数单位统一为「模块」（1 模块 = 窄条宽度）；调用时需乘以
 * 每模块用户单位数（jsbarcode 的 width 选项）。设计器画布与出图端必须共用同一份。
 */
/** 条码静区（quiet zone）宽度（模块）：EAN13/UPC/ITF14 等码制对静区有强制要求，缺失会直接扫不出 */
export const BARCODE_QUIET_ZONE_MODULES = 10
/** 条高（模块） */
export const BARCODE_BAR_HEIGHT_MODULES = 30
/** 条码下方文本缺省高度（模块，相对条高，非绝对 pt） */
export const BARCODE_TEXT_FONT_SIZE_MODULES = 10
/** 文本区与条码图形之间的间距（模块） */
export const BARCODE_MARGIN_BOTTOM_MODULES = 2
/** 基础模块宽度（mm）：barWidth=2（每模块用户单位数 1）时每个模块的物理宽度 */
export const BARCODE_MODULE_WIDTH_MM = 0.25

/** 每模块的用户单位数：与出图端 jsbarcode 的 width 同口径（barWidth=2 → 1，barWidth=4 → 2） */
export function barcodeUnitsPerModule(barWidth?: number): number {
  const raw = typeof barWidth === 'number' && Number.isFinite(barWidth) ? barWidth : 2
  return Math.max(1, raw / 2)
}

/** 每模块的首选物理宽度（mm）：条宽倍率每 +1，增加 BARCODE_MODULE_WIDTH_MM / 2 */
export function barcodePreferredModuleWidthMm(barWidth?: number): number {
  return barcodeUnitsPerModule(barWidth) * BARCODE_MODULE_WIDTH_MM
}

export interface BarcodeSizeInput {
  /** 总宽度（模块，含左右静区） */
  unitWidth: number
  /** 总高度（模块，条高 + 文本区 + 间距） */
  unitHeight: number
  /** 可用框宽度（mm）；≤0 视为未知（不对条码做宽度约束） */
  boxWidthMm: number
  /** 可用框高度（mm）；≤0 视为未知 */
  boxHeightMm: number
  /** 打印机分辨率（点/英寸）；非正数或缺失视为「不对齐点阵」 */
  dpi?: number
  /** 条码模块宽度倍率（2-4），缺省 2 */
  barWidth?: number
}

export interface BarcodeSize {
  /** 结算后的每模块物理宽度（mm） */
  moduleWidthMm: number
  /** 条码图形最终宽度（mm） */
  widthMm: number
  /** 条码图形最终高度（mm） */
  heightMm: number
  /** 每模块占用的打印点数（整数）；未做点对齐时为 null */
  dotsPerModule: number | null
  /** 是否因可用框放不下首选尺寸而发生了等比缩小 */
  scaledDown: boolean
}

/**
 * 可用框（mm）并入最大宽高，得到结算尺寸的最终上限：
 * - 可用框未知（≤0）时，最大宽高即上限；
 * - 两者都未知时返回 0，交给 resolveBarcodeSize 的「不约束」分支。
 * 调用侧（画布 / 出图）共用一份，避免「最大宽高在一端生效、在另一端不生效」。
 */
export function barcodeAvailableBoxMm(boxMm: number | undefined, maxMm: number | undefined): number {
  const box = typeof boxMm === 'number' && boxMm > 0 ? boxMm : Number.POSITIVE_INFINITY
  const limit = typeof maxMm === 'number' && maxMm > 0 ? Math.min(box, maxMm) : box
  return Number.isFinite(limit) ? limit : 0
}

/**
 * 求条码的落纸尺寸。
 *
 * 缩放是等比的：成品宽高始终等于各自的模块数乘以同一个每模块宽度，
 * 所以「宽度不足」时高度同比缩小，条码不会被拉变形。
 */
export function resolveBarcodeSize(input: BarcodeSizeInput): BarcodeSize {
  const unitWidth = Math.max(1, Math.ceil(input.unitWidth))
  const unitHeight = Math.max(1, Math.ceil(input.unitHeight))
  const preferredModuleMm = barcodePreferredModuleWidthMm(input.barWidth)
  // 可用框折算出的每模块上限：宽高各算一次取小者，即等比缩放下能放下的最大值
  const maxModuleMm = Math.min(
    input.boxWidthMm > 0 ? input.boxWidthMm / unitWidth : Number.POSITIVE_INFINITY,
    input.boxHeightMm > 0 ? input.boxHeightMm / unitHeight : Number.POSITIVE_INFINITY,
  )

  const dpi = input.dpi
  if (typeof dpi === 'number' && Number.isFinite(dpi) && dpi > 0) {
    const dotsPerMm = dpi / MM_PER_INCH
    // DPI 优先：首选条宽换算成打印点后取整，落在点阵网格上
    const preferredDots = Math.max(1, Math.round(preferredModuleMm * dotsPerMm))
    // 可用框允许的最大整数点数；< 1 表示连 1 点/模块都放不下，点对齐不可行
    const maxDots = Math.floor(maxModuleMm * dotsPerMm)
    if (maxDots >= 1) {
      const dotsPerModule = Math.min(preferredDots, maxDots)
      const moduleWidthMm = dotsPerModule / dotsPerMm
      return {
        moduleWidthMm,
        widthMm: unitWidth * moduleWidthMm,
        heightMm: unitHeight * moduleWidthMm,
        dotsPerModule,
        scaledDown: dotsPerModule < preferredDots,
      }
    }
    // 连 1 点/模块都放不下 → 落到下方：放弃点对齐，按框等比缩放（比让条码溢出可用框更好）
  }

  const moduleWidthMm = Math.min(preferredModuleMm, maxModuleMm)
  return {
    moduleWidthMm,
    widthMm: unitWidth * moduleWidthMm,
    heightMm: unitHeight * moduleWidthMm,
    dotsPerModule: null,
    scaledDown: moduleWidthMm < preferredModuleMm,
  }
}
