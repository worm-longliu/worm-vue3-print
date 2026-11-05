import { describe, it, expect } from 'vitest'
import { matchKeywords, searchProperties, PROPERTY_REGISTRY } from '../property-search.js'

describe('matchKeywords', () => {
  it('正向包含：关键词包含搜索词即命中', () => {
    expect(matchKeywords('wid', ['width', '宽度'])).toBe(true)
  })
  it('输入完整词命中（修复反向 includes 缺陷）', () => {
    expect(matchKeywords('width', ['width', '宽度'])).toBe(true)
  })
  it('大小写不敏感', () => {
    expect(matchKeywords('WID', ['width'])).toBe(true)
  })
  it('不匹配返回 false', () => {
    expect(matchKeywords('xyz', ['width', '宽度'])).toBe(false)
  })
})

describe('searchProperties', () => {
  it('空搜索返回全部分组与全部项', () => {
    const r = searchProperties('')
    expect(r.groups).toEqual(PROPERTY_REGISTRY.map(g => g.group))
    expect(r.itemKeys.size).toBeGreaterThan(0)
  })
  it('搜索 width 命中位置尺寸分组的 width 项', () => {
    const r = searchProperties('width')
    expect(r.groups).toContain('position-size')
    expect(r.itemKeys.has('ps-width')).toBe(true)
    expect(r.itemKeys.has('ps-left')).toBe(false)
  })
  it('搜索中文命中', () => {
    const r = searchProperties('字体')
    expect(r.groups).toContain('appearance')
    expect(r.itemKeys.has('ap-font-size')).toBe(true)
  })
  it('固定属性可按中文和字段名检索', () => {
    expect(searchProperties('固定').itemKeys.has('ad-fixed-position')).toBe(true)
    expect(searchProperties('fixed').itemKeys.has('ad-fixed-position')).toBe(true)
  expect(searchProperties('每页固定').itemKeys.has('ad-fixed-position')).toBe(true)
  })
  it('条码设置分组已注册，可按码制/条宽/最大宽高检索', () => {
    expect(searchProperties('码制').groups).toContain('code')
    expect(searchProperties('条宽').itemKeys.has('cd-bar-width')).toBe(true)
    expect(searchProperties('纠错').itemKeys.has('cd-ec-level')).toBe(true)
    expect(searchProperties('最大宽度').itemKeys.has('cd-max-width')).toBe(true)
    expect(searchProperties('最大高度').itemKeys.has('cd-max-height')).toBe(true)
    expect(searchProperties('缩放模式').itemKeys.has('cd-fit')).toBe(true)
  })
  it('元素台线型按「线型 / 虚线 / 双线」可检索；「内部」不给检索入口', () => {
    expect(searchProperties('线型').itemKeys.has('bb-border-style')).toBe(true)
    expect(searchProperties('虚线').itemKeys.has('bb-border-style')).toBe(true)
    expect(searchProperties('双线').itemKeys.has('bb-border-style')).toBe(true)
    expect(searchProperties('内部').itemKeys.size).toBe(0)
  })
  it('「保留换行符」按手打排版的说法可检索', () => {
    for (const t of ['保留换行符', '换行符', '手动换行', '保留空格', '连续空格', '行首空格', 'keeplinebreaks']) {
      expect(searchProperties(t).itemKeys.has('ap-keep-line-breaks'), `检索不到：${t}`).toBe(true)
    }
  })
  it('与「自动换行」互不串台：各自的说法只点亮各自的行', () => {
    expect(searchProperties('自动换行').itemKeys.has('ap-word-wrap')).toBe(true)
    expect(searchProperties('自动换行').itemKeys.has('ap-keep-line-breaks')).toBe(false)
    expect(searchProperties('不换行').itemKeys.has('ap-word-wrap')).toBe(true)
    expect(searchProperties('不换行').itemKeys.has('ap-keep-line-breaks')).toBe(false)
    // 反过来的对照：说「换行符」只点亮新行
    expect(searchProperties('换行符').itemKeys.has('ap-keep-line-breaks')).toBe(true)
    expect(searchProperties('换行符').itemKeys.has('ap-word-wrap')).toBe(false)
  })
})
