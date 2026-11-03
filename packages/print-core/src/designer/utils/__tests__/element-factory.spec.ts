// 新建元素不携带字体字段：未手工配置时由渲染端系统默认字体承接。
// 项目不替用户预置字体名，避免陈列/写入第三方授权字体（见 print/fonts.ts）。
import { describe, it, expect } from 'vitest'
import { createDefaultOptions, createRuntimeElement, findBlockedElementPaths } from '../element-factory.js'
import type { ElementType } from '../../types.js'

const ALL_TYPES: ElementType[] = [
  'text', 'longText', 'table', 'image', 'hline', 'vline', 'rect', 'oval',
  'barcode', 'qrcode', 'html', 'pageNumber',
]

describe('createDefaultOptions 不预置字体', () => {
  it('每种新元素的 options 里都没有 fontFamily 键', () => {
    for (const type of ALL_TYPES) {
      expect('fontFamily' in createDefaultOptions(type), type).toBe(false)
    }
  })

  it('新表格也不写 tableDefaultFontFamily', () => {
    expect('tableDefaultFontFamily' in createDefaultOptions('table')).toBe(false)
  })

  it('既有几何默认值零变化', () => {
    expect(createDefaultOptions('text')).toMatchObject({
      left: 7, top: 17.6, width: 42.3, height: 5.3, fontSize: 12, formatter: '文本',
    })
  })
})

describe('createRuntimeElement 手工配置语义', () => {
  it('手工配置的族名原样写入', () => {
    const el = createRuntimeElement('text', { fontFamily: 'MyBrandFont' })
    expect(el.options.fontFamily).toBe('MyBrandFont')
  })

  it('面板清成「默认」时显式 undefined 生效，交还 CSS 继承', () => {
    const el = createRuntimeElement('text', { fontFamily: undefined })
    expect('fontFamily' in el.options).toBe(true)
    expect(el.options.fontFamily).toBeUndefined()
  })

  it('未传字体时 options 里不留该键，序列化不会带出字体', () => {
    const el = createRuntimeElement('table')
    expect('fontFamily' in el.options).toBe(false)
    expect(JSON.stringify(el.options)).not.toContain('fontFamily')
  })
})

describe('flowList 布局模式与四边内边距缺省', () => {
  it('工厂默认固定模式且四边内边距为零', () => {
    expect(createDefaultOptions('flowList')).toMatchObject({
      flowLayoutMode: 'fixed', flowPaddingTop: 0, flowPaddingRight: 0,
      flowPaddingBottom: 0, flowPaddingLeft: 0,
    })
  })

  it('旧几何与排布缺省零变化', () => {
    expect(createDefaultOptions('flowList')).toMatchObject({
      width: 141.1, height: 21.2, fontSize: 12, formatter: '{name} {spec}',
      flowColumns: 4, flowRowHeight: 8, flowGapX: 4, flowAutoSpan: false, flowMaxSpan: 2,
    })
  })
})

describe('findBlockedElementPaths 路径口径', () => {
  const htmlEl = { id: 'x', type: 'html', printElementType: { type: 'html' } }
  const okEl = { id: 'y', type: 'text' }

  it('单页：elements / header / footer 均无前导点，路径涵盖 printElementType 兜底', () => {
    expect(findBlockedElementPaths({
      paperSize: 'A4', margins: {}, elements: [okEl, htmlEl],
      header: { elements: [htmlEl] }, footer: { elements: [htmlEl] },
    })).toEqual([
      'elements[1].type',
      'header.elements[0].type',
      'footer.elements[0].type',
    ])
  })

  it('多页 wrapper：路径带 pages[i] 前缀', () => {
    expect(findBlockedElementPaths({
      pages: [{ paperSize: 'A4', margins: {}, elements: [htmlEl] }, { paperSize: 'A4', margins: {}, elements: [okEl, htmlEl] }],
    })).toEqual([
      'pages[0].elements[0].type',
      'pages[1].elements[1].type',
    ])
  })

  it('无封禁元素返回空数组', () => {
    expect(findBlockedElementPaths({ paperSize: 'A4', margins: {}, elements: [okEl] })).toEqual([])
  })
})
