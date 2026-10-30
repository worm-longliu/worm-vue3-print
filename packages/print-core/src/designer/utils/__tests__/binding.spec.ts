import { describe, it, expect } from 'vitest'
import { createFieldElement, createFieldLabelElement, resolveBarcodeDesignValue } from '../binding.js'

describe('createFieldElement / createFieldLabelElement', () => {
  const field = { fieldKey: 'supplier.name', fieldLabel: '供应商名称' }

  it('普通拖放仍是取值绑定的文本元素', () => {
    const el = createFieldElement(field)
    expect(el.printElementType.type).toBe('text')
    expect(el.options.formatter).toBe('{supplier.name}')
    expect(el.options.title).toBe('供应商名称')
  })

  it('Ctrl 拖放生成静态文本元素：内容与图层名都是字段中文名', () => {
    const el = createFieldLabelElement(field)
    expect(el.printElementType.type).toBe('text')
    expect(el.options.formatter).toBe('供应商名称')
    expect(el.options.title).toBe('供应商名称')
  })

  it('字段中文名缺失时回退字段 key', () => {
    const el = createFieldLabelElement({ fieldKey: 'supplier.name', fieldLabel: '' })
    expect(el.options.formatter).toBe('supplier.name')
  })
})

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
