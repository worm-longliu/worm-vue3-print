// clients/print-client/src/main/font-warning.test.ts
import { describe, it, expect } from 'vitest'
import { collectMissingFonts } from './font-warning.js'

const report = { available: true, fonts: ['SimSun'] }

describe('collectMissingFonts', () => {
  it('元素的字体不在本机清单时报告缺失', () => {
    const tpl = { elements: [{ id: 'txt-1', options: { fontFamily: 'KaiTi' } }] }
    expect(collectMissingFonts(tpl, report)).toEqual([{ family: 'KaiTi', targets: ['txt-1'] }])
  })

  it('单元格的字体同样被覆盖', () => {
    const tpl = {
      elements: [
        {
          id: 'tbl-1',
          options: {
            tableRows: [{ cells: [{ fontFamily: 'KaiTi' }] }],
          },
        },
      ],
    }
    expect(collectMissingFonts(tpl, report)).toEqual([{ family: 'KaiTi', targets: ['tbl-1#r0c0'] }])
  })

  it('本机清单可用时不误报', () => {
    const tpl = { elements: [{ id: 'txt-1', options: { fontFamily: 'SimSun' } }] }
    expect(collectMissingFonts(tpl, report)).toEqual([])
  })

  it('枚举失败（available:false）时返回空数组', () => {
    const tpl = { elements: [{ id: 'txt-1', options: { fontFamily: 'KaiTi' } }] }
    expect(collectMissingFonts(tpl, { available: false, fonts: [] })).toEqual([])
  })

  it('模板结构畸形时不抛异常', () => {
    expect(collectMissingFonts(null, report)).toEqual([])
    expect(collectMissingFonts({ elements: 'nope' }, report)).toEqual([])
  })
})
