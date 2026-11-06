import { describe, it, expect } from 'vitest'
import { draftTemplate } from '../draft.js'
import { expandPreset, listPresetSummaries, DRAFT_PRESETS } from '../presets.js'
import { validateTemplateJson } from '../validate.js'
import { inspectTemplate } from '../inspect.js'
import { getPaperDimensions } from '@worm-vue3-print/core'
import type { TemplateData } from '@worm-vue3-print/core/designer'

describe('presets 清单', () => {
  it('六个配方都在清单里，槽位与数据一致', () => {
    const summaries = listPresetSummaries()
    expect(summaries.map(s => s.id)).toEqual([
      'doc-a4', 'doc-a5', 'receipt-80mm', 'label-60x40', 'label-40x30', 'waybill-100x150',
    ])
    for (const s of summaries) {
      expect(s.scene).toBeTruthy()
      expect(s.slots.length).toBeGreaterThan(0)
    }
  })
})

describe('expandPreset', () => {
  it('每个 preset 展开后 validate + inspect 全绿（无 error）', () => {
    for (const preset of DRAFT_PRESETS) {
      const expanded = expandPreset(preset.id)
      expect(expanded, preset.id).toBeDefined()
      const template: TemplateData = {
        ...(expanded!.paper as Pick<TemplateData, 'paperSize' | 'orientation' | 'margins' | 'customWidth' | 'customHeight'>),
        header: { height: 0, elements: [] },
        footer: { height: 0, elements: [] },
        elements: [],
        unit: 'mm',
      }
      // 展开元素先走 draftTemplate 的完整回灌（工厂默认值 + validate + inspect）
      const r = draftTemplate({ preset: preset.id })
      expect(r.issues.filter(i => i.level === 'error'), `${preset.id}: ${JSON.stringify(r.issues)}`).toEqual([])
      expect(r.expressionErrors, preset.id).toEqual([])
      expect(validateTemplateJson(r.template).ok, preset.id).toBe(true)
      expect(inspectTemplate(r.template).findings.filter(f => f.level === 'error'), preset.id).toEqual([])
      // 纸张与展开结果一致
      expect(r.template.paperSize).toBe(template.paperSize)
    }
  })

  it('固定纸 preset 的内容总高都留足 2mm 安全线', () => {
    for (const preset of DRAFT_PRESETS) {
      const expanded = expandPreset(preset.id)!
      const paperSize = expanded.paper.paperSize!
      const dims = getPaperDimensions({
        paperSize,
        orientation: expanded.paper.orientation ?? 'portrait',
        ...(expanded.paper.customWidth !== undefined ? { customWidth: expanded.paper.customWidth } : {}),
        ...(expanded.paper.customHeight !== undefined ? { customHeight: expanded.paper.customHeight } : {}),
      })
      const margins = expanded.paper.margins!
      const contentH = dims.height - margins.top - margins.bottom
      // 纵向总高按区块累加（cols 并排栏共享同一横条，不能按元素求和）
      const totalH = preset.blocks.reduce((s, b) => s + b.height, 0)
      if (preset.id.startsWith('receipt')) continue // 连续纸高度按内容推导
      expect(totalH, preset.id).toBeLessThanOrEqual(contentH - 2 + 1e-9)
    }
  })

  it('几何落在内容区内：横向不越界、纵向非负', () => {
    for (const preset of DRAFT_PRESETS) {
      const expanded = expandPreset(preset.id)!
      const r = draftTemplate({ preset: preset.id })
      const tpl = r.template
      const dims = getPaperDimensions({
        paperSize: tpl.paperSize,
        orientation: tpl.orientation,
        ...(tpl.customWidth !== undefined ? { customWidth: tpl.customWidth } : {}),
        ...(tpl.customHeight !== undefined ? { customHeight: tpl.customHeight } : {}),
      })
      const contentW = dims.width - tpl.margins.left - tpl.margins.right
      for (const [i, el] of expanded.elements.entries()) {
        expect(el.options!.left ?? -1, `${preset.id} elements[${i}].left`).toBeGreaterThanOrEqual(0)
        expect((el.options!.left ?? 0) + (el.options!.width ?? 0), `${preset.id} elements[${i}] 横向`)
          .toBeLessThanOrEqual(contentW + 1e-9)
        expect(el.options!.top ?? -1, `${preset.id} elements[${i}].top`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('表格列宽合计等于元素宽、行高合计等于元素高', () => {
    for (const preset of DRAFT_PRESETS) {
      const r = draftTemplate({ preset: preset.id })
      for (const [i, el] of r.template.elements.entries()) {
        if (el.type !== 'table') continue
        const widths = el.options.tableColWidths as number[]
        const rows = el.options.tableRows as Array<{ height: number; type: string; repeatOnPage?: boolean }>
        expect(widths.reduce((a, b) => a + b, 0), `${preset.id} elements[${i}] 列宽`).toBeCloseTo(el.options.width, 6)
        expect(rows.reduce((s, row) => s + row.height, 0), `${preset.id} elements[${i}] 行高`).toBeCloseTo(el.options.height, 6)
        expect(rows.some(row => row.type === 'header' && row.repeatOnPage), `${preset.id} header 重复`).toBe(true)
        expect(rows.filter(row => row.type === 'data'), `${preset.id} data 行唯一`).toHaveLength(1)
      }
    }
  })

  it('paper 覆盖项生效：doc-a4 覆盖边距后几何跟着内容宽走，列宽同步等比缩放', () => {
    const expanded = expandPreset('doc-a4', { margins: { top: 20, right: 20, bottom: 20, left: 20 } })
    expect(expanded!.paper.margins).toEqual({ top: 20, right: 20, bottom: 20, left: 20 })
    // 内容宽 210−40=170：全宽元素与表格宽度都应为 170
    const text = expanded!.elements[0]
    expect(text.options!.width).toBe(170)
    const table = expanded!.elements.find(el => el.type === 'table')
    expect(table!.options!.width).toBe(170)
    // 列宽合计跟着 170 走（按两位小数）
    const widths = table!.options!.tableColWidths as number[]
    expect(widths.reduce((a, b) => Math.round((a + b) * 100) / 100, 0)).toBe(170)
  })

  it('全部 preset：默认纸张与覆盖边距后，每个 table 的列宽合计（两位小数）恒等于元素宽', () => {
    for (const preset of DRAFT_PRESETS) {
      for (const paper of [undefined, { margins: { top: 20, right: 20, bottom: 20, left: 20 } }] as const) {
        const expanded = expandPreset(preset.id, paper)
        const margins = expanded!.paper.margins!
        const dims = getPaperDimensions({
          paperSize: expanded!.paper.paperSize!,
          orientation: expanded!.paper.orientation ?? 'portrait',
          ...(expanded!.paper.customWidth !== undefined ? { customWidth: expanded!.paper.customWidth } : {}),
          ...(expanded!.paper.customHeight !== undefined ? { customHeight: expanded!.paper.customHeight } : {}),
        })
        const contentW = dims.width - margins.left - margins.right
        for (const [i, el] of expanded!.elements.entries()) {
          if (el.type !== 'table') continue
          const widths = el.options!.tableColWidths as number[]
          const sum = Math.round(widths.reduce((a, b) => a + b, 0) * 100) / 100
          expect(sum, `${preset.id} elements[${i}] 列宽合计（paper=${JSON.stringify(paper)}）`).toBe(contentW)
          expect(el.options!.width, `${preset.id} elements[${i}] 表格宽度`).toBe(sum)
        }
      }
    }
  })

  it('paperSize 覆盖项生效：doc-a4 改 A5 后表格宽 128、列宽合计 128', () => {
    const expanded = expandPreset('doc-a4', { paperSize: 'A5' })
    const table = expanded!.elements.find(el => el.type === 'table')
    expect(table!.options!.width).toBe(128)
    expect(Math.round((table!.options!.tableColWidths as number[]).reduce((a, b) => a + b, 0) * 100) / 100).toBe(128)
  })

  it('默认纸张下 preset 源数据列宽保持原值（doc-a4 默认 190，未被源数据修改）', () => {
    const tableBlock = DRAFT_PRESETS.find(p => p.id === 'doc-a4')!.blocks.find(b => b.element?.type === 'table')!
    expect(tableBlock.element!.options!.tableColWidths).toEqual([60, 40, 30, 60])
    const expanded = expandPreset('doc-a4')
    const table = expanded!.elements.find(el => el.type === 'table')
    expect(table!.options!.width).toBe(190)
    expect(table!.options!.tableColWidths).toEqual([60, 40, 30, 60])
  })

  it('undefined 覆盖键不抹掉 preset 已填值（waybill 的 CUSTOM 尺寸）', () => {
    const expanded = expandPreset('waybill-100x150', { orientation: 'portrait' })
    expect(expanded!.paper.customWidth).toBe(100)
    expect(expanded!.paper.customHeight).toBe(150)
  })

  it('左右两栏按比例切开且依次相接（doc-a4 的 meta 行）', () => {
    const expanded = expandPreset('doc-a4')!
    // 展开顺序固定：title、docTitle 之后是第一条 meta 行的 4 栏
    const metaCols = expanded.elements.slice(2, 6)
    expect(metaCols).toHaveLength(4)
    for (let i = 1; i < metaCols.length; i++) {
      const prev = metaCols[i - 1]!.options!
      const cur = metaCols[i]!.options!
      expect((prev.left ?? 0) + (prev.width ?? 0)).toBeCloseTo(cur.left ?? -1, 6)
    }
    const last = metaCols[3]!.options!
    expect((last.left ?? 0) + (last.width ?? 0)).toBeCloseTo(190, 6) // 内容宽 210−20
  })
})

describe('draftTemplate 的 preset 门禁', () => {
  it('未知 preset 报可行动错误并列出可用 id', () => {
    const r = draftTemplate({ preset: 'no-such' })
    expect(r.issues.some(i => i.level === 'error' && i.message.includes('doc-a4'))).toBe(true)
    expect(r.template.elements).toHaveLength(0)
  })

  it('preset 与 elements 互斥：同时给出报 error 且 preset 优先', () => {
    const r = draftTemplate({
      preset: 'label-40x30',
      elements: [{ type: 'text', options: { left: 0, top: 0, width: 30, height: 5 } }],
    })
    expect(r.issues.some(i => i.level === 'error' && i.message.includes('互斥'))).toBe(true)
    // preset 骨架生效，而不是用户给的 elements
    expect(r.template.elements.length).toBeGreaterThan(1)
    expect(r.template.elements[0].options.formatter).toBe('{goods.name}')
  })

  it('preset 生成的元素 id 独立、走 core 工厂（带 printElementType）', () => {
    const r = draftTemplate({ preset: 'label-60x40' })
    const ids = r.template.elements.map(el => el.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const el of r.template.elements) {
      expect(el.printElementType.type).toBe(el.type)
    }
  })
})
