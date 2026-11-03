// 流式列表的绑定与出纸 HTML：逐单元求值、跨列声明、一框一页的裁切与网格样式。
import { describe, it, expect } from 'vitest'
import { bindData } from '../data-binder.js'
import { generateHtml } from '../html-generator.js'
import type { PageLayout, TemplateData } from '../types.js'

const layouts: PageLayout[] = [{ pageIndex: 0, sections: [{ elementId: 'fl-1', type: 'element' }] }]

function template(options: Record<string, any>): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{
      id: 'fl-1',
      type: 'flowList' as any,
      options: { left: 0, top: 0, width: 80, height: 24, fontSize: 12, ...options },
    } as any],
  } as unknown as TemplateData
}

function render(options: Record<string, any>, printData: Record<string, any>): string {
  return generateHtml(bindData(template(options), printData), layouts, printData)
}

/** 取元素 div 与全部单元 div 的行内声明 */
function elementDecls(html: string): string[] {
  const m = html.match(/<div class="print-element"[^>]*style="([^"]*)"/)
  if (!m) throw new Error(`未渲染出 print-element：${html.slice(0, 400)}`)
  return m[1].split(';').map(s => s.trim()).filter(Boolean)
}

function cells(html: string): Array<{ text: string; span: number }> {
  return [...html.matchAll(/<div class="print-flow-cell"([^>]*)>([^<]*)<\/div>/g)].map(mt => ({
    text: mt[2] ?? '',
    span: Number(/grid-column:span (\d+)/.exec(mt[1] ?? '')?.[1] ?? 1),
  }))
}

const drugs = {
  drugs: [
    { name: '黄芪', spec: '20g' },
    { name: '炙黄芪（先煎）', spec: '30g' },
    { name: '红花', spec: '10g' },
    { name: '地龙', spec: '10g' },
    { name: '桃仁', spec: '10g' },
  ],
}

describe('数据绑定', () => {
  it('单元模板是一条完整表达式：列表路径写在模板里，不需要单独配数据源', () => {
    const bound = bindData(template({ formatter: '{drugs.name} {drugs.spec}' }), drugs)
    expect(bound.elements[0]!.options._flowItems).toEqual([
      '黄芪 20g',
      '炙黄芪（先煎） 30g',
      '红花 10g',
      '地龙 10g',
      '桃仁 10g',
    ])
  })

  it('模板只引用行内字段时按「顶层第一个数组」兜底（与表格同口径）', () => {
    const bound = bindData(template({ formatter: '{name}' }), drugs)
    expect(bound.elements[0]!.options._flowItems).toEqual([
      '黄芪', '炙黄芪（先煎）', '红花', '地龙', '桃仁',
    ])
  })

  it('显式 dataSource 仍生效，且优先于表达式检出', () => {
    const bound = bindData(template({ formatter: '{name}', dataSource: 'drugs' }), {
      ...drugs,
      other: [{ name: '甲' }, { name: '乙' }],
    })
    // 取的是 drugs（5 项）而不是 other（2 项）
    expect(bound.elements[0]!.options._flowItems.length).toBe(5)
  })

  it('数组缺失时不抛错，单元为空', () => {
    const bound = bindData(template({ formatter: '{drugs.name}', dataSource: 'drugs' }), {})
    expect(bound.elements[0]!.options._flowItems).toEqual([])
  })
})

describe('出纸 HTML', () => {
  it('网格按指定列数铺，行高取「最小高」语义', () => {
    const decls = elementDecls(render({
      formatter: '{name} {spec}', dataSource: 'drugs',
      flowColumns: 4, flowRowHeight: 8, flowGapX: 4,
    }, drugs))
    expect(decls).toContain('display:grid')
    expect(decls).toContain('grid-template-columns:repeat(4,minmax(0,1fr))')
    expect(decls).toContain('column-gap:4mm')
    expect(decls).toContain('grid-auto-rows:minmax(8mm,auto)')
    expect(decls).toContain('overflow:hidden')
  })

  it('关闭自适应跨列时每个单元各占一列，不出现跨列声明', () => {
    const html = render({ formatter: '{name} {spec}', dataSource: 'drugs', flowColumns: 4 }, drugs)
    expect(cells(html).every(c => c.span === 1)).toBe(true)
    expect(html).not.toContain('grid-column:span')
  })

  it('打开自适应跨列后长单元吃掉两列，且单元文本完整不被拆', () => {
    const html = render({
      formatter: '{name} {spec}', dataSource: 'drugs',
      flowColumns: 4, flowGapX: 4, flowAutoSpan: true, flowMaxSpan: 2,
    }, drugs)
    const list = cells(html)
    const long = list.find(c => c.text.startsWith('炙黄芪'))
    expect(long?.span).toBe(2)
    expect(long?.text).toBe('炙黄芪（先煎） 30g')
    // 每行列数之和不被突破
    expect(list.some(c => c.span > 2)).toBe(false)
  })

  it('「最多跨几列」超过每行列数时按列数生效（钳制的落纸体现）', () => {
    const html = render({
      formatter: '{name} {spec}', dataSource: 'drugs',
      flowColumns: 2, flowGapX: 2, flowAutoSpan: true, flowMaxSpan: 9,
    }, drugs)
    expect(cells(html).every(c => c.span <= 2)).toBe(true)
  })

  it('一框一页：元素高度按声明的框高写死，不随单元增多撑破纸面', () => {
    const decls = elementDecls(render({
      formatter: '{name} {spec}', dataSource: 'drugs', flowColumns: 4, height: 24,
    }, drugs))
    expect(decls).toContain('height:24mm')
  })

  it('无业务数据时用 testData 逐行兜底（设计态预览与试打印用）', () => {
    const html = render({ testData: '黄芪 20g\n当归尾 15g\n赤芍 10g' }, {})
    expect(cells(html).map(c => c.text)).toEqual(['黄芪 20g', '当归尾 15g', '赤芍 10g'])
  })
})

describe('动态模式', () => {
  it('动态模式保留排布行，固定模式不写内部行结构', () => {
    const dynamic = bindData(template({
      flowLayoutMode: 'dynamic', formatter: '{name}', dataSource: 'drugs',
      flowColumns: 2, flowAutoSpan: true, flowMaxSpan: 2,
    }), drugs)
    expect(dynamic.elements[0]!.options._flowRows.length).toBeGreaterThan(1)
    const fixed = bindData(template({ formatter: '{name}', dataSource: 'drugs' }), drugs)
    expect(fixed.elements[0]!.options._flowRows).toBeUndefined()
  })

  it('动态测量趟逐行输出标记，容器不写死高度', () => {
    const html = render({ flowLayoutMode: 'dynamic', formatter: '{name}', dataSource: 'drugs' }, drugs)
    expect(html).toContain('class="print-flow-row"')
    expect(html).toContain('data-flow-row-index="0"')
    expect(elementDecls(html)).not.toContain('height:24mm')
  })

  it('动态测量容器的 verticalAlign 不改变文档流方向', () => {
    const decls = elementDecls(render({
      flowLayoutMode: 'dynamic', verticalAlign: 'middle', formatter: '{name}', dataSource: 'drugs',
    }, drugs))
    expect(decls.filter(d => d.startsWith('display:')).at(-1)).toBe('display:block')
  })

  it('动态模式无业务数据时仍用 testData 生成测量行', () => {
    const html = render({ flowLayoutMode: 'dynamic', flowColumns: 1, testData: '黄芪 20g\n当归尾 15g\n赤芍 10g' }, {})
    expect(html.match(/class="print-flow-row"/g)).toHaveLength(3)
    expect(cells(html).map(c => c.text)).toEqual(['黄芪 20g', '当归尾 15g', '赤芍 10g'])
  })
})
