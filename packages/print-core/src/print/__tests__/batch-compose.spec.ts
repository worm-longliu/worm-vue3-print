import { describe, it, expect } from 'vitest'
import { composeBatchHtml } from '../batch-compose.js'
import type { BatchCopyInput } from '../batch-compose.js'
import type { TemplateData, PageLayout } from '../../render/types.js'

function tpl(paperSize: 'A4' | 'CONTINUOUS'): TemplateData {
  return {
    paperSize, orientation: 'portrait', customWidth: 80,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
  } as unknown as TemplateData
}

function copy(bound: TemplateData, pages: number, heightMm: number | undefined): BatchCopyInput {
  const pageLayouts: PageLayout[] = Array.from({ length: pages }, (_, i) => ({
    pageIndex: i, sections: [],
  }))
  return {
    bound, pageLayouts, data: {},
    derivedHeightMm: heightMm,
    paperMm: { width: 80, height: heightMm ?? 297 },
    heightSource: heightMm ? 'derived' : 'config',
  }
}

describe('composeBatchHtml', () => {
  it('固定纸：两份合并为一个文档，section 数=2，pageCount 求和', () => {
    const bound = tpl('A4')
    const r = composeBatchHtml([copy(bound, 1, undefined), copy(bound, 3, undefined)])
    expect(r.pageCount).toBe(4)
    expect(r.copyPaperMm).toHaveLength(2)
    expect(r.html).toContain('<!DOCTYPE html>')
    expect(r.html).toContain('<section class="print-copy">')
    expect((r.html.match(/<section class="print-copy">/g) ?? []).length).toBe(2)
    expect(r.html).toContain('data-page="1"')
    expect(r.html).toContain('data-page="3"')
    expect(r.html).not.toContain('@page copy0')
    expect(r.html).toContain('.print-copy:not(:last-child)')
  })

  it('连续纸：每份带索引 class 与命名页，纸高取自各份', () => {
    const bound = tpl('CONTINUOUS')
    const r = composeBatchHtml([copy(bound, 1, 100), copy(bound, 1, 200)])
    expect(r.html).toContain('<section class="print-copy print-copy-0">')
    expect(r.html).toContain('<section class="print-copy print-copy-1">')
    expect(r.html).toContain('@page copy0 { size: 80mm 100mm')
    expect(r.html).toContain('@page copy1 { size: 80mm 200mm')
    expect(r.copyPaperMm).toEqual([{ width: 80, height: 100 }, { width: 80, height: 200 }])
  })

  it('单份批量也强制不额外分页（最后一份 no break）', () => {
    const r = composeBatchHtml([copy(tpl('A4'), 2, undefined)])
    expect((r.html.match(/<section class="print-copy">/g) ?? []).length).toBe(1)
  })
})
