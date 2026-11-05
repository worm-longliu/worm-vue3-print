import { describe, it, expect } from 'vitest'
import type { ElementOptions, PrintElementData, TemplateData } from '@worm-vue3-print/core/designer'
import { inspectTemplate } from '../inspect.js'

// getPaperDimensions 返回整张纸尺寸（A4 = 210×297），可印区由本函数再扣 margins
const CONTENT_W = 210 - 10 - 10
const CONTENT_H = 297 - 10 - 10

function tpl(elements: TemplateData['elements'], extra: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    unit: 'mm',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements,
    ...extra,
  } as TemplateData
}
const el = (options: Partial<ElementOptions>): PrintElementData => ({
  id: 'e1', type: 'text', options: options as ElementOptions, printElementType: { type: 'text' },
})

describe('inspectTemplate', () => {
  it('合规模板无 finding', () => {
    const r = inspectTemplate(tpl([el({ left: 0, top: 0, width: 50, height: 8 })]))
    expect(r.ok).toBe(true)
    expect(r.findings).toEqual([])
  })

  it('越出纸张右沿报 error 并带元素路径', () => {
    const r = inspectTemplate(tpl([el({ left: CONTENT_W - 5, top: 0, width: 20, height: 8 })]))
    expect(r.ok).toBe(false)
    expect(r.findings[0].code).toBe('OUT_OF_PAPER')
    expect(r.findings[0].path).toBe('elements[0]')
  })

  it('只侵入页边距（仍在纸上）降级为 warning', () => {
    // 内容区右沿 190，纸张右沿 200（10+190）：占位 185~200 落在页边距内但没出纸
    const r = inspectTemplate(tpl([el({ left: 185, top: 0, width: 15, height: 8 })]))
    expect(r.ok).toBe(true)
    expect(r.findings.map(f => [f.code, f.level])).toEqual([['OUT_OF_CONTENT_AREA', 'warning']])
  })

  it('负起点分两档：小幅进边距是 warning，超出纸张才是 error', () => {
    // 真实 fixture（core 的 ikqsrg-follow-region）里竖线 left = -0.4986mm，属侵入左边距
    const inside = inspectTemplate(tpl([el({ left: -0.4986, top: 0, width: 1.8, height: 40 })]))
    expect(inside.ok).toBe(true)
    expect(inside.findings.map(f => f.code)).toEqual(['OUT_OF_CONTENT_AREA'])

    const outside = inspectTemplate(tpl([el({ left: -15, top: 0, width: 20, height: 8 })]))
    expect(outside.ok).toBe(false)
    expect(outside.findings.some(f => f.code === 'OUT_OF_PAPER' && f.level === 'error')).toBe(true)
  })

  it('零宽高报 error，贴边不算越界', () => {
    const r = inspectTemplate(tpl([el({ left: 0, top: 0, width: 0, height: 8 })]))
    expect(r.findings.some(f => f.code === 'ZERO_SIZE_ELEMENT')).toBe(true)
    const edge = inspectTemplate(tpl([el({ left: 0, top: 0, width: CONTENT_W, height: 8 })]))
    expect(edge.findings).toEqual([])
  })

  it('缺 unit 的历史模板先要求迁移，不做几何判定', () => {
    const legacy = tpl([el({ left: 0, top: 0, width: 50, height: 8 })])
    delete (legacy as { unit?: string }).unit
    const r = inspectTemplate(legacy)
    expect(r.findings.map(f => f.code)).toEqual(['LEGACY_UNIT'])
  })

  it('页眉+页脚吃掉整张可印高度报 error', () => {
    const r = inspectTemplate(tpl([], {
      header: { height: CONTENT_H - 2, elements: [] },
      footer: { height: 20, elements: [] },
    }))
    expect(r.findings.some(f => f.code === 'HEADER_TOO_TALL' && f.level === 'error')).toBe(true)
  })

  it('页眉带装不下页眉元素只报 warning', () => {
    const r = inspectTemplate(tpl([], {
      header: { height: 10, elements: [el({ left: 0, top: 5, width: 40, height: 8 })] },
    }))
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0].code).toBe('BAND_TOO_SMALL')
    expect(r.findings[0].level).toBe('warning')
  })

  it('内容区纵向超出不算缺陷（分页会接手）', () => {
    const r = inspectTemplate(tpl([el({ left: 0, top: CONTENT_H + 50, width: 50, height: 8 })]))
    expect(r.findings).toEqual([])
  })

  it('旋转元素按旋转后外接框判定横向越界', () => {
    const inside = inspectTemplate(tpl([
      el({ left: 140, top: 41.5, width: 80, height: 5, rotate: 90 }),
    ]))
    expect(inside.findings).toEqual([])

    const outside = inspectTemplate(tpl([
      el({ left: 190, top: 41.5, width: 80, height: 5, rotate: 90 }),
    ]))
    expect(outside.findings.some(f => f.code === 'OUT_OF_PAPER' && f.level === 'error')).toBe(true)
  })

  it('表格列宽之和与元素宽不符报 warning', () => {
    const r = inspectTemplate(tpl([{
      id: 't1', type: 'table', printElementType: { type: 'table' },
      options: { left: 0, top: 0, width: 100, height: 40, tableColWidths: [40, 40] },
    }]))
    expect(r.findings.some(f => f.code === 'TABLE_COL_WIDTH_MISMATCH')).toBe(true)
  })

  it('表格缺 tableRows 与 flowList 缺 flowColumns 各报一条', () => {
    const r = inspectTemplate(tpl([
      { id: 't1', type: 'table', printElementType: { type: 'table' }, options: { left: 0, top: 0, width: 100, height: 40 } },
      { id: 'f1', type: 'flowList', printElementType: { type: 'flowList' }, options: { left: 0, top: 50, width: 100, height: 20 } },
    ]))
    expect(r.findings.map(f => f.code)).toEqual(['TABLE_MISSING_ROWS', 'FLOW_MISSING_COLUMNS'])
  })

  it('同区完全重叠报 warning，线/形状类不参与', () => {
    const overlap = inspectTemplate(tpl([
      el({ left: 0, top: 0, width: 50, height: 8 }),
      { id: 'e2', type: 'rect', printElementType: { type: 'rect' }, options: { left: 5, top: 2, width: 20, height: 4 } },
      { id: 'e3', type: 'text', printElementType: { type: 'text' }, options: { left: 10, top: 2, width: 20, height: 4 } },
    ]))
    expect(overlap.findings.some(f => f.code === 'ELEMENT_OVERLAP' && f.path === 'elements[0]')).toBe(true)

    const lineOnly = inspectTemplate(tpl([
      el({ left: 0, top: 0, width: 50, height: 8 }),
      { id: 'e2', type: 'rect', printElementType: { type: 'rect' }, options: { left: 5, top: 2, width: 20, height: 4 } },
    ]))
    expect(lineOnly.findings).toEqual([])
  })

  it('连续纸只约束横向：纸宽内纵向不限', () => {
    // THERMAL_80 纸张宽 80、内容区宽 60；元素[0] 占位 10~60 合规，元素[1] 占位 80~100 出纸被裁
    const r = inspectTemplate(tpl([
      el({ left: 0, top: 400, width: 50, height: 8 }),
      el({ left: 70, top: 0, width: 20, height: 8 }),
    ], { paperSize: 'THERMAL_80' }))
    expect(r.findings.map(f => f.code)).toEqual(['OUT_OF_PAPER'])
    expect(r.findings[0].path).toBe('elements[1]')
  })
})
