// print-core/src/render/table-merge-pagination.test.ts
// 「按值合并 × 分页」端到端：归并按渲染区间计算，长明细照常切页，跨页段于页界处断开并重放该值

import { describe, it, expect } from 'vitest'
import { bindData } from './data-binder.js'
import { paginate } from './pagination-engine.js'
import { generateHtml } from './html-generator.js'
import type { TemplateData, MeasuredElement } from './types.js'

const cell = (partial: Record<string, any> = {}) => ({ id: 'c', formatter: '', ...partial })

function makeTemplate(tableOptions: Record<string, any>): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{ id: 'tbl-1', type: 'table', options: { left: 0, top: 0, width: 150, ...tableOptions } }] as any,
  }
}

/** 明细表：1 行重复表头 + 1 行数据（单位列开启按值合并），行高均 10mm，页可用 275mm */
function build(merge: boolean, count: number, extraRows: any[] = []) {
  const rows = [
    { id: 'r1', type: 'header', height: 10, repeatOnPage: true, cells: [cell({ formatter: '品名' }), cell({ formatter: '数量' }), cell({ formatter: '单位' })] },
    {
      id: 'r2', type: 'data', height: 10,
      cells: [
        cell({ formatter: '{name}' }),
        cell({ formatter: '{qty}' }),
        cell({ formatter: '{unit}', ...(merge ? { mergeSameValue: true } : {}) }),
      ],
    },
    ...extraRows,
  ]
  const t = makeTemplate({
    tableMode: 'dynamic', tableColWidths: [70, 40, 40], tableRows: rows,
    fields: [{ text: 'items', dataSource: 'items' }],
  })
  const items = Array.from({ length: count }, (_, i) => ({ name: `货品${i + 1}`, qty: 1, unit: '个' }))
  const bound = bindData(t, { items })
  const renderRows: any[] = bound.elements[0]!.options._renderRows
  const measured = new Map<string, MeasuredElement>([['tbl-1', {
    id: 'tbl-1',
    measuredHeight: renderRows.length * 10,
    measuredRowHeights: renderRows.map(() => 10),
    repeatHeaderHeight: 10,
  }]])
  const pages = paginate(bound, measured)
  const html = generateHtml(bound, pages, {})
  const pageHtmls = html.split('<section class="print-page"').slice(1)
  return { renderRows, pages, html, pageHtmls }
}

describe('按值合并 × 分页（40 行明细，页可用 275mm）', () => {
  it('开启合并后仍按 27 行切片：首页不再只剩表头', () => {
    const base = build(false, 40)
    const merged = build(true, 40)
    // 归并不改行数、不改行高，切片结果必须与未开启时完全一致
    expect(merged.pages.map(p => p.sections.map((s: any) => [s.startRow, s.endRow])))
      .toEqual(base.pages.map(p => p.sections.map((s: any) => [s.startRow, s.endRow])))
    expect(merged.pages[0]!.sections[0]).toMatchObject({ startRow: 0, endRow: 27 })
    expect(merged.pageHtmls).toHaveLength(2)
  })

  it('40 条明细逐行都在纸上：不留白、不越界裁切', () => {
    const { html, pages } = build(true, 40)
    // 首页 27 行（含表头）+ 次页 1 行重复表头 + 14 行 = 42 个 <tr>
    expect((html.match(/<tr/g) ?? []).length).toBe(42)
    expect((html.match(/货品/g) ?? []).length).toBe(40)
    // 每页占高都不超过页可用高度（本用例每行 10mm，20 行为 200mm，27 行为 270mm）
    const usedMm = pages.map(p => p.sections.reduce((sum: number, s: any) => {
      let h = s.repeatHeader ? 10 : 0
      for (let r = s.startRow ?? 0; r < (s.endRow ?? 0); r++) h += 10
      return sum + h
    }, 0))
    expect(Math.max(...usedMm)).toBeLessThanOrEqual(275)
    expect(pages.some(p => (p as any).overflow)).toBe(false)
  })

  it('跨页的段在页界处断开：每页各有一个主格，续页首行重放单位值', () => {
    const { pageHtmls } = build(true, 40)
    // 单位列「个」：每页各自作为主格出现一次（续页重放），不是整段被推到次页
    for (const page of pageHtmls) {
      expect((page.match(/>个</g) ?? []).length).toBe(1)
    }
    // 段长不超过本页行数：首页 26 行、次页 14 行
    expect(pageHtmls[0]!).toContain('rowspan="26"')
    expect(pageHtmls[1]!).toContain('rowspan="14"')
  })

  it('未开启合并时逐行输出单位值（存量行为不变）', () => {
    const { html } = build(false, 40)
    expect((html.match(/>个</g) ?? []).length).toBe(40)
    expect(html).not.toContain('rowspan=')
  })
})

describe('按值合并 × 小计行', () => {
  it('每页小计按本页数据行求和，且页尾不被挤到表头页', () => {
    const subtotal = { id: 'r3', type: 'subtotal', height: 10, cells: [cell({ formatter: '本页小计' }), cell({ formatter: '{SUM(qty)}' }), cell({ formatter: '' })] }
    const { pages, pageHtmls } = build(true, 40, [subtotal])
    // 小计行占页尾预算：首页 1 表头 + 25 条 + 小计，次页 15 条 + 小计——小计不再是 0
    expect(pages[0]!.sections[0]).toMatchObject({ startRow: 0, endRow: 26, subtotal: true })
    expect(pageHtmls[0]!).toContain('本页小计')
    expect((pageHtmls[0]!.match(/>25</g) ?? []).length).toBe(1)
    expect((pageHtmls[1]!.match(/>15</g) ?? []).length).toBe(1)
  })
})

describe('按值合并 × 横向合并（数据行内 colspan）', () => {
  it('横向合并行保持两列，不被归并成多一列', () => {
    const rows = [
      { id: 'r1', type: 'header', height: 10, cells: [cell({ formatter: '品名' }), cell({ formatter: '数量' })] },
      {
        id: 'r2', type: 'data', height: 10,
        cells: [cell({ formatter: '{name}', colspan: 2 }), cell({ formatter: '', merged: true })],
      },
    ]
    const t = makeTemplate({
      tableMode: 'dynamic', tableColWidths: [75, 75], tableRows: rows,
      fields: [{ text: 'items', dataSource: 'items' }],
    })
    const bound = bindData(t, { items: [{ name: 'A' }] })
    const renderRows: any[] = bound.elements[0]!.options._renderRows
    const measured = new Map<string, MeasuredElement>([['tbl-1', {
      id: 'tbl-1', measuredHeight: 20, measuredRowHeights: [10, 10], repeatHeaderHeight: 0,
    }]])
    const html = generateHtml(bound, paginate(bound, measured), {})
    const dataRow = html.slice(html.lastIndexOf('<tr'))
    // 数据行只有一个 td（colspan=2），占位格不输出 td
    expect((dataRow.match(/<td/g) ?? []).length).toBe(1)
    expect(dataRow).toContain('colspan="2"')
  })
})

describe('按值合并 × 空数据', () => {
  it('0 条明细不产生合并，仍输出表头', () => {
    const { html, renderRows } = build(true, 0)
    expect(renderRows).toHaveLength(1)
    expect(html).not.toContain('rowspan=')
    expect(html).toContain('品名')
  })
})
