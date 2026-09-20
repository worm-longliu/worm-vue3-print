// print-render/src/types.test.ts
import { describe, it, expect } from 'vitest'
import { getPaperDimensions, getOutputPaperDimensions, getOutputRotationAngle, shouldApplyOutputRotation } from './types.js'

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

describe('getOutputPaperDimensions / getOutputRotationAngle / shouldApplyOutputRotation', () => {
  it('无 outputRotation 时出纸尺寸=设计稿尺寸、不旋转', () => {
    expect(getOutputPaperDimensions(makeTemplate({ orientation: 'landscape' }))).toEqual({ width: 297, height: 210 })
    expect(getOutputRotationAngle(makeTemplate({ orientation: 'landscape' }))).toBe(0)
    expect(shouldApplyOutputRotation(makeTemplate({ orientation: 'landscape' }))).toBe(false)
  })

  it('旋转 90°：横版设计稿交换长宽出竖向纸（210×297）', () => {
    const t = makeTemplate({ orientation: 'landscape', outputRotation: 90 })
    expect(getOutputPaperDimensions(t)).toEqual({ width: 210, height: 297 })
    expect(getOutputRotationAngle(t)).toBe(90)
    expect(shouldApplyOutputRotation(t)).toBe(true)
  })

  it('旋转 270°：与 90° 同样交换长宽（210×297），方向相反', () => {
    const t = makeTemplate({ orientation: 'landscape', outputRotation: 270 })
    expect(getOutputPaperDimensions(t)).toEqual({ width: 210, height: 297 })
    expect(getOutputRotationAngle(t)).toBe(270)
    expect(shouldApplyOutputRotation(t)).toBe(true)
  })

  it('旋转 180°：纸张长宽不变（仍 297×210），仅内容翻转', () => {
    const t = makeTemplate({ orientation: 'landscape', outputRotation: 180 })
    expect(getOutputPaperDimensions(t)).toEqual({ width: 297, height: 210 })
    expect(getOutputRotationAngle(t)).toBe(180)
    expect(shouldApplyOutputRotation(t)).toBe(true)
  })

  it('旋转 0° 显式设置：不旋转、纸张不变', () => {
    expect(getOutputRotationAngle(makeTemplate({ orientation: 'portrait', outputRotation: 0 }))).toBe(0)
    expect(shouldApplyOutputRotation(makeTemplate({ orientation: 'portrait', outputRotation: 0 }))).toBe(false)
  })

  it('纵向设计稿 + 旋转 90°：出纸为横向纸（297×210）', () => {
    const t = makeTemplate({ orientation: 'portrait', outputRotation: 90 })
    expect(getOutputPaperDimensions(t)).toEqual({ width: 297, height: 210 })
    expect(getOutputRotationAngle(t)).toBe(90)
  })

  it('连续纸忽略旋转（强制纵向、无旋转、纸张不变）', () => {
    const t = makeTemplate({ paperSize: 'CONTINUOUS', customWidth: 80, orientation: 'portrait', outputRotation: 90 })
    expect(getOutputPaperDimensions(t)).toEqual({ width: 80, height: 297 })
    expect(getOutputRotationAngle(t)).toBe(0)
    expect(shouldApplyOutputRotation(t)).toBe(false)
  })

  it('拼版忽略旋转（无旋转、纸张不变）', () => {
    const t = makeTemplate({ orientation: 'landscape', outputRotation: 90, tiling: { enabled: true } })
    expect(getOutputPaperDimensions(t)).toEqual({ width: 297, height: 210 })
    expect(getOutputRotationAngle(t)).toBe(0)
    expect(shouldApplyOutputRotation(t)).toBe(false)
  })
})
