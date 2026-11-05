import { describe, expect, it } from 'vitest'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { elementStyle } from '../elements'

const makeEl = (options: Partial<RuntimeElement['options']>): RuntimeElement => ({
  id: 'e',
  options: { left: 10, top: 20, width: 40, height: 8, ...options },
  printElementType: { type: 'text', title: '文本' },
}) as RuntimeElement

describe('common 元素四向外边距', () => {
  it('根元素只偏移边框盒，不改 left/top/width/height', () => {
    const style = elementStyle(makeEl({ marginTop: 2, marginRight: 3, marginBottom: 4, marginLeft: 5 }))
    expect(style).toMatchObject({
      position: 'absolute', left: '10mm', top: '20mm', width: '40mm', height: '8mm',
      marginTop: '2mm', marginRight: '3mm', marginBottom: '4mm', marginLeft: '5mm',
    })
    expect(elementStyle(makeEl({}))).not.toHaveProperty('marginTop')
    expect(elementStyle(makeEl({ marginTop: 0 }))).not.toHaveProperty('marginTop')
  })
})
