import { describe, it, expect } from 'vitest'
import { buildBatchPageCss } from './css-builder.js'
import type { TemplateData } from './types.js'

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
