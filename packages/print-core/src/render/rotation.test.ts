// 元素级旋转口径单点（rotation.ts）的判据：AABB 几何对照数字与验证件 summary.json 同源
// （docs/superpowers/specs/2026-10-27-element-rotation-design.md 第三节）
import { describe, expect, it } from 'vitest'
import {
  CODE_ROTATION_MIN_DPI,
  getRotatedAabb,
  normalizeRotationAngle,
  resolveElementRotation,
} from './rotation.js'

const BOX = { left: 20, top: 250, width: 100, height: 20 }

function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}

describe('normalizeRotationAngle', () => {
  it('归一到 [0,360)，非有限值归 0', () => {
    expect(normalizeRotationAngle(0)).toBe(0)
    expect(normalizeRotationAngle(360)).toBe(0)
    expect(normalizeRotationAngle(450)).toBe(90)
    expect(normalizeRotationAngle(-90)).toBe(270)
    expect(normalizeRotationAngle(720.5)).toBe(0.5)
    expect(normalizeRotationAngle(Number.NaN)).toBe(0)
    expect(normalizeRotationAngle(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('getRotatedAabb', () => {
  it('0°/180° 逐字退化回原盒（存量分页产物 byte 级不变的前提）', () => {
    for (const a of [0, 180, 360, undefined as unknown as number]) {
      const r = getRotatedAabb(BOX, 20, a === undefined ? 0 : a)
      expect(r).toEqual({ left: 20, top: 250, width: 100, height: 20 })
    }
  })

  it('直角档精确换算（不走三角函数）', () => {
    expect(getRotatedAabb(BOX, 20, 90)).toEqual({ left: 60, top: 210, width: 20, height: 100 })
    expect(getRotatedAabb(BOX, 20, 270)).toEqual({ left: 60, top: 210, width: 20, height: 100 })
    expect(getRotatedAabb(BOX, 20, 180)).toEqual({ left: 20, top: 250, width: 100, height: 20 })
  })

  it('斜角对照数字逐档相等（100×20 @(20,250)）', () => {
    // 15°：aabbW=100·cos15+20·sin15=101.7690，aabbH=100·sin15+20·cos15=45.2004
    const r15 = getRotatedAabb(BOX, 20, 15)
    expect(round4(r15.width)).toBe(101.769)
    expect(round4(r15.height)).toBe(45.2004)
    expect(round4(r15.top)).toBe(237.3998)
    expect(round4(r15.left)).toBe(19.1155)

    // 30°：96.6025×67.3205，top 226.3397
    const r30 = getRotatedAabb(BOX, 20, 30)
    expect(round4(r30.width)).toBe(96.6025)
    expect(round4(r30.height)).toBe(67.3205)
    expect(round4(r30.top)).toBe(226.3397)

    // 45°：84.8528 见方，top 217.5836
    const r45 = getRotatedAabb(BOX, 20, 45)
    expect(round4(r45.width)).toBe(84.8528)
    expect(round4(r45.height)).toBe(84.8528)
    expect(round4(r45.top)).toBe(217.5736)
  })

  it('AABB 围绕设计盒中心（中心点不变）', () => {
    for (const a of [13, 37, 90, 123, 45, 270]) {
      const r = getRotatedAabb(BOX, 20, a)
      expect(round4(r.left + r.width / 2)).toBe(70)
      expect(round4(r.top + r.height / 2)).toBe(260)
    }
  })
})

describe('resolveElementRotation', () => {
  it('未设/0/非法值 → undefined', () => {
    expect(resolveElementRotation('text', undefined)).toBeUndefined()
    expect(resolveElementRotation('text', {})).toBeUndefined()
    expect(resolveElementRotation('text', { rotate: 0 })).toBeUndefined()
    expect(resolveElementRotation('text', { rotate: 360 })).toBeUndefined()
    expect(resolveElementRotation('text', { rotate: Number.NaN })).toBeUndefined()
  })

  it('普通类型斜角放行并归一', () => {
    expect(resolveElementRotation('text', { rotate: 30 })).toBe(30)
    expect(resolveElementRotation('image', { rotate: 450 })).toBe(90)
    expect(resolveElementRotation('rect', { rotate: -90 })).toBe(270)
  })

  it('v1 排除类型恒 undefined（模板不报错，出纸保持水平）', () => {
    expect(resolveElementRotation('table', { rotate: 45 })).toBeUndefined()
    expect(resolveElementRotation('flowList', { rotate: 45 })).toBeUndefined()
  })

  it('条码/二维码直角档全 dpi 放行', () => {
    for (const type of ['barcode', 'qrcode']) {
      expect(resolveElementRotation(type, { rotate: 90 })).toBe(90)
      expect(resolveElementRotation(type, { rotate: 180 })).toBe(180)
      expect(resolveElementRotation(type, { rotate: 270 })).toBe(270)
      expect(resolveElementRotation(type, { rotate: 90 }, 203)).toBe(90)
    }
  })

  it('条码斜角：dpi 达标放行、低于门槛吸附直角、dpi 未知按声明角放行', () => {
    expect(CODE_ROTATION_MIN_DPI).toBe(385)
    expect(resolveElementRotation('barcode', { rotate: 30 }, 385)).toBe(30)
    expect(resolveElementRotation('barcode', { rotate: 30 }, 600)).toBe(30)
    expect(resolveElementRotation('barcode', { rotate: 30 })).toBe(30)
    // 300dpi 及以下吸附：30°→最近直角 0（即不转）、45°→90、60°→90
    expect(resolveElementRotation('barcode', { rotate: 30 }, 300)).toBeUndefined()
    expect(resolveElementRotation('barcode', { rotate: 30 }, 203)).toBeUndefined()
    expect(resolveElementRotation('barcode', { rotate: 45 }, 203)).toBe(90)
    expect(resolveElementRotation('barcode', { rotate: 60 }, 300)).toBe(90)
    expect(resolveElementRotation('qrcode', { rotate: 30 }, 300)).toBeUndefined()
  })

  it('码类元素自带 printerDpi 即生效，调用方无需重复传 dpi（条码与二维码同口径）', () => {
    for (const type of ['barcode', 'qrcode']) {
      expect(resolveElementRotation(type, { rotate: 30, printerDpi: 203 })).toBeUndefined()
      expect(resolveElementRotation(type, { rotate: 45, printerDpi: 300 })).toBe(90)
      expect(resolveElementRotation(type, { rotate: 30, printerDpi: CODE_ROTATION_MIN_DPI })).toBe(30)
      // 未声明打印头分辨率：按声明角放行（设计器无法预知出纸端 dpi）
      expect(resolveElementRotation(type, { rotate: 30 })).toBe(30)
    }
  })

  it('显式 dpi 覆盖元素自带 printerDpi（渲染端按出纸机已知分辨率结算）', () => {
    expect(resolveElementRotation('qrcode', { rotate: 30, printerDpi: 203 }, 600)).toBe(30)
    expect(resolveElementRotation('barcode', { rotate: 30, printerDpi: 600 }, 203)).toBeUndefined()
  })
})
