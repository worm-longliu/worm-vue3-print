// print-core/src/render/multilevel-header.test.ts
// 多级表头端到端：数据绑定 → 分页切片 → 续片渲染。
// 关注点：表头各层由 rowspan/colspan 连成结构整体，分页续片必须完整重复，不能被切在半截上。
import { describe, it, expect } from 'vitest'
import { bindData } from './data-binder.js'
import { paginate } from './pagination-engine.js'
import { generateHtml } from './html-generator.js'
import type { TemplateData, MeasuredElement, PageLayout } from './types.js'

const cell = (formatter: string, span: Partial<{ rowspan: number; colspan: number; merged: boolean }> = {}) =>
  ({ id: 'c', formatter, rowspan: 1, colspan: 1, merged: false, ...span })

/**
 * 两级表头 + 数据行：
 * 行0 | 基本信息(跨2列) | 金额(跨2行) |
 * 行1 | 姓名 | 年龄 | (被金额占据)
 */
function tableRows(repeatFlags: [boolean, boolean], headerRowspan = 2) {
  return [
    { id: 'h0', type: 'header', height: 8, repeatOnPage: repeatFlags[0], cells: [
      cell('基本信息', { colspan: 2 }), cell('', { merged: true }), cell('金额', { rowspan: headerRowspan }),
    ] },
    { id: 'h1', type: 'header', height: 8, repeatOnPage: repeatFlags[1], cells: [
      cell('姓名'), cell('年龄'), cell('', { rowspan: headerRowspan, merged: true }),
    ] },
    { id: 'd0', type: 'data', height: 8, cells: [cell('{name}'), cell('{age}'), cell('{amt}')] },
  ]
}

function items(n: number) {
  return Array.from({ length: n }, (_, i) => ({ name: `A${i}`, age: i, amt: i * 10 }))
}

/** 行高统一 8mm 的测量结果；repeatHeaderHeight 由前 _repeatHeaderCount 行求和推导 */
function measure(bound: TemplateData): Map<string, MeasuredElement> {
  const opts = bound.elements[0]!.options as any
  const rows: any[] = opts._renderRows ?? []
  const heights = rows.map(() => 8)
  const repeatCount: number = opts._repeatHeaderCount ?? 0
  return new Map([['tbl-1', {
    id: 'tbl-1',
    measuredHeight: heights.reduce((s, h) => s + h, 0),
    measuredRowHeights: heights,
    repeatHeaderHeight: heights.slice(0, repeatCount).reduce((s, h) => s + h, 0),
  }]])
}

function makeTemplate(rows: any[]): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [{
      id: 'tbl-1', type: 'table',
      options: { left: 0, top: 0, width: 120, tableColWidths: [40, 40, 40], tableRows: rows, tableMode: 'dynamic', fields: [{ text: 'items', dataSource: 'items' }] },
      tablePagination: { enabled: true },
    } as any],
  }
}

/** 绑定 → 分页 → 取第 i 页 HTML */
function renderPage(rows: any[], itemCount: number, pageIndex: number) {
  const bound = bindData(makeTemplate(rows), { items: items(itemCount) })
  const pages = paginate(bound, measure(bound))
  const html = generateHtml(bound, [pages[pageIndex]!], {})
  return { bound, pages, html }
}

describe('多级表头分页续片', () => {
  it('两行表头都勾选：续片完整重复两个层级', () => {
    const { pages, html } = renderPage(tableRows([true, true]), 100, 1)
    expect(pages.length).toBeGreaterThan(1)
    expect(html).toContain('基本信息')
    expect(html).toContain('金额')
    expect(html).toContain('姓名')
    expect(html).toContain('年龄')
  })

  it('只勾首行：表头区作为整体重复，第二级表头不丢失（回归）', () => {
    // 修复前 _repeatHeaderCount=1，续片只剩「基本信息|金额」，「姓名/年龄」丢失
    const { bound, html } = renderPage(tableRows([true, false]), 100, 1)
    expect((bound.elements[0]!.options as any)._repeatHeaderCount).toBe(2)
    expect(html).toContain('姓名')
    expect(html).toContain('年龄')
  })

  it('只勾第二行：同样整体重复', () => {
    const { html } = renderPage(tableRows([false, true]), 100, 1)
    expect(html).toContain('基本信息')
    expect(html).toContain('姓名')
  })

  it('两行都不勾：续片不重复表头', () => {
    const { html } = renderPage(tableRows([false, false]), 100, 1)
    expect(html).not.toContain('基本信息')
    expect(html).not.toContain('姓名')
  })

  it('续片表头段的跨行主格不被裁剪（rowspan=2 完整输出）', () => {
    const { html } = renderPage(tableRows([true, true]), 100, 1)
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'))
    expect(table).toContain('rowspan="2"')
    // 2 行重复表头 + 本页数据行
    const trCount = (table.match(/<tr/g) ?? []).length
    expect(trCount).toBeGreaterThan(2)
  })

  it('脏数据兜底：表头主格 rowspan 跨出表头区时，续片按边界裁剪而不吞掉数据行', () => {
    // rowspan=5 越过 2 行表头区 → 重复行数收缩到 1，超界 rowspan 渲染时裁剪为 1
    const { bound, html } = renderPage(tableRows([true, true], 5), 100, 1)
    expect((bound.elements[0]!.options as any)._repeatHeaderCount).toBe(1)
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'))
    expect(table).not.toContain('rowspan="5"')
  })
})

describe('多级表头切片区间', () => {
  it('续片区间不含表头行，表头由 repeatHeader 单独渲染', () => {
    const { pages } = renderPage(tableRows([true, true]), 100, 1)
    const slice = pages[1]!.sections[0] as any
    expect(slice.type).toBe('table-slice')
    expect(slice.repeatHeader).toBe(true)
    expect(slice.startRow).toBeGreaterThanOrEqual(2)
  })
})
