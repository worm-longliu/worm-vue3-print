# 标签多行多列拼版打印 · 实施计划

日期：2026-09-19
设计文档：`docs/superpowers/specs/2026-09-19-label-tiling-print-design.md`
验证报告：`docs/superpowers/spikes/2026-09-19-tiling-poc/RESULTS.md`（方案已实证，含 6 处修正）

## 前置约束（每个任务都适用）

- 一律简体中文（代码注释、提交信息、PR）。
- 单文件单次写入不超过 500 行。
- **外科手术式修改**：不顺手重构无关代码；本次触碰到的无用 import / 变量要清掉。
- **红绿 TDD**：每个功能先写失败测试（红），再实现（绿）。
- 测试命令：core → `npm test -w @worm-vue3-print/core`；canvas → `npm test -w @worm-vue3-print/canvas`。
- 实现严格照抄验证过的 CSS（RESULTS.md §5 的 D1/D2/D3/D4 是实测结论，不要"优化"掉）。

## 已拍板的决策

- **集成测试新增 `pdfjs-dist` devDependency**：已落地（`@worm-vue3-print/render` devDependencies，实测版本 6.3.289），可行性见 RESULTS.md §4.6。分张归属断言（第 13 条落在第 2 张）纳入 D1。
- 连带改动：新增 `services/print-render/vitest.config.ts`，把 `spike/**` 排除出 `npm test`（探针保留到实现完成，收尾时删除）。

## 阶段 A：core 布局与校验（纯函数）

### 任务 A1：新建拼版类型与常量

- 文件：`packages/print-core/src/print/tiling.ts`（新建）
- 要做的：写入类型与常量，**不含逻辑**：

```ts
// print-core/src/print/tiling.ts
// 标签多行多列拼版：类型、校验、布局纯函数（无 DOM / 无 IO）
import { PAPER_DIMENSIONS, getPaperDimensions, isContinuousPaper } from '../render/types.js'
import type { PaperSize, TemplateData } from '../render/types.js'

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

/** 打开拼版开关时的初值（列数还会按纸面收敛，见 canvas 侧 TilingConfig） */
export const TILE_DEFAULTS: TilingOptions = {
  enabled: true,
  sheetPaperSize: 'A4',
  sheetOrientation: 'portrait',
  sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
  gapX: 2,
  gapY: 2,
  columns: 2,
}

export type TilingIssueCode =
  | 'COLUMNS_INVALID'
  | 'COLUMNS_OVERFLOW'
  | 'SHEET_SIZE_INVALID'
  | 'LABEL_TOO_TALL'
  | 'CONTINUOUS_UNSUPPORTED'
  | 'SHEET_CONTINUOUS'

export interface TilingIssue { code: TilingIssueCode; message: string }

export interface TilingResolveOptions {
  paperOverride?: { width?: number; height?: number }
}

export interface TileLayout {
  tile: { width: number; height: number }
  sheet: { width: number; height: number }
  columns: number
  rows: number
  perSheet: number
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
export function normalizeTilingOptions(t: TemplateData): TilingOptions {
  const raw = t.tiling
  return {
    ...TILE_DEFAULTS,
    ...raw,
    sheetMargin: { ...TILE_DEFAULTS.sheetMargin, ...(raw?.sheetMargin ?? {}) },
  }
}
```

- 注意：`TemplateData.tiling` 此时还不存在，先不要 import 它——本任务只写独立类型，`normalizeTilingOptions` 的参数类型暂时用 `{ tiling?: TilingOptions }` 结构化写法：
  `export function normalizeTilingOptions(t: { tiling?: TilingOptions }): TilingOptions`
  等任务 A3 改两处 `TemplateData` 后再换成 `TemplateData`。
- 验证：`npm run build -w @worm-vue3-print/core` 通过（无类型错误）。

### 任务 A2：布局的失败测试（红）

- 文件：`packages/print-core/src/print/__tests__/tiling.spec.ts`（新建）
- 要做的：写测试，此时 `resolveSheetMm` / `computeTileLayout` 尚不存在，预期红。
  基准标签模板用 `CUSTOM` 70×40、四边 3mm：

```ts
import { describe, it, expect } from 'vitest'
import { computeTileLayout, resolveSheetMm, tilePosition, computeMaxColumns } from '../tiling.js'
import type { TilingOptions } from '../tiling.js'

/** 70×40mm 标签模板 */
function labelTemplate(tiling?: TilingOptions) {
  return {
    paperSize: 'CUSTOM',
    customWidth: 70,
    customHeight: 40,
    orientation: 'portrait',
    margins: { top: 3, right: 3, bottom: 3, left: 3 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    tiling: tiling ?? {
      enabled: true, columns: 2, gapX: 2, gapY: 2,
      sheetPaperSize: 'A4',
      sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
    },
  } as any
}

describe('computeTileLayout', () => {
  it('A4 纵向 + 70×40 标签 + 四边 10 + 间距 2 + 2 列 → 6 行、每张 12 格', () => {
    const layout = computeTileLayout(labelTemplate())
    expect(layout.sheet).toEqual({ width: 210, height: 297 })
    expect(layout.tile).toEqual({ width: 70, height: 40 })
    expect(layout.columns).toBe(2)
    expect(layout.rows).toBe(6)
    expect(layout.perSheet).toBe(12)
  })

  it('maxColumns = floor((可用宽 + 间距) / (标签宽 + 间距))', () => {
    expect(computeTileLayout(labelTemplate()).maxColumns).toBe(2)   // (190+2)/(70+2)
    expect(computeTileLayout(labelTemplate({
      enabled: true, columns: 1, gapX: 0, gapY: 0, sheetPaperSize: 'A4',
      sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
    })).maxColumns).toBe(2)
  })

  it('目标纸可自定义：A5 预设行数随纸高变化', () => {
    const a5 = computeTileLayout(labelTemplate({
      enabled: true, columns: 2, gapX: 2, gapY: 2, sheetPaperSize: 'A5',
      sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
    }))
    expect(a5.sheet).toEqual({ width: 148, height: 210 })
    expect(a5.rows).toBe(4)   // floor((210-20+2)/(40+2))
  })

  it('CUSTOM 目标纸读取自定义宽高', () => {
    const custom = computeTileLayout(labelTemplate({
      enabled: true, columns: 1, gapX: 0, gapY: 0, sheetPaperSize: 'CUSTOM',
      sheetCustomWidth: 100, sheetCustomHeight: 150,
      sheetMargin: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(custom.sheet).toEqual({ width: 100, height: 150 })
    expect(custom.rows).toBe(3)   // floor(150/40)
  })

  it('缺省纸张字段回落 A4 纵向', () => {
    expect(resolveSheetMm(labelTemplate({ enabled: true, columns: 1, gapX: 2, gapY: 2,
      sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 } })))
      .toEqual({ width: 210, height: 297 })
  })

  it('paperOverride 覆盖后行列按覆盖纸面重算；0/负数视为未提供', () => {
    const t = labelTemplate()
    expect(resolveSheetMm(t, { paperOverride: { width: 100, height: 100 } }))
      .toEqual({ width: 100, height: 100 })
    expect(resolveSheetMm(t, { paperOverride: { width: 0, height: -1 } }))
      .toEqual({ width: 210, height: 297 })
  })

  it('方向独立：横向目标纸只改目标纸，标签朝向仍由模板决定', () => {
    const landscapeSheet = computeTileLayout(labelTemplate({
      enabled: true, columns: 2, gapX: 2, gapY: 2, sheetPaperSize: 'A4',
      sheetOrientation: 'landscape',
      sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
    }))
    expect(landscapeSheet.sheet).toEqual({ width: 297, height: 210 })
    expect(landscapeSheet.tile).toEqual({ width: 70, height: 40 })   // 标签未变
  })

  it('tilePosition 按行优先给出格位', () => {
    const layout = computeTileLayout(labelTemplate())
    expect(tilePosition(layout, 0)).toEqual({ left: 10, top: 10 })
    expect(tilePosition(layout, 1)).toEqual({ left: 82, top: 10 })
    expect(tilePosition(layout, 2)).toEqual({ left: 10, top: 52 })
    expect(tilePosition(layout, 11)).toEqual({ left: 82, top: 220 })
  })
})
```

- 不要漏 `tilePosition` 的 import（同文件导出）。
- 验证：`npm test -w @worm-vue3-print/core -- tiling` → 红（模块缺导出）。

### 任务 A3：实现 `resolveSheetMm` / `computeTileLayout` / `tilePosition`（绿）

- 文件：`packages/print-core/src/print/tiling.ts`（追加）
- 要做的：在 `tiling.ts` 末尾追加：

```ts
/** 目标纸张解析；优先级：paperOverride → CUSTOM 自定义宽高 → 预设 → 缺省 A4 纵向 */
export function resolveSheetMm(
  t: { tiling?: TilingOptions },
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
  const preset = cfg.sheetPaperSize ?? 'A4'
  const base = PAPER_DIMENSIONS[preset as PaperSize] ?? PAPER_DIMENSIONS.A4
  return cfg.sheetOrientation === 'landscape'
    ? { width: base.height, height: base.width }
    : { ...base }
}

/** 可用宽高 */
function availableArea(sheet: { width: number; height: number }, margin: TilingOptions['sheetMargin']) {
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
 * 拼版布局（纯函数）。调用方负责判断 enabled——本函数不做开关判断，
 * 管线在分流后调用、设计器在开关打开时调用。
 */
export function computeTileLayout(
  t: TemplateData,
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
export function computeMaxColumns(t: TemplateData, opts?: TilingResolveOptions): number {
  const cfg = normalizeTilingOptions(t)
  const sheet = resolveSheetMm(t, opts)
  const label = getPaperDimensions(t)
  const availW = sheet.width - cfg.sheetMargin.left - cfg.sheetMargin.right
  return calcMaxColumns(availW, label.width, cfg.gapX)
}
```

- A2 的测试再补一条：`expect(computeMaxColumns(labelTemplate())).toBe(2)`，以及「列数超宽时 `computeMaxColumns` 仍返回 2、不抛错」。

- 同时把 A1 里 `normalizeTilingOptions` 的参数类型改成 `TemplateData`（现在能用真实类型了），并在两处模板类型加字段：
  - `packages/print-core/src/render/types.ts:25` 附近 `TemplateData` 内加：
    `/** 拼版打印配置（模板级）；缺省不写 = 不拼版 */`
    `tiling?: import('../print/tiling.js').TilingOptions`
  - `packages/print-core/src/designer/types.ts` 的 `TemplateData` 内加同一行（该文件的 import 路径同为 `../print/tiling.js`）。
- 注意 A3 依赖 A5 的 `validateTiling`——若按顺序执行，本任务先写一个「总是返回 `[]`」的占位实现，A5 再换成真实现（或在 A4/A5 提前完成）。推荐把 A4/A5 与 A3 合并执行，见下。
- 验证：`npm test -w @worm-vue3-print/core -- tiling` 全绿；`npm run build -w @worm-vue3-print/core` 通过。

### 任务 A4：校验的失败测试（红）

- 文件：`packages/print-core/src/print/__tests__/tiling.spec.ts`（追加 describe）
- 要做的：

```ts
describe('validateTiling', () => {
  it('合法配置返回空数组，不抛错', () => {
    expect(validateTiling(labelTemplate())).toEqual([])
  })

  it('列数缺失 / 0 / 小数 → COLUMNS_INVALID', () => {
    for (const columns of [0, 1.5, undefined as any]) {
      const issues = validateTiling(labelTemplate({ ...baseCfg(), columns }))
      expect(issues.map(i => i.code)).toContain('COLUMNS_INVALID')
      expect(issues[0].message).toBe('拼版列数必须是大于 0 的整数')
    }
  })

  it('列数超出可用宽度 → COLUMNS_OVERFLOW，文案带「最多可放 2 列」', () => {
    const issues = validateTiling(labelTemplate({ ...baseCfg(), columns: 5 }))
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('COLUMNS_OVERFLOW')
    expect(issues[0].message).toContain('最多可放 2 列')
    expect(issues[0].message).toContain('超出纸面可用宽度')
  })

  it('CUSTOM 目标纸宽高非法 → SHEET_SIZE_INVALID', () => {
    const issues = validateTiling(labelTemplate({
      ...baseCfg(), sheetPaperSize: 'CUSTOM', sheetCustomWidth: 0, sheetCustomHeight: 150,
    }))
    expect(issues[0].code).toBe('SHEET_SIZE_INVALID')
    expect(issues[0].message).toBe('拼版自定义纸张宽高必须是大于 0 的数值（mm）')
  })

  it('标签高于可用高度 → LABEL_TOO_TALL', () => {
    const t = { ...labelTemplate({ ...baseCfg(), sheetPaperSize: 'CUSTOM',
      sheetCustomWidth: 100, sheetCustomHeight: 30 }),
      customHeight: 40 }
    expect(validateTiling(t as any)[0].code).toBe('LABEL_TOO_TALL')
  })

  it('连续纸标签 → CONTINUOUS_UNSUPPORTED；目标纸连续 → SHEET_CONTINUOUS', () => {
    const cont = { ...labelTemplate(), paperSize: 'CONTINUOUS' }
    expect(validateTiling(cont as any)[0].code).toBe('CONTINUOUS_UNSUPPORTED')
    const sheetCont = labelTemplate({ ...baseCfg(), sheetPaperSize: 'CONTINUOUS' as any })
    expect(validateTiling(sheetCont).map(i => i.code)).toContain('SHEET_CONTINUOUS')
  })

  it('纸面类 issue 优先于列数类与高度类', () => {
    const issues = validateTiling({ ...labelTemplate({ ...baseCfg(), columns: 5 }), paperSize: 'CONTINUOUS' } as any)
    expect(issues.map(i => i.code)).toEqual(['CONTINUOUS_UNSUPPORTED', 'COLUMNS_OVERFLOW'])
  })

  it('computeTileLayout 抛错的 message 与 code 严格等于首条 issue（防文案漂移）', () => {
    const t = labelTemplate({ ...baseCfg(), columns: 5 })
    const issue = validateTiling(t)[0]
    try {
      computeTileLayout(t)
      throw new Error('应当抛错')
    } catch (err) {
      expect(err).toBeInstanceOf(TilingError)
      expect((err as TilingError).message).toBe(issue.message)
      expect((err as TilingError).code).toBe(issue.code)
    }
  })
})
```

- `baseCfg()` 是本文件内的辅助函数，返回一份完整合法的 `TilingOptions`：
  `function baseCfg(): TilingOptions { return { enabled: true, columns: 2, gapX: 2, gapY: 2, sheetPaperSize: 'A4', sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 } } }`
- 验证：红（`validateTiling` 未实现）。

### 任务 A5：实现 `validateTiling` 并接入 `computeTileLayout`（绿）

- 文件：`packages/print-core/src/print/tiling.ts`（追加）
- 要做的：

```ts
/**
 * 拼版配置校验；永不抛错，合法返回 []。
 * 判定顺序：纸面类 → 列数类 → 高度类（设计文档 §9）。
 * 不检查 enabled——由调用方决定是否校验。
 */
export function validateTiling(t: TemplateData, opts?: TilingResolveOptions): TilingIssue[] {
  const issues: TilingIssue[] = []
  const cfg = normalizeTilingOptions(t)

  // ── 纸面类 ──
  if (isContinuousPaper(t)) {
    issues.push({
      code: 'CONTINUOUS_UNSUPPORTED',
      message: '连续纸不支持拼版打印，请将模板纸张改为固定纸张或关闭拼版',
    })
  }
  if (t.tiling?.sheetPaperSize === 'CONTINUOUS') {
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
  if (issues.length) return issues   // 纸面不合法时后续几何无意义

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
```

- 删除任务 A3 里为解耦而写的 `validateTiling` 占位实现（若采用了占位方案）。
- 验证：`npm test -w @worm-vue3-print/core -- tiling` 全绿。

## 阶段 B：CSS 与合成器

### 任务 B1：拼版 CSS 的失败测试（红）

- 文件：`packages/print-core/src/render/css-builder.test.ts`（追加）
- 要做的：断言必须严格照抄 SPIKE 实测结论（D1/D3/D4）：

```ts
describe('buildSheetPageCss', () => {
  const layout = {
    tile: { width: 70, height: 40 },
    sheet: { width: 210, height: 297 },
    columns: 2, rows: 6, perSheet: 12, maxColumns: 2,
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    gapX: 2, gapY: 2,
  }
  const css = buildSheetPageCss(layout)

  it('@page 用拼版纸尺寸且 margin 为 0', () => {
    expect(css).toContain('@page { size: 210mm 297mm; margin: 0; }')
  })
  it('张容器为整页高 + 显式 break-after，末张取消（SPIKE D3）', () => {
    expect(css).toContain('.print-sheet')
    expect(css).toMatch(/height:\s*297mm/)
    expect(css).toContain('break-after: page')
    expect(css).toContain('.print-sheet:last-child { break-after: auto; page-break-after: auto; }')
  })
  it('格容器绝对定位且尺寸等于标签尺寸', () => {
    expect(css).toMatch(/\.print-tile\s*\{[^}]*position:\s*absolute/)
    expect(css).toMatch(/\.print-tile\s*\{[^}]*width:\s*70mm/)
    expect(css).toMatch(/\.print-tile\s*\{[^}]*height:\s*40mm/)
  })
  it('拼版 @page 必须排在标签 @page 之后（SPIKE D4 回归保护）', () => {
    const full = buildPageCss(labelTemplate()) + buildSheetPageCss(layout)
    expect(full.lastIndexOf('@page')).toBeGreaterThan(full.indexOf('@page'))
    expect(full.indexOf('size: 210mm 297mm')).toBeGreaterThan(full.indexOf('size: 70mm 40mm'))
  })
  it('预览期覆盖格内 .print-page 的 margin（SPIKE D1 回归保护）', () => {
    expect(css).toContain('.print-tile > .print-page { margin: 0; box-shadow: none; }')
  })
})
```

- 验证：红。

### 任务 B2：实现 `buildSheetPageCss`（绿）

- 文件：`packages/print-core/src/render/css-builder.ts`（在 `buildBatchPageCss` 之后追加；文件顶部加 `import type { TileLayout } from '../print/tiling.js'`）
- 要做的：**逐字照抄下面内容**，注释不要精简（它们是实测结论）：

```ts
/**
 * 拼版纸张 CSS：一张目标纸承载多行多列标签。
 * 必须由调用方拼在 buildPageCss 之后（同优先级下后出现的 @page 生效），
 * 否则浏览器 window.print() 会按标签纸尺寸分页——实测 12 格被切成 7 张 70×40mm。
 */
export function buildSheetPageCss(layout: TileLayout): string {
  return `
/* ── 拼版纸张：@page 尺寸 = 目标纸。服务端/客户端链路以 paperMm 显式定尺寸、不看这里，
       但浏览器链路只看 @page，故这条是硬需求 ── */
@page { size: ${mm(layout.sheet.width)} ${mm(layout.sheet.height)}; margin: 0; }

/* ── 一张目标纸 ── */
.print-sheet {
  width: ${mm(layout.sheet.width)};
  height: ${mm(layout.sheet.height)};
  position: relative;
  overflow: hidden;
  break-after: page;
  page-break-after: always;
}
.print-sheet:last-child { break-after: auto; page-break-after: auto; }

/* ── 一格：绝对定位，位置由 tilePosition() 以行内 style 给出 ── */
.print-tile {
  position: absolute;
  width: ${mm(layout.tile.width)};
  height: ${mm(layout.tile.height)};
  overflow: hidden;
}
/* 防御性声明：绝对定位 + overflow:hidden 容器内的后代不产生分页点，当前布局下无实际作用；
   若将来改用 flex/grid 布局，格内整页会重新参与分页，故保留 */
.print-tile > .print-page { break-after: auto; page-break-after: auto; }

@media screen {
  .print-sheet { margin: 12px auto; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18); }
  /* 必需：抵消标签 CSS 的 @media screen{.print-page{margin:12px auto}}，
     否则设计器预览错位 3.17mm、与出纸不一致 */
  .print-tile > .print-page { margin: 0; box-shadow: none; }
}
`
}
```

- 验证：`npm test -w @worm-vue3-print/core -- css-builder` 全绿。

### 任务 B3：合并器的失败测试（红）

- 文件：`packages/print-core/src/print/__tests__/tile-compose.spec.ts`（新建）
- 要做的：

```ts
import { describe, it, expect } from 'vitest'
import { composeTiledHtml } from '../tile-compose.js'
import { computeTileLayout } from '../tiling.js'
import type { TileInput } from '../tile-compose.js'
import type { TemplateData, PageLayout } from '../../render/types.js'

const TILING = {
  enabled: true, columns: 2, gapX: 2, gapY: 2, sheetPaperSize: 'A4' as const,
  sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
}

function tpl(): TemplateData {
  return {
    paperSize: 'CUSTOM', customWidth: 70, customHeight: 40,
    orientation: 'portrait',
    margins: { top: 3, right: 3, bottom: 3, left: 3 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [
      { id: 't1', type: 'text', options: { left: 0, top: 0, width: 60, height: 8, formatter: '{title}' } },
    ],
    tiling: TILING,
  } as unknown as TemplateData
}

/** 每份恰好 1 页的最小输入 */
function inputs(count: number): TileInput[] {
  const bound = tpl()
  const pageLayouts: PageLayout[] = [{ pageIndex: 0, sections: [{ elementId: 't1', type: 'element' }] }]
  return Array.from({ length: count }, (_, i) => ({
    bound, pageLayouts, data: { title: `L${String(i + 1).padStart(2, '0')}` },
  }))
}

const layout = () => computeTileLayout(tpl())

describe('composeTiledHtml', () => {
  it('12 格 → 1 张；13 格 → 2 张且共 13 格', () => {
    const one = composeTiledHtml({ copies: inputs(12), layout: layout() })
    expect(one.sheetCount).toBe(1)
    expect((one.html.match(/class="print-sheet"/g) ?? []).length).toBe(1)
    expect((one.html.match(/class="print-tile"/g) ?? []).length).toBe(12)

    const two = composeTiledHtml({ copies: inputs(13), layout: layout() })
    expect(two.sheetCount).toBe(2)
    expect((two.html.match(/class="print-sheet"/g) ?? []).length).toBe(2)
    expect((two.html.match(/class="print-tile"/g) ?? []).length).toBe(13)
  })

  it('格位置按行优先写入行内 style', () => {
    const { html } = composeTiledHtml({ copies: inputs(3), layout: layout() })
    expect(html).toContain('style="left:10mm;top:10mm"')
    expect(html).toContain('style="left:82mm;top:10mm"')
    expect(html).toContain('style="left:10mm;top:52mm"')
  })

  it('各份数据分别绑定到各自的格', () => {
    const { html } = composeTiledHtml({ copies: inputs(13), layout: layout() })
    expect(html).toContain('L01')
    expect(html).toContain('L12')
    expect(html).toContain('L13')
  })

  it('CSS：保留标签 @page、拼版 @page 在后、末张取消分页、预览 margin 覆盖', () => {
    const { html } = composeTiledHtml({ copies: inputs(12), layout: layout() })
    expect(html).toContain('size: 70mm 40mm')
    expect(html).toContain('size: 210mm 297mm')
    expect(html.indexOf('size: 210mm 297mm')).toBeGreaterThan(html.indexOf('size: 70mm 40mm'))
    expect(html).toContain('.print-sheet:last-child')
    expect(html).toContain('.print-tile > .print-page { margin: 0; box-shadow: none; }')
    expect(html).toContain('.print-tile > .print-page { break-after: auto; page-break-after: auto; }')
  })

  it('纯字符串合成（不依赖 DOM），输出完整文档', () => {
    const { html } = composeTiledHtml({ copies: inputs(12), layout: layout() })
    expect(typeof html).toBe('string')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })
})
```

- 验证：红。

### 任务 B4：实现 `composeTiledHtml`（绿）

- 文件：`packages/print-core/src/print/tile-compose.ts`（新建）
- 要做的：写入（纯字符串，不 import 任何 DOM API）：

```ts
// print-core/src/print/tile-compose.ts
// 拼版合并：多份单份渲染产物 → 按「列×行」铺进目标纸（纯字符串，不依赖 DOM）
import { renderFinalPages, wrapHtmlDocument } from '../render/html-generator.js'
import { buildPageCss, buildSheetPageCss } from '../render/css-builder.js'
import { buildFontFaceCss } from './fonts.js'
import { tilePosition } from './tiling.js'
import type { TileLayout } from './tiling.js'
import type { CodeRenderer, PageLayout, TemplateData } from '../render/types.js'

export interface TileInput {
  /** 该份数据绑定后的模板 */
  bound: TemplateData
  /** 该份的分页结果；拼版要求恰好 1 页（管线已校验，此处直接使用首份产物） */
  pageLayouts: PageLayout[]
  /** 该份原始数据（水印层使用） */
  data: Record<string, any>
  codeRenderer?: CodeRenderer
}

/**
 * 把各份标签页按行优先铺进目标纸。
 * 每张固定容纳 layout.perSheet 格；放不满的最后一张留白（空位不输出任何内容）。
 */
export function composeTiledHtml(input: {
  copies: TileInput[]
  layout: TileLayout
}): { html: string; sheetCount: number; perSheet: number } {
  const { copies, layout } = input
  const bound = copies[0].bound

  const sheets: string[] = []
  for (let start = 0; start < copies.length; start += layout.perSheet) {
    const tiles = copies
      .slice(start, start + layout.perSheet)
      .map((copy, i) => {
        const pos = tilePosition(layout, i)
        // 格内直接复用单份渲染产物：水印层、三区、绝对定位元素、页码变量全部照旧
        const page = renderFinalPages(copy.bound, copy.pageLayouts, copy.data, {
          codeRenderer: copy.codeRenderer,
        })
        return `<div class="print-tile" style="left:${pos.left}mm;top:${pos.top}mm">\n${page}\n</div>`
      })
      .join('\n')
    sheets.push(`<section class="print-sheet">\n${tiles}\n</section>`)
  }

  // 顺序关键：标签页 CSS 在前、拼版纸张 CSS 在后 —— 同优先级下后出现的 @page 生效，
  // 浏览器 window.print() 才按目标纸分页（服务端/客户端不看 @page，靠 paperMm）
  const css = buildFontFaceCss(bound.fonts)
    + buildPageCss(bound)
    + '\n'
    + buildSheetPageCss(layout)

  return {
    html: wrapHtmlDocument(css, sheets.join('\n')),
    sheetCount: sheets.length,
    perSheet: layout.perSheet,
  }
}
```

- 验证：`npm test -w @worm-vue3-print/core -- tile-compose` 全绿。

## 阶段 C：管线接线

### 任务 C1：管线的失败测试（红）

- 文件：`packages/print-core/src/print/__tests__/pipeline.spec.ts`（追加 describe，复用文件内既有的 `template()` 与 `runtimeOf()`）
- 要做的：

```ts
describe('拼版打印', () => {
  const TILING = {
    enabled: true, columns: 2, gapX: 2, gapY: 2, sheetPaperSize: 'A4' as const,
    sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
  }
  const labelTpl = (overrides: Partial<TemplateData> = {}) => template({
    paperSize: 'CUSTOM', customWidth: 70, customHeight: 40,
    margins: { top: 3, right: 3, bottom: 3, left: 3 },
    tiling: TILING,
    ...overrides,
  } as Partial<TemplateData>)
  const list = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `L${i + 1}` }))

  it('拼版关闭 → 与现状结构一致（零回归）', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const result = await prepareDocument({ templateJson: template(), printData: list(3) }, runtime)
    expect(result.copies).toBe(3)
    expect(result.pageCount).toBe(3)
    expect(result.html).toContain('<section class="print-copy">')
    expect(result.html).not.toContain('print-sheet')
  })

  it('开启 + 12 条 → paperMm=目标纸、pageCount=张数(1)、copies=12', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const result = await prepareDocument({ templateJson: labelTpl(), printData: list(12) }, runtime)
    expect(result.copies).toBe(12)
    expect(result.pageCount).toBe(1)
    expect(result.paperMm).toEqual({ width: 210, height: 297 })
    expect(result.html).toContain('<section class="print-sheet">')
    expect((result.html.match(/class="print-tile"/g) ?? []).length).toBe(12)
  })

  it('开启 + 13 条 → 2 张', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const result = await prepareDocument({ templateJson: labelTpl(), printData: list(13) }, runtime)
    expect(result.pageCount).toBe(2)
    expect(result.copies).toBe(13)
  })

  it('单份数据也走拼版（1 条 = 1 格 = 1 张）', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const result = await prepareDocument({ templateJson: labelTpl(), printData: { title: 'L1' } }, runtime)
    expect(result.copies).toBe(1)
    expect(result.pageCount).toBe(1)
    expect((result.html.match(/class="print-tile"/g) ?? []).length).toBe(1)
  })

  it('某份渲染出多页 → 抛错并指出第几份', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 400 }] })
    await expect(
      prepareDocument({ templateJson: labelTpl(), printData: list(2) }, runtime),
    ).rejects.toThrow(/恰好 1 页/)
  })

  it('连续纸 + 拼版 → 抛错', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }], contentBottomPx: 20 })
    const job = {
      templateJson: labelTpl({ paperSize: 'CONTINUOUS', customWidth: 70 } as Partial<TemplateData>),
      printData: list(2),
    }
    await expect(prepareDocument(job, runtime)).rejects.toThrow(/连续纸不支持拼版/)
  })

  it('列数超宽 → 抛错含「最多可放」', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const job = {
      templateJson: labelTpl({ tiling: { ...TILING, columns: 5 } } as Partial<TemplateData>),
      printData: list(1),
    }
    await expect(prepareDocument(job, runtime)).rejects.toThrow(/最多可放 2 列/)
  })
})
```

- 验证：红（管线未接线）。

### 任务 C2：管线接线（绿）

- 文件：`packages/print-core/src/print/pipeline.ts`
- 要做的三处改动：

1. 顶部加 import：
```ts
import { composeTiledHtml } from './tile-compose.js'
import { computeTileLayout } from './tiling.js'
```

2. `prepareWithSession` 内，`single` 分支改为：
```ts
  if (normalized.mode === 'single') {
    const single = await prepareSingleWithSession(job, session, normalized.data)
    if (job.templateJson.tiling?.enabled === true) {
      return composeTiledPrepared(job, [{
        bound: single.bound,
        pageLayouts: single.pageLayouts,
        data: normalized.data,
        codeRenderer: single.codeRenderer,
        derivedHeightMm: single.derivedHeightMm,
        paperMm: single.paperMm,
        heightSource: single.heightSource,
      }])
    }
    return toPreparedDocument(single)
  }
```

3. 批量分支的 `const merged = composeBatchHtml(copies)` **之前**插入拼版分流：
```ts
  if (job.templateJson.tiling?.enabled === true) {
    return composeTiledPrepared(job, copies)
  }
```

4. 在 `toPreparedDocument` 之后新增内部函数：
```ts
/**
 * 拼版合成：先校验（纸面/列数/高度）+ 校验每份恰好 1 页，再铺格。
 * 校验在渲染产物之上、合并之前完成，失败即抛错，不产出半成品文档。
 */
function composeTiledPrepared(job: PrintJob, copies: BatchCopyInput[]): PreparedDocument {
  const bound = copies[0].bound
  // 目标纸先经 paperOverride 解析，再据此算行列——保证布局与物理纸始终一致
  const layout = computeTileLayout(bound, { paperOverride: job.paperOverride })

  copies.forEach((copy, i) => {
    if (copy.pageLayouts.length !== 1) {
      throw new Error(
        `拼版要求每份标签恰好 1 页，第 ${i + 1} 份渲染出 ${copy.pageLayouts.length} 页`
        + '（内容超出纸张）；请缩小内容或调整标签纸张高度',
      )
    }
  })

  const tiled = composeTiledHtml({
    copies: copies.map(c => ({
      bound: c.bound, pageLayouts: c.pageLayouts, data: c.data, codeRenderer: c.codeRenderer,
    })),
    layout,
  })

  return {
    html: tiled.html,
    // 语义变更：pageCount = 实际输出张数（客户端任务历史、预览「共 N 页」都按此口径）
    pageCount: tiled.sheetCount,
    paperMm: { width: layout.sheet.width, height: layout.sheet.height },
    continuous: false,
    heightSource: 'config',
    // 调试用途；各份 pageIndex 均从 0 开始
    pageLayouts: copies.flatMap(c => c.pageLayouts),
    copies: copies.length,
  }
}
```

- 注意：`renderScreenshot` 不参与拼版（仍是标签纸单页快照）——在函数注释补一句该语义，不要改逻辑。
- 验证：`npm test -w @worm-vue3-print/core -- pipeline` 全绿。

### 任务 C3：导出与导出断言（绿）

- 文件：`packages/print-core/src/print/index.ts`、`packages/print-core/src/print/__tests__/exports.spec.ts`
- 要做的：
  1. `print/index.ts` 末尾加两行：
     `export * from './tiling.js'`
     `export * from './tile-compose.js'`
  2. `exports.spec.ts` 追加断言（照该文件既有写法）：
```ts
it('导出拼版能力', () => {
  expect(typeof computeTileLayout).toBe('function')
  expect(typeof validateTiling).toBe('function')
  expect(typeof composeTiledHtml).toBe('function')
  expect(typeof tilePosition).toBe('function')
  expect(TILE_DEFAULTS.columns).toBe(2)
  expect(new TilingError('COLUMNS_OVERFLOW', 'x')).toBeInstanceOf(Error)
})
```
      （import 从 `'../index.js'` 或该文件既有来源取，保持文件风格）
- 验证：`npm test -w @worm-vue3-print/core` 全绿；`npm run build -w @worm-vue3-print/core` 通过。

## 阶段 D：端到端验证（真实 Chromium）

### 任务 D1：Playwright 集成测试

- 文件：`services/print-render/src/tiling.integration.test.ts`（新建，照 `batch.integration.test.ts` 的写法）
- **前置已完成**：`pdfjs-dist@6.3.289` 已加入 `services/print-render` devDependencies，可行性经 SPIKE §4.6 实测（12/12 项通过）。**不要再写正则解析 PDF 的降级版**——分张归属是拼版最核心的正确性。
- 要做的（四条断言，全部有 SPIKE 实测背书）：

```ts
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs' // Node 环境用 legacy 构建

const PT_PER_MM = 72 / 25.4

/** 解析 PDF：逐页取尺寸（mm）与文本。手法经 SPIKE §4.6 实测 */
async function parsePdf(buf: Buffer) {
  // 注意：v6 起析构入口在 loadingTask 上，PDFDocumentProxy 已无 destroy()
  const task = getDocument({ data: new Uint8Array(buf), useSystemFonts: false })
  const doc = await task.promise
  const pages: Array<{ widthMm: number; heightMm: number; text: string }> = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const { items } = await page.getTextContent()
    pages.push({
      widthMm: viewport.width / PT_PER_MM,
      heightMm: viewport.height / PT_PER_MM,
      text: items.map(it => ('str' in it ? it.str : '')).join(''),
    })
  }
  await task.destroy()
  return pages
}

it('12 条 + A4 2 列 → 1 张、页尺寸 210×297（容差 ±0.5mm，SPIKE D6）', async () => {
  const { pdf } = await coreRenderPdf(job, runtime)
  const pages = await parsePdf(Buffer.from(pdf))
  expect(pages).toHaveLength(1)
  // 容差必须有：存在 mm↔pt 舍入（210mm 会读成 210.2mm）
  expect(Math.abs(pages[0].widthMm - 210)).toBeLessThan(0.5)
  expect(Math.abs(pages[0].heightMm - 297)).toBeLessThan(0.5)
}, 60000)

it('13 条 → 2 张', async () => { /* 同上，expect(pages).toHaveLength(2) */ }, 60000)

it('自定义目标纸 100×150 → 页尺寸随之为 100×150', async () => { /* 同上，容差 ±0.5mm */ }, 60000)

it('分张归属：第 1 张含 L01/L12、第 2 张含 L13', async () => {
  // 这就是「拼版是否真的一格一条」的核心断言，SPIKE §4.6 实测可行
  const pages = await parsePdf(Buffer.from(pdf))
  expect(pages[0].text).toContain('L01')
  expect(pages[0].text).toContain('L12')
  expect(pages[0].text).not.toContain('L13')
  expect(pages[1].text).toContain('L13')
  expect(pages[1].text).not.toContain('L01')
}, 60000)

it('12 格落在 2×6 网格上（print media 实测坐标，SPIKE H5）', async () => {
  // 用 Playwright page.setContent(prepared.html) → emulateMedia({media:'print'})
  // → 读每个 .print-tile 的 getBoundingClientRect，mm 换算 = px * 25.4 / 96
  // 断言：left/top 与 tilePosition 理论值误差 < 0.5mm、宽高 = 70/40mm、共 12 格
}, 60000)
```

- 验证：`npm run test -w @worm-vue3-print/render -- tiling.integration` 通过（慢，首次约 10–20s）。
- **换算规则（写测试时必读）**：pdfjs 的 `item.transform` 是**标准 PDF 用户空间单位 pt、原点在该页左下角**，`mm = pt × 25.4 / 72`；**坐标按页重置**，无需按页码补偿。B 阶段若看到「用 `25.4/96`、要减 `(N-1) × 纸高`」的说法，那是 **pypdf 的特例**（D5 已修正），不要套用。
- `spike/` 已在 `services/print-render/vitest.config.ts` 排除出 `npm test`；本任务的文件放 `src/` 下按既有命名即可被收集。

## 阶段 E：设计器（`packages/print-canvas`）

### 任务 E1：新增 `TilingConfig.vue`

- 文件：`packages/print-canvas/src/components/property/TilingConfig.vue`（新建）
- 要做的：照 `WatermarkConfig.vue` 的 `pd-*` 结构与 `DesignBackgroundConfig.vue` 的 `v-model` 契约写。props/emits：

```ts
const props = defineProps<{
  modelValue?: TilingOptions
  /** 完整模板：校验与摘要都需要标签纸尺寸/朝向，必须传 */
  templateData?: TemplateData
}>()
const emit = defineEmits<{ 'update:modelValue': [value: TilingOptions] }>()
```

- 内部要点（全部必须实现）：
  1. `cfg` 为本地归一化副本：`const cfg = computed(() => ({ ...TILE_DEFAULTS, ...(props.modelValue ?? {}), sheetMargin: { ...TILE_DEFAULTS.sheetMargin, ...(props.modelValue?.sheetMargin ?? {}) } }))`
  2. **打开开关时写 `TILE_DEFAULTS` 并按纸面收敛列数**（避免小自定义纸一开拼版就非法）：
     ```ts
     function onEnabledChange(next: boolean) {
       if (!next) return patch({ enabled: false })   // 关闭时保留其余字段
       const max = maxColumns.value
       const columns = max >= 1 ? Math.min(TILE_DEFAULTS.columns, max) : 1
       patch({ ...TILE_DEFAULTS, columns })
     }
     ```
     `maxColumns` 取 **core 导出的 `computeMaxColumns(template, opts)`**（任务 A3 已导出；不抛错，超宽时也能给出上限）。
  3. **实时摘要**（只读，开关下方）：合法时显示调 `computeTileLayout` 得到「目标纸 A4 纵向 210×297mm · 2 列 × 6 行 = 每张 12 格」；非法时不显示摘要、只显示红字。
  4. **实时红字**：`validateTiling({ ...templateData, tiling: cfg })` 的全部 message，逐条显示；**只预警、不阻断输入**（列数从 2 改成 5 的中间态必然非法，阻断会导致改不回去）。
  5. 列数 `StepperInput` 的 `:max` 用 `Math.max(maxColumns, 1)`。
  6. 连续纸模板（`templateData.paperSize === 'CONTINUOUS'`）：**开关置灰** + 文案「连续纸不支持拼版」。
  7. 目标纸张下拉的数据源：`PAPER_PRESETS`（`@worm-vue3-print/core/designer`）**排除 `CONTINUOUS`**；选「自定义」时显示两个 `StepperInput`（min 25 / max 2000，与模板自定义纸张同一交互）。
  8. 复用既有样式类：`pd-divider` / `pd-form` / `pd-field` / `pd-label` / `pd-select` / `pd-radio-group` / `pd-radio` / `pd-hint` / `margin-grid` / `custom-size-grid` / `custom-size-x`。
- 验证：`npm test -w @worm-vue3-print/canvas -- TilingConfig`（见 E4）。

### 任务 E2：挂进「页面属性」页签

- 文件：`packages/print-canvas/src/components/PropertyPanel.vue`
- 要做的：
  1. 模板中，紧接 `<DesignBackgroundConfig … />`（约 112 行）之后插入：
```vue
          <TilingConfig
            :model-value="templateData?.tiling"
            :template-data="templateData"
            @update:model-value="emitUpdate({ tiling: $event })"
          />
```
  2. import 区（约 170 行）加：`import TilingConfig from './property/TilingConfig.vue'`
  3. 加类型 import：`import type { TilingOptions } from '@worm-vue3-print/core'`（`emitUpdate` 的 `Partial<TemplateData>` 已能容纳 `tiling`）
- 验证：`npm run build -w @worm-vue3-print/canvas` 通过；设计器里「页面属性 → 拼版打印」可见可交互。

### 任务 E3：保存闸门 + 暴露 `validateTemplate`

- 文件：
  - `packages/print-canvas/src/utils/tiling-guard.ts`（新建）
  - `packages/print-canvas/src/components/PrintDesigner.vue`（改 3 处）
- 要做的：

1. 新建闸门函数（把「保存闸门的定义」集中一处，便于单测）：
```ts
// packages/print-canvas/src/utils/tiling-guard.ts
import { validateTiling } from '@worm-vue3-print/core'
import type { TemplateData } from '@worm-vue3-print/core/designer'

/**
 * 拼版保存闸门：返回应阻断保存的错误文案；null = 放行。
 * 拼版关闭时直接放行（不校验、零回归）。
 */
export function tilingSaveGuardMessage(template: TemplateData): string | null {
  if (template.tiling?.enabled !== true) return null
  const issues = validateTiling(template as never)
  return issues.length ? issues[0].message : null
}
```
   注：`as never` 仅为跨两个 `TemplateData` 定义（render / designer）的结构兼容兜底；若类型直接兼容则去掉。

2. `PrintDesigner.vue`：import 加 `import { tilingSaveGuardMessage } from '../utils/tiling-guard'`

3. `handleSave()`（约 481 行）改为：
```ts
function handleSave() {
  const json = templateJsonWithFonts()
  const blocked = tilingSaveGuardMessage(json)
  if (blocked) {
    activePropertyTab.value = 'page'   // 自动切到「页面属性」页签，定位到出错字段
    alert(blocked)                     // 与画布既有阻塞提示惯例一致
    return                              // 不 emit('save')、不 markSaved()
  }
  emit('save', JSON.stringify(json))
  markSaved()
}
```

4. `defineExpose`（约 479 行）改为：
```ts
defineExpose({
  getTemplateJson: templateJsonWithFonts,
  /**
   * 拼版校验（纯查询，不弹窗、不切页签）。
   * 宿主旁路（直接调 getTemplateJson 自行保存/导出）必须调它再决定是否放行——
   * 那条路径绕不过 handleSave 的闸门。
   */
  validateTemplate: () => tilingSaveGuardMessage(templateJsonWithFonts()),
})
```
   注：这里的返回值语义是「错误文案或 null」。若宿主更需要 issue 列表，改为返回 `validateTiling(json)` 的结果数组（`[]` = 合法），并在文档里写清。**二者只能有一个**——推荐返回 issue 数组（信息更全），此时 `tilingSaveGuardMessage` 内部改为取 `[0].message`。
- 验证：`npm run build -w @worm-vue3-print/canvas` 通过；手工验收见 F3。

### 任务 E4：canvas 测试

- 文件：`packages/print-canvas/src/__tests__/TilingConfig.spec.ts`、`packages/print-canvas/src/__tests__/tiling-guard.spec.ts`（均新建）
- 要做的（`mount` 用法照 `StepperInput.spec.ts`）：

```ts
// TilingConfig.spec.ts
it('关闭时不写 enabled=true，切换开关写入 TILE_DEFAULTS', …)
it('打开开关时列数按纸面收敛：小纸 → 1，A4 → 2', …)
    // A4 + 70×40 → columns 2；CUSTOM 80×40 目标纸 → columns 1
it('列数超宽 → 红字含「最多可放」，且输入不被阻断', …)
    // 断言红字存在；再断言 input 的 value 仍是用户输入的值（未被改写）
it('切换目标纸张/方向后摘要更新', …)
it('选「自定义」后显示宽高输入并落盘 sheetCustomWidth/Height', …)
it('连续纸模板：开关置灰且提示', …)

// tiling-guard.spec.ts
it('拼版关闭 → 放行（null）', …)
it('拼版开启且列数超宽 → 返回错误文案，与 validateTiling 首条一致', …)
it('拼版开启且合法 → 放行', …)
```

- 验证：`npm test -w @worm-vue3-print/canvas` 全绿。

> **实施偏离记录（2026-09-19 落地时）**：
> 1. 未抽出 `utils/tiling-guard.ts` 与 `tiling-guard.spec.ts`，改为在 `PrintDesigner.vue` 内用组件已有的 `tilingIssues` computed 直接判定；`validateTemplate` 按 E3 注释里的推荐方案返回 **issue 数组**（而非文案/null），与设计文档 §3.3 一致。
> 2. `tiling-guard.spec.ts` 改为 `src/__tests__/print-designer-tiling.spec.ts`：**挂载真实 `PrintDesigner`**、从 `DesignerToolbar` 发 `save`/`preview` 事件，比抽纯函数多覆盖了「`tiling` 穿过模板载入迁移存活」「保存拦截后页签联动」「预览不被连坐」三条真实路径。
> 3. `TilingConfig.spec.ts` 实际 9 例，覆盖开关联动 / 关闭保留字段 / 列数按 `maxColumns` 收敛 / 摘要随纸向更新 / 自定义纸宽高落盘 / 超宽红字不阻断输入 / 连续纸置灰。

## 阶段 F：宿主示例、文档与收尾

### 任务 F1：demo 示范宿主侧拦截

- 文件：`demo/src/App.vue`
- 要做的：`onSave(json)` 与 `onExportTemplate()` 里，落盘前先调 `designerRef.value?.validateTemplate?.()`，非空则 `alert` 并中止。当前 demo 裸调 `getTemplateJson()` 是**反例**（绕过了设计器闸门），必须改，否则会成为宿主接入的错误范本。
- 验证：demo 里把列数改成超宽 → 点「导出模板」→ 弹出拼版错误且不下载文件。

### 任务 F2：文档同步（漏一项就会留下错误文档）

- 文件与内容：
  1. `docs/中文/指南/渲染管线.md`：新增「拼版打印」小节——目标纸张可自定义（A4 仅默认）、行列推导、**非法配置不允许保存**的完整时机矩阵、页数语义（1 页 = 1 张）。
  2. `docs/中文/接口/API文档.md`：`TilingOptions` 字段表、§3.2 解析优先级、`computeTileLayout` / `computeMaxColumns` / `validateTiling` / `composeTiledHtml` / `tilePosition`、`TileLayout`（含 `maxColumns`）、`TilingIssueCode` 全量对照表（宿主据此做本地化提示）、`pageCount` 语义变更。
  3. `packages/print-core/README.md`：能力表补「拼版打印」，补上述导出。
  4. `packages/print-canvas/README.md`：补「`PrintDesigner` 新增 expose `validateTemplate`，宿主自有保存链路须先校验再落盘」。
  5. `skills/worm-vue3-print-integration/SKILL.md`：能力表补一行「拼版打印」。
  6. `skills/worm-vue3-print-integration/references/integration-api.md`：**必须更新**——该文件现写着「组件只 expose 了 `getTemplateJson`」，不改就是错误文档；同时补「`getTemplateJson()` 是旁路、不经过设计器保存闸门」。
  7. `skills/worm-vue3-print-integration/references/host-integration-guide.md`：保存章节补一句宿主侧先调 `validateTemplate`。
- 验证：`node scripts/check-print-architecture.mjs`（`npm run lint:print-architecture`）通过；文档里不再出现「只 expose 了 getTemplateJson」。

### 任务 F3：收尾门禁与人工验收

- 执行（缺一不可）：
```bash
npm run build
npm test
npm run lint:print-architecture
npm run test -w @worm-vue3-print/render
```
- **探针清理（实施完成后执行）**：删除 `services/print-render/spike/` 整个目录（spike 测试 + 2 个 Python 校验脚本 + `output/` 下 PDF 与 JSON），验证结论已全部固化在 `docs/superpowers/spikes/2026-09-19-tiling-poc/RESULTS.md`。
- **`services/print-render/vitest.config.ts` 保留**：`spike/**` 排除规则在删除探针后虽无对象，但保留可防止将来再引入 PoC 时污染 `npm test`；该文件是本任务新增的唯一测试基建改动，需与 D1 一起提交。
- 人工验收清单（无法单测的部分）：
  1. 设计器开拼版 → 摘要显示「2 列 × 6 行 = 每张 12 格」。
  2. 列数改成 5 → 立刻红字「最多可放 2 列」；**输入框仍是 5**（不阻断）；点「保存」→ 弹同一句错误、自动切到「页面属性」、文件不落盘。
  3. 列数改回 2 → 保存成功。
  4. 拼版开启时点「预览」：能打开，**格内标签不与格边框错位**（SPIKE D1 的 3.17mm 偏移已消除）。
  5. 连续纸模板：拼版开关置灰并有提示。
  6. demo「导出模板」在列数超宽时被拦。

## 实施完成记录（2026-09-19）

六个阶段全部落地，门禁实测通过：

| 阶段 | 产出 | 验证 |
|---|---|---|
| A | `print/tiling.ts`（类型/常量/`resolveSheetMm`/`computeTileLayout`/`tilePosition`/`computeMaxColumns`/`validateTiling`/`TilingError`） | `tiling.spec.ts` 18 例绿 |
| B | `buildSheetPageCss`（css-builder）、`print/tile-compose.ts` | `css-builder.test.ts` + `tile-compose.spec.ts` 绿 |
| C | `pipeline.ts` 单份/批量双分支按 `tiling.enabled` 分流；`print/index.ts` 导出 | `pipeline.spec.ts` 20 例绿（含「关闭即零回归」）、`exports.spec.ts` 绿 |
| D | `services/print-render/src/tiling.integration.test.ts`（真实 Chromium + pdfjs-dist） | 4 例绿：1 张/2 张、页尺寸 210×297、分张归属、2×6 网格 |
| E | `property/TilingConfig.vue` + PropertyPanel 挂载 + PrintDesigner 保存闸门/`validateTemplate` | `TilingConfig.spec.ts` 9 例、`print-designer-tiling.spec.ts` 6 例绿 |
| F | 中文文档（渲染管线 §5 / API 文档）、两个包 README、集成技能、demo 示例；探针已删 | 见下表门禁 |

门禁结果：

- `npm run build` —— 通过（core / client / render / canvas / Electron 客户端全链）
- `npm test` —— 通过，共 96 文件 / 887 测试：core 559（47 文件）、canvas 219（33 文件）、client 19（3 文件）、print-client 90（13 文件）
- `npm run lint:print-architecture` —— 通过（三端无重复测量/纸高/出图/码制实现）
- `npm run test -w @worm-vue3-print/render` —— 6 文件 15 测试通过（含新增 4 项拼版集成）
- `demo` 类型检查（`vue-tsc`）—— 通过，确认新 expose 的 `validateTemplate()` 类型可达
- `services/print-render/spike/` —— 已删除；`vitest.config.ts` 的 `spike/**` 排除规则保留

未纳入本轮（属发版流程）：四处版本号、CHANGELOG 中/英、canvas 帮助弹窗。


