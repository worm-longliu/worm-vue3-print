// services/print-render/src/font-warnings.test.ts
import { describe, it, expect } from 'vitest'
import { buildFontWarningsHeader } from './font-warnings.js'

const report = { available: true, fonts: ['SimSun'] }

function tpl(fontFamily?: string) {
  return { elements: [{ id: 'txt-1', options: { fontFamily } }] }
}

describe('buildFontWarningsHeader', () => {
  it('有缺失时返回可解码的 warnings 头', () => {
    const header = buildFontWarningsHeader(tpl('KaiTi'), report)
    expect(header).toBeTruthy()
    expect(JSON.parse(decodeURIComponent(header!))).toEqual([
      { code: 'FONT_MISSING', family: 'KaiTi', targets: ['txt-1'] },
    ])
  })

  it('无缺失时返回 null', () => {
    expect(buildFontWarningsHeader(tpl('SimSun'), report)).toBeNull()
    expect(buildFontWarningsHeader(tpl(), report)).toBeNull()
  })

  it('该端未上报时跳过校验', () => {
    expect(buildFontWarningsHeader(tpl('KaiTi'), { available: false, fonts: [] })).toBeNull()
  })

  it('族名超过 32 个时截断', () => {
    const many = {
      elements: Array.from({ length: 40 }, (_, i) => ({
        id: `txt-${i}`,
        options: { fontFamily: `F${i}` },
      })),
    }
    const parsed = JSON.parse(decodeURIComponent(buildFontWarningsHeader(many, report)!))
    expect(parsed).toHaveLength(32)
  })

  it('同一族的 targets 超过 5 个时截断', () => {
    const many = {
      elements: Array.from({ length: 8 }, (_, i) => ({ id: `txt-${i}`, options: { fontFamily: 'KaiTi' } })),
    }
    const parsed = JSON.parse(decodeURIComponent(buildFontWarningsHeader(many, report)!))
    expect(parsed[0].targets).toEqual(['txt-0', 'txt-1', 'txt-2', 'txt-3', 'txt-4'])
  })
})
