// print-core/src/render/row-merge.ts
// dynamic 模式数据行「按值纵向合并」：相邻数据行同值列在渲染区间内归并为 rowspan
//
// 关键约束：归并发生在**渲染区间**（一片 table-slice 或整表测量趟）内部，而不是绑定阶段。
// 绑定阶段归并会让分页引擎把合并段当成 keep-together 组：段高超过一页时整表一次都不切页，
// 前页只剩表头、后页越界裁掉明细（且不置 overflow）。按片归并后，跨页的段在页界处自然断开、
// 续页首行重放该值（Word / Excel 同口径），分页与行组切片完全不受影响。

import type { RenderRow } from './types.js'

/** 归并覆盖层：只描述「本渲染区间」内的 rowspan 与占位，不篡改共享的 _renderRows */
export interface MergeOverlay {
  /** `${row}:${col}` → 该格跨越的行数（>1） */
  rowspan: Map<string, number>
  /** 被上方主格覆盖的占位格坐标 `${row}:${col}` */
  merged: Set<string>
}

const cellKey = (row: number, col: number): string => `${row}:${col}`

/**
 * 计算 [start, end) 区间内的按值归并覆盖层；无归并时返回 undefined（渲染路径逐字不变）。
 *
 * 规则（每列独立）：
 * - 参与列 = 区间内任一 `data` 行声明了 `mergeSameValue` 的列；表头/小计/汇总行不参与；
 * - 该列在区间内任一行带 `rawFormatter`（引用页码，绑定阶段拿不到最终文本）→ 整列跳过；
 * - 相邻 data 行 `content` 全等、去空白后非空、两侧都声明 `mergeSameValue` → 延长合并段；
 * - 横向合并的占位格（`merged` 的既有格子）是段边界：不当作主格，也不并入他段。
 */
export function buildMergeOverlay(
  rows: RenderRow[],
  start: number,
  end: number,
): MergeOverlay | undefined {
  if (end - start < 2) return undefined

  const cols = new Set<number>()
  for (let r = start; r < end; r++) {
    const row = rows[r]
    if (row?.type !== 'data') continue
    row.cells.forEach((cell, col) => {
      if (cell?.mergeSameValue === true) cols.add(col)
    })
  }
  if (cols.size === 0) return undefined

  const overlay: MergeOverlay = { rowspan: new Map(), merged: new Set() }
  for (const col of cols) {
    // 页码列整列跳过：含页码的表达式保留原文延迟求值，此处拿到的是表达式而非最终文本
    let skip = false
    for (let r = start; r < end && !skip; r++) {
      if (rows[r]?.cells[col]?.rawFormatter) skip = true
    }
    if (skip) continue

    let r = start
    while (r < end) {
      if (!isHead(rows[r], col)) { r++; continue }
      const value = rows[r]!.cells[col]!.content
      let last = r
      while (last + 1 < end && isSameValue(rows[last + 1], col, value)) last++
      if (last > r) {
        overlay.rowspan.set(cellKey(r, col), last - r + 1)
        for (let k = r + 1; k <= last; k++) overlay.merged.add(cellKey(k, col))
      }
      r = last + 1
    }
  }

  return overlay.rowspan.size > 0 ? overlay : undefined
}

/** 可作归并主格：data 行、非占位格、声明了 mergeSameValue、文本去空白后非空 */
function isHead(row: RenderRow | undefined, col: number): boolean {
  if (!row || row.type !== 'data') return false
  const cell = row.cells[col]
  if (!cell || cell.merged || cell.mergeSameValue !== true) return false
  return (cell.content ?? '').trim() !== ''
}

/** 可并入当前段的下一行：同为 data 行、同列声明合并、非占位格、文本全等 */
function isSameValue(row: RenderRow | undefined, col: number, value: string): boolean {
  if (!row || row.type !== 'data') return false
  const cell = row.cells[col]
  if (!cell || cell.merged || cell.mergeSameValue !== true) return false
  return cell.content === value
}
