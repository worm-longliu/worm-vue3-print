// print-core/src/render/row-merge.ts
// dynamic 模式数据行「按值纵向合并」：相邻数据行同值列自动 rowspan

import type { RenderRow } from './types.js'

/**
 * 对同一数据模板行展开出的连续数据行（run）做按值归并，原地改写 rowspan/merged/content。
 *
 * 规则（每列独立）：
 * - 仅处理 `cols` 中声明的列（模板格 `mergeSameValue: true` 的列索引）；
 * - 该列任一行 `rawFormatter` 存在（引用页码，绑定阶段无法求值）→ 整列跳过；
 * - 相邻行 `content` 全等且非空 → 延长合并段；段长 > 1 时首格 `rowspan = 段长`，
 *   其余格置 `merged = true`（占位格，渲染趟不输出 td）、`content = ''`。
 *
 * 归并产物复用静态合并的 rowspan/merged 表示，分页引擎的 keep-together 分组与
 * 续片表头的 rowspan 边界收缩据此自动生效，无需下游感知「按值」来源。
 */
export function mergeDataRowsByValue(rows: RenderRow[], cols: number[]): void {
  if (rows.length < 2) { return }
  for (const col of cols) {
    // 页码列跳过：含页码的表达式保留原文延迟求值，绑定阶段拿到的是表达式而非最终文本
    if (rows.some(row => row.cells[col]?.rawFormatter)) { continue }
    let start = 0
    while (start < rows.length) {
      const head = rows[start]!.cells[col]
      if (!head || head.content === '') { start++; continue }
      let end = start
      while (end + 1 < rows.length && rows[end + 1]!.cells[col]!.content === head.content) { end++ }
      if (end > start) {
        head.rowspan = end - start + 1
        for (let r = start + 1; r <= end; r++) {
          const cell = rows[r]!.cells[col]!
          cell.merged = true
          cell.rowspan = 1
          cell.content = ''
        }
      }
      start = end + 1
    }
  }
}
