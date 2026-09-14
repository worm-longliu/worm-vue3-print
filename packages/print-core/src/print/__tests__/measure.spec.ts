import { describe, it, expect } from 'vitest'
import { normalizeMeasurements } from '../measure.js'
import { PX_PER_MM } from '../units.js'
import type { TemplateData } from '../../render/types.js'

const template = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [
    { id: 'a', type: 'text', options: { left: 0, top: 0, width: 50, height: 10 } },
    { id: 't', type: 'table', options: { left: 0, top: 20, width: 100, height: 40, _repeatHeaderCount: 2 } },
  ],
} as unknown as TemplateData

describe('normalizeMeasurements', () => {
  it('普通元素：像素高度换算为毫米，无行高与重复表头高度', () => {
    const map = normalizeMeasurements([{ id: 'a', heightPx: 38 }], template)
    const a = map.get('a')!
    expect(a.measuredHeight).toBeCloseTo(38 / PX_PER_MM, 9)
    expect(a.measuredRowHeights).toBeUndefined()
    expect(a.repeatHeaderHeight).toBe(0)
  })

  it('表格元素：行高逐行换算，重复表头高度取前 N 行之和', () => {
    const map = normalizeMeasurements(
      [{ id: 't', heightPx: 760, rowHeightsPx: [38, 38, 190, 190] }],
      template,
    )
    const t = map.get('t')!
    expect(t.measuredRowHeights).toEqual([38 / PX_PER_MM, 38 / PX_PER_MM, 190 / PX_PER_MM, 190 / PX_PER_MM])
    expect(t.repeatHeaderHeight).toBeCloseTo((38 + 38) / PX_PER_MM, 9)
  })

  it('模板未知 id 或未配置重复表头时，重复表头高度为 0', () => {
    const map = normalizeMeasurements([{ id: 'ghost', heightPx: 76, rowHeightsPx: [38, 38] }], template)
    expect(map.get('ghost')!.repeatHeaderHeight).toBe(0)
  })
})
