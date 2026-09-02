// web/src/components/print/utils/table-matrix.ts
// Excel 风格表格矩阵结构操作纯函数库。
// 约定：函数原地修改传入的 rows/colWidths；返回 string 的函数以非空字符串为拒绝原因。
import type { TableRow, TableRowType, TableCell, TableCellBorder, ElementOptions } from '../types'

export interface CellRect { r1: number; c1: number; r2: number; c2: number }

/** 单元格 ID 生成器：使用闭包隔离的计数器，避免全局变量冲突 */
function createCellIdGenerator() {
  let seq = 0
  return function genCellId(): string {
    seq += 1
    return `cell-${Date.now().toString(36)}-${seq}`
  }
}

/** 行 ID 生成器：使用闭包隔离的计数器 */
function createRowIdGenerator() {
  let seq = 0
  return function genRowId(): string {
    seq += 1
    return `row-${Date.now().toString(36)}-${seq}`
  }
}

// 模块级单例：同一模块内共享计数器
const genCellId = createCellIdGenerator()
const genRowId = createRowIdGenerator()

const DEFAULT_BORDER: TableCellBorder = { width: 0.75, style: 'solid', color: '#333333' }

/** JSON 深拷贝：兼容 Vue reactive Proxy（structuredClone 对 Proxy 抛 DataCloneError） */
function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function createCell(partial?: Partial<TableCell>): TableCell {
  return {
    id: genCellId(),
    borders: {
      top: { ...DEFAULT_BORDER }, right: { ...DEFAULT_BORDER },
      bottom: { ...DEFAULT_BORDER }, left: { ...DEFAULT_BORDER },
    },
    ...partial,
  }
}

/** 默认新建表格：3 列 × 4 行（标题/数据/小计/汇总），列宽均分 50mm，表格组件默认显示当前页小计行 */
export function createDefaultTable(): { rows: TableRow[]; colWidths: number[] } {
  const colWidths = [50, 50, 50]
  const mk = (type: TableRowType, repeat?: boolean): TableRow => ({
    id: genRowId(),
    type,
    height: 8,
    ...(repeat !== undefined ? { repeatOnPage: repeat } : {}),
    cells: colWidths.map(() => createCell()),
  })
  const header = mk('header', true)
  header.cells.forEach((c, i) => { c.formatter = `列${i + 1}`; c.align = 'center'; c.fontWeight = 'bold' })
  return { rows: [header, mk('data'), mk('subtotal'), mk('summary')], colWidths }
}

/** 定位覆盖 (r,c) 的主格坐标（自身非 merged 即为主格） */
export function findMainCell(rows: TableRow[], r: number, c: number): { r: number; c: number } {
  if (!rows[r]!.cells[c]!.merged) { return { r, c } }
  for (let ri = r; ri >= 0; ri--) {
    for (let ci = c; ci >= 0; ci--) {
      const cell = rows[ri]!.cells[ci]!
      if (cell.merged) { continue }
      const rs = cell.rowspan ?? 1
      const cs = cell.colspan ?? 1
      if (ri + rs - 1 >= r && ci + cs - 1 >= c) { return { r: ri, c: ci } }
    }
  }
  return { r, c }
}

/** 主格覆盖矩形 */
export function getSpanRect(rows: TableRow[], r: number, c: number): CellRect {
  const main = findMainCell(rows, r, c)
  const cell = rows[main.r]!.cells[main.c]!
  return {
    r1: main.r, c1: main.c,
    r2: main.r + (cell.rowspan ?? 1) - 1,
    c2: main.c + (cell.colspan ?? 1) - 1,
  }
}

/** 由锚点/焦点推导矩形选区，并迭代扩展至完整包含所有跨越的合并格 */
export function normalizeSelection(
  rows: TableRow[], a: { r: number; c: number }, b: { r: number; c: number },
): CellRect {
  let rect: CellRect = {
    r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c),
  }
  for (;;) {
    let changed = false
    for (let r = rect.r1; r <= rect.r2; r++) {
      for (let c = rect.c1; c <= rect.c2; c++) {
        const span = getSpanRect(rows, r, c)
        const merged: CellRect = {
          r1: Math.min(rect.r1, span.r1), c1: Math.min(rect.c1, span.c1),
          r2: Math.max(rect.r2, span.r2), c2: Math.max(rect.c2, span.c2),
        }
        if (merged.r1 !== rect.r1 || merged.c1 !== rect.c1 || merged.r2 !== rect.r2 || merged.c2 !== rect.c2) {
          rect = merged
          changed = true
        }
      }
    }
    if (!changed) { return rect }
  }
}

/** 合并合法性校验，返回拒绝原因或 null */
export function canMergeReason(rows: TableRow[], rect: CellRect): string | null {
  const cellCount = (rect.r2 - rect.r1 + 1) * (rect.c2 - rect.c1 + 1)
  if (cellCount < 2) { return '至少选择 2 个单元格' }
  const types = new Set<TableRowType>()
  for (let r = rect.r1; r <= rect.r2; r++) { types.add(rows[r]!.type) }
  if (types.size > 1) { return '合并区域不能跨越不同类型的行' }
  // 与已有合并区部分重叠：normalize 后矩形应与选区一致
  const norm = normalizeSelection(rows, { r: rect.r1, c: rect.c1 }, { r: rect.r2, c: rect.c2 })
  if (norm.r1 !== rect.r1 || norm.c1 !== rect.c1 || norm.r2 !== rect.r2 || norm.c2 !== rect.c2) {
    return '选区与已有合并区域部分重叠'
  }
  return null
}

/** 合并：左上为主格，非空内容空格拼接并入主格 */
export function mergeCells(rows: TableRow[], rect: CellRect): void {
  const main = rows[rect.r1]!.cells[rect.c1]!
  const contents: string[] = []
  for (let r = rect.r1; r <= rect.r2; r++) {
    for (let c = rect.c1; c <= rect.c2; c++) {
      const cell = rows[r]!.cells[c]!
      if (cell.formatter) { contents.push(cell.formatter) }
      if (r === rect.r1 && c === rect.c1) { continue }
      cell.merged = true
      cell.rowspan = 1
      cell.colspan = 1
      cell.formatter = ''
    }
  }
  main.rowspan = rect.r2 - rect.r1 + 1
  main.colspan = rect.c2 - rect.c1 + 1
  main.formatter = contents.join(' ')
}

/** 拆分选区内所有合并格：占位格恢复并复制主格样式 */
export function splitCells(rows: TableRow[], rect: CellRect): void {
  for (let r = rect.r1; r <= rect.r2; r++) {
    for (let c = rect.c1; c <= rect.c2; c++) {
      const cell = rows[r]!.cells[c]!
      if (!cell.merged && ((cell.rowspan ?? 1) > 1 || (cell.colspan ?? 1) > 1)) {
        const span = getSpanRect(rows, r, c)
        const styleSrc = cell
        for (let sr = span.r1; sr <= span.r2; sr++) {
          for (let sc = span.c1; sc <= span.c2; sc++) {
            const t = rows[sr]!.cells[sc]!
            t.merged = false
            t.rowspan = 1
            t.colspan = 1
            copyCellStyle(styleSrc, t)
          }
        }
        cell.rowspan = 1
        cell.colspan = 1
      }
    }
  }
}

function copyCellStyle(src: TableCell, dst: TableCell): void {
  if (src === dst) { return }
  dst.align = src.align
  dst.valign = src.valign
  dst.fontSize = src.fontSize
  dst.fontWeight = src.fontWeight
  dst.color = src.color
  dst.backgroundColor = src.backgroundColor
  dst.borders = src.borders ? deepClone(src.borders) : undefined
  dst.padding = src.padding
  dst.wordWrap = src.wordWrap
}

/** 插入行。index 为参照行，position 决定插在其上方或下方 */
export function insertRow(rows: TableRow[], index: number, position: 'above' | 'below'): void {
  const insertAt = position === 'above' ? index : index + 1
  const ref = rows[index]!
  const colCount = ref.cells.length
  // 参照行为 data 时新行降级为 header（data 全表唯一）
  const type: TableRowType = ref.type === 'data' ? 'header' : ref.type
  const newRow: TableRow = {
    id: `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    height: ref.height,
    cells: Array.from({ length: colCount }, () => createCell()),
  }
  // 处理跨越插入边界的纵向合并：主格 rowspan+1，新行对应格置 merged
  for (let c = 0; c < colCount; c++) {
    if (insertAt > 0 && insertAt < rows.length) {
      const span = getSpanRect(rows, insertAt - 1, c)
      if (span.r1 < insertAt && span.r2 >= insertAt) {
        const main = rows[span.r1]!.cells[span.c1]!
        main.rowspan = (main.rowspan ?? 1) + 1
        newRow.cells[c]!.merged = true
      }
    }
  }
  rows.splice(insertAt, 0, newRow)
}

/** 删除行；主格在被删行时移交下一行 */
export function deleteRow(rows: TableRow[], index: number): string | null {
  if (rows.length <= 1) { return '不能删除最后一行' }
  const row = rows[index]!
  const colCount = row.cells.length
  for (let c = 0; c < colCount; c++) {
    const cell = row.cells[c]!
    if (!cell.merged && (cell.rowspan ?? 1) > 1) {
      // 主格在被删行：移交到下一行
      const next = rows[index + 1]!.cells[c]!
      Object.assign(next, deepClone(cell), { id: next.id })
      next.rowspan = (cell.rowspan ?? 1) - 1
      next.merged = false
    } else if (cell.merged) {
      // 被删行处于某纵向合并中间：主格 rowspan-1
      const span = getSpanRect(rows, index, c)
      if (span.r1 < index && span.c1 === c) {
        const main = rows[span.r1]!.cells[span.c1]!
        main.rowspan = (main.rowspan ?? 1) - 1
      }
    }
  }
  rows.splice(index, 1)
  return null
}

/** 插入列 */
export function insertCol(
  rows: TableRow[], colWidths: number[], index: number, position: 'left' | 'right',
): void {
  const insertAt = position === 'left' ? index : index + 1
  colWidths.splice(insertAt, 0, colWidths[index]!)
  for (const row of rows) {
    const newCell = createCell()
    if (insertAt > 0 && insertAt < row.cells.length) {
      const r = rows.indexOf(row)
      const span = getSpanRect(rows, r, insertAt - 1)
      if (span.c1 < insertAt && span.c2 >= insertAt) {
        const main = rows[span.r1]!.cells[span.c1]!
        // 每个横跨行都会命中一次，只在主格所在行加 colspan
        if (r === span.r1) { main.colspan = (main.colspan ?? 1) + 1 }
        newCell.merged = true
      }
    }
    row.cells.splice(insertAt, 0, newCell)
  }
}

/** 删除列；主格在被删列时移交右侧列 */
export function deleteCol(rows: TableRow[], colWidths: number[], index: number): string | null {
  if (colWidths.length <= 1) { return '不能删除最后一列' }
  for (let r = 0; r < rows.length; r++) {
    const cell = rows[r]!.cells[index]!
    if (!cell.merged && (cell.colspan ?? 1) > 1) {
      const next = rows[r]!.cells[index + 1]!
      Object.assign(next, deepClone(cell), { id: next.id })
      next.colspan = (cell.colspan ?? 1) - 1
      next.merged = false
    } else if (cell.merged) {
      const span = getSpanRect(rows, r, index)
      if (span.c1 < index && span.r1 === r) {
        const main = rows[span.r1]!.cells[span.c1]!
        main.colspan = (main.colspan ?? 1) - 1
      }
    }
  }
  for (const row of rows) { row.cells.splice(index, 1) }
  colWidths.splice(index, 1)
  return null
}

/** 行类型变更校验 + 写入。约束：header 顶部连续；data 唯一；subtotal/summary 在 data 之后；subtotal 在 summary 之前 */
export function setRowType(
  rows: TableRow[], index: number, type: TableRowType,
): string | null {
  if (type === 'data') {
    const existing = rows.findIndex((r, i) => r.type === 'data' && i !== index)
    if (existing >= 0) { return `数据行已存在（第 ${existing + 1} 行），全表最多一行` }
  }
  if (type === 'header') {
    // 设置后 header 行必须从第 0 行起连续
    for (let i = 0; i < index; i++) {
      if (rows[i]!.type !== 'header') { return '标题行必须从表格顶部连续设置' }
    }
  }
  if (type === 'subtotal' || type === 'summary') {
    const dataIdx = rows.findIndex(r => r.type === 'data')
    if (dataIdx < 0) { return '请先设置数据行，小计/汇总行必须位于数据行之后' }
    if (index < dataIdx) { return '小计/汇总行必须位于数据行之后' }
  }
  if (type === 'subtotal') {
    // 目标状态：本行设为小计后，其上方（index 之前）不得存在汇总行（小计必须位于汇总行之前）
    if (rows.slice(0, index).some(r => r.type === 'summary')) {
      return '小计行必须位于汇总行之前'
    }
  }
  if (type === 'summary') {
    if (rows.slice(index + 1).some(r => r.type === 'subtotal')) {
      return '汇总行必须位于小计行之后'
    }
  }
  // 取消 header 时校验剩余 header 仍连续（中间行取消会断开）
  if (rows[index]!.type === 'header' && type !== 'header') {
    for (let i = index + 1; i < rows.length; i++) {
      if (rows[i]!.type === 'header') { return '取消该标题行会导致标题行不连续，请先调整后续标题行' }
    }
  }
  rows[index]!.type = type
  if (type !== 'header') { delete rows[index]!.repeatOnPage }
  return null
}

export type BorderPreset = 'all' | 'outer' | 'inner' | 'none'

/** 按预设批量写边框；none 时清空选区内所有格的 borders */
export function applyBorderPreset(
  rows: TableRow[], rect: CellRect, preset: BorderPreset, border: TableCellBorder,
): void {
  for (let r = rect.r1; r <= rect.r2; r++) {
    for (let c = rect.c1; c <= rect.c2; c++) {
      const cell = rows[r]!.cells[c]!
      if (cell.merged) { continue }
      if (preset === 'none') {
        delete cell.borders
        continue
      }
      const span = getSpanRect(rows, r, c)
      const atTop = span.r1 === rect.r1
      const atBottom = span.r2 === rect.r2
      const atLeft = span.c1 === rect.c1
      const atRight = span.c2 === rect.c2
      const b = { ...(cell.borders ?? {}) }
      if (preset === 'all') {
        b.top = { ...border }; b.bottom = { ...border }; b.left = { ...border }; b.right = { ...border }
      } else if (preset === 'outer') {
        if (atTop) { b.top = { ...border } }
        if (atBottom) { b.bottom = { ...border } }
        if (atLeft) { b.left = { ...border } }
        if (atRight) { b.right = { ...border } }
      } else if (preset === 'inner') {
        if (!atTop) { b.top = { ...border } }
        if (!atBottom) { b.bottom = { ...border } }
        if (!atLeft) { b.left = { ...border } }
        if (!atRight) { b.right = { ...border } }
      }
      cell.borders = b
    }
  }
}

/** 设计态下无边框单元格的辅助虚线：与背景网格线同风格（浅灰虚线），略深保证可读 */
export const GHOST_BORDER_CSS = '1px dashed rgba(0,0,0,0.18)'

/**
 * 解析单元格某条边的最终 CSS border 值。
 * - 有真实边框（style 非 none）→ 返回 `${width}pt ${style} ${color}`
 * - 设计态且开关开启、且该边无边框 → 返回虚拟虚线（仅设计稿展示，不影响预览/打印）
 * - 其余情况（预览态 / 开关关闭）→ 'none'
 */
export function resolveCellBorderCss(
  b: TableCellBorder | undefined,
  opts: { designMode?: boolean; showGhostBorder?: boolean } = {},
): string {
  if (b && b.style !== 'none') return `${b.width}pt ${b.style} ${b.color}`
  if (opts.designMode && opts.showGhostBorder !== false) return GHOST_BORDER_CSS
  return 'none'
}

/** 表格元素尺寸派生：options.width/height 恒等于列宽和/行高和（mm），与渲染端一致 */
export function syncTableElementSize(options: ElementOptions): void {
  const wMm = (options.tableColWidths ?? []).reduce((s, w) => s + w, 0)
  const hMm = (options.tableRows ?? []).reduce((s, r) => s + r.height, 0)
  options.width = Math.round(wMm * 100) / 100
  options.height = Math.round(hMm * 100) / 100
}
