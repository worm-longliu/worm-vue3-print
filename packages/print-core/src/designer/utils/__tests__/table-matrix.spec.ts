// web/src/components/print/__tests__/table-matrix.spec.ts
import { describe, it, expect } from 'vitest'
import type { TableRow, TableRowType } from '../../types.js'
import {
  createDefaultTable, createCell,
  normalizeSelection, canMergeReason, mergeCells, splitCells,
  insertRow, deleteRow, insertCol, deleteCol, setRowType, applyBorderPreset,
  syncTableElementSize, resolveCellBorderCss, GHOST_BORDER_CSS,
  clampResizedColumnWidth, MIN_COL_WIDTH_MM,
} from '../table-matrix.js'

/** 构造 rows×cols 全 header 矩阵 */
function makeRows(r: number, c: number): TableRow[] {
  return Array.from({ length: r }, (_, ri) => ({
    id: `row-${ri}`,
    type: 'header' as const,
    height: 8,
    cells: Array.from({ length: c }, () => createCell()),
  }))
}

/** 构造指定类型的行 */
function makeTypedRows(types: TableRowType[], c: number): TableRow[] {
  return types.map((type, ri) => ({
    id: `row-${ri}`,
    type,
    height: 8,
    cells: Array.from({ length: c }, () => createCell()),
  }))
}

describe('createDefaultTable', () => {
  it('默认 3 列 4 行：标题/数据/小计/汇总，标题行 repeatOnPage', () => {
    const { rows, colWidths } = createDefaultTable()
    expect(colWidths).toHaveLength(3)
    expect(rows.map(r => r.type)).toEqual(['header', 'data', 'subtotal', 'summary'])
    expect(rows[0]!.repeatOnPage).toBe(true)
    expect(rows[0]!.cells.every(c => c.borders?.top)).toBe(true)
  })
})

describe('合并/拆分', () => {
  it('合并 2x2：主格 span，其余 merged', () => {
    const rows = makeRows(3, 3)
    expect(canMergeReason(rows, { r1: 0, c1: 0, r2: 1, c2: 1 })).toBeNull()
    mergeCells(rows, { r1: 0, c1: 0, r2: 1, c2: 1 })
    expect(rows[0]!.cells[0]!.rowspan).toBe(2)
    expect(rows[0]!.cells[0]!.colspan).toBe(2)
    expect(rows[0]!.cells[1]!.merged).toBe(true)
    expect(rows[1]!.cells[0]!.merged).toBe(true)
    expect(rows[1]!.cells[1]!.merged).toBe(true)
  })

  it('合并时非空内容用空格拼接', () => {
    const rows = makeRows(1, 2)
    rows[0]!.cells[0]!.formatter = 'A'
    rows[0]!.cells[1]!.formatter = 'B'
    mergeCells(rows, { r1: 0, c1: 0, r2: 0, c2: 1 })
    expect(rows[0]!.cells[0]!.formatter).toBe('A B')
  })

  it('拒绝跨行类型合并', () => {
    const rows = makeTypedRows(['summary', 'header'], 2)
    // 两行类型不同（summary vs header），合并应该被拒绝
    expect(canMergeReason(rows, { r1: 0, c1: 0, r2: 1, c2: 0 })).toContain('类型')
  })

  it('拒绝与已有合并区部分重叠（normalizeSelection 扩展后等值判断）', () => {
    const rows = makeRows(3, 3)
    mergeCells(rows, { r1: 0, c1: 0, r2: 1, c2: 1 })
    // 选区 (1,1)-(2,2) 与合并区部分重叠，normalize 后应扩展为 (0,0)-(2,2)
    const rect = normalizeSelection(rows, { r: 1, c: 1 }, { r: 2, c: 2 })
    expect(rect).toEqual({ r1: 0, c1: 0, r2: 2, c2: 2 })
  })

  it('拆分恢复所有占位格', () => {
    const rows = makeRows(2, 2)
    mergeCells(rows, { r1: 0, c1: 0, r2: 1, c2: 1 })
    splitCells(rows, { r1: 0, c1: 0, r2: 1, c2: 1 })
    expect(rows.flatMap(r => r.cells).every(c => !c.merged && (c.rowspan ?? 1) === 1)).toBe(true)
  })
})

describe('插入/删除行', () => {
  it('在纵向合并中间插入行：主格 rowspan+1，新行格 merged', () => {
    const rows = makeRows(2, 2)
    mergeCells(rows, { r1: 0, c1: 0, r2: 1, c2: 0 })
    insertRow(rows, 1, 'above') // 在第 1 行上方插入 → 落在合并区内部
    expect(rows).toHaveLength(3)
    expect(rows[0]!.cells[0]!.rowspan).toBe(3)
    expect(rows[1]!.cells[0]!.merged).toBe(true)
    expect(rows[1]!.cells[1]!.merged).toBeFalsy()
  })

  it('删除含主格的行：主格移交下一行', () => {
    const rows = makeRows(3, 2)
    rows[0]!.cells[0]!.formatter = 'X'
    mergeCells(rows, { r1: 0, c1: 0, r2: 1, c2: 0 })
    expect(deleteRow(rows, 0)).toBeNull()
    expect(rows).toHaveLength(2)
    expect(rows[0]!.cells[0]!.formatter).toBe('X')
    expect(rows[0]!.cells[0]!.merged).toBeFalsy()
    expect(rows[0]!.cells[0]!.rowspan ?? 1).toBe(1)
  })

  it('拒绝删除最后一行', () => {
    const rows = makeRows(1, 2)
    expect(deleteRow(rows, 0)).toContain('最后')
  })
})

describe('插入/删除列', () => {
  it('插入列同步 colWidths，横向合并中间插入 → 主格 colspan+1', () => {
    const rows = makeRows(2, 2)
    const colWidths = [30, 30]
    mergeCells(rows, { r1: 0, c1: 0, r2: 0, c2: 1 })
    insertCol(rows, colWidths, 1, 'left')
    expect(colWidths).toEqual([30, 30, 30])
    expect(rows[0]!.cells[0]!.colspan).toBe(3)
    expect(rows[1]!.cells).toHaveLength(3)
  })

  it('删除含主格的列：主格移交右侧列', () => {
    const rows = makeRows(1, 3)
    const colWidths = [30, 30, 30]
    rows[0]!.cells[0]!.formatter = 'X'
    mergeCells(rows, { r1: 0, c1: 0, r2: 0, c2: 1 })
    expect(deleteCol(rows, colWidths, 0)).toBeNull()
    expect(colWidths).toEqual([30, 30])
    expect(rows[0]!.cells[0]!.formatter).toBe('X')
  })
})

describe('行类型约束 setRowType', () => {
  it('data 行最多一行', () => {
    const rows = makeTypedRows(['header', 'data', 'header'], 2)
    // 尝试设置第 2 行为 data 应该失败
    expect(setRowType(rows, 2, 'data')).toContain('数据行')
  })
  it('header 必须从顶部连续', () => {
    const rows = makeTypedRows(['summary', 'summary', 'summary'], 2)
    // 尝试设置第 2 行为 header 应该失败（因为第 0 行不是 header）
    expect(setRowType(rows, 2, 'header')).toContain('连续')
  })
  it('summary 必须在 data 行之后', () => {
    const rows = makeTypedRows(['header', 'header', 'header'], 2)
    // 尝试设置第 2 行为 summary 应该失败（因为没有 data 行）
    expect(setRowType(rows, 2, 'summary')).toContain('数据行')
  })
  it('subtotal 必须在 data 行之后', () => {
    const rows = makeTypedRows(['header', 'header', 'header'], 2)
    expect(setRowType(rows, 2, 'subtotal')).toContain('数据行')
  })
  it('subtotal 位于 data 之后可正常设置', () => {
    const rows = makeTypedRows(['header', 'data', 'header'], 2)
    expect(setRowType(rows, 2, 'subtotal')).toBeNull()
    expect(rows[2]!.type).toBe('subtotal')
  })
  it('subtotal 上方已有汇总行时拒绝（小计必须在汇总前）', () => {
    const rows = makeTypedRows(['header', 'data', 'summary', 'header'], 2)
    // 把第 3 行（标题）改为小计，其上方（第 2 行）有汇总 → 拒绝
    expect(setRowType(rows, 3, 'subtotal')).toContain('小计行必须位于汇总行之前')
  })
  it('汇总行上方插入行并改为小计：合法（小计前移至汇总上方）', () => {
    // 模拟用户在汇总行上方插入一行（插入行默认继承汇总类型），再把该行改为小计
    const rows = makeTypedRows(['header', 'data', 'summary', 'summary'], 2)
    // 把第 2 行（上方汇总）改为小计 → 目标状态 小计在前、汇总在后，合法
    expect(setRowType(rows, 2, 'subtotal')).toBeNull()
    expect(rows.map(r => r.type)).toEqual(['header', 'data', 'subtotal', 'summary'])
  })
  it('summary 之后已有小计行时拒绝（汇总必须在最后）', () => {
    const rows = makeTypedRows(['header', 'data', 'subtotal', 'subtotal'], 2)
    // 把第 2 行（小计）改为汇总，其后方仍有小计 → 拒绝
    expect(setRowType(rows, 2, 'summary')).toContain('汇总行必须位于小计行之后')
  })
  it('小计与汇总并存：小计在前、汇总在后合法', () => {
    const rows = makeTypedRows(['header', 'data', 'subtotal', 'subtotal'], 2)
    // 最后一个小计改为汇总：小计在前、汇总在后
    expect(setRowType(rows, 3, 'summary')).toBeNull()
    expect(rows.map(r => r.type)).toEqual(['header', 'data', 'subtotal', 'summary'])
  })
})

describe('边框预设 applyBorderPreset', () => {
  const border = { width: 0.75, style: 'solid' as const, color: '#333' }
  it('inner 只写内部边', () => {
    const rows = makeRows(2, 2)
    rows.forEach(r => r.cells.forEach(c => { delete c.borders }))
    applyBorderPreset(rows, { r1: 0, c1: 0, r2: 1, c2: 1 }, 'inner', border)
    expect(rows[0]!.cells[0]!.borders?.bottom).toEqual(border)
    expect(rows[0]!.cells[0]!.borders?.right).toEqual(border)
    expect(rows[0]!.cells[0]!.borders?.top).toBeUndefined()
    expect(rows[0]!.cells[0]!.borders?.left).toBeUndefined()
  })
  it('none 清空四边', () => {
    const rows = makeRows(1, 1)
    applyBorderPreset(rows, { r1: 0, c1: 0, r2: 0, c2: 0 }, 'none', border)
    expect(rows[0]!.cells[0]!.borders).toBeUndefined()
  })
})

describe('虚拟边框 resolveCellBorderCss', () => {
  it('有真实边框（style 非 none）返回原始 width/style/color', () => {
    const b = { width: 0.75, style: 'dashed' as const, color: '#333' }
    expect(resolveCellBorderCss(b, { designMode: true })).toBe('0.75pt dashed #333')
  })
  it('style=none 且设计态 → 返回虚拟虚线', () => {
    const b = { width: 0.75, style: 'none' as const, color: '#333' }
    expect(resolveCellBorderCss(b, { designMode: true })).toBe(GHOST_BORDER_CSS)
  })
  it('无边框数据且设计态 → 返回虚拟虚线', () => {
    expect(resolveCellBorderCss(undefined, { designMode: true })).toBe(GHOST_BORDER_CSS)
  })
  it('无边框数据但非设计态（预览/打印）→ none', () => {
    expect(resolveCellBorderCss(undefined, { designMode: false })).toBe('none')
    expect(resolveCellBorderCss(undefined)).toBe('none')
  })
  it('设计态但开关关闭 → none', () => {
    expect(resolveCellBorderCss(undefined, { designMode: true, showGhostBorder: false })).toBe('none')
  })
  it('真实边框在预览态下保持原样', () => {
    const b = { width: 0.75, style: 'solid' as const, color: '#333' }
    expect(resolveCellBorderCss(b, { designMode: false })).toBe('0.75pt solid #333')
  })
})

describe('syncTableElementSize 表格尺寸派生', () => {
  it('width/height 直接取列宽和/行高和（mm），不做 pt 放大', () => {
    const options = {
      left: 0, top: 0, width: 999, height: 999,
      tableColWidths: [40, 60],
      tableRows: [
        { id: 'r1', type: 'header' as const, height: 8, cells: [] },
        { id: 'r2', type: 'data' as const, height: 12, cells: [] },
      ],
    }
    syncTableElementSize(options)
    expect(options.width).toBe(100)
    expect(options.height).toBe(20)
  })

  it('列宽/行高为小数时四舍五入到 0.01', () => {
    const options = {
      left: 0, top: 0, width: 0, height: 0,
      tableColWidths: [33.333, 66.667],
      tableRows: [{ id: 'r1', type: 'data' as const, height: 7.555, cells: [] }],
    }
    syncTableElementSize(options)
    expect(options.width).toBe(100)
    expect(options.height).toBe(7.56)
  })

  it('空表格不报错且尺寸归零', () => {
    const options = { left: 0, top: 0, width: 50, height: 50 }
    syncTableElementSize(options)
    expect(options.width).toBe(0)
    expect(options.height).toBe(0)
  })
})

describe('clampResizedColumnWidth 列宽拖拽钳制', () => {
  it('按增量扩大目标列宽', () => {
    expect(clampResizedColumnWidth([40, 40, 40], 1, 50, 200)).toBe(50)
  })

  it('收缩目标列宽', () => {
    expect(clampResizedColumnWidth([40, 40, 40], 1, 30, 200)).toBe(30)
  })

  it('不低于最小列宽 MIN_COL_WIDTH_MM', () => {
    expect(clampResizedColumnWidth([40, 40, 40], 1, 1, 200)).toBe(MIN_COL_WIDTH_MM)
  })

  it('总宽不超过 maxTableWidth：其余列和 80 时上限为 40', () => {
    expect(clampResizedColumnWidth([40, 40, 40], 1, 80, 120)).toBe(40)
  })

  it('maxTableWidth 为 Infinity 时只受最小列宽约束', () => {
    expect(clampResizedColumnWidth([40, 40, 40], 1, 200, Infinity)).toBe(200)
  })

  it('结果保留 0.1mm 精度', () => {
    expect(clampResizedColumnWidth([40, 40, 40], 1, 47.26, 200)).toBe(47.3)
    expect(clampResizedColumnWidth([40, 40, 40], 1, 47.24, 200)).toBe(47.2)
  })
})
