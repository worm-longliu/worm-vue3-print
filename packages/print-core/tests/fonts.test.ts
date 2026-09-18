// packages/print-core/tests/fonts.test.ts
import { describe, it, expect } from 'vitest'
import { FALLBACK_FONT_STACK, buildFontFaceCss, toFontFamilyStack } from '../src/print/fonts.js'

describe('buildFontFaceCss', () => {
  it('按声明生成 @font-face，含字重/字型与 font-display:block', () => {
    const css = buildFontFaceCss([
      {
        family: 'Noto Sans SC',
        files: [
          { url: '/fonts/noto-400.woff2', weight: 400 },
          { url: '/fonts/noto-700.woff2', weight: 700 },
          { url: '/fonts/noto-italic.woff2', style: 'italic' },
        ],
      },
    ])
    expect(css).toContain('@font-face{font-family:"Noto Sans SC";src:url("/fonts/noto-400.woff2") format("woff2");font-weight:400;font-style:normal;font-display:block;}')
    expect(css).toContain('font-weight:700')
    expect(css).toContain('font-style:italic')
    expect(css.match(/@font-face/g)).toHaveLength(3)
  })

  it('缺省字重按 400，绝对 URL 原样保留，format 提示按扩展名推断', () => {
    const css = buildFontFaceCss([
      {
        family: 'Demo',
        files: [
          { url: 'https://cdn.example.com/demo.ttf' },
          { url: 'https://cdn.example.com/demo.woff?x=1' },
          { url: 'https://cdn.example.com/no-ext' },
        ],
      },
    ])
    expect(css).toContain('font-weight:400')
    expect(css).toContain('url("https://cdn.example.com/demo.ttf") format("truetype")')
    expect(css).toContain('url("https://cdn.example.com/demo.woff?x=1") format("woff")')
    expect(css).toContain('url("https://cdn.example.com/no-ext");')
  })

  it('无声明、空族名或空 url 时产出空串（可安全拼接）', () => {
    expect(buildFontFaceCss(undefined)).toBe('')
    expect(buildFontFaceCss([])).toBe('')
    expect(buildFontFaceCss([{ family: '  ', files: [{ url: '/a.woff2' }] }])).toBe('')
    expect(buildFontFaceCss([{ family: 'A', files: [{ url: '' }] }])).toBe('')
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
