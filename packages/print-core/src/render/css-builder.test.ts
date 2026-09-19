import { describe, it, expect } from 'vitest'
import { buildBatchPageCss, buildPageCss, buildSheetPageCss } from './css-builder.js'
import type { TemplateData } from './types.js'
import type { TileLayout } from '../print/tiling.js'

function tpl(paperSize: 'A4' | 'CONTINUOUS'): TemplateData {
  return {
    paperSize,
    orientation: 'portrait',
    customWidth: 80,
    margins: { top: 0, right: 0, bottom: 2, left: 0 },
    header: { height: 0, elements: [] },
    footer: { height: 4, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
  } as unknown as TemplateData
}

describe('buildBatchPageCss', () => {
  it('固定纸：单一 @page + 份间分页，无命名页', () => {
    const css = buildBatchPageCss(tpl('A4'), [{}, {}])
    expect(css).toContain('@page {')
    expect(css).toContain('.print-copy:not(:last-child)')
    expect(css).not.toContain('@page copy0')
  })

  it('连续纸：每份命名页尺寸与作用域 min-height/footer top', () => {
    const css = buildBatchPageCss(tpl('CONTINUOUS'), [{ heightMm: 100 }, { heightMm: 200 }])
    expect(css).toContain('@page copy0 { size: 80mm 100mm')
    expect(css).toContain('@page copy1 { size: 80mm 200mm')
    expect(css).toContain('.print-copy-0 { page: copy0; }')
    expect(css).toContain('.print-copy-1 .print-page { min-height: 200mm; }')
    // footer top = 纸高 100 - 下边距 2 - 页脚 4 = 94mm
    expect(css).toContain('.print-copy-0 .page-footer { top: 94mm; }')
    expect(css).toContain('.print-copy:not(:last-child)')
  })
})

describe('buildSheetPageCss', () => {
  const layout: TileLayout = {
    tile: { width: 70, height: 40 },
    sheet: { width: 210, height: 297 },
    columns: 2,
    rows: 6,
    perSheet: 12,
    maxColumns: 2,
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    gapX: 2,
    gapY: 2,
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
    const label = { ...tpl('A4'), paperSize: 'CUSTOM', customWidth: 70, customHeight: 40 } as unknown as TemplateData
    const full = buildPageCss(label) + buildSheetPageCss(layout)
    expect(full.lastIndexOf('@page')).toBeGreaterThan(full.indexOf('@page'))
    expect(full.indexOf('size: 210mm 297mm')).toBeGreaterThan(full.indexOf('size: 70mm 40mm'))
  })

  it('预览期覆盖格内 .print-page 的 margin（SPIKE D1 回归保护）', () => {
    expect(css).toContain('.print-tile > .print-page { margin: 0; box-shadow: none; }')
  })
})
