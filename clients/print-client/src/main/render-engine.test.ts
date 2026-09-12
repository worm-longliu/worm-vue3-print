import { describe, it, expect } from 'vitest'
import { buildWebPrintSettings } from './render-engine.js'

describe('buildWebPrintSettings', () => {
  it('最小参数：静默、打印背景、自定义纸（微米）、零边距（HTML 自控边距）', () => {
    const s = buildWebPrintSettings({}, { width: 80000, height: 120000 })
    expect(s).toMatchObject({
      silent: true,
      printBackground: true,
      pageSize: { width: 80000, height: 120000 },
      margins: { marginType: 'none' },
      copies: 1,
    })
    expect(s.deviceName).toBeUndefined()
  })

  it('指定打印机/份数/方向/颜色', () => {
    const s = buildWebPrintSettings(
      { printerName: '热敏-80', copies: 3, landscape: true, color: false },
      { width: 80000, height: 120000 },
    )
    expect(s).toMatchObject({
      deviceName: '热敏-80', copies: 3, landscape: true, color: false,
    })
  })

  it('paperName 优先于自定义 pageSize（针式驱动纸型）', () => {
    const s = buildWebPrintSettings({ paperName: 'A4' }, { width: 80000, height: 120000 })
    expect(s.pageSize).toBe('A4')
  })

  it('自定义边距（微米）透传；pageRanges 透传', () => {
    const s = buildWebPrintSettings(
      { margins: { top: 5000, bottom: 5000, left: 4000, right: 4000 }, pageRanges: [{ from: 1, to: 2 }] },
      { width: 210000, height: 297000 },
    )
    expect(s.margins).toEqual({ marginType: 'custom', top: 5000, bottom: 5000, left: 4000, right: 4000 })
    expect(s.pageRanges).toEqual([{ from: 1, to: 2 }])
  })
})
