import { describe, it, expect } from 'vitest'
import type { TemplateData } from '../types'
import { getPaperSizeMM, getZoneRects } from '../utils/zone-layout'

function makeTemplate(partial: Partial<TemplateData>): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    ...partial,
  }
}

describe('getPaperSizeMM（CUSTOM 自定义纸张）', () => {
  it('CUSTOM 纵向返回自定义宽高', () => {
    const t = makeTemplate({ paperSize: 'CUSTOM', customWidth: 100, customHeight: 150 })
    expect(getPaperSizeMM(t)).toEqual({ width: 100, height: 150 })
  })

  it('CUSTOM 横向交换宽高', () => {
    const t = makeTemplate({ paperSize: 'CUSTOM', orientation: 'landscape', customWidth: 100, customHeight: 150 })
    expect(getPaperSizeMM(t)).toEqual({ width: 150, height: 100 })
  })

  it('CUSTOM 缺省自定义尺寸回退 A4', () => {
    const t = makeTemplate({ paperSize: 'CUSTOM' })
    expect(getPaperSizeMM(t)).toEqual({ width: 210, height: 297 })
  })

  it('A4 纵向尺寸不变', () => {
    const t = makeTemplate({ paperSize: 'A4' })
    expect(getPaperSizeMM(t)).toEqual({ width: 210, height: 297 })
  })

  it('A4 横向交换宽高', () => {
    const t = makeTemplate({ paperSize: 'A4', orientation: 'landscape' })
    expect(getPaperSizeMM(t)).toEqual({ width: 297, height: 210 })
  })
})

describe('getZoneRects（CUSTOM 纸张的三区几何）', () => {
  it('内容区宽度 = 自定义宽 − 左右边距', () => {
    const t = makeTemplate({
      paperSize: 'CUSTOM',
      customWidth: 100,
      customHeight: 150,
      margins: { top: 5, right: 10, bottom: 5, left: 10 },
      header: { height: 10, elements: [] },
      footer: { height: 10, elements: [] },
    })
    const rects = getZoneRects(t)
    expect(rects.content.width).toBe(80) // 100 - 10 - 10
    expect(rects.content.height).toBe(120) // 150 - 5 - 5 - 10 - 10
  })
})
