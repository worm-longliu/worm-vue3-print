// print-render/src/types.test.ts
import { describe, it, expect } from 'vitest'
import { getPaperDimensions } from './types.js'

function makeTemplate(overrides: Record<string, any> = {}) {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    ...overrides,
  } as any
}

describe('getPaperDimensions', () => {
  it('标准纸 A4 竖版返回 210×297', () => {
    expect(getPaperDimensions(makeTemplate())).toEqual({ width: 210, height: 297 })
  })

  it('A4 横版交换宽高', () => {
    expect(getPaperDimensions(makeTemplate({ orientation: 'landscape' }))).toEqual({ width: 297, height: 210 })
  })

  it('CUSTOM 读取 customWidth/customHeight（竖版）', () => {
    expect(getPaperDimensions(makeTemplate({
      paperSize: 'CUSTOM',
      customWidth: 100,
      customHeight: 150,
    }))).toEqual({ width: 100, height: 150 })
  })

  it('CUSTOM 横版交换宽高', () => {
    expect(getPaperDimensions(makeTemplate({
      paperSize: 'CUSTOM',
      orientation: 'landscape',
      customWidth: 100,
      customHeight: 150,
    }))).toEqual({ width: 150, height: 100 })
  })

  it('CUSTOM 缺省自定义尺寸回退 A4', () => {
    expect(getPaperDimensions(makeTemplate({ paperSize: 'CUSTOM' }))).toEqual({ width: 210, height: 297 })
  })
})
