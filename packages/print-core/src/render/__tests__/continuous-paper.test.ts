import { describe, it, expect } from 'vitest'
import { getPaperDimensions, isContinuousPaper } from '../types.js'
import { paginate } from '../pagination-engine.js'
import { buildPageCss } from '../css-builder.js'
import { composeContinuousHeight, MIN_CONTINUOUS_HEIGHT_MM } from '../continuous-paper.js'
import type { TemplateData, TemplateElement, MeasuredElement } from '../types.js'

function continuousTemplate(over: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'CONTINUOUS',
    orientation: 'portrait',
    margins: { top: 5, right: 5, bottom: 3, left: 5 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    customWidth: 80,
    ...over,
  } as TemplateData
}

const el = (id: string, top: number, height: number): TemplateElement =>
  ({
    id,
    type: 'text',
    options: { top, left: 0, width: 70, height },
  }) as TemplateElement

function measuredOf(t: TemplateData, heightOf: (id: string) => number): Map<string, MeasuredElement> {
  return new Map(
    t.elements.map(e => [e.id, { id: e.id, measuredHeight: heightOf(e.id) } as MeasuredElement]),
  )
}

describe('CONTINUOUS 纸型', () => {
  it('默认尺寸 80×297（设计画布），宽度取 customWidth', () => {
    expect(getPaperDimensions(continuousTemplate())).toEqual({ width: 80, height: 297 })
    expect(getPaperDimensions(continuousTemplate({ customWidth: 58 }))).toEqual({ width: 58, height: 297 })
  })

  it('isContinuousPaper 判定', () => {
    expect(isContinuousPaper(continuousTemplate())).toBe(true)
    expect(isContinuousPaper({ paperSize: 'A4' })).toBe(false)
  })

  it('内容超过 297mm 也只产生一页（不按设计高度分页）', () => {
    const t = continuousTemplate({
      elements: Array.from({ length: 20 }, (_, i) => el(`e${i}`, i * 30, 28)),
    })
    const pages = paginate(t, measuredOf(t, () => 28))
    expect(pages).toHaveLength(1)
  })

  it('composeContinuousHeight：探针底边 + footer + mb（探针底边已含 mt/header/overlay/内容偏移）', () => {
    const t = continuousTemplate({
      margins: { top: 5, right: 5, bottom: 3, left: 5 },
      header: { height: 8, elements: [] },
      firstPageOverlay: { height: 4, elements: [] },
      footer: { height: 6, elements: [] },
    })
    // 探针测得内容区最大底边相对纸顶 = mt5 + header8 + overlay4 + 内容底80 = 97
    expect(composeContinuousHeight(t, 97)).toBe(106)
  })

  it('推导高度最小钳制 25.4mm（探针底边为 0 的空模板）', () => {
    expect(composeContinuousHeight(continuousTemplate(), 0)).toBe(MIN_CONTINUOUS_HEIGHT_MM)
  })

  it('表格超高：探针底边（含动态表格实际底）参与组合，跟随区不被裁切', () => {
    const t = continuousTemplate({ margins: { top: 5, right: 5, bottom: 3, left: 5 } })
    // 探针已如实量到动态表格（含全部渲染行）底边相对纸顶 315
    // 315 + footer0 + mb3 = 318
    expect(composeContinuousHeight(t, 315)).toBe(318)
  })

  it('buildPageCss 接收显式纸高：@page/.print-page/footer 全部对齐该高度', () => {
    const t = continuousTemplate({
      margins: { top: 5, right: 5, bottom: 3, left: 5 },
      footer: { height: 6, elements: [] },
    })
    const css = buildPageCss(t, 106)
    expect(css).toContain('@page { size: 80mm 106mm')
    expect(css).toContain('min-height: 106mm')
    // footer 钉在推导高度底部：106 - mb3 - footer6 = 97
    expect(css).toContain('top: 97mm')
  })
})
