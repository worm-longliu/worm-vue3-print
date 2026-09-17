import { describe, it, expect } from 'vitest'
import { parsePrintSubmit, parsePrintSubmitHtml } from './request-validation.js'

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

  it('templateName 为空白串时 trim 并返回名称', () => {
    const r = parsePrintSubmit({ templateJson: {}, templateName: '  采购收货单 ' })
    expect(r.templateName).toBe('采购收货单')
  })

  it('templateName 缺省/空白时返回空串', () => {
    expect(parsePrintSubmit({ templateJson: {} }).templateName).toBe('')
    expect(parsePrintSubmit({ templateJson: {}, templateName: '   ' }).templateName).toBe('')
  })

  it('templateName 非字符串抛 INVALID_REQUEST', () => {
    expect(() => parsePrintSubmit({ templateJson: {}, templateName: 123 })).toThrow()
    try {
      parsePrintSubmit({ templateJson: {}, templateName: 123 })
      throw new Error('应抛错')
    } catch (err) {
      expect((err as { code?: string }).code).toBe('INVALID_REQUEST')
    }
  })

  it('printData 数组合法时透传', () => {
    const r = parsePrintSubmit({
      templateJson: {},
      printData: [{ a: 1 }, { a: 2 }],
      print: {},
    })
    expect(Array.isArray(r.spec.printData)).toBe(true)
    expect(r.spec.printData).toHaveLength(2)
  })

  it('printData 空数组拒绝', () => {
    expect(() => parsePrintSubmit({ templateJson: {}, printData: [], print: {} }))
      .toThrow('批量打印数据必须是非空对象数组')
  })

  it('printData 超过 500 份拒绝并报告份数', () => {
    const list = Array.from({ length: 501 }, () => ({}))
    expect(() => parsePrintSubmit({ templateJson: {}, printData: list, print: {} }))
      .toThrow('批量打印最多支持 500 份，当前 501 份')
  })

  it('printData 数组含非对象项拒绝并报告项序号', () => {
    expect(() => parsePrintSubmit({ templateJson: {}, printData: [{}, 1], print: {} }))
      .toThrow('批量打印数据第 2 项必须是对象')
  })

  it('printData 数组含嵌套数组项拒绝', () => {
    expect(() => parsePrintSubmit({ templateJson: {}, printData: [{}, []], print: {} }))
      .toThrow('批量打印数据第 2 项必须是对象')
  })
})

describe('parsePrintSubmitHtml', () => {
  const valid = {
    html: '<html><body>ok</body></html>',
    paperMm: { width: 80, height: 120.5 },
    continuous: true,
    pageCount: 3,
    print: { printerName: '热敏-80', copies: 2 },
    templateName: ' 采购收货单 ',
  }

  it('合法请求解析为直打印任务（名称 trim）', () => {
    const r = parsePrintSubmitHtml(valid)
    expect(r).toMatchObject({
      html: valid.html,
      paperMm: { width: 80, height: 120.5 },
      continuous: true,
      pageCount: 3,
      templateName: '采购收货单',
    })
    expect(r.print).toEqual({ printerName: '热敏-80', copies: 2 })
  })

  it('print 缺省合法；continuous/pageCount 缺省为 false/undefined', () => {
    const r = parsePrintSubmitHtml({ html: '<html></html>', paperMm: { width: 80, height: 297 } })
    expect(r.print).toEqual({})
    expect(r.continuous).toBe(false)
    expect(r.pageCount).toBeUndefined()
    expect(r.templateName).toBe('')
  })

  it.each([
    ['非对象', null],
    ['html 缺失', { paperMm: { width: 80, height: 297 } }],
    ['html 非字符串', { html: 1, paperMm: { width: 80, height: 297 } }],
    ['html 空白', { html: '   ', paperMm: { width: 80, height: 297 } }],
    ['paperMm 缺失', { html: '<html></html>' }],
    ['paperMm.width 非法', { html: '<html></html>', paperMm: { width: 0, height: 297 } }],
    ['paperMm.height 非法', { html: '<html></html>', paperMm: { width: 80, height: -1 } }],
    ['continuous 非布尔', { html: '<html></html>', paperMm: { width: 80, height: 297 }, continuous: 1 }],
    ['pageCount 非正整数', { html: '<html></html>', paperMm: { width: 80, height: 297 }, pageCount: 0 }],
    ['print 非对象', { html: '<html></html>', paperMm: { width: 80, height: 297 }, print: 1 }],
    ['copies 非法', { html: '<html></html>', paperMm: { width: 80, height: 297 }, print: { copies: 0 } }],
  ])('%s → INVALID_REQUEST', (_name, raw) => {
    expect(() => parsePrintSubmitHtml(raw)).toThrow()
    try {
      parsePrintSubmitHtml(raw)
      throw new Error('应抛错')
    } catch (err) {
      expect((err as { code?: string }).code).toBe('INVALID_REQUEST')
    }
  })

  it('纸张覆盖字段一律拒绝（已固化在预渲染 HTML 中）', () => {
    for (const forbidden of [
      { paperSize: { width: 80000 } },
      { margins: { top: 0, bottom: 0, left: 0, right: 0 } },
      { landscape: true },
    ]) {
      try {
        parsePrintSubmitHtml({ ...valid, print: { printerName: 'P', ...forbidden } })
        throw new Error('应抛错')
      } catch (err) {
        expect((err as { code?: string }).code).toBe('INVALID_REQUEST')
      }
    }
  })

  it('templateName 非字符串抛 INVALID_REQUEST', () => {
    expect(() => parsePrintSubmitHtml({ ...valid, templateName: 1 })).toThrow()
    try {
      parsePrintSubmitHtml({ ...valid, templateName: 1 })
      throw new Error('应抛错')
    } catch (err) {
      expect((err as { code?: string }).code).toBe('INVALID_REQUEST')
    }
  })

  it('html 超过 20MB 上限抛 INVALID_REQUEST', () => {
    const raw = { ...valid, html: 'x'.repeat(20 * 1024 * 1024 + 1) }
    expect(() => parsePrintSubmitHtml(raw)).toThrow()
  })
})
