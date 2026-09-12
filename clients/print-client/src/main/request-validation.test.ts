import { describe, it, expect } from 'vitest'
import { parsePrintSubmit } from './request-validation.js'

describe('parsePrintSubmit', () => {
  it('合法请求拆分为渲染 spec 与打印参数', () => {
    const r = parsePrintSubmit({
      templateJson: { paperSize: 'A4' },
      printData: { a: 1 },
      baseUrl: 'http://x',
      print: { printerName: 'P', copies: 2, paperSize: { width: 80000 } },
    })
    expect(r.spec).toEqual({ templateJson: { paperSize: 'A4' }, printData: { a: 1 }, baseUrl: 'http://x' })
    expect(r.print).toMatchObject({ printerName: 'P', copies: 2 })
  })

  it('print 缺省合法（走默认打印机/模板纸张）', () => {
    expect(parsePrintSubmit({ templateJson: {} }).print).toEqual({})
  })

  it.each([
    ['非对象', null],
    ['缺 templateJson', { printData: {} }],
    ['templateJson 非对象', { templateJson: 1 }],
    ['print 非对象', { templateJson: {}, print: 1 }],
    ['copies 非法', { templateJson: {}, print: { copies: 0 } }],
    ['paperSize 非对象', { templateJson: {}, print: { paperSize: 1 } }],
    ['paperSize.width 非法', { templateJson: {}, print: { paperSize: { width: -1 } } }],
    ['margins 缺字段', { templateJson: {}, print: { margins: { top: 1 } } }],
  ])('%s → INVALID_REQUEST', (_name, raw) => {
    expect(() => parsePrintSubmit(raw)).toThrow()
    try {
      parsePrintSubmit(raw)
      throw new Error('应抛错')
    } catch (err) {
      expect((err as { code?: string }).code).toBe('INVALID_REQUEST')
    }
  })

  it('paperSize.height=0 合法（表示连续纸走推导）', () => {
    const r = parsePrintSubmit({ templateJson: {}, print: { paperSize: { height: 0 } } })
    expect(r.print.paperSize).toEqual({ height: 0 })
  })
})
