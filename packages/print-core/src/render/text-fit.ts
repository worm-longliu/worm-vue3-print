// print-core/src/render/text-fit.ts
// 文字溢出显示形式（截断 / 自动缩小 / 自适应行高）的纯逻辑：
// 默认值判定、下限字号、以及「单元格可用高度」的几何换算。
// 无 DOM 依赖：服务端、桌面客户端、浏览器预览与设计器画布共用同一份判定。

import type { TextFit } from '../designer/types.js'
import { ptToMm } from '../designer/utils/units.js'

/** 自动缩小的默认下限字号（pt） */
export const DEFAULT_SHRINK_MIN_FONT_SIZE_PT = 6

/** 自动缩小的绝对下限（pt）：低于此值已不可读，直接退化为截断 */
export const MIN_SHRINK_FONT_SIZE_PT = 1

const VALID_FITS: readonly string[] = ['clip', 'shrink', 'autoHeight']

function normalizeFit(value: unknown): TextFit | undefined {
  return typeof value === 'string' && VALID_FITS.includes(value) ? (value as TextFit) : undefined
}

/** 文本类元素未显式配置时的默认形式：与既有无配置行为一致 */
const ELEMENT_DEFAULT_FIT: Record<string, TextFit> = {
  text: 'clip',
  longText: 'autoHeight',
}

/** 元素级显示形式：未配置时按元素类型取默认（text=截断、longText=自适应行高） */
export function resolveElementTextFit(type: string, opts?: { textFit?: TextFit } | undefined): TextFit {
  return normalizeFit(opts?.textFit) ?? ELEMENT_DEFAULT_FIT[type] ?? 'clip'
}

/** 单元格级显示形式：未配置时「不换行→截断，否则自适应行高」（与既有行为一致） */
export function resolveCellTextFit(
  cell?: { textFit?: string; wordWrap?: boolean } | undefined,
): TextFit {
  return normalizeFit(cell?.textFit) ?? (cell?.wordWrap === false ? 'clip' : 'autoHeight')
}

/** 自动缩小的下限字号（pt）；非法值或缺省回落到默认值 */
export function resolveShrinkMinFontSize(pt?: number | undefined): number {
  if (typeof pt !== 'number' || !Number.isFinite(pt) || pt <= 0) return DEFAULT_SHRINK_MIN_FONT_SIZE_PT
  return Math.max(pt, MIN_SHRINK_FONT_SIZE_PT)
}

/** 字号保留两位小数（渲染与回写统一口径，避免长浮点写进模板） */
export function roundFontSize(pt: number): number {
  return Math.round(pt * 100) / 100
}

/**
 * 字号向下取到两位小数：自动缩小只能取「已确认放得下」的字号，
 * 四舍五入可能把字号放大到溢出，故一律向下取整。
 */
export function floorFontSize(pt: number): number {
  return Math.floor(pt * 100) / 100
}

/** 自动缩小结果：key = 元素 id，或 `元素id#行类别#行:列` */
export interface FitFontSize {
  key: string
  fontSizePt: number
}

/** 单元格自动缩小的行类别：b=正文渲染行 / st=当前页小计行 / sm=整表汇总行 */
export type CellFitRowKind = 'b' | 'st' | 'sm'

/** 单元格自动缩小结果的 key（元素级 key 不含 '#'） */
export function cellFitKey(
  elementId: string,
  kind: CellFitRowKind,
  rowIndex: number,
  colIndex: number,
): string {
  return `${elementId}#${kind}#${rowIndex}:${colIndex}`
}

/** 解析单元格自动缩小结果的 key；元素级 key 返回 undefined */
export function parseCellFitKey(
  key: string,
): { elementId: string; kind: CellFitRowKind; rowIndex: number; colIndex: number } | undefined {
  const first = key.indexOf('#')
  if (first < 0) return undefined
  const last = key.lastIndexOf('#')
  const kind = key.slice(first + 1, last) as CellFitRowKind
  if (kind !== 'b' && kind !== 'st' && kind !== 'sm') return undefined
  const [rowIndex, colIndex] = key.slice(last + 1).split(':').map(Number)
  if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return undefined
  return { elementId: key.slice(0, first), kind, rowIndex, colIndex }
}

/** 边框宽度（pt，可缺省）；结构上兼容 RenderCellBorders 与 TableCellBorders */
type BorderLike = { width?: number } | undefined

interface FitCellLike {
  rowspan?: number
  colspan?: number
  padding?: number
  borders?: {
    top?: BorderLike
    right?: BorderLike
    bottom?: BorderLike
    left?: BorderLike
  } | undefined
}

/**
 * 单元格「可用内容宽度」（mm）：所跨列宽之和，扣除左右内边距与塌陷边框占位。
 * 与 `cellFitCapMm`（高度）同一口径：table-layout:fixed + border-collapse:collapse。
 * 条形码点对齐需要单元格的真实可用宽度，设计器画布复用同一函数。
 * 列宽缺失（表格未配置 tableColWidths）时返回 0，调用方据此不启用点对齐。
 */
export function cellFitWidthMm(
  colWidths: number[],
  colIndex: number,
  cell: FitCellLike | undefined,
  defaultPadding = 1,
): number {
  const span = Math.max(cell?.colspan ?? 1, 1)
  let width = 0
  for (let i = 0; i < span; i++) {
    width += colWidths[colIndex + i] ?? 0
  }
  if (width <= 0) return 0
  const padding = cell?.padding ?? defaultPadding
  // border-collapse: collapse 下边框居中于格线，每格实际占用自身边框的一半
  const borderMm = (ptToMm(cell?.borders?.left?.width ?? 0) + ptToMm(cell?.borders?.right?.width ?? 0)) / 2
  return Math.max(width - padding * 2 - borderMm, 0.5)
}

/**
 * 单元格「可用内容高度」（mm）：所跨行高之和，扣除上下内边距与塌陷边框占位。
 * 截断形式据此设 max-height，自动缩小据此判定是否放得下。
 * 与渲染端（tbody 行高）保持同一口径，设计器画布复用同一函数。
 */
export function cellFitCapMm(
  rows: Array<{ height?: number }>,
  rowIndex: number,
  cell: FitCellLike | undefined,
  defaultPadding = 1,
): number {
  const span = Math.max(cell?.rowspan ?? 1, 1)
  let height = 0
  for (let i = 0; i < span; i++) {
    height += rows[rowIndex + i]?.height ?? 8
  }
  const padding = cell?.padding ?? defaultPadding
  // border-collapse: collapse 下边框居中于格线，每格实际占用自身边框的一半
  const borderMm = (ptToMm(cell?.borders?.top?.width ?? 0) + ptToMm(cell?.borders?.bottom?.width ?? 0)) / 2
  return Math.max(height - padding * 2 - borderMm, 0.5)
}
