// 素材台「文本较长」判据：≥4 个中文字宽才独占整行，短标签仍可两列并排。
import { describe, it, expect } from 'vitest'
import { isWideMaterialLabel } from './material-label.js'

describe('isWideMaterialLabel', () => {
  it('内置素材里只有 4 字的「流式列表」判为长文本', () => {
    expect(isWideMaterialLabel('流式列表')).toBe(true)
    expect(isWideMaterialLabel('条形码')).toBe(false)
    expect(isWideMaterialLabel('二维码')).toBe(false)
    expect(isWideMaterialLabel('长文')).toBe(false)
  })

  it('拉丁标签按约 0.55 字宽折算，短的 HTML 不判长、长的仍判长', () => {
    expect(isWideMaterialLabel('HTML')).toBe(false)
    expect(isWideMaterialLabel('ECharts 图表')).toBe(true)
  })

  it('空标签与单字符不判长', () => {
    expect(isWideMaterialLabel('')).toBe(false)
    expect(isWideMaterialLabel('图')).toBe(false)
  })
})
