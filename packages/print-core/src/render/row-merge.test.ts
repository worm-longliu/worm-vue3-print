// print-core/src/render/row-merge.test.ts
// 数据行按值纵向合并：归并覆盖层按「渲染区间」计算——同值成段、跨页断开、空值/页码列不参与

import { describe, it, expect } from 'vitest'
import { buildMergeOverlay } from './row-merge.js'
import type { RenderRow } from './types.js'

const rc = (content: string, extra: Record<string, any> = {}) => ({
  content, rowspan: 1, colspan: 1, merged: false, mergeSameValue: true, ...extra,
})
const rr = (cells: any[], type = 'data'): RenderRow => ({ type, height: 8, cells }) as unknown as RenderRow

/** 某列在区间内的有效跨度（无覆盖层即渲染行自带 rowspan） */
function spanOf(rows: RenderRow[], overlay: ReturnType<typeof buildMergeOverlay>, r: number, c: number): number {
  return overlay?.rowspan.get(`${r}:${c}`) ?? rows[r]!.cells[c]!.rowspan ?? 1
}
const isPlaceholder = (overlay: ReturnType<typeof buildMergeOverlay>, r: number, c: number): boolean =>
  overlay?.merged.has(`${r}:${c}`) ?? false

describe('buildMergeOverlay 按值归并', () => {
  it('相邻同值成段：首格 span=段长，其余格为占位', () => {
    const rows = [rr([rc('A01'), rc('x')]), rr([rc('A01'), rc('y')]), rr([rc('B02'), rc('z')])]
    const o = buildMergeOverlay(rows, 0, rows.length)
    expect(spanOf(rows, o, 0, 0)).toBe(2)
    expect(isPlaceholder(o, 1, 0)).toBe(true)
    expect(spanOf(rows, o, 2, 0)).toBe(1)
    // 覆盖层不改写共享渲染行：文本、rowspan、merged 原样
    expect(rows[0]!.cells[0]!.content).toBe('A01')
    expect(rows[0]!.cells[0]!.rowspan).toBe(1)
    expect(rows[1]!.cells[0]!.merged).toBe(false)
  })

  it('段间不同值断开：A/B/A 不合并', () => {
    const rows = [rr([rc('A')]), rr([rc('B')]), rr([rc('A')])]
    expect(buildMergeOverlay(rows, 0, rows.length)).toBeUndefined()
  })

  it('空值与纯空白不参与合并', () => {
    const rows = [rr([rc('')]), rr([rc('')]), rr([rc('  ')]), rr([rc('A')]), rr([rc('A')])]
    const o = buildMergeOverlay(rows, 0, rows.length)
    expect(isPlaceholder(o, 0, 0)).toBe(false)
    expect(isPlaceholder(o, 1, 0)).toBe(false)
    expect(isPlaceholder(o, 2, 0)).toBe(false)
    expect(spanOf(rows, o, 3, 0)).toBe(2)
  })

  it('页码列整列跳过：rawFormatter 存在时即使文本相同也不合并', () => {
    // 含页码的表达式在绑定阶段保留原文，两行 content 同为表达式字符串，比较文本会误判同值
    const rows = [
      rr([rc('{pageIndex}', { rawFormatter: '{pageIndex}' })]),
      rr([rc('{pageIndex}', { rawFormatter: '{pageIndex}' })]),
    ]
    expect(buildMergeOverlay(rows, 0, rows.length)).toBeUndefined()
  })

  it('多列独立归并：各列按自己的值成段', () => {
    const rows = [
      rr([rc('A'), rc('X')]),
      rr([rc('A'), rc('Y')]),
      rr([rc('B'), rc('Y')]),
    ]
    const o = buildMergeOverlay(rows, 0, rows.length)
    expect(spanOf(rows, o, 0, 0)).toBe(2)
    expect(isPlaceholder(o, 1, 0)).toBe(true)
    expect(spanOf(rows, o, 1, 1)).toBe(2)
    expect(isPlaceholder(o, 2, 1)).toBe(true)
    expect(isPlaceholder(o, 0, 1)).toBe(false)
    expect(isPlaceholder(o, 2, 0)).toBe(false)
  })

  it('未声明 mergeSameValue 的列不参与', () => {
    const rows = [
      rr([rc('A', { mergeSameValue: false }), rc('X', { mergeSameValue: false })]),
      rr([rc('A', { mergeSameValue: false }), rc('X', { mergeSameValue: false })]),
    ]
    expect(buildMergeOverlay(rows, 0, rows.length)).toBeUndefined()
  })

  it('表头/小计行不参与：段在行类型边界处断开', () => {
    const rows = [rr([rc('A')], 'header'), rr([rc('A')]), rr([rc('A')], 'subtotal')]
    expect(buildMergeOverlay(rows, 0, rows.length)).toBeUndefined()
  })

  it('横向合并占位格是段边界：不当作主格，也不生成 span', () => {
    const rows = [
      rr([rc('A', { colspan: 2 }), rc('', { merged: true, mergeSameValue: true })]),
      rr([rc('A', { colspan: 2 }), rc('', { merged: true, mergeSameValue: true })]),
    ]
    const o = buildMergeOverlay(rows, 0, rows.length)
    expect(spanOf(rows, o, 0, 0)).toBe(2)
    expect(o?.rowspan.has('0:1')).toBe(false)
    expect(o?.rowspan.has('1:1')).toBe(false)
  })

  it('区间外不归并：整段被页界切开后，两页各自成段（续页首行重放该值）', () => {
    const rows = Array.from({ length: 6 }, () => rr([rc('A01')]))
    const first = buildMergeOverlay(rows, 0, 3)
    const second = buildMergeOverlay(rows, 3, 6)
    expect(spanOf(rows, first, 0, 0)).toBe(3)
    expect(isPlaceholder(first, 1, 0)).toBe(true)
    expect(isPlaceholder(first, 2, 0)).toBe(true)
    // 续页：首行重新作为主格（值重放），段长不超过本页行数
    expect(spanOf(rows, second, 3, 0)).toBe(3)
    expect(rows[3]!.cells[0]!.content).toBe('A01')
  })

  it('区间内仅一行或未声明列时返回 undefined（渲染路径零开销）', () => {
    expect(buildMergeOverlay([rr([rc('A')])], 0, 1)).toBeUndefined()
    expect(buildMergeOverlay(
      [rr([rc('A', { mergeSameValue: false })]), rr([rc('A', { mergeSameValue: false })])], 0, 2,
    )).toBeUndefined()
  })
})
