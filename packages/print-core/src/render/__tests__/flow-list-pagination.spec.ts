// 动态流式列表按行分页：切片区间、内边距/边框预算、单行超高与连续纸单片、切片 HTML 闭合容器；下方跟随区归属。
import { describe, it, expect } from 'vitest'
import { paginate, collectFollowMemberIds } from '../pagination-engine.js'
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

  it('实测行高不完整时按配置行高兜底，后续行不丢失', () => {
    const tpl = template({
      top: 0, flowLayoutMode: 'dynamic', flowColumns: 1, flowRowHeight: 8,
      _flowRows: flowRows(['黄芪', '红花', '桃仁']),
    })
    const pages = paginate(tpl, measured('fl', [8]))
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

// ─── 下方跟随区（与表格共用规则：同页承接末片 / 放不下整体移页 / 中间页不重复） ───

/** 多元素模板：A4 竖版，边距 10，无页眉页脚 */
function multiTemplate(elements: Array<Record<string, any>>): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: elements as any,
  }
}

function flowListEl(id: string, top: number, height: number, rows: any[], options: Record<string, any> = {}): Record<string, any> {
  return {
    id, type: 'flowList',
    options: { left: 0, top, width: 100, height, flowLayoutMode: 'dynamic', flowColumns: 1, ...options, _flowRows: rows },
  }
}

function followTextEl(id: string, top: number, height: number, options: Record<string, any> = {}): Record<string, any> {
  return { id, type: 'text', options: { left: 0, top, width: 100, height, ...options } }
}

function measuredMulti(
  entries: Array<{ id: string; measuredHeight?: number; flowRowHeights?: number[]; rowHeights?: number[] }>,
): Map<string, MeasuredElement> {
  return new Map(entries.map(e => [e.id, {
    id: e.id,
    measuredHeight: e.measuredHeight ?? (e.flowRowHeights ?? e.rowHeights ?? []).reduce((s, h) => s + h, 0),
    ...(e.flowRowHeights ? { measuredFlowRowHeights: e.flowRowHeights } : {}),
    ...(e.rowHeights ? { measuredRowHeights: e.rowHeights } : {}),
  }]))
}

/** 表格元素（3 行×8mm 设计）：动态列表上方，验证动态列表不被表格认领 */
function aboveTableEl(id: string, top: number): Record<string, any> {
  return {
    id, type: 'table',
    options: {
      left: 0, top, width: 100, height: 24,
      tableRows: [{ height: 8 }, { height: 8 }, { height: 8 }],
      _renderRows: Array.from({ length: 3 }, () => ({
        type: 'data', height: 8, cells: [{ content: '', rowspan: 1, colspan: 1, merged: false }],
      })),
      _repeatHeaderCount: 0,
    },
    tablePagination: { enabled: true },
  }
}

function followGroups(pages: PageLayout[]): Array<PageSection & { pageIndex: number }> {
  return pages.flatMap(p =>
    p.sections
      .filter(s => s.type === 'flow-group')
      .map(s => ({ ...(s as PageSection), pageIndex: p.pageIndex })),
  )
}

describe('动态列表下方跟随区', () => {
  const ROWS_20 = flowRows(Array.from({ length: 20 }, (_, i) => `药${i}`))

  it('跟随区放得下：列表末片升级为 flow-group 同页承接，全程只出现一次', () => {
    // 20 行×20mm → 首页 13 行（260mm），续页 7 行；列表设计底部 400，跟随文本紧跟其下
    const tpl = multiTemplate([
      flowListEl('fl', 0, 400, ROWS_20),
      followTextEl('after', 400, 10, { formatter: '合计' }),
    ])
    const pages = paginate(tpl, measuredMulti([
      { id: 'fl', flowRowHeights: Array(20).fill(20) },
      { id: 'after', measuredHeight: 10 },
    ]))
    expect(pages).toHaveLength(2)
    // 末片升级为 flow-group：保留切片行区间与 renderTop，承接跟随成员
    const lastSection = pages.at(-1)!.sections.at(-1)
    expect(lastSection).toMatchObject({
      type: 'flow-group', elementId: 'fl',
      startFlowRow: 13, endFlowRow: 20, renderTop: 0,
      followElementIds: ['after'],
    })
    // 跟随区只在末片所在页出现：全程唯一
    expect(followGroups(pages).filter(g => g.elementId === 'fl')).toHaveLength(1)
    // 跟随文本不再按普通元素重复渲染
    for (const page of pages) {
      expect(page.sections.some(s => s.type === 'element' && s.elementId === 'after')).toBe(false)
    }
  })

  it('首页同列已有元素时不重复累计列表设计 top，跟随区按实际底部承接', () => {
    // 标题 0~30、列表 30~210、跟随区 210~250，均可放进 275mm 分页预算。
    const tpl = multiTemplate([
      followTextEl('title', 0, 30, { formatter: '标题' }),
      flowListEl('fl', 30, 180, flowRows(Array.from({ length: 9 }, (_, i) => `药${i}`))),
      followTextEl('after', 230, 20, { formatter: '合计' }),
    ])
    const pages = paginate(tpl, measuredMulti([
      { id: 'title', measuredHeight: 30 },
      { id: 'fl', flowRowHeights: Array(9).fill(20) },
      { id: 'after', measuredHeight: 20 },
    ]))
    expect(pages).toHaveLength(1)
    expect(followGroups(pages)).toHaveLength(1)
    expect(pages[0]!.sections.at(-1)).toMatchObject({
      type: 'flow-group', elementId: 'fl', groupTop: 30,
      startFlowRow: 0, endFlowRow: 9, followElementIds: ['after'],
    })
  })

  it('跟随区放不下：整体移到新页 groupTop=0 且 startFlowRow/endFlowRow 归零，只渲染跟随区', () => {
    // 页边距收窄：contentHeight = 297−10−250 = 37，预算 35；2 行×30mm 每页一行
    const tpl = multiTemplate([
      flowListEl('fl', 0, 60, flowRows(['黄芪', '红花'])),
      followTextEl('after', 60, 10, { formatter: '合计' }),
    ])
    tpl.margins.bottom = 250
    const pages = paginate(tpl, measuredMulti([
      { id: 'fl', flowRowHeights: [30, 30] },
      { id: 'after', measuredHeight: 10 },
    ]))
    expect(pages).toHaveLength(3)
    expect(flowSlices(pages)).toEqual([
      { pageIndex: 0, startFlowRow: 0, endFlowRow: 1, renderTop: 0 },
      { pageIndex: 1, startFlowRow: 1, endFlowRow: 2, renderTop: 0 },
    ])
    // 移页：仅有跟随区的新页，容器从页顶开始
    const moved = pages.at(-1)!
    expect(moved.sections).toHaveLength(1)
    expect(moved.sections[0]).toMatchObject({
      type: 'flow-group', elementId: 'fl', groupTop: 0, startFlowRow: 0, endFlowRow: 0,
      followElementIds: ['after'],
    })
    expect(followGroups(pages).filter(g => g.elementId === 'fl')).toHaveLength(1)
    // 中间页不出现跟随区
    const movedHtml = generateHtml(tpl, pages).split('<section class="print-page').at(-1)!
    expect(movedHtml).toContain('class="flow-follow"')
    expect(movedHtml).toContain('合计')
    expect(movedHtml).not.toContain('print-flowlist-slice')
  })

  it('无横向交集或设计上位于列表顶部的元素不进入跟随区', () => {
    const tpl = multiTemplate([
      flowListEl('fl', 0, 40, flowRows(['黄芪', '红花'])),
      followTextEl('above', 10, 8, { formatter: '上方' }),
      followTextEl('after', 40, 10, { formatter: '合计' }),
      { id: 'far', type: 'text', options: { left: 200, top: 50, width: 30, height: 8 } },
    ])
    const pages = paginate(tpl, measuredMulti([
      { id: 'fl', flowRowHeights: [20, 20] },
      { id: 'above', measuredHeight: 8 },
      { id: 'after', measuredHeight: 10 },
      { id: 'far', measuredHeight: 8 },
    ]))
    const group = followGroups(pages).find(g => g.elementId === 'fl')
    expect(group?.followElementIds).toEqual(['after'])
    // 匹配外元素仍按普通元素落位
    const elementIds = pages.flatMap(p => p.sections).filter(s => s.type === 'element').map(s => s.elementId)
    expect(elementIds).toContain('above')
    expect(elementIds).toContain('far')
  })

  it('collectFollowMemberIds 与分页引擎同源：动态列表为锚点，旁侧元素不认领', () => {
    const elements = [
      flowListEl('fl', 0, 40, flowRows(['黄芪', '红花'])),
      followTextEl('after', 40, 10),
      { id: 'far', type: 'text', options: { left: 200, top: 50, width: 30, height: 8 } },
    ]
    const ids = collectFollowMemberIds(elements)
    expect(ids.has('after')).toBe(true)
    expect(ids.has('fl')).toBe(false)
    expect(ids.has('far')).toBe(false)
  })

  it('上方表格不把动态列表认领为普通跟随成员，动态列表自建跟随区', () => {
    const tpl = multiTemplate([
      aboveTableEl('tbl-1', 10),
      flowListEl('fl', 34, 16, flowRows(['黄芪', '红花'])),
      followTextEl('after2', 50, 10, { formatter: '合计' }),
    ])
    const pages = paginate(tpl, measuredMulti([
      { id: 'tbl-1', rowHeights: [8, 8, 8] },
      { id: 'fl', flowRowHeights: [8, 8] },
      { id: 'after2', measuredHeight: 10 },
    ]))
    // 表格跟随区不含动态列表（动态列表是它自己的锚点），after2 归入最近的动态列表
    const tblGroups = followGroups(pages).filter(g => g.elementId === 'tbl-1')
    expect(tblGroups).toHaveLength(0)
    // 动态列表单页即可装下：唯一切片直接升级为 flow-group（首片用设计 top 34）承接 after2
    expect(flowSlices(pages)).toEqual([])
    const group = followGroups(pages).find(g => g.elementId === 'fl')
    expect(group).toMatchObject({
      type: 'flow-group', startFlowRow: 0, endFlowRow: 2,
      followElementIds: ['after2'], groupTop: 34,
    })
    expect(group?.renderTop).toBe(34)
  })
})

describe('动态列表与普通编组隔离', () => {
  it('动态列表携带 groupId 时其他编组成员不被跳过', () => {
    const tpl = multiTemplate([
      flowListEl('fl', 0, 8, flowRows(['黄芪']), { groupId: 'g1' }),
      followTextEl('other', 20, 8, { groupId: 'g1', formatter: '编组文本' }),
    ])
    const pages = paginate(tpl, measuredMulti([
      { id: 'fl', flowRowHeights: [8] },
      { id: 'other', measuredHeight: 8 },
    ]))
    const ids = pages.flatMap(p => p.sections).map(s => s.elementId)
    expect(ids).toContain('fl')
    expect(ids).toContain('other')
  })
})

describe('跟随区 HTML：列表末片升级为 flow-group', () => {
  it('切片相对文档流（不带绝对定位 top），保留 box-sizing/完整边框/四边 padding，follow 紧随切片底部', () => {
    // chrome = 上下内边距 4mm + 上下 1pt 边框 ≈ 4.705mm；设计高度回写 chrome + 3 行×8mm
    const chrome = 4 + 2 * (25.4 / 72)
    const designHeight = Math.round((chrome + 24) * 1000) / 1000
    const tpl = multiTemplate([
      flowListEl('fl', 0, designHeight, flowRows(['黄芪', '红花', '桃仁']), {
        flowPaddingTop: 2, flowPaddingRight: 3, flowPaddingBottom: 2, flowPaddingLeft: 4,
        borderWidth: 1,
      }),
      followTextEl('after', designHeight, 10, { formatter: '合计' }),
    ])
    const pages = paginate(tpl, measuredMulti([
      { id: 'fl', flowRowHeights: [8, 8, 8] },
      { id: 'after', measuredHeight: 10 },
    ]))
    const html = generateHtml(tpl, pages)

    // 整个文档只有切片在 flow-group 内的这一次输出（无独立 table-slice 分节）
    expect(html).toContain('class="flow-group"')
    expect(html).toContain('class="flow-slice"')
    const sliceIdx = html.indexOf('class="print-flowlist-slice"')
    const followIdx = html.indexOf('class="flow-follow"')
    expect(sliceIdx).toBeGreaterThan(-1)
    expect(followIdx).toBeGreaterThan(sliceIdx)
    const sliceSegment = html.slice(sliceIdx, followIdx)
    expect(sliceSegment).toContain('box-sizing:border-box')
    expect(sliceSegment).toContain('border:1pt solid #000;')
    expect(sliceSegment).toContain('padding:2mm 3mm 2mm 4mm;')
    // group 内切片走相对文档流，绝不复用绝对定位 + top（否则坐标翻倍）
    expect(sliceSegment).not.toContain('position:absolute')
    expect(sliceSegment).toContain('桃仁')
    expect(html).toContain('合计')
  })
})

describe('切片 HTML 闭合容器', () => {
  it('verticalAlign 不把切片容器改成横向 flex', () => {
    const tpl = template({
      top: 0, height: 8, flowLayoutMode: 'dynamic', flowColumns: 1,
      verticalAlign: 'middle', _flowRows: flowRows(['黄芪', '红花']),
    })
    const html = generateHtml(tpl, paginate(tpl, measured('fl', [8, 8])))
    const style = html.match(/<div class="print-flowlist-slice" style="([^"]*)"/)?.[1] ?? ''
    const displays = [...style.matchAll(/display:([^;]+)/g)].map(m => m[1])
    expect(displays.at(-1)).toBe('block')
  })

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
