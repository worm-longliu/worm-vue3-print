// 文字溢出显示形式：默认值判定、可用高度换算与渲染输出
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SHRINK_MIN_FONT_SIZE_PT,
  cellFitCapMm,
  cellFitWidthMm,
  cellFitKey,
  parseCellFitKey,
  resolveCellTextFit,
  resolveElementTextFit,
  resolveShrinkMinFontSize,
} from './text-fit.js'
import { generateHtml } from './html-generator.js'
import type { TemplateData, TemplateElement, RenderRow } from './types.js'

// ─── 判定 ───

describe('resolveElementTextFit', () => {
  it('未配置时按元素类型取默认：text 截断、longText 自适应行高', () => {
    expect(resolveElementTextFit('text', {})).toBe('clip')
    expect(resolveElementTextFit('longText', {})).toBe('autoHeight')
    expect(resolveElementTextFit('text', undefined)).toBe('clip')
  })

  it('显式配置优先于默认值', () => {
    expect(resolveElementTextFit('text', { textFit: 'shrink' })).toBe('shrink')
    expect(resolveElementTextFit('longText', { textFit: 'clip' })).toBe('clip')
  })

  it('非法值回落默认', () => {
    expect(resolveElementTextFit('text', { textFit: 'ellipsis' as never })).toBe('clip')
  })
})

describe('resolveCellTextFit', () => {
  it('未配置时：不换行→截断，否则自适应行高', () => {
    expect(resolveCellTextFit({})).toBe('autoHeight')
    expect(resolveCellTextFit({ wordWrap: true })).toBe('autoHeight')
    expect(resolveCellTextFit({ wordWrap: false })).toBe('clip')
    expect(resolveCellTextFit(undefined)).toBe('autoHeight')
  })

  it('显式配置优先级最高', () => {
    expect(resolveCellTextFit({ textFit: 'shrink', wordWrap: false })).toBe('shrink')
  })
})

describe('resolveShrinkMinFontSize', () => {
  it('缺省与非法值回落 6pt，且不低于绝对下限 1pt', () => {
    expect(resolveShrinkMinFontSize()).toBe(DEFAULT_SHRINK_MIN_FONT_SIZE_PT)
    expect(resolveShrinkMinFontSize(0)).toBe(DEFAULT_SHRINK_MIN_FONT_SIZE_PT)
    expect(resolveShrinkMinFontSize(Number.NaN)).toBe(DEFAULT_SHRINK_MIN_FONT_SIZE_PT)
    expect(resolveShrinkMinFontSize(0.2)).toBe(1)
    expect(resolveShrinkMinFontSize(8)).toBe(8)
  })
})

describe('cellFitCapMm', () => {
  const rows = [{ height: 8 }, { height: 10 }]

  it('可用高度 = 行高 − 上下内边距 − 塌陷边框占位', () => {
    expect(cellFitCapMm(rows, 0, { padding: 1 })).toBeCloseTo(6, 5)
    // 跨行取所跨行高之和
    expect(cellFitCapMm(rows, 0, { padding: 1, rowspan: 2 })).toBeCloseTo(16, 5)
  })

  it('未设内边距时用元素级默认值；边框按 pt 折算一半', () => {
    // 0.75pt ≈ 0.2646mm，上下各半 → 合计 0.75pt/2 ≈ 0.1323mm
    expect(cellFitCapMm([{ height: 8 }], 0, { borders: { top: { width: 0.75 } } }, 2)).toBeCloseTo(8 - 4 - 0.1323, 3)
  })

  it('极端值兜底为 0.5mm，不返回 0/负数', () => {
    expect(cellFitCapMm([{ height: 1 }], 0, { padding: 5 })).toBe(0.5)
  })
})

describe('cellFitWidthMm', () => {
  const colWidths = [40, 60]

  it('可用宽度 = 列宽 − 左右内边距 − 塌陷边框占位（与 cellFitCapMm 同口径）', () => {
    expect(cellFitWidthMm(colWidths, 0, { padding: 1 })).toBeCloseTo(38, 5)
    expect(cellFitWidthMm(colWidths, 1, { padding: 1 })).toBeCloseTo(58, 5)
  })

  it('跨列取所跨列宽之和', () => {
    expect(cellFitWidthMm(colWidths, 0, { padding: 1, colspan: 2 })).toBeCloseTo(98, 5)
  })

  it('未设内边距时用元素级默认值', () => {
    expect(cellFitWidthMm(colWidths, 0, {}, 2)).toBeCloseTo(36, 5)
  })

  it('列宽缺失时返回 0（调用方据此不启用点对齐）', () => {
    expect(cellFitWidthMm([], 0, { padding: 1 })).toBe(0)
    expect(cellFitWidthMm([40], 3, { padding: 1 })).toBe(0)
  })

  it('极端值兜底为 0.5mm，不返回 0/负数', () => {
    expect(cellFitWidthMm([1], 0, { padding: 5 })).toBe(0.5)
  })
})

describe('单元格缩小结果 key', () => {
  it('构造与解析可逆', () => {
    const key = cellFitKey('el-1-ab', 'st', 3, 2)
    expect(key).toBe('el-1-ab#st#3:2')
    expect(parseCellFitKey(key)).toEqual({ elementId: 'el-1-ab', kind: 'st', rowIndex: 3, colIndex: 2 })
  })

  it('元素级 key（无 #）与非法 key 均解析为 undefined', () => {
    expect(parseCellFitKey('el-1-ab')).toBeUndefined()
    expect(parseCellFitKey('el-1-ab#x#0:0')).toBeUndefined()
    expect(parseCellFitKey('el-1-ab#b#a:b')).toBeUndefined()
  })
})

// ─── 渲染输出 ───

function templateWith(element: TemplateElement): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [element],
  }
}

function textElement(options: Record<string, any>): TemplateElement {
  return { id: 't1', type: 'text', options: { left: 10, top: 10, width: 40, height: 8, fontSize: 12, ...options } }
}

function render(el: TemplateElement): string {
  return generateHtml(templateWith(el), [{ pageIndex: 0, sections: [{ elementId: el.id, type: 'element' }] }])
}

describe('文本元素三种形式的 HTML 输出', () => {
  it('截断（默认）：不加高度自适应样式，仅不换行时补省略号', () => {
    const html = render(textElement({}))
    expect(html).not.toContain('overflow:visible')
    expect(html).not.toContain('ellipsis')
    expect(render(textElement({ wordWrap: false }))).toContain('white-space:nowrap;text-overflow:ellipsis;')
  })

  it('自适应行高：放开裁剪且不写死高度，盒子由内容撑开（测量趟与最终趟一致）', () => {
    const template = templateWith(textElement({ textFit: 'autoHeight' }))
    const html = render(textElement({ textFit: 'autoHeight' }))
    expect(html).toContain('overflow:visible;')
    expect(html).not.toContain('height:8mm')
    // 测量趟同样不写死高度，实测高度即内容高度
    const measureHtml = generateHtml(template, [], undefined, { isMeasurementPass: true })
    expect(measureHtml).toContain('data-measure-id="t1"')
    expect(measureHtml).not.toContain('height:8mm')
  })

  it('自动缩小：容器保持裁剪，带测量趟所需标记与下限字号', () => {
    const html = render(textElement({ textFit: 'shrink', shrinkMinFontSize: 8 }))
    expect(html).toContain('data-fit="shrink"')
    expect(html).toContain('data-fit-key="t1"')
    expect(html).toContain('data-fit-base="12"')
    expect(html).toContain('data-fit-min="8"')
    expect(html).not.toContain('overflow:visible')
  })

  it('回写的自动缩小字号覆盖设计字号渲染', () => {
    const html = render(textElement({ textFit: 'shrink', _fitFontSize: 7.25 }))
    expect(html).toContain('font-size:7.25pt')
    expect(html).not.toContain('font-size:12pt')
  })
})

describe('表格单元格三种形式的 HTML 输出', () => {
  function tableElement(cellPatch: Record<string, any> = {}, opts: Record<string, any> = {}): TemplateElement {
    return {
      id: 'tb1',
      type: 'table',
      options: {
        left: 10, top: 10, width: 60, height: 16,
        tableColWidths: [30, 30],
        tableDefaultFontSize: 10,
        tableDefaultPadding: 1,
        _renderRows: [
          { type: 'header', height: 8, cells: [{ content: '标题', rowspan: 1, colspan: 1, merged: false }] },
          { type: 'data', height: 8, cells: [{ content: '内容', rowspan: 1, colspan: 1, merged: false, ...cellPatch }] },
        ] as RenderRow[],
        ...opts,
      },
    }
  }

  it('自适应行高（默认）：直接输出文本，不加定高容器', () => {
    const html = render(tableElement())
    expect(html).toContain('>内容</td>')
    expect(html).not.toContain('cell-fit')
  })

  it('截断：内容包定高容器，max-height 取可用高度', () => {
    const html = render(tableElement({ textFit: 'clip' }))
    expect(html).toContain('<div class="cell-fit" style="max-height:6mm;overflow:hidden">内容</div>')
  })

  it('截断 + 不换行：追加省略号声明', () => {
    const html = render(tableElement({ textFit: 'clip', wordWrap: false }))
    expect(html).toContain('max-height:6mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis')
  })

  it('自动缩小：带行/列定位 key 与可用高度，供测量趟回写字号', () => {
    const html = render(tableElement({ textFit: 'shrink' }))
    expect(html).toContain('data-fit="shrink"')
    expect(html).toContain('data-fit-key="tb1#b#1:0"')
    expect(html).toContain('data-fit-mm="6"')
    expect(html).toContain('data-fit-base="10"')
  })

  it('回写的字号优先于单元格/元素级字号', () => {
    const html = render(tableElement({ textFit: 'shrink', fontSize: 10, fittedFontSize: 6.5 }))
    expect(html).toContain('font-size:6.5pt')
  })
})
