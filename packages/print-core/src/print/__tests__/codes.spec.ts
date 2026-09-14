import { describe, it, expect } from 'vitest'
import { codeSpecKey, createMapCodeRenderer, createCollectingCodeRenderer, mergeCodeMaps } from '../codes.js'

describe('codeSpecKey', () => {
  it('码值相同但码制或选项不同 → 键不同', () => {
    const a = codeSpecKey('123', 'barcode', { barcodeType: 'CODE128' })
    const b = codeSpecKey('123', 'barcode', { barcodeType: 'EAN13' })
    const c = codeSpecKey('123', 'qrcode', { barcodeType: 'CODE128' })
    expect(new Set([a, b, c]).size).toBe(3)
  })
  it('参数相同 → 键稳定（可跨进程传输后比对）', () => {
    expect(codeSpecKey('123', 'barcode', { barWidth: 2, showText: true }))
      .toBe(codeSpecKey('123', 'barcode', { barWidth: 2, showText: true }))
  })
})

describe('createMapCodeRenderer', () => {
  const map = new Map([[codeSpecKey('123', 'barcode', {}), '<svg id="fake"/>']])
  it('命中返回 SVG', () => {
    expect(createMapCodeRenderer(map).render('123', 'barcode', {})).toBe('<svg id="fake"/>')
  })
  it('未命中抛错，交由渲染管线降级为文本占位', () => {
    expect(() => createMapCodeRenderer(map).render('456', 'barcode', {})).toThrow()
  })
})

describe('createCollectingCodeRenderer', () => {
  it('记录规格并抛错（上层因此输出文本占位）', () => {
    const collector = createCollectingCodeRenderer()
    expect(() => collector.renderer.render('123', 'barcode', { barcodeType: 'CODE128' })).toThrow()
    const specs = collector.takeSpecs()
    expect(specs).toHaveLength(1)
    expect(specs[0]).toMatchObject({ value: '123', cellType: 'barcode' })
    expect(specs[0].key).toBe(codeSpecKey('123', 'barcode', { barcodeType: 'CODE128' }))
  })

  it('基映射命中时直接返回，不重复收集', () => {
    const key = codeSpecKey('123', 'barcode', {})
    const collector = createCollectingCodeRenderer(new Map([[key, '<svg id="hit"/>']]))
    expect(collector.renderer.render('123', 'barcode', {})).toBe('<svg id="hit"/>')
    expect(collector.takeSpecs()).toHaveLength(0)
  })

  it('takeSpecs 取走后清空，重复调用不会重复渲染', () => {
    const collector = createCollectingCodeRenderer()
    expect(() => collector.renderer.render('123', 'barcode', {})).toThrow()
    expect(collector.takeSpecs()).toHaveLength(1)
    expect(collector.takeSpecs()).toHaveLength(0)
  })

  it('同码值同参数只收集一次', () => {
    const collector = createCollectingCodeRenderer()
    expect(() => collector.renderer.render('123', 'barcode', {})).toThrow()
    expect(() => collector.renderer.render('123', 'barcode', {})).toThrow()
    expect(collector.takeSpecs()).toHaveLength(1)
  })
})

describe('mergeCodeMaps', () => {
  it('后者覆盖前者同名键，且不修改入参', () => {
    const a = new Map([['k', 'a'], ['x', '1']])
    const b = new Map([['k', 'b']])
    const merged = mergeCodeMaps(a, b)
    expect(merged.get('k')).toBe('b')
    expect(merged.get('x')).toBe('1')
    expect(a.get('k')).toBe('a')
  })
})
