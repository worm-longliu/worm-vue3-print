// print-core/src/render/barcode-dot.test.ts
// 条码落纸尺寸的三条规则：条宽定首选 → 设了 dpi 就吸附到整数打印点（dpi 优先）→ 框不够等比缩小。
import { describe, it, expect } from 'vitest'
import {
  BARCODE_QUIET_ZONE_MODULES,
  MM_PER_INCH,
  barcodeAvailableBoxMm,
  barcodePreferredModuleWidthMm,
  barcodeUnitsPerModule,
  resolveBarcodeSize,
} from './barcode-dot.js'

/** 实测基准：CODE128C 编 '12345678' → 79 模块；条高 30 + 间距 2 + 文本 12 = 44 模块 */
const CODE128C_79 = { unitWidth: 79, unitHeight: 44 }
/** 元素工厂缺省条码框（element-factory.ts） */
const DEFAULT_BOX = { boxWidthMm: 56.4, boxHeightMm: 14.1 }

/** 折算回打印点：点对齐时必须落在整数点上 */
function dotsOf(mm: number, dpi: number): number {
  return (mm * dpi) / MM_PER_INCH
}

describe('条宽 → 首选模块宽度', () => {
  it('每模块用户单位数与出图端 jsbarcode 的 width 同口径', () => {
    expect(barcodeUnitsPerModule()).toBe(1)
    expect(barcodeUnitsPerModule(2)).toBe(1)
    expect(barcodeUnitsPerModule(3)).toBe(1.5)
    expect(barcodeUnitsPerModule(4)).toBe(2)
    // 缺省值与非法值都按 barWidth=2 处理
    expect(barcodePreferredModuleWidthMm()).toBe(0.25)
    expect(barcodePreferredModuleWidthMm(4)).toBe(0.5)
  })

  it('静区常量为 jsbarcode 缺省值 10 模块', () => {
    expect(BARCODE_QUIET_ZONE_MODULES).toBe(10)
  })
})

describe('resolveBarcodeSize 未设 dpi：按条宽渲染', () => {
  it('条宽决定每模块物理宽度，框装得下就按原尺寸（不放大填满）', () => {
    const size = resolveBarcodeSize({ ...CODE128C_79, ...DEFAULT_BOX })
    expect(size.moduleWidthMm).toBe(0.25)
    expect(size.widthMm).toBeCloseTo(79 * 0.25, 9)
    expect(size.heightMm).toBeCloseTo(44 * 0.25, 9)
    expect(size.dotsPerModule).toBeNull()
    expect(size.scaledDown).toBe(false)
  })

  it('dpi 为 0 / 负数 / 缺失时不点对齐', () => {
    for (const dpi of [undefined, 0, -203]) {
      const size = resolveBarcodeSize({ ...CODE128C_79, ...DEFAULT_BOX, dpi })
      expect(size.dotsPerModule).toBeNull()
      expect(size.moduleWidthMm).toBe(0.25)
    }
  })

  it('条宽加倍 → 尺寸同比加倍', () => {
    const base = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 0, boxHeightMm: 0 })
    const thick = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 0, boxHeightMm: 0, barWidth: 4 })
    expect(thick.widthMm).toBeCloseTo(base.widthMm * 2, 9)
  })

  it('可用宽高不足时等比缩小（宽高比不变）', () => {
    const size = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 20, boxHeightMm: 5, barWidth: 4 })
    expect(size.scaledDown).toBe(true)
    expect(size.widthMm).toBeLessThanOrEqual(20)
    expect(size.heightMm).toBeLessThanOrEqual(5)
    expect(size.widthMm / size.heightMm).toBeCloseTo(79 / 44, 9)
  })

  it('框尺寸未知（为 0）时不约束，按首选尺寸渲染', () => {
    const size = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 0, boxHeightMm: 0 })
    expect(size.widthMm).toBeCloseTo(79 * 0.25, 9)
    expect(size.scaledDown).toBe(false)
  })
})

describe('resolveBarcodeSize 设置 dpi：优先适配打印点阵', () => {
  it('203dpi 缺省条宽：0.25mm → 2 点/模块（宽度足够，不放大）', () => {
    const size = resolveBarcodeSize({ ...CODE128C_79, ...DEFAULT_BOX, dpi: 203 })
    expect(size.dotsPerModule).toBe(2)
    expect(size.widthMm).toBeCloseTo((79 * 2 * MM_PER_INCH) / 203, 9)
    expect(size.heightMm).toBeCloseTo((44 * 2 * MM_PER_INCH) / 203, 9)
    expect(size.scaledDown).toBe(false)
  })

  it('300dpi 同一条宽：吸附到 3 点/模块（DPI 优先于条宽的精确毫米值）', () => {
    const size = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 0, boxHeightMm: 0, dpi: 300 })
    expect(size.dotsPerModule).toBe(3)
    // 0.25mm 在 300dpi 下是 2.95 点，向上吸附为 3 点 = 0.254mm
    expect(size.moduleWidthMm).toBeCloseTo(0.254, 3)
  })

  it('成品尺寸恰好是整数个打印点（消除条宽忽宽忽窄的关键）', () => {
    for (const dpi of [203, 300, 600]) {
      const size = resolveBarcodeSize({ ...CODE128C_79, ...DEFAULT_BOX, dpi })
      expect(dotsOf(size.widthMm, dpi)).toBeCloseTo(Math.round(dotsOf(size.widthMm, dpi)), 6)
      expect(dotsOf(size.heightMm, dpi)).toBeCloseTo(Math.round(dotsOf(size.heightMm, dpi)), 6)
    }
  })

  it('条宽越大，每模块点数越多（barWidth 仍是尺寸的第一来源）', () => {
    const thin = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 0, boxHeightMm: 0, dpi: 203, barWidth: 2 })
    const thick = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 0, boxHeightMm: 0, dpi: 203, barWidth: 4 })
    expect(thick.dotsPerModule).toBe(4)
    expect(thick.widthMm).toBeCloseTo(thin.widthMm * 2, 9)
  })

  it('框很大时不放大：宁可按条宽原尺寸，也不把条宽拉成非整数点', () => {
    const size = resolveBarcodeSize({
      unitWidth: 79, unitHeight: 44, boxWidthMm: 200, boxHeightMm: 200, dpi: 203,
    })
    expect(size.dotsPerModule).toBe(2)
  })

  it('宽度不足时按整数点逐级缩小（保持点对齐与宽高比）', () => {
    const size = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 15, boxHeightMm: 14.1, dpi: 203 })
    expect(size.dotsPerModule).toBe(1)
    expect(size.scaledDown).toBe(true)
    expect(size.widthMm).toBeLessThanOrEqual(15)
    expect(size.widthMm / size.heightMm).toBeCloseTo(79 / 44, 9)
    expect(dotsOf(size.widthMm, 203)).toBeCloseTo(Math.round(dotsOf(size.widthMm, 203)), 6)
  })

  it('连 1 点/模块都放不下时退回连续等比缩放（不对齐也不溢出可用框）', () => {
    const size = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 5, boxHeightMm: 5, dpi: 203 })
    expect(size.dotsPerModule).toBeNull()
    expect(size.scaledDown).toBe(true)
    expect(size.widthMm).toBeLessThanOrEqual(5)
    expect(size.heightMm).toBeLessThanOrEqual(5)
    expect(size.widthMm / size.heightMm).toBeCloseTo(79 / 44, 9)
  })

  it('高度先告急时同样等比缩小（宽高比不变）', () => {
    const size = resolveBarcodeSize({ ...CODE128C_79, boxWidthMm: 56.4, boxHeightMm: 6, dpi: 203 })
    expect(size.heightMm).toBeLessThanOrEqual(6)
    expect(size.widthMm / size.heightMm).toBeCloseTo(79 / 44, 9)
    expect(dotsOf(size.heightMm, 203)).toBeCloseTo(Math.round(dotsOf(size.heightMm, 203)), 6)
  })

  it('模块数取整向上：非整数单位宽不会被算成额外点数', () => {
    const size = resolveBarcodeSize({
      unitWidth: 79.2, unitHeight: 44.4, boxWidthMm: 0, boxHeightMm: 0, dpi: 203,
    })
    expect(dotsOf(size.widthMm, 203)).toBeCloseTo(80 * (size.dotsPerModule ?? 0), 6)
    expect(dotsOf(size.heightMm, 203)).toBeCloseTo(45 * (size.dotsPerModule ?? 0), 6)
  })
})

describe('可用框并入最大宽高', () => {
  it('可用框已知时取小者', () => {
    expect(barcodeAvailableBoxMm(56.4, 30)).toBe(30)
    expect(barcodeAvailableBoxMm(56.4, 80)).toBe(56.4)
  })

  it('可用框未知时最大宽高即上限', () => {
    expect(barcodeAvailableBoxMm(0, 30)).toBe(30)
    expect(barcodeAvailableBoxMm(undefined, 30)).toBe(30)
  })

  it('两者都未知时返回 0（不约束）', () => {
    expect(barcodeAvailableBoxMm(0, undefined)).toBe(0)
    expect(barcodeAvailableBoxMm(undefined, undefined)).toBe(0)
  })
})
