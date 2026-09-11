// services/print-render/src/barcode-renderer.test.ts
import { describe, it, expect } from 'vitest'
import { renderBarcodeSvg } from './barcode-renderer.js'

function viewBox(svg: string): string {
  return svg.match(/viewBox="([^"]+)"/)?.[1] ?? ''
}

describe('renderBarcodeSvg 条码', () => {
  it('默认输出与历史一致（barWidth=2 → scale=1，fontSize=12 → textsize=7）', () => {
    expect(viewBox(renderBarcodeSvg('12345678', 'barcode', { showText: true }))).toBe('0 0 79 36')
  })

  it('barWidth=4 时 scale=2，viewBox 宽度翻倍', () => {
    const s = renderBarcodeSvg('12345678', 'barcode', { showText: true, barWidth: 4 })
    expect(viewBox(s)).toBe('0 0 158 70')
  })

  it('barWidth=3 时 scale=1.5，viewBox 相应放大', () => {
    const s = renderBarcodeSvg('12345678', 'barcode', { showText: true, barWidth: 3 })
    expect(viewBox(s)).toBe('0 0 119 53')
  })

  it('barWidth<2 时 scale 钳制为 1，不因 bwip 异常而变粗', () => {
    expect(viewBox(renderBarcodeSvg('12345678', 'barcode', { showText: true, barWidth: 1 })))
      .toBe('0 0 79 36')
  })

  it('fontSize 放大时文本区增高（viewBox 高度增大）', () => {
    const h = (svg: string) => Number(viewBox(svg).split(' ').pop())
    expect(h(renderBarcodeSvg('12345678', 'barcode', { showText: true, fontSize: 24 })))
      .toBeGreaterThan(h(renderBarcodeSvg('12345678', 'barcode', { showText: true, fontSize: 12 })))
  })

  it('showText=false 时不输出文本区（高度降低）', () => {
    expect(viewBox(renderBarcodeSvg('12345678', 'barcode', { showText: false }))).toBe('0 0 79 29')
  })
})

describe('renderBarcodeSvg 二维码不受条宽/字号影响', () => {
  it('qrcode 输出固定方形 SVG', () => {
    expect(viewBox(renderBarcodeSvg('qrcode-x', 'qrcode', {}))).toBe('0 0 126 126')
  })
})

describe('bwip CodeRenderer 与 print-core generateHtml 集成', () => {
  it('条码元素经注入渲染器输出 URL 编码 SVG data URI，尺寸与 bwip 一致', async () => {
    const { generateHtml } = await import('@worm-vue3-print/core')
    const tpl = {
      paperSize: 'A4', orientation: 'portrait' as const,
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] },
      footer: {
        height: 12,
        elements: [{ id: 'bc', type: 'barcode', options: { testData: '12345678', barWidth: 4 } }],
      },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [],
    }
    const html = generateHtml(tpl as any, [{ pageIndex: 0, sections: [] }], undefined, {
      codeRenderer: { render: (v, t, o) => renderBarcodeSvg(v, t, o) },
    })
    const m = html.match(/data:image\/svg\+xml;charset=utf-8,([^"]+)/)
    expect(m).toBeTruthy()
    const svg = decodeURIComponent(m![1])
    expect(svg).toContain('viewBox="0 0 158')
  })

  it('码值非法时降级为文本占位，不输出 img', async () => {
    const { generateHtml } = await import('@worm-vue3-print/core')
    const tpl = {
      paperSize: 'A4', orientation: 'portrait' as const,
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] },
      footer: {
        height: 12,
        elements: [{ id: 'bc', type: 'barcode', options: { testData: 'ABC', barcodeType: 'EAN13' } }],
      },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [],
    }
    const html = generateHtml(tpl as any, [{ pageIndex: 0, sections: [] }], undefined, {
      codeRenderer: { render: (v, t, o) => renderBarcodeSvg(v, t, o) },
    })
    expect(html).toContain('<span>ABC</span>')
    expect(html).not.toContain('<img src="data:image/svg+xml')
  })
})
