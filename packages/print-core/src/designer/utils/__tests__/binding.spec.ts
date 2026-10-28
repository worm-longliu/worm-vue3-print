import { describe, it, expect } from 'vitest'
import { resolveBarcodeDesignValue } from '../binding.js'

// 设计态码值解析：单元格与元素级码类共用同一条求值链
describe('resolveBarcodeDesignValue', () => {
  it('默认兜底仍是通用示例码值（表格单元格调用方不受影响）', () => {
    expect(resolveBarcodeDesignValue(undefined, undefined)).toBe('1234567890128')
    expect(resolveBarcodeDesignValue('', undefined)).toBe('1234567890128')
  })

  it('字面量内容原样返回（属性台改内容后设计态立即生效）', () => {
    expect(resolveBarcodeDesignValue('HELLO', undefined, 'qrcode')).toBe('HELLO')
  })

  it('{字段} 表达式按 demo 数据求值，取不到才用兜底', () => {
    expect(resolveBarcodeDesignValue('{order.no}', undefined, 'qrcode')).toBe('PO20260801001')
    expect(resolveBarcodeDesignValue('{不存在字段}', undefined, 'qrcode')).toBe('qrcode')
  })

  it('兜底传空串表示「不给示例码值」，交给调用方的最终回退', () => {
    expect(resolveBarcodeDesignValue('', undefined, '')).toBe('')
  })
})
