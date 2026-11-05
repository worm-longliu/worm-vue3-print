// print-core/src/render/pagination-engine.2d.test.ts
// 二维占用分页预算（Gitee #IKOUJI）：纵向预算按「横向相交」分列记账，
// 互不相交的元素不互相占用版面；隐式堆叠簇同样要求横向相交。
import { describe, it, expect } from 'vitest'
import { paginate } from './pagination-engine.js'
import type { TemplateData, MeasuredElement } from './types.js'

/** 报告人纸张：DOT_HALF 241×139.7、边距 10、页眉页脚各 10 → 内容高 99.7、预算 97.7 */
function dotHalfPaper(elements: Array<Record<string, any>>): TemplateData {
  return {
    paperSize: 'CUSTOM', orientation: 'portrait',
    customWidth: 241, customHeight: 139.7,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    elements: elements as any,
  }
}

/** 自定义纸（内容高 = height - 上下边距 20） */
function customPaper(width: number, height: number, elements: Array<Record<string, any>>): TemplateData {
  return {
    paperSize: 'CUSTOM', orientation: 'portrait',
    customWidth: width, customHeight: height,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: elements as any,
  }
}

function el(id: string, type: string, left: number, top: number, width: number, height: number, extra: Record<string, any> = {}): Record<string, any> {
  return { id, type, options: { left, top, width, height, ...extra } }
}

function heightMap(entries: Array<[string, number]>): Map<string, MeasuredElement> {
  return new Map(entries.map(([id, h]) => [id, { id, measuredHeight: h }]))
}

/** 表格实测：整表高 = 行高之和 */
function tableMeasure(id: string, rowHeights: number[], repeatCount = 0): [string, MeasuredElement] {
  return [id, {
    id,
    measuredHeight: rowHeights.reduce((s, h) => s + h, 0),
    measuredRowHeights: rowHeights,
    repeatHeaderHeight: rowHeights.slice(0, repeatCount).reduce((s, h) => s + h, 0),
  }]
}

describe('二维占用预算：横向不相交的元素不互相占高（Gitee #IKOUJI）', () => {
  /**
   * 报告人模板几何：左右两条与表格横向不相交的竖线（x[11.3..14.8]、x[216.3..218.1]），
   * 表格 x[25.8..175.8] 设计底部 47.98，横线 x[65.5..136.1] top 86.87（设计上落在表格跟随区）。
   * 旧口径把两条竖线的全高累加进整页预算（55.94 + 35.3 = 91.2 / 97.7），
   * 跟随区 40.69mm 判为放不下 → 横线整段挪到第 2 页，设计坐标丢失。
   */
  function ikoujiTemplate(): TemplateData {
    return dotHalfPaper([
      el('v1', 'vline', 11.278233333333334, 7.38431666666667, 3.5, 55.9375),
      el('v2', 'vline', 216.32991666666666, 36.75316666666667, 1.8, 35.3),
      el('h1', 'hline', 65.53041666666668, 86.86973333333333, 70.6, 1.8),
      el('tb', 'table', 25.83041666666667, 15.696116666666672, 150, 32.28, {
        _renderRows: [
          { type: 'header', height: 8, cells: [{ content: '', rowspan: 1, colspan: 1, merged: false }] },
          { type: 'header', height: 8, cells: [{ content: '', rowspan: 1, colspan: 1, merged: false }] },
        ],
        _repeatHeaderCount: 2,
        tablePagination: { enabled: true },
      }),
    ])
  }

  it('横竖线与表格横向不相交时，横线仍以表格设计 top 成 flow-group 留在首页', () => {
    const measured = new Map<Array<[string, MeasuredElement]>>([
      ...heightMap([['v1', 55.9375], ['v2', 35.3], ['h1', 1.8]]),
      tableMeasure('tb', [8, 8], 2),
    ])
    const pages = paginate(ikoujiTemplate(), measured)

    expect(pages).toHaveLength(1)
    const group = pages[0].sections.find(s => s.elementId === 'tb')
    expect(group).toMatchObject({ type: 'flow-group', groupTop: 15.696116666666672 })
    expect(group!.followElementIds).toEqual(['h1'])
  })

  it('两条横向互不相交的竖线各自计列：满高竖线不把同页右列元素挤到下一页', () => {
    // 内容高 99.7、预算 97.7：左列竖线 90mm 只占自己列，右列 60mm 竖线仍放得下
    const tpl = dotHalfPaper([
      el('a', 'vline', 0, 0, 2, 90),
      el('b', 'vline', 200, 0, 2, 60),
    ])
    const pages = paginate(tpl, heightMap([['a', 90], ['b', 60]]))
    expect(pages).toHaveLength(1)
    expect(pages[0].sections.map(s => s.elementId)).toEqual(['a', 'b'])
  })

  it('同列（横向相交）堆叠元素的累计口径不变：合计超预算仍换页', () => {
    // 现状锁定用例（改动前后都应为 2 页）：同列 e1 60 + e2 60 > 预算 97.7
    const tpl = dotHalfPaper([
      el('e1', 'text', 0, 0, 200, 60),
      el('e2', 'text', 0, 60, 200, 60),
    ])
    const pages = paginate(tpl, heightMap([['e1', 60], ['e2', 60]]))
    expect(pages).toHaveLength(2)
    expect(pages[1].sections[0]).toMatchObject({ elementId: 'e2', renderTop: 0 })
  })

  it('同列口径不变：底边越过纸面时仍留本页并标 overflow（既有契约，本次不动）', () => {
    // 内容高 99.7、预算 97.7：pre 占 8，e（top 100 h10）按本列剩余判为放得下，
    // 沿用设计坐标留在本页；底边 110 越过内容区 → 只上报裁切风险，由上层（拼版）阻断
    const tpl = dotHalfPaper([
      el('pre', 'text', 0, 0, 200, 8),
      el('e', 'text', 0, 100, 200, 10),
    ])
    const pages = paginate(tpl, heightMap([['pre', 8], ['e', 10]]))
    expect(pages).toHaveLength(1)
    expect(pages[0].sections.map(s => s.elementId)).toEqual(['pre', 'e'])
    expect(pages[0].sections[1]).toMatchObject({ elementId: 'e', renderTop: 100 })
    expect(pages[0].overflow).toBe(true)
  })
})

describe('隐式堆叠簇与换页光标同样按横向区间判定', () => {
  it('纵向相交但横向不相交的两个元素不再并成同页簇：各自按本列预算落位', () => {
    // 内容高 80、预算 78：整宽矩形占 60 → 本列剩余 18
    // A（x[0..20] h10）放得下；B（x[40..60] h60）放不下 → 只 B 换页
    const tpl = customPaper(100, 100, [
      el('pre', 'rect', 0, 0, 100, 60),
      el('A', 'text', 0, 65, 20, 10),
      el('B', 'text', 40, 65, 20, 60),
    ])
    const pages = paginate(tpl, heightMap([['pre', 60], ['A', 10], ['B', 60]]))

    expect(pages[0].sections.map(s => s.elementId)).toEqual(['pre', 'A'])
    expect(pages[0].sections.find(s => s.elementId === 'A')).toMatchObject({ renderTop: 65 })
    expect(pages[1].sections.map(s => s.elementId)).toEqual(['B'])
  })

  it('换页后并排不交的元素各贴本列已占底部：右列不必跟随左列光标下移', () => {
    // 预算 78：big（整宽 h70）落页1 → 剩 8；a（x[0..20] h20）放不下换页2 贴页顶；
    // b（x[40..60] h10）与 a 横向不相交 → 应贴 b 自己列的 0，而不是 a 之后的光标 20
    const tpl = customPaper(100, 100, [
      el('big', 'text', 0, 0, 100, 70),
      el('a', 'text', 0, 75, 20, 20),
      el('b', 'text', 40, 100, 20, 10),
    ])
    const pages = paginate(tpl, heightMap([['big', 70], ['a', 20], ['b', 10]]))

    expect(pages).toHaveLength(2)
    expect(pages[1].sections.find(s => s.elementId === 'a')).toMatchObject({ renderTop: 0 })
    expect(pages[1].sections.find(s => s.elementId === 'b')).toMatchObject({ renderTop: 0 })
  })

  it('换页后同列元素仍顺排：后一个贴前一个已占底部，不叠压', () => {
    // a、b 同列（x[0..60] 与 x[30..90] 横向相交）→ b 起点 = a 底 = 20
    const tpl = customPaper(100, 100, [
      el('big', 'text', 0, 0, 100, 70),
      el('a', 'text', 0, 75, 60, 20),
      el('b', 'text', 30, 100, 60, 10),
    ])
    const pages = paginate(tpl, heightMap([['big', 70], ['a', 20], ['b', 10]]))
    expect(pages[1].sections.find(s => s.elementId === 'a')).toMatchObject({ renderTop: 0 })
    expect(pages[1].sections.find(s => s.elementId === 'b')).toMatchObject({ renderTop: 20 })
  })
})

describe('元素四向外边距的二维分页口径', () => {
  it('续页光标保留上下外边距，首页坐标不自动推挤', () => {
    const tpl = customPaper(100, 100, [
      el('a', 'text', 0, 0, 100, 55, { marginTop: 5, marginBottom: 5 }),
      el('b', 'text', 0, 65, 100, 10, { marginTop: 2, marginBottom: 3 }),
    ])
    const pages = paginate(tpl, heightMap([['a', 55], ['b', 10]]))
    expect(pages).toHaveLength(2)
    expect(pages[0]!.sections[0]).toMatchObject({ elementId: 'a', renderTop: 0 })
    expect(pages[1]!.sections[0]).toMatchObject({ elementId: 'b', renderTop: 0 })
  })

  it('外边距盒相交但边框盒分离时不组成隐式重叠单元', () => {
    const tpl = customPaper(100, 100, [
      el('a', 'text', 0, 0, 100, 60, { marginBottom: 10 }),
      el('b', 'text', 0, 65, 100, 20),
    ])
    expect(paginate(tpl, heightMap([['a', 60], ['b', 20]]))).toHaveLength(2)
  })
})
