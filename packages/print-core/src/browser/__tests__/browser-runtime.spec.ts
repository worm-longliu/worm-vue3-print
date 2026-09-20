// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest'
import { createBrowserPrintRuntime } from '../browser-runtime.js'
import { renderHtmlPages } from '../browser-pagination.js'
import type { CodeRenderer, TemplateData } from '../../render/types.js'

beforeAll(() => {
  // happy-dom 不实现 canvas 2d 上下文；jsbarcode 需要它测量文字宽度
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = () => ({ font: '', measureText: (text: string) => ({ width: String(text).length * 8 }) })
})

const template = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  elements: [{ id: 'a', type: 'text', options: { left: 0, top: 0, width: 40, height: 8, formatter: 'hi' } }],
} as unknown as TemplateData

describe('renderHtmlPages', () => {
  it('调用方传入 CodeRenderer 时直接沿用（不走向量收集与页面渲染）', async () => {
    const custom: CodeRenderer = { render: () => '<svg id="custom"/>' }
    const result = await renderHtmlPages(template, {}, undefined, custom)
    expect(result.pageCount).toBeGreaterThanOrEqual(1)
    expect(result.paperMm).toEqual({ width: 210, height: 297 })
    expect(result.continuous).toBe(false)
    expect(typeof result.html).toBe('string')
  })

  it('不传 CodeRenderer 时由 runtime 自建（走 core 管线）', async () => {
    const result = await renderHtmlPages(template, {})
    expect(result.html).toContain('data-page="1"')
    expect(result.pageLayouts.length).toBe(result.pageCount)
  })

  it('条形码元素的码值由 iframe driver 渲染为 SVG，而不是文本降级', async () => {
    const codeTemplate = {
      ...template,
      elements: [
        {
          id: 'c',
          type: 'barcode',
          options: { left: 0, top: 0, width: 50, height: 15, formatter: '123456789012', barcodeType: 'CODE128' },
        },
      ],
    } as unknown as TemplateData
    const result = await renderHtmlPages(codeTemplate, {})
    // 条形码按结算尺寸内联 SVG（<img> 会把 mm 内在尺寸取整到 CSS px）
    expect(result.html).toContain('<svg')
    expect(result.html).not.toContain('data:image/svg+xml')
    expect(result.html).not.toContain('<span>123456789012</span>')
  })
})

describe('createBrowserPrintRuntime', () => {
  it('返回可用的 runtime', () => {
    expect(typeof createBrowserPrintRuntime().withSession).toBe('function')
  })
})
