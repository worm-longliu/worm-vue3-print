import { describe, it, expect } from 'vitest'
import {
  computeTileLayout,
  resolveSheetMm,
  tilePosition,
  computeMaxColumns,
  validateTiling,
  TilingError,
} from '../tiling.js'
import type { TilingOptions } from '../tiling.js'
import type { TemplateData } from '../../render/types.js'

/** 完整合法的拼版配置：A4 目标纸 + 四边留白 10mm + 格间距 2mm + 2 列 */
function baseCfg(): TilingOptions {
  return {
    enabled: true,
    columns: 2,
    gapX: 2,
    gapY: 2,
    sheetPaperSize: 'A4',
    sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
  }
}

/** 70×40mm 标签模板 */
function labelTemplate(tiling?: TilingOptions): TemplateData {
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
    tiling: tiling ?? baseCfg(),
  } as unknown as TemplateData
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
    expect(computeTileLayout(labelTemplate()).maxColumns).toBe(2) // (190+2)/(70+2)
    expect(computeTileLayout(labelTemplate({ ...baseCfg(), columns: 1, gapX: 0 })).maxColumns).toBe(2)
  })

  it('目标纸可自定义：A5 预设行数随纸高变化', () => {
    // A5 可用宽 148−20=128mm，放不下 2 列 70mm 标签，故取 1 列单独验证行数几何
    const a5 = computeTileLayout(labelTemplate({
      ...baseCfg(), columns: 1, sheetPaperSize: 'A5',
    }))
    expect(a5.sheet).toEqual({ width: 148, height: 210 })
    expect(a5.rows).toBe(4) // floor((210-20+2)/(40+2))
  })

  it('CUSTOM 目标纸读取自定义宽高', () => {
    const custom = computeTileLayout(labelTemplate({
      enabled: true,
      columns: 1,
      gapX: 0,
      gapY: 0,
      sheetPaperSize: 'CUSTOM',
      sheetCustomWidth: 100,
      sheetCustomHeight: 150,
      sheetMargin: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(custom.sheet).toEqual({ width: 100, height: 150 })
    expect(custom.rows).toBe(3) // floor(150/40)
  })

  it('缺省纸张字段回落 A4 纵向', () => {
    const t = labelTemplate({ ...baseCfg(), sheetPaperSize: undefined, sheetOrientation: undefined })
    expect(resolveSheetMm(t)).toEqual({ width: 210, height: 297 })
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
      ...baseCfg(), sheetOrientation: 'landscape',
    }))
    expect(landscapeSheet.sheet).toEqual({ width: 297, height: 210 })
    expect(landscapeSheet.tile).toEqual({ width: 70, height: 40 }) // 标签未变
  })

  it('tilePosition 按行优先给出格位', () => {
    const layout = computeTileLayout(labelTemplate())
    expect(tilePosition(layout, 0)).toEqual({ left: 10, top: 10 })
    expect(tilePosition(layout, 1)).toEqual({ left: 82, top: 10 })
    expect(tilePosition(layout, 2)).toEqual({ left: 10, top: 52 })
    expect(tilePosition(layout, 11)).toEqual({ left: 82, top: 220 })
  })

  it('computeMaxColumns 纯几何、不校验：列数超宽时仍返回上限且不抛错', () => {
    expect(computeMaxColumns(labelTemplate())).toBe(2)
    expect(computeMaxColumns(labelTemplate({ ...baseCfg(), columns: 5 }))).toBe(2)
  })
})

describe('validateTiling', () => {
  it('合法配置返回空数组，不抛错', () => {
    expect(validateTiling(labelTemplate())).toEqual([])
  })

  it('列数缺失 / 0 / 小数 → COLUMNS_INVALID', () => {
    for (const columns of [0, 1.5, undefined as unknown as number]) {
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
    // 目标纸 100×30 → 可用高 10mm，容不下 40mm 标签；列数取 1 以免先触发 COLUMNS_OVERFLOW
    const t = {
      ...labelTemplate({
        ...baseCfg(), columns: 1, sheetPaperSize: 'CUSTOM',
        sheetCustomWidth: 100, sheetCustomHeight: 30,
      }),
      customHeight: 40,
    }
    expect(validateTiling(t as unknown as TemplateData)[0].code).toBe('LABEL_TOO_TALL')
  })

  it('连续纸标签 → CONTINUOUS_UNSUPPORTED；目标纸连续 → SHEET_CONTINUOUS', () => {
    const cont = { ...labelTemplate(), paperSize: 'CONTINUOUS' }
    expect(validateTiling(cont as unknown as TemplateData)[0].code).toBe('CONTINUOUS_UNSUPPORTED')

    const sheetCont = labelTemplate({ ...baseCfg(), sheetPaperSize: 'CONTINUOUS' as never })
    expect(validateTiling(sheetCont).map(i => i.code)).toContain('SHEET_CONTINUOUS')
  })

  it('标签连续纸不阻断列数校验，两条 issue 同时给出', () => {
    const t = { ...labelTemplate({ ...baseCfg(), columns: 5 }), paperSize: 'CONTINUOUS' }
    expect(validateTiling(t as unknown as TemplateData).map(i => i.code))
      .toEqual(['CONTINUOUS_UNSUPPORTED', 'COLUMNS_OVERFLOW'])
  })

  it('目标纸为连续纸时几何不可靠，只报纸面类 issue', () => {
    const t = labelTemplate({ ...baseCfg(), columns: 5, sheetPaperSize: 'CONTINUOUS' as never })
    expect(validateTiling(t).map(i => i.code)).toEqual(['SHEET_CONTINUOUS'])
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
