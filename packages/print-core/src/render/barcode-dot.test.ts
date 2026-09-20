// print-core/src/render/barcode-dot.test.ts
// 条码打印点对齐：断言「每模块取整数个打印点」「成品尺寸恰好等于整数点」「不超出可用框」。
import { describe, it, expect } from 'vitest'
import {
  BARCODE_QUIET_ZONE_MODULES,
  MM_PER_INCH,
  millimetersToDots,
  resolveBarcodeDotLayout,
} from './barcode-dot.js'

/** 实测基准：CODE128C 编 '12345678' → 79 模块；条高 30 + 间距 2 + 文本 12 = 44 模块 */
const CODE128C_79 = { unitWidth: 79, unitHeight: 44 }
/** 元素工厂缺省条码框（element-factory.ts） */
const DEFAULT_BOX = { boxWidthMm: 56.4, boxHeightMm: 14.1 }

describe('resolveBarcodeDotLayout', () => {
  it('未提供 dpi 时返回 null（保持原缩放行为）', () => {
    expect(resolveBarcodeDotLayout({ ...CODE128C_79, ...DEFAULT_BOX })).toBeNull()
    expect(resolveBarcodeDotLayout({ ...CODE128C_79, ...DEFAULT_BOX, dpi: 0 })).toBeNull()
    expect(resolveBarcodeDotLayout({ ...CODE128C_79, ...DEFAULT_BOX, dpi: -203 })).toBeNull()
  })

  it('203dpi 缺省条码框：高度受限 → 每模块 2 点（0.25mm）', () => {
    const layout = resolveBarcodeDotLayout({ ...CODE128C_79, ...DEFAULT_BOX, dpi: 203 })!
    // 宽度可用 5 点/模块（floor(56.4×8/79)），高度只够 2 点/模块（floor(14.1×8/44)）
    expect(layout.dotsPerModule).toBe(2)
    expect(layout.widthDots).toBe(79 * 2)
    expect(layout.heightDots).toBe(44 * 2)
    expect(layout.widthMm).toBeCloseTo((158 * MM_PER_INCH) / 203, 6)
    expect(layout.heightMm).toBeCloseTo((88 * MM_PER_INCH) / 203, 6)
  })

  it('300dpi 缺省条码框：每模块 3 点', () => {
    const layout = resolveBarcodeDotLayout({ ...CODE128C_79, ...DEFAULT_BOX, dpi: 300 })!
    expect(layout.dotsPerModule).toBe(3)
    expect(layout.widthDots).toBe(237)
    expect(layout.heightDots).toBe(132)
  })

  it('成品尺寸恰好是整数个打印点（这是消除条宽忽宽忽窄的关键）', () => {
    for (const dpi of [203, 300, 600]) {
      const layout = resolveBarcodeDotLayout({ ...CODE128C_79, ...DEFAULT_BOX, dpi })!
      expect(millimetersToDots(layout.widthMm, dpi)).toBeCloseTo(layout.widthDots, 9)
      expect(millimetersToDots(layout.heightMm, dpi)).toBeCloseTo(layout.heightDots, 9)
      expect(Number.isInteger(layout.widthDots)).toBe(true)
      expect(Number.isInteger(layout.heightDots)).toBe(true)
    }
  })

  it('框足够大时取宽度允许的最大点数（条越粗越清晰）', () => {
    const layout = resolveBarcodeDotLayout({
      unitWidth: 79, unitHeight: 44, boxWidthMm: 100, boxHeightMm: 100, dpi: 203,
    })!
    expect(layout.dotsPerModule).toBe(10)
    expect(layout.widthMm).toBeCloseTo((790 * MM_PER_INCH) / 203, 6)
  })

  it('永不超出可用框（宽高都放得下）', () => {
    const layout = resolveBarcodeDotLayout({ ...CODE128C_79, ...DEFAULT_BOX, dpi: 203 })!
    expect(layout.widthMm).toBeLessThanOrEqual(DEFAULT_BOX.boxWidthMm)
    expect(layout.heightMm).toBeLessThanOrEqual(DEFAULT_BOX.boxHeightMm)
  })

  it('框尺寸未知（为 0）时不做点对齐：交给原有按框缩放路径', () => {
    expect(resolveBarcodeDotLayout({ ...CODE128C_79, boxWidthMm: 0, boxHeightMm: 14.1, dpi: 203 })).toBeNull()
    expect(resolveBarcodeDotLayout({ ...CODE128C_79, boxWidthMm: 56.4, boxHeightMm: 0, dpi: 203 })).toBeNull()
  })

  it('框放不下时的最小可用布局都不成立时返回 null（宁可缩放，也不让条码溢出元素框）', () => {
    expect(resolveBarcodeDotLayout({
      unitWidth: 79, unitHeight: 44, boxWidthMm: 56.4, boxHeightMm: 1, dpi: 203,
    })).toBeNull()
    // minDotsPerModule 抬高下限后同样如此
    expect(resolveBarcodeDotLayout({
      unitWidth: 79, unitHeight: 44, boxWidthMm: 56.4, boxHeightMm: 1, dpi: 203, minDotsPerModule: 3,
    })).toBeNull()
    // 刚好放得下 1 点/模块时仍可用
    expect(resolveBarcodeDotLayout({
      unitWidth: 79, unitHeight: 44, boxWidthMm: 56.4, boxHeightMm: 5.6, dpi: 203,
    })?.dotsPerModule).toBe(1)
  })

  it('模块数取整向上：非整数单位宽不会被放大成额外点数', () => {
    const layout = resolveBarcodeDotLayout({
      unitWidth: 79.2, unitHeight: 44.4, boxWidthMm: 56.4, boxHeightMm: 14.1, dpi: 203,
    })!
    expect(layout.widthDots).toBe(80 * layout.dotsPerModule)
    expect(layout.heightDots).toBe(45 * layout.dotsPerModule)
  })

  it('静区常量为 jsbarcode 缺省值 10 模块', () => {
    expect(BARCODE_QUIET_ZONE_MODULES).toBe(10)
  })
})
