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
})
