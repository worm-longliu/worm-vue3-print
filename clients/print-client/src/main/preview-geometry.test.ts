import { describe, it, expect } from 'vitest'
import { computeMmPerPx, isRenderTimeoutCode, round4 } from './preview-geometry.js'

describe('computeMmPerPx', () => {
  it('A4 @2x：210mm / 1588px = 0.1322（按实际截图像素，不按 96dpi 换算）', () => {
    expect(computeMmPerPx(210, 1588)).toBe(0.1322)
  })

  it('A4 @1x：210mm / 794px = 0.2645', () => {
    expect(computeMmPerPx(210, 794)).toBe(0.2645)
  })

  it('连续纸等非整比例纸张也按实测比例', () => {
    expect(computeMmPerPx(80, 638)).toBe(0.1254)
  })

  it('入参非正或非有限时返回 undefined', () => {
    expect(computeMmPerPx(0, 100)).toBeUndefined()
    expect(computeMmPerPx(210, 0)).toBeUndefined()
    expect(computeMmPerPx(-210, 100)).toBeUndefined()
    expect(computeMmPerPx(210, -1)).toBeUndefined()
    expect(computeMmPerPx(Number.NaN, 100)).toBeUndefined()
    expect(computeMmPerPx(210, Number.POSITIVE_INFINITY)).toBeUndefined()
  })
})

describe('round4', () => {
  it('保留 4 位小数', () => {
    expect(round4(0.13224181)).toBe(0.1322)
    expect(round4(1.00005)).toBe(1.0001)
  })
})

describe('isRenderTimeoutCode', () => {
  it('core 管线超时与客户端传输超时都算超时', () => {
    expect(isRenderTimeoutCode('RENDER_TIMEOUT')).toBe(true)
    expect(isRenderTimeoutCode('CLIENT_TIMEOUT')).toBe(true)
  })

  it('其他错误码不算超时', () => {
    for (const code of ['RENDER_FAILED', 'PAGE_OUT_OF_RANGE', 'PDF_FAILED', '', 'render_timeout', undefined, null, 0]) {
      expect(isRenderTimeoutCode(code)).toBe(false)
    }
  })
})
