// print-core/src/render/row-merge.test.ts
// 数据行按值纵向合并：相邻同值归并、空值/页码列不参与、多列独立

import { describe, it, expect } from 'vitest'
import { mergeDataRowsByValue } from './row-merge.js'
import type { RenderRow } from './types.js'

const rc = (content: string, extra: Record<string, any> = {}) => ({
  content, rowspan: 1, colspan: 1, merged: false, ...extra,
})
const rr = (cells: any[]): RenderRow => ({ type: 'data', height: 8, cells }) as unknown as RenderRow

describe('mergeDataRowsByValue 按值归并', () => {
  it('相邻同值成段：首格 rowspan，覆盖格 merged 且 content 清空', () => {
    const rows = [rr([rc('A01'), rc('x')]), rr([rc('A01'), rc('y')]), rr([rc('B02'), rc('z')])]
    mergeDataRowsByValue(rows, [0])
    expect(rows[0]!.cells[0]!.rowspan).toBe(2)
    expect(rows[0]!.cells[0]!.merged).toBe(false)
    expect(rows[0]!.cells[0]!.content).toBe('A01')
    expect(rows[1]!.cells[0]!.merged).toBe(true)
    expect(rows[1]!.cells[0]!.rowspan).toBe(1)
    expect(rows[1]!.cells[0]!.content).toBe('')
    expect(rows[2]!.cells[0]!.rowspan).toBe(1)
    expect(rows[2]!.cells[0]!.merged).toBe(false)
  })

  it('段间不同值断开：A/B/A 不合并', () => {
    const rows = [rr([rc('A')]), rr([rc('B')]), rr([rc('A')])]
    mergeDataRowsByValue(rows, [0])
    expect(rows.every(r => r.cells[0]!.rowspan === 1 && !r.cells[0]!.merged)).toBe(true)
  })

  it('空值不参与合并：相邻空串保持逐行', () => {
    const rows = [rr([rc('')]), rr([rc('')]), rr([rc('A')]), rr([rc('A')])]
    mergeDataRowsByValue(rows, [0])
    expect(rows[0]!.cells[0]!.merged).toBe(false)
    expect(rows[1]!.cells[0]!.merged).toBe(false)
    expect(rows[2]!.cells[0]!.rowspan).toBe(2)
  })

  it('页码列整列跳过：rawFormatter 存在时即使文本相同也不合并', () => {
    // 含页码的表达式在绑定阶段保留原文，两行 content 同为表达式字符串，比较文本会误判同值
    const rows = [
      rr([rc('{pageIndex}', { rawFormatter: '{pageIndex}' })]),
      rr([rc('{pageIndex}', { rawFormatter: '{pageIndex}' })]),
    ]
    mergeDataRowsByValue(rows, [0])
    expect(rows[0]!.cells[0]!.rowspan).toBe(1)
    expect(rows[1]!.cells[0]!.merged).toBe(false)
  })

  it('多列独立归并：各列按自己的值成段', () => {
    const rows = [
      rr([rc('A'), rc('X')]),
      rr([rc('A'), rc('Y')]),
      rr([rc('B'), rc('Y')]),
    ]
    mergeDataRowsByValue(rows, [0, 1])
    expect(rows[0]!.cells[0]!.rowspan).toBe(2)
    expect(rows[1]!.cells[0]!.merged).toBe(true)
    expect(rows[1]!.cells[1]!.rowspan).toBe(2)
    expect(rows[2]!.cells[1]!.merged).toBe(true)
    // 第二列合并段与第一列相互独立：A 段内 X/Y 不同，X/Y 段内 A/B 不同
    expect(rows[0]!.cells[1]!.merged).toBe(false)
    expect(rows[2]!.cells[0]!.merged).toBe(false)
  })

  it('未声明的列不参与', () => {
    const rows = [rr([rc('A'), rc('X')]), rr([rc('A'), rc('X')])]
    mergeDataRowsByValue(rows, [0])
    expect(rows[0]!.cells[1]!.merged).toBe(false)
    expect(rows[1]!.cells[1]!.content).toBe('X')
  })

  it('单行或空列索引直接返回', () => {
    const rows = [rr([rc('A')])]
    mergeDataRowsByValue(rows, [0])
    expect(rows[0]!.cells[0]!.rowspan).toBe(1)
  })
})
