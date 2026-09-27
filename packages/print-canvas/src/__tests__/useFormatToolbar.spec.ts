import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useFormatToolbar, MIXED } from '../composables/useFormatToolbar'
import type { RuntimeElement, TableSelection, TableCell } from '@worm-vue3-print/core/designer'

function el(id: string, type: string, options: Record<string, unknown> = {}): RuntimeElement {
  return {
    id,
    zone: 'content',
    printElementType: { type, title: type },
    options: { left: 0, top: 0, width: 20, height: 10, ...options },
  } as unknown as RuntimeElement
}

function cell(extra: Partial<TableCell> = {}): TableCell {
  return { ...extra } as TableCell
}

function tableEl(rows: TableCell[][]): RuntimeElement {
  return el('t1', 'table', {
    tableColWidths: rows[0]!.map(() => 30),
    tableRows: rows.map((cs, r) => ({
      id: `r${r}`, type: 'data', height: 8,
      cells: cs.map((c, i) => ({ ...c, id: `r${r}c${i}` })),
    })),
  })
}

function setup(elements: RuntimeElement[], selectedIds: string[] = [], selection: TableSelection | null = null) {
  const recordHistory = vi.fn()
  const toolbar = useFormatToolbar({
    elements: ref(elements),
    selectedIds: ref(new Set(selectedIds)),
    tableSelection: ref(selection),
    recordHistory,
  })
  return { toolbar, recordHistory }
}

describe('useFormatToolbar 上下文派生', () => {
  it('无选中元素且无单元格选区时 context 为 none', () => {
    const { toolbar } = setup([el('a', 'text')])
    expect(toolbar.context.value).toBe('none')
  })

  it('存在单元格选区时 context 为 cells（优先于元素）', () => {
    const { toolbar } = setup([tableEl([[cell({})]])], ['t1'],
      { elementId: 't1', r1: 0, c1: 0, r2: 0, c2: 0 })
    expect(toolbar.context.value).toBe('cells')
  })

  it('仅选中元素时 context 为 elements', () => {
    const { toolbar } = setup([el('a', 'text')], ['a'])
    expect(toolbar.context.value).toBe('elements')
  })

  it('全部为文本类元素时 fontEditable 为 true，混入图片为 false', () => {
    const a = setup([el('a', 'text'), el('b', 'longText')], ['a', 'b'])
    expect(a.toolbar.fontEditable.value).toBe(true)
    const b = setup([el('a', 'text'), el('img', 'image')], ['a', 'img'])
    expect(b.toolbar.fontEditable.value).toBe(false)
  })
})

describe('useFormatToolbar 元素批量写入', () => {
  it('applyStyle 把字体/字号/对齐/颜色写入选中元素并记一次历史', () => {
    const e1 = el('a', 'text')
    const e2 = el('b', 'longText')
    const { toolbar, recordHistory } = setup([e1, e2], ['a', 'b'])
    toolbar.applyStyle({ fontFamily: '宋体', fontSize: 14, textAlign: 'center', verticalAlign: 'middle', color: '#ff0000' })
    for (const e of [e1, e2]) {
      expect(e.options.fontFamily).toBe('宋体')
      expect(e.options.fontSize).toBe(14)
      expect(e.options.textAlign).toBe('center')
      expect(e.options.verticalAlign).toBe('middle')
      expect(e.options.color).toBe('#ff0000')
    }
    expect(recordHistory).toHaveBeenCalledTimes(1)
  })

  it('背景色写入全部选中元素，字体类字段只写入文本类元素', () => {
    const t = el('a', 'text')
    const img = el('img', 'image')
    const { toolbar } = setup([t, img], ['a', 'img'])
    toolbar.applyStyle({ backgroundColor: '#eee', fontSize: 12 })
    expect(t.options.backgroundColor).toBe('#eee')
    expect(img.options.backgroundColor).toBe('#eee')
    expect(t.options.fontSize).toBe(12)
    expect(img.options.fontSize).toBeUndefined()
  })

  it('锁定元素不写入', () => {
    const t = el('a', 'text', { locked: true })
    const { toolbar, recordHistory } = setup([t], ['a'])
    toolbar.applyStyle({ fontSize: 16 })
    expect(t.options.fontSize).toBeUndefined()
    expect(recordHistory).not.toHaveBeenCalled()
  })

  it('无写入目标时不记历史', () => {
    const { toolbar, recordHistory } = setup([el('a', 'text')])
    toolbar.applyStyle({ fontSize: 16 })
    expect(recordHistory).not.toHaveBeenCalled()
  })
})

describe('useFormatToolbar 混合值检测', () => {
  it('字号不一致时 values.fontSize 为 MIXED，一致时返回该值', () => {
    const a = setup([el('a', 'text', { fontSize: 12 }), el('b', 'text', { fontSize: 14 })], ['a', 'b'])
    expect(a.toolbar.values.value.fontSize).toBe(MIXED)
    const b = setup([el('a', 'text', { fontSize: 12 }), el('b', 'text', { fontSize: 12 })], ['a', 'b'])
    expect(b.toolbar.values.value.fontSize).toBe(12)
  })

  it('单选未设置字段时返回 undefined 而非 MIXED', () => {
    const { toolbar } = setup([el('a', 'text')], ['a'])
    expect(toolbar.values.value.fontFamily).toBeUndefined()
  })
})

describe('useFormatToolbar 加粗与装饰线开关', () => {
  it('全部加粗时 toggleBold 清除为 normal', () => {
    const a = el('a', 'text', { fontWeight: 'bold' })
    const b = el('b', 'text', { fontWeight: 'bold' })
    const { toolbar } = setup([a, b], ['a', 'b'])
    toolbar.toggleBold()
    expect(a.options.fontWeight).toBe('normal')
    expect(b.options.fontWeight).toBe('normal')
  })

  it('部分加粗（混合）时 toggleBold 统一加粗', () => {
    const a = el('a', 'text', { fontWeight: 'bold' })
    const b = el('b', 'text')
    const { toolbar } = setup([a, b], ['a', 'b'])
    expect(toolbar.values.value.bold).toBe(MIXED)
    toolbar.toggleBold()
    expect(a.options.fontWeight).toBe('bold')
    expect(b.options.fontWeight).toBe('bold')
  })

  it('下划线与删除线以词组共存，再次切换只移除对应词', () => {
    const a = el('a', 'text')
    const { toolbar } = setup([a], ['a'])
    toolbar.toggleUnderline()
    toolbar.toggleStrike()
    expect(a.options.textDecoration).toContain('underline')
    expect(a.options.textDecoration).toContain('line-through')
    toolbar.toggleUnderline()
    expect(a.options.textDecoration).not.toContain('underline')
    expect(a.options.textDecoration).toContain('line-through')
  })
})

describe('useFormatToolbar 单元格上下文', () => {
  const sel = { elementId: 't1', r1: 0, c1: 0, r2: 1, c2: 1 }

  it('applyStyle 写入选区内单元格并跳过被合并占位格', () => {
    const t = tableEl([[cell({}), cell({ merged: true })], [cell({}), cell({})]])
    const { toolbar, recordHistory } = setup([t], ['t1'], sel)
    toolbar.applyStyle({ fontFamily: '黑体', fontSize: 9, textAlign: 'right', color: '#111' })
    const rows = t.options.tableRows!
    expect(rows[0]!.cells[0]!.fontFamily).toBe('黑体')
    expect(rows[1]!.cells[1]!.fontSize).toBe(9)
    expect(rows[1]!.cells[0]!.align).toBe('right')
    expect(rows[0]!.cells[1]!.fontFamily).toBeUndefined()
    expect(recordHistory).toHaveBeenCalledTimes(1)
  })

  it('单元格 toggleBold 在 bold 与未设置之间切换', () => {
    const t = tableEl([[cell({}), cell({})]])
    const { toolbar } = setup([t], ['t1'], { ...sel, r2: 0, c2: 1 })
    toolbar.toggleBold()
    expect(t.options.tableRows![0]!.cells[0]!.fontWeight).toBe('bold')
    toolbar.toggleBold()
    expect(t.options.tableRows![0]!.cells[0]!.fontWeight).toBeUndefined()
  })

  it('单元格上下文字体值不一致时为 MIXED', () => {
    const t = tableEl([[cell({ fontSize: 9 }), cell({ fontSize: 12 })]])
    const { toolbar } = setup([t], ['t1'], { ...sel, r2: 0, c2: 1 })
    expect(toolbar.values.value.fontSize).toBe(MIXED)
  })
})

describe('useFormatToolbar 边框', () => {
  it('元素「无边框」置 borderWidth 为 0，「所有边框」写入线型参数', () => {
    const a = el('a', 'text', { borderWidth: 1 })
    const { toolbar } = setup([a], ['a'])
    toolbar.applyElementBorder('none', { width: 1, style: 'solid', color: '#000' })
    expect(a.options.borderWidth).toBe(0)
    toolbar.applyElementBorder('all', { width: 2, style: 'dashed', color: '#333' })
    expect(a.options.borderWidth).toBe(2)
    expect(a.options.borderStyle).toBe('dashed')
    expect(a.options.borderColor).toBe('#333')
  })

  it('单元格边框预设委托矩阵工具写入四边', () => {
    const t = tableEl([[cell({}), cell({})], [cell({}), cell({})]])
    const { toolbar, recordHistory } = setup([t], ['t1'], { elementId: 't1', r1: 0, c1: 0, r2: 1, c2: 1 })
    toolbar.applyCellBorderPreset('outer', { width: 0.75, style: 'solid', color: '#000' })
    const rows = t.options.tableRows!
    expect(rows[0]!.cells[0]!.borders?.top).toBeTruthy()
    expect(rows[0]!.cells[0]!.borders?.left).toBeTruthy()
    expect(rows[1]!.cells[1]!.borders?.bottom).toBeTruthy()
    expect(rows[1]!.cells[1]!.borders?.right).toBeTruthy()
    expect(recordHistory).toHaveBeenCalledTimes(1)
  })

  it('单元格单边开关：开启写入对应边，关闭删除对应边', () => {
    const t = tableEl([[cell({})]])
    const { toolbar } = setup([t], ['t1'], { elementId: 't1', r1: 0, c1: 0, r2: 0, c2: 0 })
    const b = { width: 1, style: 'solid' as const, color: '#000' }
    toolbar.applyCellBorderEdges(['top', 'right'], b, true)
    const c = t.options.tableRows![0]!.cells[0]!
    expect(c.borders?.top).toBeTruthy()
    expect(c.borders?.right).toBeTruthy()
    toolbar.applyCellBorderEdges(['top'], b, false)
    expect(c.borders?.top).toBeUndefined()
    expect(c.borders?.right).toBeTruthy()
  })
})

describe('useFormatToolbar 单边状态与切换（WPS 式菜单）', () => {
  const sel = { elementId: 't1', r1: 0, c1: 0, r2: 0, c2: 1 }
  const b = { width: 1, style: 'solid' as const, color: '#000' }

  it('元素上下文 cellEdges 为 null', () => {
    const { toolbar } = setup([el('a', 'text')], ['a'])
    expect(toolbar.cellEdges.value).toBeNull()
  })

  it('选区为空时 cellEdges 为 null（空选区不得判成全激活）', () => {
    const t = tableEl([[cell({ merged: true }), cell({ merged: true })]])
    const { toolbar } = setup([t], ['t1'], sel)
    expect(toolbar.cellEdges.value).toBeNull()
  })

  it('未设置边框时四边均 false', () => {
    const t = tableEl([[cell({}), cell({})]])
    const { toolbar } = setup([t], ['t1'], sel)
    expect(toolbar.cellEdges.value).toEqual({ top: false, right: false, bottom: false, left: false })
  })

  it('部分单元格有上边框时为 MIXED', () => {
    const t = tableEl([[cell({ borders: { top: b } }), cell({})]])
    const { toolbar } = setup([t], ['t1'], sel)
    expect(toolbar.cellEdges.value!.top).toBe(MIXED)
    expect(toolbar.cellEdges.value!.left).toBe(false)
  })

  it('toggleCellEdge 无到有写入、全有再点清除', () => {
    const t = tableEl([[cell({}), cell({})]])
    const { toolbar } = setup([t], ['t1'], sel)
    toolbar.toggleCellEdge('top', b)
    expect(toolbar.cellEdges.value!.top).toBe(true)
    toolbar.toggleCellEdge('top', b)
    expect(toolbar.cellEdges.value!.top).toBe(false)
    expect(t.options.tableRows![0]!.cells[0]!.borders?.top).toBeUndefined()
  })
})

describe('useFormatToolbar 元素分边边框', () => {
  const spec = { width: 2, style: 'dashed', color: '#f00' }

  it('elementEdges 从选中元素 options.borders 派生；未设置四边 false', () => {
    const { toolbar } = setup([el('a', 'text')], ['a'])
    expect(toolbar.elementEdges.value).toEqual({ top: false, right: false, bottom: false, left: false })
    toolbar.toggleElementEdge('top', spec)
    expect(toolbar.elementEdges.value!.top).toBe(true)
  })

  it('toggleElementEdge 无到有写入该边、全有再点移除该边，整圈字段不受影响', () => {
    const a = el('a', 'text', { borderWidth: 1 })
    const { toolbar, recordHistory } = setup([a], ['a'])
    toolbar.toggleElementEdge('top', spec)
    expect(a.options.borders?.top).toEqual({ width: 2, style: 'dashed', color: '#f00' })
    expect(a.options.borderWidth).toBe(1)
    toolbar.toggleElementEdge('top', spec)
    expect(a.options.borders?.top).toBeUndefined()
    expect(recordHistory).toHaveBeenCalledTimes(2)
  })

  it('部分元素有该边时 elementEdges 为 MIXED，再点补齐全部', () => {
    const a = el('a', 'text', { borders: { top: { width: 1 } } })
    const bEl = el('b', 'text')
    const { toolbar } = setup([a, bEl], ['a', 'b'])
    expect(toolbar.elementEdges.value!.top).toBe(MIXED)
    toolbar.toggleElementEdge('top', spec)
    expect(toolbar.elementEdges.value!.top).toBe(true)
  })

  it('「所有边框」写整圈并清分边残留；「无边框」同时清整圈与分边', () => {
    const a = el('a', 'text', { borders: { top: { width: 1 } } })
    const { toolbar } = setup([a], ['a'])
    toolbar.applyElementBorder('all', spec)
    expect(a.options.borderWidth).toBe(2)
    expect(a.options.borders).toBeUndefined()
    a.options.borders = { bottom: { width: 3 } }
    toolbar.applyElementBorder('none', spec)
    expect(a.options.borderWidth).toBe(0)
    expect(a.options.borders).toBeUndefined()
  })

  it('非元素上下文 elementEdges 为 null；锁定元素不参与', () => {
    const { toolbar } = setup([el('a', 'text', { locked: true })], ['a'])
    toolbar.toggleElementEdge('top', spec)
    expect(toolbar.elementEdges.value).toBeNull()
  })
})
