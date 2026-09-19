import { describe, it, expect } from 'vitest'
import { composeTiledHtml } from '../tile-compose.js'
import { computeTileLayout } from '../tiling.js'
import { bindData } from '../../render/data-binder.js'
import type { TileInput } from '../tile-compose.js'
import type { TemplateData, PageLayout } from '../../render/types.js'

const TILING = {
  enabled: true,
  columns: 2,
  gapX: 2,
  gapY: 2,
  sheetPaperSize: 'A4' as const,
  sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
}

/** 70×40mm 标签模板，内容为一个绑定 {title} 的文本元素 */
function tpl(): TemplateData {
  return {
    paperSize: 'CUSTOM',
    customWidth: 70,
    customHeight: 40,
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

/** 每份恰好 1 页的最小输入；bound 走真实 bindData，保证文本已求值 */
function inputs(count: number): TileInput[] {
  const pageLayouts: PageLayout[] = [{ pageIndex: 0, sections: [{ elementId: 't1', type: 'element' }] }]
  return Array.from({ length: count }, (_, i) => {
    const data = { title: `L${String(i + 1).padStart(2, '0')}` }
    return { bound: bindData(tpl(), data), pageLayouts, data }
  })
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
