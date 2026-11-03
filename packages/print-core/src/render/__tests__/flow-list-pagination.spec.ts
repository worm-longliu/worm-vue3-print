// 动态流式列表按行分页：切片区间、内边距/边框预算、单行超高与连续纸单片、切片 HTML 闭合容器。
import { describe, it, expect } from 'vitest'
import { paginate } from '../pagination-engine.js'
import { generateHtml } from '../html-generator.js'
import { bindData } from '../data-binder.js'
import type { TemplateData, MeasuredElement, PageLayout, PageSection } from '../types.js'

function template(options: Record<string, any>): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{
      id: 'fl',
      type: 'flowList' as any,
      options: { left: 0, top: 0, width: 100, fontSize: 12, ...options },
    } as any],
  }
}

function flowRows(texts: string[]): any[] {
  return texts.map(text => ({ cells: [{ text, span: 1 }] }))
}

function measured(id: string, rowHeights: number[]): Map<string, MeasuredElement> {
  return new Map([[
    id,
    {
      id,
      measuredHeight: rowHeights.reduce((s, h) => s + h, 0),
      measuredFlowRowHeights: rowHeights,
    },
  ]])
}

/** 提取动态列表切片：pageIndex + 半开行区间 + 定位 top */
function flowSlices(pages: PageLayout[]): Array<Pick<PageSection, 'startFlowRow' | 'endFlowRow' | 'renderTop'> & { pageIndex: number }> {
  return pages.flatMap(p =>
    p.sections
      .filter(s => s.type === 'flow-list-slice')
      .map(s => ({
        pageIndex: p.pageIndex,
        startFlowRow: s.startFlowRow,
        endFlowRow: s.endFlowRow,
        renderTop: s.renderTop,
      })),
  )
}

describe('动态列表按行切片', () => {
  it('首页从设计 top 起排，装不下的行滚到续页（renderTop 0）', () => {
    // A4 边距 10 → 内容高 277、预算 275；设计 top 260 → 首片剩余 275-260-上下内边距4 = 11mm，只能放一行
    const tpl = template({
      top: 260, height: 24, flowLayoutMode: 'dynamic',
      flowColumns: 1, flowPaddingTop: 2, flowPaddingBottom: 2,
      _flowRows: flowRows(['黄芪', '红花', '桃仁']),
    })
    const pages = paginate(tpl, measured('fl', [8, 8, 8]))
    expect(flowSlices(pages)).toEqual([
      { pageIndex: 0, startFlowRow: 0, endFlowRow: 1, renderTop: 260 },
      { pageIndex: 1, startFlowRow: 1, endFlowRow: 3, renderTop: 0 },
    ])
  })

  it('单行超高整页：只有一片且标记 overflow，不出现前置空页', () => {
    const tpl = template({
      top: 0, flowLayoutMode: 'dynamic',
      flowColumns: 1, flowPaddingTop: 2, flowPaddingBottom: 2,
      _flowRows: flowRows(['超大行']),
    })
    const pages = paginate(tpl, measured('fl', [300]))
    const slices = flowSlices(pages)
    expect(slices).toEqual([{ pageIndex: 0, startFlowRow: 0, endFlowRow: 1, renderTop: 0 }])
    expect(pages.some(p => p.overflow)).toBe(true)
  })

  it('超高行之前已有普通行时先收前片，超高行单独进入续页', () => {
    const tpl = template({
      top: 0, flowLayoutMode: 'dynamic', flowColumns: 1,
      _flowRows: flowRows(['普通行', '超大行']),
    })
    const pages = paginate(tpl, measured('fl', [8, 300]))
    expect(flowSlices(pages)).toEqual([
      { pageIndex: 0, startFlowRow: 0, endFlowRow: 1, renderTop: 0 },
      { pageIndex: 1, startFlowRow: 1, endFlowRow: 2, renderTop: 0 },
    ])
    expect(pages[0]?.overflow).toBeUndefined()
    expect(pages[1]?.overflow).toBe(true)
  })

  it('连续纸只剩单行区间一整片（endFlowRow=3）', () => {
    const tpl = template({
      top: 0, flowLayoutMode: 'dynamic',
      flowColumns: 1, flowPaddingTop: 2, flowPaddingBottom: 2,
      _flowRows: flowRows(['黄芪', '红花', '桃仁']),
    })
    tpl.paperSize = 'CONTINUOUS' as any
    const pages = paginate(tpl, measured('fl', [8, 8, 8]))
    expect(flowSlices(pages)).toEqual([
      { pageIndex: 0, startFlowRow: 0, endFlowRow: 3, renderTop: 0 },
    ])
  })

  it('四边内边距与上下边框进入预算：挤掉本来能放下的行', () => {
    // chrome = 上下内边距 2+2 + 上下 1pt(=25.4/72mm) 边框 ≈ 4.705mm
    // 行高 135.2：两行 270.4 ≤ 275（无 chrome 时单片装下），加 chrome 后超出预算 → 换页
    const rows = flowRows(['一', '二'])
    const build = () => template({
      top: 0, flowLayoutMode: 'dynamic',
      flowColumns: 1, flowPaddingTop: 2, flowPaddingBottom: 2,
      borderWidth: 1,
      _flowRows: rows,
    })
    expect(flowSlices(paginate(build(), measured('fl', [135.2, 135.2])))).toEqual([
      { pageIndex: 0, startFlowRow: 0, endFlowRow: 1, renderTop: 0 },
      { pageIndex: 1, startFlowRow: 1, endFlowRow: 2, renderTop: 0 },
    ])
    // 行高贴满可用预算（275 - chrome）：单行放得下，两行必换页
    const hFull = 275 - 4 - 2 * (25.4 / 72)
    expect(flowSlices(paginate(build(), measured('fl', [hFull, hFull])))).toEqual([
      { pageIndex: 0, startFlowRow: 0, endFlowRow: 1, renderTop: 0 },
      { pageIndex: 1, startFlowRow: 1, endFlowRow: 2, renderTop: 0 },
    ])
  })

  it('空行区间不输出空切片', () => {
    const tpl = template({
      top: 0, flowLayoutMode: 'dynamic', flowColumns: 1, _flowRows: [],
    })
    const pages = paginate(tpl, measured('fl', []))
    expect(flowSlices(pages)).toEqual([])
    expect(pages).toEqual([{ pageIndex: 0, sections: [] }])
  })
})

describe('切片 HTML 闭合容器', () => {
  it('每个切片容器输出四边 padding、元素边框与本片文本，下一片不带上一片文本', () => {
    let tpl = template({
      top: 260, height: 24, flowLayoutMode: 'dynamic',
      flowColumns: 1, flowRowHeight: 8, flowPaddingTop: 2, flowPaddingRight: 3,
      flowPaddingBottom: 2, flowPaddingLeft: 4,
      borderWidth: 1,
      formatter: '{name}', dataSource: 'drugs',
    })
    const data = { drugs: [{ name: '黄芪' }, { name: '红花' }, { name: '桃仁' }] }
    tpl = bindData(tpl, data)
    const pages = paginate(tpl, measured('fl', [8, 8, 8]))
    const html = generateHtml(tpl, pages, data)

    // 按切片起点切段：非贪婪正则会误截到第一行的 </div>
    const starts = [...html.matchAll(/<div class="print-flowlist-slice"/g)].map(m => m.index ?? 0)
    expect(starts).toHaveLength(2)
    const slices = starts.map((start, i) =>
      html.slice(start, i + 1 < starts.length ? starts[i + 1]! : html.length),
    )
    for (const slice of slices) {
      expect(slice).toContain('padding:2mm 3mm 2mm 4mm;')
      expect(slice).toContain('border:1pt solid #000;')
      // 容器不写死高度（高度由本片行高、内边距与边框撑开），也不依赖 overflow 裁切
      const style = slice.match(/style="([^"]*)"/)?.[1] ?? ''
      expect(style).not.toMatch(/(?:^|;)height:\d/)
      expect(style).toContain('height:auto')
      expect(style).toContain('box-sizing:border-box')
      expect(style).not.toContain('overflow:hidden')
    }
    const texts = slices.map(s =>
      [...s.matchAll(/<div class="print-flow-cell"[^>]*>([^<]*)<\/div>/g)].map(m => m[1]),
    )
    expect(texts[0]).toEqual(['黄芪'])
    expect(texts[1]).toEqual(['红花', '桃仁'])
  })
})
