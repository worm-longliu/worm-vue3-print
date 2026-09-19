// 自动缩小结果回写：元素 _fitFontSize / 单元格 fittedFontSize 的落点与最终 HTML 表现
import { describe, it, expect } from 'vitest'
import { applyTextFitSizes } from '../apply-text-fit.js'
import { prepareDocument } from '../pipeline.js'
import { createDomHostRuntime } from '../dom-host-runtime.js'
import { EXECUTOR, createFakeDriverFactory } from './fake-driver.js'
import type { TemplateData, TemplateElement, RenderRow } from '../../render/types.js'

function textEl(overrides: Record<string, any> = {}): TemplateElement {
  return {
    id: 't1',
    type: 'text',
    options: { left: 0, top: 0, width: 50, height: 10, fontSize: 12, textFit: 'shrink', ...overrides },
  }
}

function tableEl(rows: RenderRow[]): TemplateElement {
  return {
    id: 'tb1',
    type: 'table',
    options: {
      left: 0, top: 20, width: 60, tableColWidths: [30, 30], tableDefaultFontSize: 10,
      _renderRows: rows,
      _subtotalTemplates: [{ type: 'subtotal', height: 8, cells: [{ content: '合计', merged: false, rowspan: 1, colspan: 1, textFit: 'shrink' }] }] as RenderRow[],
      _summaryRows: [] as RenderRow[],
    },
  }
}

function template(elements: TemplateElement[]): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements,
  } as TemplateData
}

describe('applyTextFitSizes', () => {
  it('元素级 key 写入 options._fitFontSize（并保留两位小数）', () => {
    const el = textEl()
    applyTextFitSizes(template([el]), [{ key: 't1', fontSizePt: 9.6233 }])
    expect(el.options._fitFontSize).toBe(9.62)
  })

  it('单元格 key 写入对应渲染行单元格的 fittedFontSize，并区分正文/小计/汇总行类别', () => {
    const body: RenderRow = { type: 'data', height: 8, cells: [{ content: '内容', merged: false, rowspan: 1, colspan: 1 }] }
    const el = tableEl([body])
    applyTextFitSizes(template([el]), [
      { key: 'tb1#b#0:0', fontSizePt: 7 },
      { key: 'tb1#st#0:0', fontSizePt: 5.5 },
    ])
    expect((el.options._renderRows as RenderRow[])[0]!.cells[0]!.fittedFontSize).toBe(7)
    expect((el.options._subtotalTemplates as RenderRow[])[0]!.cells[0]!.fittedFontSize).toBe(5.5)
  })

  it('页眉/页脚/首页叠加区元素同样可回写（这些区域也参与测量趟）', () => {
    const header = textEl({ textFit: 'shrink' })
    header.id = 'h1'
    const data = template([])
    data.header.elements = [header]
    applyTextFitSizes(data, [{ key: 'h1', fontSizePt: 8 }])
    expect(header.options._fitFontSize).toBe(8)
  })

  it('未命中 key、非数字下标一律静默跳过，不抛错', () => {
    const el = tableEl([{ type: 'data', height: 8, cells: [{ content: '内容', merged: false, rowspan: 1, colspan: 1 }] }])
    expect(() => applyTextFitSizes(template([el]), [
      { key: 'missing', fontSizePt: 8 },
      { key: 'tb1#b#9:9', fontSizePt: 8 },
      { key: 'tb1#zz#0:0', fontSizePt: 8 },
    ])).not.toThrow()
    expect((el.options._renderRows as RenderRow[])[0]!.cells[0]!.fittedFontSize).toBeUndefined()
  })

  it('空清单直接返回', () => {
    const el = textEl()
    applyTextFitSizes(template([el]), [])
    expect(el.options._fitFontSize).toBeUndefined()
  })
})

describe('管线串联：自动缩小结果进入最终 HTML', () => {
  it('测量趟返回的字号写回后，最终 HTML 用缩小后的字号渲染（元素与单元格）', async () => {
    const rows: RenderRow[] = [{ type: 'data', height: 8, cells: [{ content: '内容', merged: false, rowspan: 1, colspan: 1 }] }]
    const data = template([textEl(), tableEl(rows)])
    const fake = createFakeDriverFactory({
      measurements: [
        { id: 't1', heightPx: 38 },
        { id: 'tb1', heightPx: 38, rowHeightsPx: [30] },
      ],
      fits: [
        { key: 't1', fontSizePt: 8.5 },
        { key: 'tb1#b#0:0', fontSizePt: 6.5 },
      ],
    })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    const result = await prepareDocument({ templateJson: data }, runtime)

    expect(result.html).toContain('font-size:8.5pt')
    expect(result.html).toContain('font-size:6.5pt')
    // 测量趟 HTML 不带回写字号（缩写在页面内完成），只带标记
    expect(fake.documents[0]).toContain('data-fit="shrink"')
    expect(fake.documents[0]).not.toContain('font-size:8.5pt')
  })
})
