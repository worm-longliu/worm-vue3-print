// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest'
import { browserCodeRenderer } from '../browser-code-renderer.js'

// happy-dom 不实现 canvas 2d 上下文；jsbarcode 文本测量需要 getContext('2d')，
// 真实浏览器原生支持，此处补最小桩以覆盖渲染路径。
beforeAll(() => {
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = function () {
    return {
      font: '',
      measureText: (text: string) => ({ width: String(text).length * 8 }),
    }
  }
})

describe('browserCodeRenderer 二维码', () => {
  it('合法码值输出 SVG rect 矩阵', () => {
    const svg = browserCodeRenderer.render('https://example.com/order/123', 'qrcode', {
      qrCodeLevel: 'M',
    })
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0')
    expect(svg).toContain('<rect')
    expect(svg).toContain('shape-rendering="crispEdges"')
  })

  it('纠错级别 H 与 L 均正常输出', () => {
    expect(browserCodeRenderer.render('A', 'qrcode', { qrCodeLevel: 'H' })).toContain('<svg')
    expect(browserCodeRenderer.render('A', 'qrcode', { qrCodeLevel: 'L' })).toContain('<svg')
  })

  it('非法纠错级别回退 M 不抛错', () => {
    expect(browserCodeRenderer.render('test', 'qrcode', { qrCodeLevel: 'X' })).toContain('<svg')
  })
})

describe('browserCodeRenderer 条形码', () => {
  it('CODE128 合法码值输出 SVG', () => {
    const svg = browserCodeRenderer.render('12345678', 'barcode', { barcodeType: 'CODE128' })
    expect(svg).toContain('<svg')
    // jsbarcode SVG 渲染产物包含 rect（条）或 path
    expect(/<(rect|path)/.test(svg)).toBe(true)
  })

  it('默认码制 CODE128 兜底', () => {
    expect(browserCodeRenderer.render('ABC-123', 'barcode', {})).toContain('<svg')
  })
})

describe('browserCodeRenderer 条形码打印质量（热敏出纸清晰度）', () => {
  it('关闭条边缘抗锯齿（crispEdges），与二维码一致', () => {
    // 灰边像素会被热敏头阈值化，导致条宽进一步失真
    expect(browserCodeRenderer.render('12345678', 'barcode', {})).toContain('shape-rendering="crispEdges"')
  })

  it('左右静区各 10 模块（79 模块码值 → 图形宽度 99 模块）', () => {
    const svg = browserCodeRenderer.render('12345678', 'barcode', {})
    expect(svg).toMatch(/viewBox="0 0 99 /)
  })

  it('提供 printerDpi 时尺寸写成恰好整数个打印点（mm）', () => {
    const svg = browserCodeRenderer.render('12345678', 'barcode', {
      printerDpi: 203, targetWidthMm: 56.4, targetHeightMm: 14.1,
    })
    const widthMm = Number(/width="([\d.]+)mm"/.exec(svg)?.[1])
    const heightMm = Number(/height="([\d.]+)mm"/.exec(svg)?.[1])
    expect(widthMm).toBeGreaterThan(0)
    expect(heightMm).toBeGreaterThan(0)
    // 折算回打印点必须是整数，否则打印机仍会各自取整
    expect((widthMm * 203) / 25.4).toBeCloseTo(Math.round((widthMm * 203) / 25.4), 6)
    expect((heightMm * 203) / 25.4).toBeCloseTo(Math.round((heightMm * 203) / 25.4), 6)
    // 不得超出可用框
    expect(widthMm).toBeLessThanOrEqual(56.4)
    expect(heightMm).toBeLessThanOrEqual(14.1)
  })

  it('未设 printerDpi 时按条宽折算 mm 尺寸（99×44 模块 × 0.25mm）', () => {
    const svg = browserCodeRenderer.render('12345678', 'barcode', {})
    expect(svg).toMatch(/width="24.75mm"/)
    expect(svg).toMatch(/height="11mm"/)
  })

  it('条宽加倍 → 尺寸同比加倍（barWidth 是尺寸的第一来源）', () => {
    const thin = browserCodeRenderer.render('12345678', 'barcode', {})
    const thick = browserCodeRenderer.render('12345678', 'barcode', { barWidth: 4 })
    const w = (s: string) => Number(/width="([\d.]+)mm"/.exec(s)?.[1])
    expect(w(thick)).toBeCloseTo(w(thin) * 2, 9)
  })

  it('可用框放不下首选尺寸时等比缩小到框内（宁可缩小，也不让条码溢出元素框）', () => {
    const svg = browserCodeRenderer.render('12345678', 'barcode', {
      printerDpi: 203, targetWidthMm: 56.4, targetHeightMm: 0.5,
    })
    const widthMm = Number(/width="([\d.]+)mm"/.exec(svg)?.[1])
    const heightMm = Number(/height="([\d.]+)mm"/.exec(svg)?.[1])
    expect(heightMm).toBeCloseTo(0.5, 6)
    // 等比：宽高比保持 99:44
    expect(widthMm / heightMm).toBeCloseTo(99 / 44, 6)
  })

  it('打印机分辨率下可用宽度不足：按整数点逐级缩小，始终保持点对齐', () => {
    const svg = browserCodeRenderer.render('12345678', 'barcode', {
      printerDpi: 203, targetWidthMm: 15, targetHeightMm: 14.1,
    })
    const widthMm = Number(/width="([\d.]+)mm"/.exec(svg)?.[1])
    const heightMm = Number(/height="([\d.]+)mm"/.exec(svg)?.[1])
    expect(widthMm).toBeLessThanOrEqual(15)
    expect((widthMm * 203) / 25.4).toBeCloseTo(Math.round((widthMm * 203) / 25.4), 6)
    expect((heightMm * 203) / 25.4).toBeCloseTo(Math.round((heightMm * 203) / 25.4), 6)
  })
})

describe('browserCodeRenderer 降级契约', () => {
  it('空码值抛错（由渲染管线捕获后降级文本占位）', () => {
    expect(() => browserCodeRenderer.render('', 'barcode')).toThrow()
    expect(() => browserCodeRenderer.render('', 'qrcode')).toThrow()
  })
})
