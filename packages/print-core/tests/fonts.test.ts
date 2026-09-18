// packages/print-core/tests/fonts.test.ts
import { describe, it, expect } from 'vitest'
import {
  UNAVAILABLE,
  FALLBACK_FONT_STACK,
  normalizeFontList,
  mergeFontSources,
  toFontFamilyStack,
  findMissingFonts,
} from '../src/print/fonts.js'

describe('normalizeFontList', () => {
  it('去空、去重、大小写不敏感且保留首次出现的写法', () => {
    expect(normalizeFontList(['SimSun', ' simsun ', '', 'Arial', 'Arial']))
      .toEqual(['Arial', 'SimSun'])
  })

  it('剔除 . 开头的系统隐藏字体', () => {
    expect(normalizeFontList(['.Apple Color Emoji UI', 'Arial'])).toEqual(['Arial'])
  })

  it('非字符串项被忽略', () => {
    expect(normalizeFontList(['Arial', undefined as any, 42 as any])).toEqual(['Arial'])
  })
})

describe('mergeFontSources', () => {
  it('并集并标注来源，两端都有的排最前', () => {
    const cat = mergeFontSources({
      server: { available: true, fonts: ['Noto Sans CJK SC', 'SimSun'] },
      client: { available: true, fonts: ['SimSun', 'KaiTi'] },
    })
    expect(cat.available).toEqual({ server: true, client: true })
    expect(cat.fonts.map(f => [f.family, f.sources])).toEqual([
      ['SimSun', ['server', 'client']],
      ['KaiTi', ['client']],
      ['Noto Sans CJK SC', ['server']],
    ])
  })

  it('单端不可用时只产出可用端的来源，且不抛错', () => {
    const cat = mergeFontSources({
      server: { available: true, fonts: ['Arial'] },
      client: UNAVAILABLE,
    })
    expect(cat.available).toEqual({ server: true, client: false })
    expect(cat.fonts).toEqual([{ family: 'Arial', sources: ['server'] }])
  })

  it('两端都不可用时返回空清单', () => {
    const cat = mergeFontSources({ server: UNAVAILABLE, client: UNAVAILABLE })
    expect(cat.fonts).toEqual([])
    expect(cat.available).toEqual({ server: false, client: false })
  })
})

describe('toFontFamilyStack', () => {
  it('无字体时返回纯兜底栈', () => {
    expect(toFontFamilyStack()).toBe(FALLBACK_FONT_STACK.join(', '))
  })

  it('显式族名加引号并前置兜底栈', () => {
    expect(toFontFamilyStack('SimSun')).toBe(`"SimSun", ${FALLBACK_FONT_STACK.join(', ')}`)
  })

  it('已含逗号的完整栈原样前置，不被整体加引号', () => {
    expect(toFontFamilyStack('SimSun, serif')).toBe(`SimSun, serif, ${FALLBACK_FONT_STACK.join(', ')}`)
  })

  it('空字符串与纯空白等同于未设置', () => {
    expect(toFontFamilyStack('   ')).toBe(FALLBACK_FONT_STACK.join(', '))
  })
})

describe('findMissingFonts', () => {
  const template = {
    elements: [
      { id: 'txt-1', options: { fontFamily: 'KaiTi' } },
      {
        id: 'tbl-1',
        options: {
          tableRows: [
            { cells: [{ id: 'c1', fontFamily: 'SimSun' }, { id: 'c2' }] },
            { cells: [{ id: 'c3', fontFamily: 'KaiTi' }] },
          ],
        },
      },
    ],
  }

  it('收集元素与单元格引用的字体，并聚合引用位置', () => {
    const catalog = mergeFontSources({
      server: { available: true, fonts: ['SimSun'] },
      client: UNAVAILABLE,
    })
    expect(findMissingFonts(template, catalog, 'server')).toEqual([
      { family: 'KaiTi', targets: ['txt-1', 'tbl-1#r1c0'] },
    ])
  })

  it('该端未上报时一律不判定缺失（不阻断策略的前提）', () => {
    const catalog = mergeFontSources({ server: UNAVAILABLE, client: UNAVAILABLE })
    expect(findMissingFonts(template, catalog, 'server')).toEqual([])
    expect(findMissingFonts(template, catalog, 'client')).toEqual([])
  })

  it('大小写差异不算缺失', () => {
    const catalog = mergeFontSources({
      server: { available: true, fonts: ['simsun'] },
      client: UNAVAILABLE,
    })
    const t = { elements: [{ id: 'e', options: { fontFamily: 'SimSun' } }] }
    expect(findMissingFonts(t, catalog, 'server')).toEqual([])
  })

  it('按端独立判定：服务端有、客户端没有', () => {
    const catalog = mergeFontSources({
      server: { available: true, fonts: ['SimSun'] },
      client: { available: true, fonts: ['KaiTi'] },
    })
    const t = { elements: [{ id: 'e', options: { fontFamily: 'SimSun' } }] }
    expect(findMissingFonts(t, catalog, 'server')).toEqual([])
    expect(findMissingFonts(t, catalog, 'client')).toEqual([{ family: 'SimSun', targets: ['e'] }])
  })

  it('页眉/页脚/首页叠层也在扫描范围内', () => {
    const catalog = mergeFontSources({ server: { available: true, fonts: [] }, client: UNAVAILABLE })
    const t = {
      elements: [],
      header: { elements: [{ id: 'h1', options: { fontFamily: 'KaiTi' } }] },
      footer: { elements: [{ id: 'f1', options: { fontFamily: 'KaiTi' } }] },
      firstPageOverlay: { elements: [{ id: 'o1', options: { fontFamily: 'KaiTi' } }] },
    }
    expect(findMissingFonts(t, catalog, 'server')).toEqual([
      { family: 'KaiTi', targets: ['h1', 'f1', 'o1'] },
    ])
  })
})
