import { describe, it, expect } from 'vitest'
import { buildPrintJobSettings } from './print-settings.js'

describe('buildPrintJobSettings', () => {
  it('份数缺省为 1，非法值归一为 1', () => {
    expect(buildPrintJobSettings({} as never)).toEqual({ copies: 1 })
    expect(buildPrintJobSettings({ copies: 0 } as never)).toEqual({ copies: 1 })
    expect(buildPrintJobSettings({ copies: -2 } as never)).toEqual({ copies: 1 })
  })

  it('份数取整', () => {
    expect(buildPrintJobSettings({ copies: 2.7 } as never)).toEqual({ copies: 2 })
  })

  it('保留驱动纸型名（针式打印机预置纸型）', () => {
    expect(buildPrintJobSettings({ copies: 1, paperName: 'Custom.80x297' } as never))
      .toEqual({ copies: 1, paperName: 'Custom.80x297' })
  })
})
