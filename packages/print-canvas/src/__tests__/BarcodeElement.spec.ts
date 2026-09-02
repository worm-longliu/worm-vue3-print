// web/src/components/print/__tests__/BarcodeElement.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'

vi.mock('jsbarcode', () => ({ default: vi.fn() }))

import JsBarcode from 'jsbarcode'
import BarcodeElement from '../components/elements/BarcodeElement.vue'
import type { RuntimeElement } from '../types'

function makeElement(options: Partial<RuntimeElement['options']> = {}): RuntimeElement {
  return {
    id: 'el-barcode',
    options: {
      left: 0,
      top: 0,
      width: 56.4,
      height: 14.1,
      testData: '12345678',
      barcodeType: 'code128',
      ...options,
    },
    printElementType: { type: 'barcode', title: '条形码' },
  }
}

function mountBarcode(options: Partial<RuntimeElement['options']> = {}) {
  const element = reactive(makeElement(options))
  const wrapper = mount(BarcodeElement, {
    props: { element, designMode: true },
  })
  return { wrapper, element }
}

describe('BarcodeElement 宽/高/条码设置变更即时重渲染', () => {
  beforeEach(() => {
    vi.mocked(JsBarcode).mockClear()
  })

  it('挂载时渲染一次，使用 testData 与默认条宽参数', () => {
    const { wrapper } = mountBarcode()
    expect(JsBarcode).toHaveBeenCalledTimes(1)
    const [svg, value, opts] = vi.mocked(JsBarcode).mock.calls[0]!;
    if (!opts) throw new Error('barcode options missing')
    expect(svg).toBe(wrapper.find('svg').element)
    expect(value).toBe('12345678')
    // 默认 barWidth=2 → 模块宽 1；height 由元素高度 mm 换算得出
    expect(opts.width).toBe(1)
    expect(opts.height).toBeGreaterThan(0)
    expect(opts.displayValue).toBe(true)
  })

  it.each([
    ['width', 56.4, 100],
    ['height', 14.1, 30],
    ['barWidth', 2, 4],
    ['fontSize', 12, 20],
  ] as const)('修改 %s 后触发重渲染', async (key, _before, after) => {
    const { element } = mountBarcode()
    const callsBefore = vi.mocked(JsBarcode).mock.calls.length
    element.options[key] = after as never
    await nextTick()
    expect(vi.mocked(JsBarcode).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('切换 hideTitle（显示文本）后触发重渲染并传 displayValue=false', async () => {
    const { element } = mountBarcode()
    const callsBefore = vi.mocked(JsBarcode).mock.calls.length
    element.options.hideTitle = true
    await nextTick()
    expect(vi.mocked(JsBarcode).mock.calls.length).toBeGreaterThan(callsBefore)
    const [, , lastOpts] = vi.mocked(JsBarcode).mock.calls[vi.mocked(JsBarcode).mock.calls.length - 1]!
    expect(lastOpts?.displayValue).toBe(false)
  })

  it('非设计态使用绑定解析值渲染（无绑定数据时回退占位文本）', () => {
    const element = reactive(makeElement())
    mount(BarcodeElement, { props: { element, designMode: false, data: [] } })
    const [, value] = vi.mocked(JsBarcode).mock.calls[vi.mocked(JsBarcode).mock.calls.length - 1]!
    expect(value).toBe('条码')
  })
})

describe('BarcodeElement 等比填满元素框', () => {
  it('svg 带 preserveAspectRatio="xMidYMid meet" 以等比缩放适配元素框', () => {
    const { wrapper } = mountBarcode()
    expect(wrapper.find('svg').attributes('preserveAspectRatio')).toBe('xMidYMid meet')
  })
})
