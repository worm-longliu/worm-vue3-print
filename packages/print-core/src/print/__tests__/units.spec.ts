import { describe, it, expect } from 'vitest'
import {
  PX_PER_MM,
  pxToMm,
  mmToPx,
  millimetersToMicrometers,
  micrometersToMillimeters,
  millimetersToInches,
} from '../units.js'

describe('打印单位换算', () => {
  it('毫米转英寸：Electron printToPDF 的 pageSize 单位是英寸', () => {
    expect(millimetersToInches(210)).toBeCloseTo(8.2677165354, 9)
    expect(millimetersToInches(297)).toBeCloseTo(11.6929133858, 9)
  })

  it('毫米与微米互转：协议与任务记录沿用微米', () => {
    expect(millimetersToMicrometers(80)).toBe(80000)
    expect(millimetersToMicrometers(25.4)).toBe(25400)
    expect(micrometersToMillimeters(80000)).toBe(80)
  })

  it('像素与毫米同源：测量换算与视口尺寸使用同一常量', () => {
    expect(PX_PER_MM).toBe(3.7795275591)
    expect(pxToMm(PX_PER_MM)).toBeCloseTo(1, 9)
    expect(mmToPx(210)).toBe(794)
    // 297 × 3.7795275591 = 1122.52 → 四舍五入 1123
    expect(mmToPx(297)).toBe(1123)
  })
})
