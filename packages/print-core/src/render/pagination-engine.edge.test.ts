// print-core/src/render/pagination-engine.edge.test.ts
// 分页引擎极限情况示例集：验证引擎在病态/边界输入下「正确处置」而非崩溃、死循环或叠压。
// 覆盖：编组超整页、表格后续流式放置、rowspan 组超页、重复表头占满页、keepWithNext 降级、
// 贴边预算、0 高度元素、隐式堆叠簇换页、汇总行独立页、综合不变量。
import { describe, it, expect } from 'vitest'
import { paginate } from './pagination-engine.js'
import type { TemplateData, MeasuredElement } from './types.js'

/** A4 竖版边距 10：contentHeight 277，预算 275（含 2mm 安全余量） */
function tpl(elements: Array<Record<string, any>>): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: elements as any,
  }
}

/** 自定义纸：contentHeight = height − 上下边距（边距 10） */
function tplCustom(paperH: number, elements: Array<Record<string, any>>): TemplateData {
  return {
    paperSize: 'CUSTOM', orientation: 'portrait', customWidth: 80, customHeight: paperH,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: elements as any,
  } as TemplateData
}

function el(id: string, top: number, height: number, extra: Record<string, any> = {}): Record<string, any> {
  return { id, type: 'text', options: { left: 0, top, width: 60, height, ...extra } }
}

function tableEl(
  rowDefs: Array<{ height: number; type?: string; rowspan?: number }>,
  opts: Record<string, any> = {},
): Record<string, any> {
  const renderRows = rowDefs.map(r => ({
    type: r.type ?? 'data',
    height: r.height,
    cells: [{ content: '', rowspan: r.rowspan ?? 1, colspan: 1, merged: false }],
  }))
  return {
    id: 'tbl', type: 'table',
    options: { left: 0, width: 100, top: 0, ...opts, _renderRows: renderRows },
    tablePagination: { enabled: true },
  }
}

function measureTable(rowHeights: number[], repeatCount: number, id = 'tbl'): Map<string, MeasuredElement> {
  return new Map([[id, {
    id,
    measuredHeight: rowHeights.reduce((s, h) => s + h, 0),
    measuredRowHeights: rowHeights,
    repeatHeaderHeight: rowHeights.slice(0, repeatCount).reduce((s, h) => s + h, 0),
  }]])
}

function withFree(m: Map<string, MeasuredElement>, entries: Array<[string, number]>): Map<string, MeasuredElement> {
  for (const [id, h] of entries) m.set(id, { id, measuredHeight: h })
  return m
}

describe('极限：编组单元', () => {
  it('组并集高于整页 → 不拆分不死循环，整组同页并标记裁切风险', () => {
    // 纸内容区 40，预算 38；组并集 = (5+30+20) − 5 = 45 > 38
    const t = tplCustom(60, [
      el('a', 5, 10, { groupId: 'g' }),
      el('b', 25, 20, { groupId: 'g' }),
    ])
    const pages = paginate(t, new Map([
      ['a', { id: 'a', measuredHeight: 10 }],
      ['b', { id: 'b', measuredHeight: 20 }],
    ]))
    expect(pages).toHaveLength(1) // 空页防御：不换页，留在本页
    const tops = (pages[0].sections as any[]).map(s => s.elementId + ':' + s.renderTop)
    // 整组同页且相对偏移保持（b 比 a 低 20mm）
    expect(pages[0].sections).toHaveLength(2)
    const topOf = (id: string) => (pages[0].sections as any[]).find(s => s.elementId === id).renderTop
    expect(topOf('b') - topOf('a')).toBeCloseTo(20, 6)
    expect(tops.length).toBe(2)
    expect(pages[0].overflow).toBe(true) // 底 45+5=50 > 40 物理越界
  })

  it('多个编组 + 独立元素换页后顺排：区间互不叠压', () => {
    const t = tpl([
      tableEl(Array(8).fill({ height: 50, type: 'data' })),
      el('a', 500, 10, { groupId: 'g1' }),
      el('b', 520, 20, { groupId: 'g1' }),
      el('c', 600, 10, { groupId: 'g2' }),
      el('d', 610, 15, { groupId: 'g2' }),
      el('z', 700, 10, { groupId: 'solo' }), // 单成员组：不成为表格跟随区候选，按独立单元排布
    ])
    const m = measureTable(Array(8).fill(50), 0)
    withFree(m, [['a', 10], ['b', 20], ['c', 10], ['d', 15], ['z', 10]])
    const pages = paginate(t, m)
    // 表片：页0 rows0-5（250），页1 rows5-8（150，remaining 125）→ 组从光标 150 起顺排
    const second = pages[1].sections as any[]
    const topOf = (id: string) => second.find(s => s.elementId === id)!.renderTop
    expect(second.find(s => s.elementId === 'tbl')!.renderTop).toBe(0)
    expect(topOf('a')).toBe(150)
    expect(topOf('b')).toBe(170)
    expect(topOf('c')).toBe(190)
    expect(topOf('d')).toBe(200)
    // z(10) 放不下（剩余 125−65=60 ≥ 10 实际放得下）→ 同页贴 g2 底部 215
    expect(topOf('z')).toBe(215)
  })

  it('组内含 pageable:false 成员 → 整组锁首页设计坐标，且不占流式预算', () => {
    const t = tpl([
      el('a', 250, 10, { groupId: 'g', pagination: { pageable: false, keepWithNext: false } }),
      el('b', 255, 20, { groupId: 'g' }),
      el('later', 276, 5),
    ])
    const m = new Map([
      ['a', { id: 'a', measuredHeight: 10 }],
      ['b', { id: 'b', measuredHeight: 20 }],
      ['later', { id: 'later', measuredHeight: 5 }],
    ])
    const pages = paginate(t, m)
    // 锁首页成员按设计坐标且不扣预算：later(5) 仍在预算内 → 全部单页
    expect(pages).toHaveLength(1)
    const ids = pages[0].sections.map(s => s.elementId)
    expect(ids).toEqual(['a', 'b', 'later'])
    // later 底 281 > 内容区 277 → 物理裁切风险标记
    expect(pages[0].overflow).toBe(true)
  })
})

describe('极限：表格病态输入', () => {
  it('rowspan 行组高于整页 → 溢出单页容纳，后续元素归入跟随区不丢件', () => {
    // 行 0-1 同组（rowspan=2）高 400 > 275：空页防御让其溢出留在页 0，不拆组不死循环
    const t = tpl([
      tableEl([
        { height: 200, rowspan: 2 }, { height: 200 }, { height: 50 },
      ]),
      el('z', 900, 10),
    ])
    const m = measureTable([200, 200, 50], 0)
    withFree(m, [['z', 10]])
    const pages = paginate(t, m)
    expect(pages.length).toBeGreaterThanOrEqual(2)
    // 组不被拆开：rows0-2 的组整体在首个切片内
    const firstSlice = pages[0].sections[0] as any
    expect(firstSlice.startRow).toBe(0)
    expect(firstSlice.endRow).toBeGreaterThanOrEqual(2)
    // z 未丢失：作为表格跟随成员出现在某页 flow-group 的 followElementIds
    const allSections = pages.flatMap(p => p.sections as any[])
    expect(allSections.some(s => s.followElementIds?.includes('z'))).toBe(true)
  })

  it('重复表头恰占满预算（275）不抛错；276 抛错', () => {
    const ok = tpl([tableEl([{ height: 275, type: 'header' }, { height: 10 }], { _repeatHeaderCount: 1 })])
    const okM = measureTable([275, 10], 1)
    expect(() => paginate(ok, okM)).not.toThrow()
    const bad = tpl([tableEl([{ height: 276, type: 'header' }, { height: 10 }], { _repeatHeaderCount: 1 })])
    expect(() => paginate(bad, measureTable([276, 10], 1))).toThrow(/重复表头/)
  })

  it('0 高度行与 0 高度元素：不产生 NaN，光标不假推进', () => {
    const t = tpl([
      tableEl([{ height: 0 }, { height: 100 }]),
      el('zero', 500, 0),
      el('after', 501, 50),
    ])
    const m = measureTable([0, 100], 0)
    withFree(m, [['zero', 0], ['after', 50]])
    const pages = paginate(t, m)
    for (const p of pages) {
      for (const s of p.sections as any[]) {
        if (s.renderTop !== undefined) expect(Number.isFinite(s.renderTop)).toBe(true)
      }
    }
    // zero/after 归入跟随区：整组随 flow-group 出页，成员齐全不丢件
    const follow = (pages.flatMap(p => p.sections) as any[]).find(s => s.type === 'flow-group')
    expect(follow.followElementIds).toEqual(expect.arrayContaining(['zero', 'after']))
  })

  it('静态 summary 行按普通行参与切片（动态汇总行才抽离为页尾）', () => {
    // body 5 行 × 54 = 270；静态 summary 9 作普通行：270+9 > 275 → 第 6 行进新页
    const t = tpl([tableEl([
      ...Array(5).fill({ height: 54 }),
      { height: 9, type: 'summary' },
    ])])
    const m = measureTable([...Array(5).fill(54), 9], 0)
    const pages = paginate(t, m)
    expect(pages).toHaveLength(2)
    const last = pages[1].sections[0] as any
    expect([last.startRow, last.endRow]).toEqual([5, 6])
    expect(last.renderTop).toBe(0)
  })
})

describe('极限：预算边界与 keepWithNext', () => {
  it('元素高度恰等于剩余预算 → 恰好放下（≤ 语义），再加 0.1 即换页', () => {
    const exact = tpl([el('fill', 0, 270), el('edge', 270, 5)])
    const p1 = paginate(exact, new Map([
      ['fill', { id: 'fill', measuredHeight: 270 }],
      ['edge', { id: 'edge', measuredHeight: 5 }],
    ]))
    expect(p1).toHaveLength(1)

    const over = tpl([el('fill', 0, 270), el('edge', 270, 5.1)])
    const p2 = paginate(over, new Map([
      ['fill', { id: 'fill', measuredHeight: 270 }],
      ['edge', { id: 'edge', measuredHeight: 5.1 }],
    ]))
    expect(p2).toHaveLength(2)
    expect((p2[1].sections[0] as any).renderTop).toBe(0)
  })

  it('keepWithNext 两元素合计超整页 → 降级各自分页，不死循环', () => {
    const t = tpl([
      el('x', 0, 200, { pagination: { pageable: true, keepWithNext: true } }),
      el('y', 200, 150),
    ])
    const m = new Map([
      ['x', { id: 'x', measuredHeight: 200 }],
      ['y', { id: 'y', measuredHeight: 150 }],
    ])
    const pages = paginate(t, m)
    expect(pages).toHaveLength(2)
    expect(pages[0].sections[0].elementId).toBe('x')
    expect((pages[1].sections[0] as any).renderTop).toBe(0)
  })

  it('keepWithNext 正常保持：下一元素放不下时当前元素一并移页', () => {
    const t = tpl([
      el('filler', 0, 200),
      el('x', 200, 50, { pagination: { pageable: true, keepWithNext: true } }),
      el('y', 250, 50),
    ])
    const m = new Map([
      ['filler', { id: 'filler', measuredHeight: 200 }],
      ['x', { id: 'x', measuredHeight: 50 }],
      ['y', { id: 'y', measuredHeight: 50 }],
    ])
    const pages = paginate(t, m)
    // filler(200)+x(50) 后剩 25，y 放不下 → x 弹回与 y 同页
    expect(pages[0].sections.map(s => s.elementId)).toEqual(['filler'])
    const second = pages[1].sections as any[]
    expect(second.map(s => s.elementId)).toEqual(['x', 'y'])
    expect(second[0].renderTop).toBe(0)
    expect(second[1].renderTop).toBe(50) // y 贴 x 底部，不叠压
  })

  it('隐式堆叠簇换页：并集只扣一次，成员贴流式光标保持相对偏移', () => {
    // rect top1 h38.1 与 text top6.8 h5.3 纵向相交 → 隐式簇，并集 = 43.1−1 → 高 42.1? 按 bottom-top：(6.8+5.3)=12.1 vs 39.1 → 并集 38.1
    const t = tpl([
      el('filler', 0, 250),
      el('rect', 300, 38.1),
      el('text', 305.8, 5.3),
    ])
    const m = new Map([
      ['filler', { id: 'filler', measuredHeight: 250 }],
      ['rect', { id: 'rect', measuredHeight: 38.1 }],
      ['text', { id: 'text', measuredHeight: 5.3 }],
    ])
    const pages = paginate(t, m)
    const second = pages[1].sections as any[]
    // 簇锚点=rect（top 最小）贴光标 250→新页 0；text 相对偏移 5.8
    const topOf = (id: string) => second.find(s => s.elementId === id)!.renderTop
    expect(topOf('rect')).toBe(0)
    expect(topOf('text') - topOf('rect')).toBeCloseTo(5.8, 6)
  })
})
