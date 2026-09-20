import { describe, it, expect } from 'vitest'
import {
  PAPER_PRESETS,
  getPaperDimensions,
  isContinuousPaperSize,
  isLabelPaperSize,
  labelPaperDefaults,
} from '../default-config.js'
import type { TemplateData } from '../../types.js'

function tpl(over: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    ...over,
  } as TemplateData
}

describe('纸张预设：针式打印纸', () => {
  it('全等分 / 二等分 / 三等分尺寸', () => {
    expect(PAPER_PRESETS.DOT_FULL).toMatchObject({ width: 241, height: 279.4 })
    expect(PAPER_PRESETS.DOT_HALF).toMatchObject({ width: 241, height: 139.7 })
    expect(PAPER_PRESETS.DOT_THIRD).toMatchObject({ width: 241, height: 93.1 })
  })

  it('等分高度由全等分推导（保留 1 位小数）', () => {
    const full = PAPER_PRESETS.DOT_FULL!.height
    expect(PAPER_PRESETS.DOT_HALF!.height).toBe(Math.round((full / 2) * 10) / 10)
    expect(PAPER_PRESETS.DOT_THIRD!.height).toBe(Math.round((full / 3) * 10) / 10)
  })

  it('等分纸为固定纸张：支持横向', () => {
    expect(getPaperDimensions(tpl({ paperSize: 'DOT_HALF' }))).toEqual({ width: 241, height: 139.7 })
    expect(getPaperDimensions(tpl({ paperSize: 'DOT_HALF', orientation: 'landscape' })))
      .toEqual({ width: 139.7, height: 241 })
  })
})

describe('纸张预设：标签纸', () => {
  it('80×60 / 60×40 / 40×30', () => {
    expect(PAPER_PRESETS.LABEL_80X60).toMatchObject({ width: 80, height: 60 })
    expect(PAPER_PRESETS.LABEL_60X40).toMatchObject({ width: 60, height: 40 })
    expect(PAPER_PRESETS.LABEL_40X30).toMatchObject({ width: 40, height: 30 })
  })

  it('标签纸为固定纸张（非连续纸），可横向', () => {
    expect(isContinuousPaperSize('LABEL_80X60')).toBe(false)
    expect(getPaperDimensions(tpl({ paperSize: 'LABEL_80X60', orientation: 'landscape' })))
      .toEqual({ width: 60, height: 80 })
  })

  it('标签纸判定：三个预设为真，其余纸型为假', () => {
    expect(isLabelPaperSize('LABEL_80X60')).toBe(true)
    expect(isLabelPaperSize('LABEL_60X40')).toBe(true)
    expect(isLabelPaperSize('LABEL_40X30')).toBe(true)
    expect(isLabelPaperSize('A4')).toBe(false)
    expect(isLabelPaperSize('THERMAL_80')).toBe(false)
    expect(isLabelPaperSize('CONTINUOUS')).toBe(false)
    expect(isLabelPaperSize(undefined)).toBe(false)
  })

  it('标签纸默认版面：四边距归零、页眉页脚高度归零，但保留其中已有元素', () => {
    const headerEl = { id: 'h1' } as any
    const patch = labelPaperDefaults(tpl({
      header: { height: 12, elements: [headerEl] },
      footer: { height: 8, elements: [] },
    }))
    expect(patch.margins).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(patch.header.height).toBe(0)
    expect(patch.footer.height).toBe(0)
    expect(patch.header.elements).toEqual([headerEl])
  })
})

describe('纸张预设：小票纸（连续纸）', () => {
  it('57 / 80 / 110 纸宽，高度仅为设计画布', () => {
    expect(getPaperDimensions(tpl({ paperSize: 'THERMAL_57' }))).toEqual({ width: 57, height: 297 })
    expect(getPaperDimensions(tpl({ paperSize: 'THERMAL_80' }))).toEqual({ width: 80, height: 297 })
    expect(getPaperDimensions(tpl({ paperSize: 'THERMAL_110' }))).toEqual({ width: 110, height: 297 })
  })

  it('小票纸判定为连续纸，方向强制纵向', () => {
    expect(isContinuousPaperSize('THERMAL_57')).toBe(true)
    expect(isContinuousPaperSize('THERMAL_80')).toBe(true)
    expect(isContinuousPaperSize('THERMAL_110')).toBe(true)
    expect(getPaperDimensions(tpl({ paperSize: 'THERMAL_110', orientation: 'landscape' })))
      .toEqual({ width: 110, height: 297 })
  })

  it('纸宽可用 customWidth 覆盖（58mm 纸卷）', () => {
    expect(getPaperDimensions(tpl({ paperSize: 'THERMAL_57', customWidth: 58 })))
      .toEqual({ width: 58, height: 297 })
  })

  it('CONTINUOUS 仍为连续纸且默认 80mm', () => {
    expect(isContinuousPaperSize('CONTINUOUS')).toBe(true)
    expect(getPaperDimensions(tpl({ paperSize: 'CONTINUOUS' }))).toEqual({ width: 80, height: 297 })
  })
})

describe('纸张预设：下拉元数据', () => {
  it('每个预设都有中文显示名与分组', () => {
    for (const [key, preset] of Object.entries(PAPER_PRESETS)) {
      expect(preset.label, key).toBeTruthy()
      expect(preset.group, key).toBeTruthy()
    }
  })
})
