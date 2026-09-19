// print-core/src/print/__tests__/multi-template.spec.ts
// 多页面模板核心业务逻辑验证（纯逻辑，无需 DOM/浏览器）
import { describe, it, expect } from 'vitest'
import {
  normalizeTemplate,
  mergeFontDeclarations,
  composeMultiPageDocument,
} from '../multi-template.js'
import { paginate } from '../../render/pagination-engine.js'
import type { TemplateData, PageLayout, MeasuredElement } from '../../render/types.js'

// ─── 构造助手 ───

function makePage(name: string, elements: Array<Record<string, any>>): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: {
      height: 5,
      // 页码元素占位符存 testData（bindData 只求值 formatter，不动 testData），与真实行为一致
      elements: [{ id: 'pg', type: 'pageNumber', options: { left: 0, top: 0, width: 50, height: 5, testData: '{pageIndex}/{totalPages}' } }],
    },
    firstPageOverlay: { height: 0, elements: [] },
    name,
    elements: elements as TemplateData['elements'],
  }
}

function el(id: string, height: number, top = 10): Record<string, any> {
  return { id, type: 'text', options: { left: 10, top, width: 100, height, formatter: `{${id}}` } }
}

function measured(ids: Array<{ id: string; h: number }>): Map<string, MeasuredElement> {
  return new Map(ids.map(({ id, h }) => [id, { id, measuredHeight: h }]))
}

/** A4 竖版，边距 10，无页眉页脚 → contentHeight 277，可用 275（扣 2mm 安全余量） */
function pageOf(page: TemplateData): PageLayout[] {
  const heights = new Map<string, number>()
  for (const e of page.elements) heights.set(e.id, e.options.height)
  return paginate(page, measured([...heights].map(([id, h]) => ({ id, h }))))
}

// 封面：1 个元素 → 1 页；内容：4×100mm 顺序元素（边相切不重叠）→ 2 页（e1/e2 首页，e3/e4 次页）
const cover = makePage('封面', [el('cover-title', 30)])
const content = makePage('内容', [
  el('row-1', 100, 10), el('row-2', 100, 110), el('row-3', 100, 210), el('row-4', 100, 310),
])

// ─── normalizeTemplate 校验 ───

describe('normalizeTemplate', () => {
  it('单模板透传为单元素数组', () => {
    const pages = normalizeTemplate(cover)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toBe(cover)
  })

  it('多页面模板展开 pages', () => {
    const pages = normalizeTemplate({ pages: [cover, content] })
    expect(pages).toHaveLength(2)
  })

  it('pages 恰好 1 页按单模板语义', () => {
    const pages = normalizeTemplate({ pages: [cover] })
    expect(pages).toHaveLength(1)
  })

  it('空 pages 抛错', () => {
    expect(() => normalizeTemplate({ pages: [] }))
      .toThrow(/至少需要一页/)
  })

  it('各页纸张不一致抛错（含方向），错误带页面名', () => {
    const b = { ...makePage('横向', [el('x', 30)]), orientation: 'landscape' } as TemplateData
    expect(() => normalizeTemplate({ pages: [cover, b] }))
      .toThrow(/纸张尺寸必须一致/)
  })

  it('含连续纸页面抛错', () => {
    const thermal = { ...makePage('小票', [el('t', 30)]), paperSize: 'THERMAL_80' } as TemplateData
    expect(() => normalizeTemplate({ pages: [cover, thermal] }))
      .toThrow(/不支持连续纸/)
  })

  it('含拼版页面抛错', () => {
    const tiled = { ...makePage('标签', [el('l', 30)]), tiling: { enabled: true } } as TemplateData
    expect(() => normalizeTemplate({ pages: [cover, tiled] }))
      .toThrow(/不支持标签拼版/)
  })

  it('合法多页面模板返回原数组', () => {
    const pages = normalizeTemplate({ pages: [cover, content] })
    expect(pages).toEqual([cover, content])
  })
})

// ─── 字体合并 ───

describe('mergeFontDeclarations', () => {
  it('按 family 去重，保留首个，维持顺序', () => {
    const f1 = { family: 'SimSun', files: [{ url: '/a.ttf' }] }
    const f2 = { family: 'KaiTi', files: [{ url: '/b.ttf' }] }
    const f1dup = { family: 'SimSun', files: [{ url: '/c.ttf' }] }
    const merged = mergeFontDeclarations([
      { ...cover, fonts: [f1, f2] },
      { ...content, fonts: [f1dup] },
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toBe(f1)
    expect(merged[1]).toBe(f2)
  })

  it('无字体返回空数组', () => {
    expect(mergeFontDeclarations([cover, content])).toHaveLength(0)
  })
})

// ─── 整份文档组合：页码 / 新开一页 / 首页叠加 / 批量 ───

describe('composeMultiPageDocument', () => {
  it('封面 1 页 + 内容 2 页：pageCount=3，页码全局连续 1/3、2/3、3/3', () => {
    const coverLayouts = pageOf(cover)
    const contentLayouts = pageOf(content)
    expect(coverLayouts).toHaveLength(1)
    expect(contentLayouts).toHaveLength(2)

    const doc = composeMultiPageDocument([{
      boundPages: [cover, content],
      layoutsPerPage: [coverLayouts, contentLayouts],
      data: { 'cover-title': 'A', 'row-1': 1, 'row-2': 2, 'row-3': 3, 'row-4': 4 },
    }])
    expect(doc.pageCount).toBe(3)
    expect(doc.pageLayouts).toHaveLength(3)
    expect(doc.pageLayouts[0].pageIndex).toBe(0)
    expect(doc.pageLayouts[2].pageIndex).toBe(2)

    const html = doc.html
    // 3 个 .print-page
    expect(html.match(/<section class="print-page/g)).toHaveLength(3)
    // 页码全局：封面 1/3，内容首 2/3，内容次 3/3
    expect(html).toContain('data-page="1"')
    expect(html).toContain('data-page="2"')
    expect(html).toContain('data-page="3"')
    expect(html).toContain('>1/3</div>')
    expect(html).toContain('>2/3</div>')
    expect(html).toContain('>3/3</div>')
    // 作用域类：封面 mt-0、内容 mt-1
    expect(html).toContain('class="print-page mt-0"')
    expect(html).toContain('class="print-page mt-1"')
    // 内容模板的边距几何作用域 CSS
    expect(html).toContain('.mt-1.print-page {')
  })

  it('首页叠加仅在各模板自身首页出现', () => {
    const coverWithOverlay = {
      ...cover,
      firstPageOverlay: {
        height: 10,
        elements: [{ id: 'cover-overlay', type: 'text', options: { left: 0, top: 0, width: 50, height: 10, formatter: '封面叠加' } }],
      },
    }
    const contentWithOverlay = {
      ...content,
      firstPageOverlay: {
        height: 10,
        elements: [{ id: 'content-overlay', type: 'text', options: { left: 0, top: 0, width: 50, height: 10, formatter: '内容叠加' } }],
      },
    }
    const doc = composeMultiPageDocument([{
      boundPages: [coverWithOverlay, contentWithOverlay],
      layoutsPerPage: [pageOf(coverWithOverlay), pageOf(contentWithOverlay)],
      data: {},
    }])
    const html = doc.html
    // 封面叠加在第 1 页；内容叠加在第 2 页（内容模板首页）而非第 3 页
    const page1 = html.slice(0, html.indexOf('data-page="2"'))
    const page2 = html.slice(html.indexOf('data-page="2"'), html.indexOf('data-page="3"'))
    const page3 = html.slice(html.indexOf('data-page="3"'))
    expect(page1).toContain('封面叠加')
    expect(page1).not.toContain('内容叠加')
    expect(page2).toContain('内容叠加')
    expect(page2).not.toContain('封面叠加')
    expect(page3).not.toContain('内容叠加')
  })

  it('批量 2 份：pageCount=6，份间 .print-copy 包装，页码份内重置', () => {
    const coverLayouts = pageOf(cover)
    const contentLayouts = pageOf(content)
    const copyInput = {
      boundPages: [cover, content],
      layoutsPerPage: [coverLayouts, contentLayouts],
      data: {},
    }
    const doc = composeMultiPageDocument([copyInput, copyInput])
    expect(doc.pageCount).toBe(6)
    const html = doc.html
    expect(html.match(/<section class="print-copy">/g)).toHaveLength(2)
    // 第二份首页 data-page 重置为 1（份内全局）
    expect(html.match(/data-page="1"/g)).toHaveLength(2)
    expect(html).toContain('>1/3</div>')
    expect(html).toContain('>2/3</div>')
    expect(html).toContain('>3/3</div>')
  })

  it('单份不包 .print-copy', () => {
    const doc = composeMultiPageDocument([{
      boundPages: [cover, content],
      layoutsPerPage: [pageOf(cover), pageOf(content)],
      data: {},
    }])
    expect(doc.html).not.toContain('<section class="print-copy">')
  })

  it('空 copies 抛错', () => {
    expect(() => composeMultiPageDocument([])).toThrow(/至少需要一份数据/)
  })
})
