// print-core/src/print/tiling.ts
// 标签多行多列拼版：类型、校验、布局纯函数（无 DOM / 无 IO）
import {
  PAPER_DIMENSIONS,
  getPaperDimensions,
  isContinuousPaper,
  isContinuousPaperSize,
} from '../render/types.js'
import type { PaperSize, SheetPaperSize } from '../render/types.js'

/** 拼版配置（模板级，随模板保存） */
export interface TilingOptions {
  enabled: boolean
  /** 目标纸张（张）预设；缺省 A4。不含 CONTINUOUS */
  sheetPaperSize?: Exclude<PaperSize, 'CONTINUOUS'>
  /** 目标纸张方向；缺省 portrait。只影响目标纸，不影响标签朝向 */
  sheetOrientation?: 'portrait' | 'landscape'
  /** sheetPaperSize='CUSTOM' 时的纸宽（mm）；缺省 210 */
  sheetCustomWidth?: number
  /** sheetPaperSize='CUSTOM' 时的纸高（mm）；缺省 297 */
  sheetCustomHeight?: number
  /** 目标纸四边留白（mm）；与模板 margins（标签内部边距）不是一回事 */
  sheetMargin: { top: number; right: number; bottom: number; left: number }
  /** 相邻格横向间距（mm） */
  gapX: number
  /** 相邻格纵向间距（mm） */
  gapY: number
  /** 列数（手工指定，必填，≥1 的整数）；行数由纸面自动推导 */
  columns: number
}

/** 打开拼版开关时的初值（列数还会按纸面收敛，见设计器 TilingConfig） */
export const TILE_DEFAULTS: TilingOptions = {
  enabled: true,
  sheetPaperSize: 'A4',
  sheetOrientation: 'portrait',
  sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
  gapX: 2,
  gapY: 2,
  columns: 2,
}

/**
 * 拼版几何所需的最小模板信息。
 * 刻意不含 elements——布局只依赖纸张与拼版配置，因此设计器侧（元素 id 可选）
 * 与渲染侧（元素 id 必需）两种 TemplateData 都能直接传入。
 */
export interface TilingTemplateInput {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  customWidth?: number
  customHeight?: number
  tiling?: TilingOptions
}

export type TilingIssueCode =
  | 'COLUMNS_INVALID'
  | 'COLUMNS_OVERFLOW'
  | 'SHEET_SIZE_INVALID'
  | 'LABEL_TOO_TALL'
  | 'CONTINUOUS_UNSUPPORTED'
  | 'SHEET_CONTINUOUS'

export interface TilingIssue {
  code: TilingIssueCode
  message: string
}

export interface TilingResolveOptions {
  paperOverride?: { width?: number; height?: number }
}

export interface TileLayout {
  tile: { width: number; height: number }
  sheet: { width: number; height: number }
  columns: number
  rows: number
  perSheet: number
  /** 本纸最多可放列数；列数超宽时用于提示「最多可放 N 列」 */
  maxColumns: number
  margin: { top: number; right: number; bottom: number; left: number }
  gapX: number
  gapY: number
}

/** 拼版校验失败（message 与 validateTiling 首条 issue 完全一致） */
export class TilingError extends Error {
  readonly code: TilingIssueCode
  constructor(code: TilingIssueCode, message: string) {
    super(message)
    this.name = 'TilingError'
    this.code = code
  }
}

/** 保留一位小数：错误文案里的 mm 值可读性 */
export function roundMm(value: number): number {
  return Math.round(value * 10) / 10
}

/** 配置归一化：缺省字段补 TILE_DEFAULTS，sheetMargin 做深合并 */
export function normalizeTilingOptions(t: TilingTemplateInput): TilingOptions {
  const raw = t.tiling
  return {
    ...TILE_DEFAULTS,
    ...raw,
    sheetMargin: { ...TILE_DEFAULTS.sheetMargin, ...(raw?.sheetMargin ?? {}) },
  }
}

/** 目标纸张解析；优先级：paperOverride → CUSTOM 自定义宽高 → 预设 → 缺省 A4 纵向 */
export function resolveSheetMm(
  t: TilingTemplateInput,
  opts?: TilingResolveOptions,
): { width: number; height: number } {
  const cfg = normalizeTilingOptions(t)
  const ov = opts?.paperOverride
  // 宽高都有效才视为覆盖（0 / 负数 / 缺失 = 未提供）
  if (ov && typeof ov.width === 'number' && ov.width > 0
      && typeof ov.height === 'number' && ov.height > 0) {
    return { width: ov.width, height: ov.height }
  }
  if (cfg.sheetPaperSize === 'CUSTOM') {
    return {
      width: cfg.sheetCustomWidth ?? PAPER_DIMENSIONS.A4.width,
      height: cfg.sheetCustomHeight ?? PAPER_DIMENSIONS.A4.height,
    }
  }
  // 显式传入 undefined 时 spread 会覆盖默认值，故这里再兜一层
  const preset = (cfg.sheetPaperSize ?? 'A4') as PaperSize
  const base = PAPER_DIMENSIONS[preset] ?? PAPER_DIMENSIONS.A4
  return cfg.sheetOrientation === 'landscape'
    ? { width: base.height, height: base.width }
    : { ...base }
}

/** 目标纸去掉留白后的可用区域（mm） */
function availableArea(
  sheet: { width: number; height: number },
  margin: TilingOptions['sheetMargin'],
): { w: number; h: number } {
  return {
    w: sheet.width - margin.left - margin.right,
    h: sheet.height - margin.top - margin.bottom,
  }
}

/** 最多可放列数；0 表示标签比可用宽度还宽 */
function calcMaxColumns(availW: number, labelW: number, gapX: number): number {
  return Math.max(0, Math.floor((availW + gapX) / (labelW + gapX)))
}

/**
 * 拼版布局（纯函数）。调用方负责判断 enabled——本函数不做开关判断：
 * 管线在分流后调用、设计器在开关打开时调用。
 * 配置非法时抛 TilingError，message 与 validateTiling 首条 issue 一致。
 */
export function computeTileLayout(
  t: TilingTemplateInput,
  opts?: TilingResolveOptions,
): TileLayout {
  const issues = validateTiling(t, opts)
  if (issues.length) throw new TilingError(issues[0].code, issues[0].message)

  const cfg = normalizeTilingOptions(t)
  const sheet = resolveSheetMm(t, opts)
  const label = getPaperDimensions(t)
  const avail = availableArea(sheet, cfg.sheetMargin)
  const rows = Math.floor((avail.h + cfg.gapY) / (label.height + cfg.gapY))

  return {
    tile: { width: label.width, height: label.height },
    sheet,
    columns: cfg.columns,
    rows,
    perSheet: cfg.columns * rows,
    maxColumns: calcMaxColumns(avail.w, label.width, cfg.gapX),
    margin: { ...cfg.sheetMargin },
    gapX: cfg.gapX,
    gapY: cfg.gapY,
  }
}

/** 第 index 格的绝对位置（mm）；行优先：左→右、上→下 */
export function tilePosition(layout: TileLayout, index: number): { left: number; top: number } {
  const slot = index % layout.perSheet
  const col = slot % layout.columns
  const row = Math.floor(slot / layout.columns)
  return {
    left: roundMm(layout.margin.left + col * (layout.tile.width + layout.gapX)),
    top: roundMm(layout.margin.top + row * (layout.tile.height + layout.gapY)),
  }
}

/**
 * 本纸最多可放列数（纯几何，**不校验、不抛错**）。
 * 供设计器在「列数已超宽」的非法态下仍能提示「最多可放 N 列」并约束输入上限——
 * 此时 computeTileLayout 会抛错，用不了。
 */
export function computeMaxColumns(t: TilingTemplateInput, opts?: TilingResolveOptions): number {
  const cfg = normalizeTilingOptions(t)
  const sheet = resolveSheetMm(t, opts)
  const label = getPaperDimensions(t)
  const availW = sheet.width - cfg.sheetMargin.left - cfg.sheetMargin.right
  return calcMaxColumns(availW, label.width, cfg.gapX)
}

/**
 * 拼版配置校验；永不抛错，合法返回 []。
 * 判定顺序：纸面类 → 列数类 → 高度类（设计文档 §9）。
 * 不检查 enabled——由调用方决定是否校验。
 */
export function validateTiling(t: TilingTemplateInput, opts?: TilingResolveOptions): TilingIssue[] {
  const issues: TilingIssue[] = []
  const cfg = normalizeTilingOptions(t)

  // ── 纸面类 ──
  if (isContinuousPaper(t)) {
    issues.push({
      code: 'CONTINUOUS_UNSUPPORTED',
      message: '连续纸不支持拼版打印，请将模板纸张改为固定纸张或关闭拼版',
    })
  }
  // 类型上已排除连续纸，但存量模板 / 手写 JSON 仍可能传入，运行时必须拦住
  const sheetPaperSize = cfg.sheetPaperSize as string | undefined
  const sheetContinuous = isContinuousPaperSize(sheetPaperSize ?? '')
  if (sheetContinuous) {
    issues.push({ code: 'SHEET_CONTINUOUS', message: '拼版目标纸张不能是连续纸' })
  }
  const customSizeInvalid = cfg.sheetPaperSize === 'CUSTOM'
    && !((cfg.sheetCustomWidth ?? 0) > 0 && (cfg.sheetCustomHeight ?? 0) > 0)
  if (customSizeInvalid) {
    issues.push({
      code: 'SHEET_SIZE_INVALID',
      message: '拼版自定义纸张宽高必须是大于 0 的数值（mm）',
    })
  }
  // 只有「目标纸尺寸不可用」才中断几何校验：CUSTOM 宽高非法时纸面未定，
  // 目标纸为连续纸时纸面语义不适用——两种情况下的列数/高度文案都会误导用户。
  // 标签本身是连续纸（CONTINUOUS_UNSUPPORTED）不改变几何，继续往下校验，
  // 让用户一次看到全部问题。
  if (customSizeInvalid || sheetContinuous) return issues

  const sheet = resolveSheetMm(t, opts)
  const label = getPaperDimensions(t)
  const avail = availableArea(sheet, cfg.sheetMargin)
  const marginLR = roundMm(cfg.sheetMargin.left + cfg.sheetMargin.right)

  // ── 列数类 ──
  if (!Number.isInteger(cfg.columns) || cfg.columns < 1) {
    issues.push({ code: 'COLUMNS_INVALID', message: '拼版列数必须是大于 0 的整数' })
    return issues
  }
  const maxColumns = calcMaxColumns(avail.w, label.width, cfg.gapX)
  if (cfg.columns > maxColumns) {
    const needW = roundMm(cfg.columns * label.width + (cfg.columns - 1) * cfg.gapX)
    issues.push({
      code: 'COLUMNS_OVERFLOW',
      message: '拼版列数 ' + cfg.columns + ' 超出纸面可用宽度：'
        + roundMm(sheet.width) + 'mm − 左右留白 ' + marginLR + 'mm = ' + roundMm(avail.w) + 'mm，'
        + '最多可放 ' + maxColumns + ' 列；当前 ' + cfg.columns + ' 列 '
        + label.width + 'mm 标签含间距需要 ' + needW + 'mm',
    })
  }

  // ── 高度类 ──
  if (Math.floor((avail.h + cfg.gapY) / (label.height + cfg.gapY)) < 1) {
    issues.push({
      code: 'LABEL_TOO_TALL',
      message: '标签高度 ' + label.height + 'mm 超出纸面可用高度 ' + roundMm(avail.h)
        + 'mm，拼版每张 0 行；请缩小标签高度或改用横向纸',
    })
  }
  return issues
}
