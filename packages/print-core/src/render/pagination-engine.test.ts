// print-render/src/pagination-engine.test.ts
import { describe, it, expect } from 'vitest'
import { paginate, tableDesignBottom } from './pagination-engine.js'
import type { TemplateData, MeasuredElement } from './types.js'

describe('tableDesignBottom：表格设计底部 = top + max(options.height, Σ 行高)', () => {
  it('实测回写高度 > 行高之和：以视觉底部为准（紧贴元素偏移归 0）', () => {
    // 复现 bug：goodsTable top=31，行高和 42，实测回写 45.77 → 旧口径误报底部 73，多算 3.77mm 间距
    const el: any = {
      type: 'table',
      options: {
        top: 31,
        height: 45.77,
        tableRows: [
          { height: 8 }, { height: 8 }, { height: 8 }, { height: 9 }, { height: 9 },
        ],
      },
    }
    expect(tableDesignBottom(el)).toBeCloseTo(31 + 45.77, 6)
  })

  it('options.height 缺失/小于行高之和：以行高之和为物理下界，避免跟随元素负偏移叠压', () => {
    const rows = [{ height: 8 }, { height: 8 }, { height: 8 }]
    const missing: any = { type: 'table', options: { top: 10, tableRows: rows } }
    const underestimated: any = { type: 'table', options: { top: 10, height: 5, tableRows: rows } }
    expect(tableDesignBottom(missing)).toBeCloseTo(10 + 24, 6)
    expect(tableDesignBottom(underestimated)).toBeCloseTo(10 + 24, 6)
  })

  it('无 tableRows：回退 options.height', () => {
    const el: any = { type: 'table', options: { top: 4, height: 16 } }
    expect(tableDesignBottom(el)).toBeCloseTo(20, 6)
  })
})

/** A4 竖版，边距 10，无页眉页脚 → contentHeight 277，可用 275（扣 2mm 安全余量） */
function makeTemplate(tableEl: Record<string, any>): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [tableEl as any],
  }
}

/** rowspanAt: 行索引 → 该行首格 rowspan 值 */
function makeTable(rowCount: number, repeatCount: number, rowspanAt: Record<number, number> = {}) {
  const renderRows = Array.from({ length: rowCount }, (_, r) => ({
    type: r < repeatCount ? 'header' : 'data',
    height: 8,
    cells: [
      { content: '', rowspan: rowspanAt[r] ?? 1, colspan: 1, merged: false },
      { content: '', rowspan: 1, colspan: 1, merged: false },
    ],
  }))
  return {
    id: 'tbl-1', type: 'table',
    options: { left: 0, top: 0, width: 100, _renderRows: renderRows, _repeatHeaderCount: repeatCount },
    tablePagination: { enabled: true },
  }
}

function measure(rowHeights: number[], repeatCount: number): Map<string, MeasuredElement> {
  return new Map([['tbl-1', {
    id: 'tbl-1',
    measuredHeight: rowHeights.reduce((s, h) => s + h, 0),
    measuredRowHeights: rowHeights,
    repeatHeaderHeight: rowHeights.slice(0, repeatCount).reduce((s, h) => s + h, 0),
  }]])
}

describe('paginateTable 行组切片', () => {
  it('8 行×50mm、1 重复表头行：首片 0-5，次片 5-8 带 repeatHeader', () => {
    const el = makeTable(8, 1)
    const pages = paginate(makeTemplate(el), measure(Array(8).fill(50), 1))
    expect(pages).toHaveLength(2)
    expect(pages[0].sections[0]).toMatchObject({ type: 'table-slice', startRow: 0, endRow: 5 })
    expect(pages[0].sections[0].repeatHeader).toBeUndefined()
    expect(pages[1].sections[0]).toMatchObject({ startRow: 5, endRow: 8, repeatHeader: true })
  })

  it('rowspan 覆盖行 keep-together：组不被拆开', () => {
    // 行高 100，行 1 的首格 rowspan=2 → 行 1-2 同组
    const el = makeTable(4, 0, { 1: 2 })
    const pages = paginate(makeTemplate(el), measure(Array(4).fill(100), 0))
    // 首页放行 0（100）后组（200）放不下 → 切片 [0,1)，组整体进次页
    expect(pages[0].sections[0]).toMatchObject({ startRow: 0, endRow: 1 })
    expect(pages[1].sections[0].startRow).toBe(1)
    expect(pages[1].sections[0].endRow).toBeGreaterThanOrEqual(3)
  })

  it('repeatCount=0 的后续切片不带 repeatHeader', () => {
    const el = makeTable(8, 0)
    const pages = paginate(makeTemplate(el), measure(Array(8).fill(50), 0))
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[1].sections[0].repeatHeader).toBeUndefined()
  })

  it('enabled=false 整表不拆', () => {
    const el = makeTable(10, 1)
    ;(el as any).tablePagination = { enabled: false }
    const pages = paginate(makeTemplate(el), measure(Array(10).fill(50), 1))
    expect(pages).toHaveLength(1)
    expect(pages[0].sections[0]).toMatchObject({ startRow: 0, endRow: 10 })
  })

  it('重复表头高度超页 → 抛错', () => {
    const el = makeTable(3, 1)
    expect(() => paginate(makeTemplate(el), measure([300, 50, 50], 1)))
      .toThrow(/重复表头/)
  })

  it('单组高于整页 → 允许溢出不死循环', () => {
    const el = makeTable(3, 0, { 0: 2 }) // 行 0-1 同组，共 400mm > 275
    const pages = paginate(makeTemplate(el), measure([200, 200, 50], 0))
    const sections = pages.flatMap(p => p.sections)
    expect(sections.some(s => s.startRow === 0 && (s.endRow ?? 0) >= 2)).toBe(true)
  })
})

describe('分页配置读取位置（options 内）', () => {
  it('pagination 在 options 内时 pageable=false 生效（超高也不换页）', () => {
    const tpl: any = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [{
        id: 'e1', type: 'text',
        options: { left: 10, top: 10, width: 50, height: 300, pagination: { pageable: false, keepWithNext: false } },
      }],
    }
    const measured = new Map([['e1', { id: 'e1', measuredHeight: 300 }]])
    const pages = paginate(tpl, measured)
    // pageable=false 的元素恒在第一页，即使超高 300mm > 275mm 也不换页
    expect(pages).toHaveLength(1)
    expect(pages[0].sections[0].elementId).toBe('e1')
  })

  it('tablePagination 在 options 内时 enabled=false 生效（超高也整表不拆）', () => {
    const tpl: any = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [{
        id: 't1', type: 'table',
        options: {
          left: 10, top: 10, width: 100, tablePagination: { enabled: false },
          _renderRows: [
            { type: 'header', height: 100, cells: [] },
            { type: 'data', height: 100, cells: [] },
            { type: 'data', height: 100, cells: [] },
          ],
        },
      }],
    }
    const measured = new Map([['t1', { id: 't1', measuredHeight: 300, measuredRowHeights: [100, 100, 100], repeatHeaderHeight: 100 }]])
    const pages = paginate(tpl, measured)
    // 未启用分页：整表单片，不因超高切页
    expect(pages).toHaveLength(1)
    expect(pages[0].sections[0]).toMatchObject({ type: 'table-slice', startRow: 0, endRow: 3 })
  })
})

// ─── 方案 A+B：表格下方跟随区（flow-group 相对容器） ───

/** 表格设计 3 行×8mm（header/data/summary）→ 设计底部 = top(10) + 24 = 34 */
function makeFollowTable(rowCount: number, dataRowHeight = 8): Record<string, any> {
  const renderRows = Array.from({ length: rowCount }, (_, r) => ({
    type: r < 1 ? 'header' : 'data',
    height: 8,
    cells: [{ content: `row${r}`, rowspan: 1, colspan: 1, merged: false }],
  }))
  return {
    id: 'tbl-1', type: 'table',
    options: {
      left: 10, top: 10, width: 100, height: 24,
      tableRows: [
        { type: 'header', height: 8, cells: [] },
        { type: 'data', height: 8, cells: [] },
        { type: 'summary', height: 8, cells: [] },
      ],
      _renderRows: renderRows,
      _repeatHeaderCount: 1,
    },
    tablePagination: { enabled: true },
  }
}

/** 表格下方跟随元素：设计 top=39（底部 34 + 间距 5） */
function makeFollowEl(id = 'follow-1', top = 39, height = 8): Record<string, any> {
  return {
    id, type: 'text',
    options: { left: 10, top, width: 80, height, formatter: `#${id}#` },
  }
}

function makeFollowTemplate(followEls: Record<string, any>[]): TemplateData {
  const table = makeFollowTable(30, 10) // 30 行×10mm → 跨页
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [table as any, ...followEls],
  }
}

function measureFollow(rowHeights: number[], follow: Array<{ id: string; h: number }>): Map<string, MeasuredElement> {
  const m = new Map<string, MeasuredElement>([['tbl-1', {
    id: 'tbl-1',
    measuredHeight: rowHeights.reduce((s, h) => s + h, 0),
    measuredRowHeights: rowHeights,
    repeatHeaderHeight: rowHeights.slice(0, 1).reduce((s, h) => s + h, 0),
  }]])
  for (const f of follow) m.set(f.id, { id: f.id, measuredHeight: f.h })
  return m
}

describe('方案 A+B：表格下方跟随区 flow-group', () => {
  it('表格跨页：跟随区与最后一片（续片）同页 → flow-group，容器 top=0 从页顶开始', () => {
    const tpl = makeFollowTemplate([makeFollowEl()])
    // 30 行×10mm；页1 slice[0,27)，页2 slice[27,30)+表头；跟随区 8mm 放得下页2
    const pages = paginate(tpl, measureFollow(Array(30).fill(10), [{ id: 'follow-1', h: 8 }]))
    expect(pages).toHaveLength(2)
    expect(pages[0].sections[0]).toMatchObject({ type: 'table-slice', startRow: 0, endRow: 27, renderTop: 10 })
    expect(pages[1].sections[0]).toMatchObject({
      type: 'flow-group',
      elementId: 'tbl-1',
      startRow: 27,
      endRow: 30,
      repeatHeader: true,
      followElementIds: ['follow-1'],
      groupTop: 0, // 页2 续片从内容区顶部开始，不再用设计 top
    })
  })

  it('表格跨页：跟随区放不下 → 整体移到下一页，容器 top=0（仅跟随区）', () => {
    const tpl = makeFollowTemplate([makeFollowEl('follow-1', 39, 300)]) // 跟随区 300mm 超高
    const pages = paginate(tpl, measureFollow(Array(30).fill(10), [{ id: 'follow-1', h: 300 }]))
    expect(pages).toHaveLength(3)
    // 页2 仍是独立 table-slice，renderTop=0
    expect(pages[1].sections[0]).toMatchObject({ type: 'table-slice', startRow: 27, endRow: 30, repeatHeader: true, renderTop: 0 })
    // 页3 仅跟随区容器
    expect(pages[2].sections[0]).toMatchObject({
      type: 'flow-group',
      elementId: 'tbl-1',
      startRow: 0,
      endRow: 0,
      followElementIds: ['follow-1'],
      groupTop: 0,
    })
  })

  it('表格不跨页：flow-group 含全部行 + 跟随区，容器 top=表格设计 top', () => {
    const tpl = makeFollowTemplate([makeFollowEl()])
    const rows = makeFollowTable(3).options._renderRows // 3 行×8mm
    ;(tpl.elements[0] as any).options._renderRows = rows
    const pages = paginate(tpl, measureFollow([8, 8, 8], [{ id: 'follow-1', h: 8 }]))
    expect(pages).toHaveLength(1)
    expect(pages[0].sections[0]).toMatchObject({
      type: 'flow-group',
      startRow: 0,
      endRow: 3,
      followElementIds: ['follow-1'],
      groupTop: 10,
    })
  })

  it('无跟随元素：保持 table-slice，不产出 flow-group（不回归）', () => {
    const tpl = makeFollowTemplate([])
    const pages = paginate(tpl, measureFollow(Array(30).fill(10), []))
    expect(pages).toHaveLength(2)
    expect(pages.every(p => p.sections.every(s => s.type === 'table-slice'))).toBe(true)
  })

  it('多个跟随元素连环：间距按设计 Y 差值累积，全部进同一 flow-group', () => {
    // follow-1: top=39 h=8；follow-2: top=51 h=8（间距 51-47=4）
    const tpl = makeFollowTemplate([makeFollowEl('follow-1', 39, 8), makeFollowEl('follow-2', 51, 8)])
    const pages = paginate(tpl, measureFollow(
      Array(30).fill(10),
      [{ id: 'follow-1', h: 8 }, { id: 'follow-2', h: 8 }],
    ))
    const group = pages[1].sections[0]
    expect(group.type).toBe('flow-group')
    expect(group.followElementIds).toEqual(['follow-1', 'follow-2'])
    // 跟随区总高 = 5 + 8 + 4 + 8 = 25mm ≤ 页2剩余
    expect(pages).toHaveLength(2)
  })

  it('重叠的跟随元素：按并集范围计高，不因重复计高而错误移页', () => {
    // follow-1: top=39 h=200；follow-2: top=50 h=200（与 follow-1 大量重叠）
    // 旧「间隙之和」= (39−34)+200 + (50−239→0)+200 = 405mm > 页2剩余(235) → 会整体移页(3页)
    // 新「并集范围」= (50+200)−34 = 216mm ≤ 页2剩余 → 同页 flow-group(2页)
    const tpl = makeFollowTemplate([
      makeFollowEl('follow-1', 39, 200),
      makeFollowEl('follow-2', 50, 200),
    ])
    const pages = paginate(tpl, measureFollow(
      Array(30).fill(10),
      [{ id: 'follow-1', h: 200 }, { id: 'follow-2', h: 200 }],
    ))
    expect(pages).toHaveLength(2)
    expect(pages[1].sections[0]).toMatchObject({
      type: 'flow-group',
      elementId: 'tbl-1',
      followElementIds: ['follow-1', 'follow-2'],
      groupTop: 0,
    })
  })

  it('多个表格：跟随区归入各自上方最近的表格', () => {
    const tableA = makeFollowTable(3) // 3 行×8，top=10 底部 34
    const followA = makeFollowEl('follow-A', 39, 8)
    const tableB = { ...makeFollowTable(3), id: 'tbl-2', options: { ...makeFollowTable(3).options, top: 60 } }
    const followB = makeFollowEl('follow-B', 95, 8) // tbl-2 底部 60+24=84
    const tpl: any = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [tableA, followA, tableB, followB],
    }
    const measured = new Map<string, MeasuredElement>([
      ['tbl-1', { id: 'tbl-1', measuredHeight: 24, measuredRowHeights: [8, 8, 8], repeatHeaderHeight: 8 }],
      ['follow-A', { id: 'follow-A', measuredHeight: 8 }],
      ['tbl-2', { id: 'tbl-2', measuredHeight: 24, measuredRowHeights: [8, 8, 8], repeatHeaderHeight: 8 }],
      ['follow-B', { id: 'follow-B', measuredHeight: 8 }],
    ])
    const pages = paginate(tpl, measured)
    const groups = pages.flatMap(p => p.sections).filter(s => s.type === 'flow-group')
    const byEl = Object.fromEntries(groups.map(g => [g.elementId, g.followElementIds]))
    expect(byEl['tbl-1']).toEqual(['follow-A'])
    expect(byEl['tbl-2']).toEqual(['follow-B'])
  })
})

describe('换页后内容从页顶开始（renderTop）', () => {
  it('双表：静态小表 + 动态大表跨页，第 2/3 页切片 renderTop=0，首片为设计 top', () => {
    // 静态表 top=10，3 行×8mm；动态表 top=40，12 行×50mm → 跨 3 页
    const mkRows = (n: number, h: number) => Array.from({ length: n }, () => ({
      type: 'data', height: h,
      cells: [{ content: '', rowspan: 1, colspan: 1, merged: false }],
    }))
    const tpl: any = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [
        { id: 'tbl-static', type: 'table', options: { left: 0, top: 10, width: 100, _renderRows: mkRows(3, 8), _repeatHeaderCount: 0 }, tablePagination: { enabled: true } },
        { id: 'tbl-dyn', type: 'table', options: { left: 0, top: 40, width: 100, _renderRows: mkRows(12, 50), _repeatHeaderCount: 0 }, tablePagination: { enabled: true } },
      ],
    }
    const measured = new Map<string, MeasuredElement>([
      ['tbl-static', { id: 'tbl-static', measuredHeight: 24, measuredRowHeights: [8, 8, 8] }],
      ['tbl-dyn', { id: 'tbl-dyn', measuredHeight: 600, measuredRowHeights: Array(12).fill(50) }],
    ])
    const pages = paginate(tpl, measured)
    expect(pages).toHaveLength(3)
    // 页1：静态表设计 top=10；动态表首片设计 top=40
    expect(pages[0].sections[0]).toMatchObject({ elementId: 'tbl-static', startRow: 0, endRow: 3, renderTop: 10 })
    expect(pages[0].sections[1]).toMatchObject({ elementId: 'tbl-dyn', startRow: 0, endRow: 5, renderTop: 40 })
    // 页2/页3 续片从内容区顶部(0)开始，不再偏移动态表设计 top
    expect(pages[1].sections[0]).toMatchObject({ elementId: 'tbl-dyn', startRow: 5, endRow: 10, renderTop: 0 })
    expect(pages[2].sections[0]).toMatchObject({ elementId: 'tbl-dyn', startRow: 10, endRow: 12, renderTop: 0 })
  })

  it('非表格元素放不下移到下一页：renderTop=0', () => {
    // e0: top=10 h=200 放得下；e1: top=220 h=100 超过剩余 75 → 移页
    const tpl: any = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [
        { id: 'e0', type: 'text', options: { left: 0, top: 10, width: 50, height: 200 } },
        { id: 'e1', type: 'text', options: { left: 0, top: 220, width: 50, height: 100 } },
      ],
    }
    const measured = new Map<string, MeasuredElement>([
      ['e0', { id: 'e0', measuredHeight: 200 }],
      ['e1', { id: 'e1', measuredHeight: 100 }],
    ])
    const pages = paginate(tpl, measured)
    expect(pages).toHaveLength(2)
    expect(pages[0].sections[0]).toMatchObject({ elementId: 'e0', renderTop: 10 })
    expect(pages[1].sections[0]).toMatchObject({ elementId: 'e1', renderTop: 0 })
  })
})

describe('paginateTable 小计行 subtotal', () => {
  function makeSubtotalTable(rowCount: number, subtotalHeight = 10, summaryHeight = 0, repeatCount = 1) {
    const renderRows = Array.from({ length: rowCount }, (_, r) => ({
      type: r < repeatCount ? 'header' : 'data',
      height: 8,
      cells: [{ content: '', rowspan: 1, colspan: 1, merged: false }],
    }))
    renderRows.push({ type: 'subtotal', height: subtotalHeight, cells: [{ content: '', rowspan: 1, colspan: 1, merged: false }] })
    if (summaryHeight > 0) {
      renderRows.push({ type: 'summary', height: summaryHeight, cells: [{ content: '', rowspan: 1, colspan: 1, merged: false }] })
    }
    return {
      id: 'tbl-1', type: 'table',
      options: {
        left: 0, top: 0, width: 100,
        _renderRows: renderRows,
        _repeatHeaderCount: repeatCount,
        // 模拟 dynamic 模式产物：非空模板/汇总标记触发分页抽离
        _subtotalTemplates: subtotalHeight > 0
          ? [{ type: 'subtotal', height: subtotalHeight, cells: [] }]
          : [],
        _summaryRows: summaryHeight > 0
          ? [{ type: 'summary', height: summaryHeight, cells: [] }]
          : [],
      },
      tablePagination: { enabled: true },
    }
  }

  it('小计行放不下一页时本页最后一行滚到下一页，本页附小计', () => {
    // A4 可用 275；行高 90、小计 10：首页 header+1 数据=180，第3行(90)+10=100 > 剩余 95 → 第3行滚下页
    const el = makeSubtotalTable(6, 10)
    const pages = paginate(makeTemplate(el), measure(Array(6).fill(90).concat([10]), 1))
    expect(pages[0].sections[0]).toMatchObject({ type: 'table-slice', startRow: 0, endRow: 2, subtotal: true })
    expect(pages[0].sections[0].summary).toBeUndefined()
    // 第3行（当前页最后一行）与后续行进入下一页，小计跟随
    expect(pages[1].sections[0]).toMatchObject({ startRow: 2, subtotal: true })
  })

  it('每片末尾均带小计行标记（8 行×50 + 小计 10）', () => {
    const el = makeSubtotalTable(8, 10)
    const pages = paginate(makeTemplate(el), measure(Array(8).fill(50).concat([10]), 1))
    expect(pages).toHaveLength(2)
    expect(pages[0].sections[0]).toMatchObject({ startRow: 0, endRow: 5, subtotal: true })
    expect(pages[1].sections[0]).toMatchObject({ startRow: 5, endRow: 8, subtotal: true, repeatHeader: true })
  })

  it('汇总行紧随最后一片小计之后', () => {
    const el = makeSubtotalTable(7, 10, 8)
    const pages = paginate(makeTemplate(el), measure(Array(7).fill(50).concat([10, 8]), 1))
    // 首页：header+4 数据行 + 小计；次页：末数据行 + 小计 + 汇总
    expect(pages[0].sections[0]).toMatchObject({ startRow: 0, endRow: 5, subtotal: true })
    expect(pages[1].sections[0]).toMatchObject({ startRow: 5, endRow: 7, subtotal: true, summary: true })
  })

  it('未启用分页：整表单片含小计与汇总', () => {
    const el = makeSubtotalTable(3, 10, 8)
    ;(el as any).tablePagination = { enabled: false }
    const pages = paginate(makeTemplate(el), measure(Array(3).fill(50).concat([10, 8]), 1))
    expect(pages).toHaveLength(1)
    expect(pages[0].sections[0]).toMatchObject({ startRow: 0, endRow: 3, subtotal: true, summary: true })
  })
})

// ─── 堆叠（纵向重叠）与显式编组：并集计高、整组同页、换页平移 ───

/** 非表格元素模板：A4 竖版、边距 10、无页眉页脚 → 首页可用 275mm */
function makeFreeTemplate(elements: Array<Record<string, any>>): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: elements as any,
  }
}
function freeEl(id: string, top: number, height: number, extra: Record<string, any> = {}): Record<string, any> {
  return { id, type: 'text', options: { left: 0, top, width: 60, height, ...extra } }
}
function measureFree(entries: Array<[string, number]>): Map<string, MeasuredElement> {
  return new Map(entries.map(([id, h]) => [id, { id, measuredHeight: h }]))
}

/** 自定义纸张（CUSTOM）模板：小纸场景必须能复现真实纸高 */
function makeCustomPaperTemplate(
  width: number,
  height: number,
  elements: Array<Record<string, any>>,
): TemplateData {
  return {
    paperSize: 'CUSTOM', orientation: 'portrait',
    customWidth: width, customHeight: height,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: elements as any,
  }
}

describe('堆叠元素：纵向重叠按并集计高，不重复扣高', () => {
  it('两个重叠元素并集 240mm 放得下 → 同页，不被错误拆分（旧逻辑会拆成 2 页）', () => {
    // e0: top10 h150（底160）；e1: top100 h150（底250）；纵向重叠 [100,160)
    // 旧逻辑：e0 扣 150 后剩 125，e1(150) 放不下 → 移页（2 页）
    // 新逻辑：并集 = 250−10 = 240 ≤ 275 → 同页（1 页）
    const tpl = makeFreeTemplate([freeEl('e0', 10, 150), freeEl('e1', 100, 150)])
    const pages = paginate(tpl, measureFree([['e0', 150], ['e1', 150]]))
    expect(pages).toHaveLength(1)
    const ids = pages[0].sections.map(s => s.elementId)
    expect(ids).toEqual(['e0', 'e1'])
    // 首页未换页：保持各自设计 top
    expect(pages[0].sections[0]).toMatchObject({ elementId: 'e0', renderTop: 10 })
    expect(pages[0].sections[1]).toMatchObject({ elementId: 'e1', renderTop: 100 })
  })

  it('上下相切（top 恰等于上一元素底边）不聚类，保持顺序流式分页', () => {
    // e0: top10 h100（底110）；e1: top110 h200（底310），恰相切
    // 不重叠 → 各自独立：e0 扣 100 剩 175，e1(200) 放不下 → 单独移页
    const tpl = makeFreeTemplate([freeEl('e0', 10, 100), freeEl('e1', 110, 200)])
    const pages = paginate(tpl, measureFree([['e0', 100], ['e1', 200]]))
    expect(pages).toHaveLength(2)
    expect(pages[0].sections).toHaveLength(1)
    expect(pages[0].sections[0]).toMatchObject({ elementId: 'e0', renderTop: 10 })
    expect(pages[1].sections[0]).toMatchObject({ elementId: 'e1', renderTop: 0 })
  })
})

describe('显式编组 groupId：整组同页，换页保持组内相对布局', () => {
  it('组并集超出本页剩余 → 整组（含本可放下的成员）一起移到下一页并整体平移', () => {
    // pre: top0 h230（底230），首页剩余 275−230 = 45
    // 组 g1（成员彼此不重叠、与 pre 不重叠，仅靠 groupId 绑定）：
    //   a: top240 h20（底260）；b: top266 h20（底286）；组并集 = 286−240 = 46 > 45
    // 旧逻辑：a(20)、b(20) 分散扣减都能塞进首页 → 1 页（错误：编组被拆散语义虽未变，
    //   但这里验证的是"并集口径"下整组换页）
    // 新逻辑：整组移次页，pageBroken，offset=−240 → a renderTop=0、b renderTop=26
    const tpl = makeFreeTemplate([
      freeEl('pre', 0, 230),
      freeEl('a', 240, 20, { groupId: 'g1' }),
      freeEl('b', 266, 20, { groupId: 'g1' }),
    ])
    const pages = paginate(tpl, measureFree([['pre', 230], ['a', 20], ['b', 20]]))
    expect(pages).toHaveLength(2)
    expect(pages[0].sections.map(s => s.elementId)).toEqual(['pre'])
    const second = pages[1].sections
    expect(second.map(s => s.elementId).sort()).toEqual(['a', 'b'])
    const topOf = (id: string) => second.find(s => s.elementId === id)!.renderTop
    expect(topOf('a')).toBe(0)
    expect(topOf('b')).toBe(26) // 组内相对偏移 266−240 保持不变
  })

  it('组内含 pageable:false 成员 → 整组锁定首页，不换页', () => {
    const tpl = makeFreeTemplate([
      freeEl('a', 250, 20, { groupId: 'g2', pagination: { pageable: false, keepWithNext: false } }),
      freeEl('b', 255, 20, { groupId: 'g2' }),
    ])
    const pages = paginate(tpl, measureFree([['a', 20], ['b', 20]]))
    expect(pages).toHaveLength(1)
    expect(pages[0].sections.map(s => s.elementId).sort()).toEqual(['a', 'b'])
  })
})

describe('空白页防御：当前页尚无内容时换页不产出空页', () => {
  it('首个元素就超预算：按设计坐标留在本页，不产出空白第一页', () => {
    // A4：contentHeight 277，预算 275；e0 高 300 放不下
    // 旧逻辑：finishPage 无条件 push 空页 → 2 页且第 1 页空白
    const tpl = makeFreeTemplate([freeEl('e0', 0, 300)])
    const pages = paginate(tpl, measureFree([['e0', 300]]))
    expect(pages).toHaveLength(1)
    expect(pages[0].sections).toMatchObject([{ elementId: 'e0', renderTop: 0 }])
    // 不产空白页，但溢出事实必须上报（拼版据此阻断）
    expect(pages[0].overflow).toBe(true)
  })

  it('80×60mm 自定义纸：单元实测 38.1mm 略超 38mm 预算仍为单页（曾出现空白首页）', () => {
    // 内容区 40mm（60 − 上下边距各 10），预算 = 40 − 2 = 38
    // rect top1 h38.1 与 text top6.82 h5.3 纵向重叠 → 单元并集 38.1 > 38
    // 物理上未越界（底 39.1 < 40），必须保持单页且沿用设计坐标
    const tpl = makeCustomPaperTemplate(80, 60, [
      freeEl('rect', 1, 38.1),
      freeEl('text', 6.8262333333333345, 5.3),
    ])
    const pages = paginate(tpl, measureFree([['rect', 38.1], ['text', 5.3]]))
    expect(pages).toHaveLength(1)
    const topOf = (id: string) => pages[0].sections.find(s => s.elementId === id)!.renderTop
    expect(topOf('rect')).toBe(1)
    expect(topOf('text')).toBe(6.8262333333333345)
    // 只越过 2mm 安全余量的预算，物理未越界（底 39.1 < 40）→ 不算裁切风险，拼版不得阻断
    expect(pages[0].overflow).toBeUndefined()
  })

  it('内容真的超出内容区（会被纸面裁掉）才标记 overflow', () => {
    // 同上纸张（内容区 40mm），矩形 top10 h38 → 底 48 > 40，物理越界
    const tpl = makeCustomPaperTemplate(80, 60, [freeEl('rect', 10, 38)])
    const pages = paginate(tpl, measureFree([['rect', 38]]))
    expect(pages).toHaveLength(1)
    expect(pages[0].overflow).toBe(true)
  })
})

describe('换页流式光标：表格后续页的编组不叠压表格（回归）', () => {
  it('次片从页顶起排，显式编组锚点贴切片实占底部，组内相对偏移保持', () => {
    // 8 行×50 + 重复表头 50：页1 片 rows0-5（250）；页2 片 rows5-8（150 + 表头 50 = 200），剩余 75
    // 编组 g1：a top500 h10、b top520 h20 → 并集 40 ≤ 75 → 落页2，起点 = 200（修复前为 0，叠压表格）
    const table = makeTable(8, 1)
    const tpl = makeFreeTemplate([
      table,
      freeEl('a', 500, 10, { groupId: 'g1' }),
      freeEl('b', 520, 20, { groupId: 'g1' }),
    ])
    const measured = new Map([...measure(Array(8).fill(50), 1), ...measureFree([['a', 10], ['b', 20]])])
    const pages = paginate(tpl, measured)
    expect(pages).toHaveLength(2)
    const second = pages[1].sections
    expect(second.find(s => s.elementId === 'tbl-1')!.renderTop).toBe(0)
    const topOf = (id: string) => second.find(s => s.elementId === id)!.renderTop
    expect(topOf('a')).toBe(200)
    expect(topOf('b')).toBe(220)
  })

  it('两个编组单元先后放置按流式光标顺排，互不叠压', () => {
    const table = makeTable(8, 1)
    const tpl = makeFreeTemplate([
      table,
      freeEl('a', 500, 10, { groupId: 'g1' }),
      freeEl('b', 520, 20, { groupId: 'g1' }),
      freeEl('c', 600, 10, { groupId: 'g2' }),
      freeEl('d', 610, 15, { groupId: 'g2' }),
    ])
    const measured = new Map([
      ...measure(Array(8).fill(50), 1),
      ...measureFree([['a', 10], ['b', 20], ['c', 10], ['d', 15]]),
    ])
    const pages = paginate(tpl, measured)
    const second = pages[1].sections
    const topOf = (id: string) => second.find(s => s.elementId === id)!.renderTop
    // g1 起点 200（高 40）→ g2 起点 240（并集 25 也 ≤ 剩余 35）
    expect(topOf('a')).toBe(200)
    expect(topOf('c')).toBe(240)
    expect(topOf('d')).toBe(250)
  })
})
