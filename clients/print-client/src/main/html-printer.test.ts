// HTML 直打印的打印参数构造（纯函数）：纸张单位微米、零边距、静默
import { describe, it, expect } from 'vitest'
import { buildWebPrintOptions } from './html-printer.js'
import type { PrintOptions } from '@worm-vue3-print/core/client'

const label = { width: 60, height: 40 }

describe('buildWebPrintOptions', () => {
  it('纸型按毫米换算成微米，边距恒为 none，静默且保留背景', () => {
    expect(buildWebPrintOptions({}, label)).toEqual({
      silent: true,
      printBackground: true,
      copies: 1,
      pageSize: { width: 60000, height: 40000 },
      margins: { marginType: 'none' },
    })
  })

  it('A4 纵向同样按真实尺寸声明，不夹带标准纸型名', () => {
    const options = buildWebPrintOptions({}, { width: 210, height: 297 })
    expect(options.pageSize).toEqual({ width: 210000, height: 297000 })
  })

  it('横纵混排使用共同介质尺寸，方向交给各页 CSS，不按首页横向强制整份', () => {
    const landscape = { width: 297, height: 210 }
    const pages = [landscape, { width: 210, height: 297 }]
    const options = buildWebPrintOptions({ copies: 2 }, landscape, pages)
    expect(options.pageSize).toEqual({ width: 210000, height: 297000 })
    expect(options.copies).toBe(2)
    expect(options).not.toHaveProperty('landscape')
    expect(() => buildWebPrintOptions({ landscape: true }, landscape, pages)).toThrow('混排')
  })

  it('份数取整，缺省与非正数归 1', () => {
    expect(buildWebPrintOptions({ copies: 3 }, label).copies).toBe(3)
    expect(buildWebPrintOptions({ copies: 2.7 }, label).copies).toBe(2)
    expect(buildWebPrintOptions({ copies: 0 }, label).copies).toBe(1)
  })

  it('打印机名进 deviceName；缺省不写该键（交给系统默认打印机）', () => {
    expect(buildWebPrintOptions({ printerName: 'Adobe PDF' }, label).deviceName).toBe('Adobe PDF')
    expect('deviceName' in buildWebPrintOptions({}, label)).toBe(false)
  })

  it('方向与色彩只在显式给出时透传', () => {
    const print: PrintOptions = { landscape: true, color: false }
    const options = buildWebPrintOptions(print, label)
    expect(options.landscape).toBe(true)
    expect(options.color).toBe(false)
    expect('landscape' in buildWebPrintOptions({}, label)).toBe(false)
    expect('color' in buildWebPrintOptions({}, label)).toBe(false)
  })

  it('页码范围非空才透传', () => {
    expect(buildWebPrintOptions({ pageRanges: [{ from: 1, to: 2 }] }, label).pageRanges).toEqual([
      { from: 1, to: 2 },
    ])
    expect('pageRanges' in buildWebPrintOptions({ pageRanges: [] }, label)).toBe(false)
  })
})
