import { describe, it, expect, beforeAll } from 'vitest'
import { browserCodeRenderer } from '../browser-code-renderer'

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

describe('browserCodeRenderer 降级契约', () => {
  it('空码值抛错（由渲染管线捕获后降级文本占位）', () => {
    expect(() => browserCodeRenderer.render('', 'barcode')).toThrow()
    expect(() => browserCodeRenderer.render('', 'qrcode')).toThrow()
  })
})
