// web/src/components/print/__tests__/BarcodeElement.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'

vi.mock('jsbarcode', () => ({ default: vi.fn() }))

import JsBarcode from 'jsbarcode'
import BarcodeElement from '../components/elements/BarcodeElement.vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

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
  // jsbarcode 真实实现在此被桩掉：按其入参补一个成比例的 viewBox，才能走到尺寸结算逻辑
  // （真实 jsbarcode 会以「模块 × 每模块用户单位数」为画布，即 99×44 模块再乘 opts.width）
  vi.mocked(JsBarcode).mockImplementation((svg: any, _value: string, opts: any) => {
    const unit = Number(opts?.width) || 1
    svg.setAttribute?.('viewBox', `0 0 ${99 * unit} ${44 * unit}`)
    return svg
  })
  const wrapper = mount(BarcodeElement, {
    props: { element, designMode: true },
  })
  return { wrapper, element }
}

/** 取 svg style 里的宽/高（mm） */
function mmOf(wrapper: ReturnType<typeof mount>, prop: 'width' | 'height'): number {
  const style = wrapper.find('svg').attributes('style') ?? ''
  return Number(new RegExp(`(?:^|;)\\s*${prop}:\\s*([\\d.]+)mm`).exec(style)?.[1])
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

/** 挂载并等 DOM 刷新：尺寸在 onMounted 结算，需下一次 tick 才落到 style */
async function mountSettled(options: Partial<RuntimeElement['options']> = {}) {
  const { wrapper, element } = mountBarcode(options)
  await nextTick()
  return { wrapper, element }
}

describe('BarcodeElement 按条宽 / 打印机 dpi 结算尺寸', () => {
  it('未设 dpi：尺寸 = 模块数 × 条宽（宽度足够时不放大填满）', async () => {
    const { wrapper } = await mountSettled()
    // 99×44 模块 × 0.25mm（barWidth=2），元素框 56.4×14.1mm 装得下
    expect(mmOf(wrapper, 'width')).toBeCloseTo(99 * 0.25, 6)
    expect(mmOf(wrapper, 'height')).toBeCloseTo(44 * 0.25, 6)
  })

  it('元素框放不下时等比缩小（宽高比不变、不溢出）', async () => {
    const { wrapper } = await mountSettled({ barWidth: 4, height: 8 })
    expect(mmOf(wrapper, 'height')).toBeLessThanOrEqual(8)
    expect(mmOf(wrapper, 'width') / mmOf(wrapper, 'height')).toBeCloseTo(99 / 44, 6)
  })

  it('设置 dpi：尺寸吸附到整数打印点（dpi 优先于条宽的毫米值）', async () => {
    const { wrapper } = await mountSettled({ printerDpi: 203 })
    const widthDots = (mmOf(wrapper, 'width') * 203) / 25.4
    // DOM 序列化把 mm 截断到 6 位小数（≈1nm），折算回点的偏差远小于一个打印点
    expect(Math.abs(widthDots - Math.round(widthDots))).toBeLessThan(1e-5)
    // 203dpi 下 0.25mm ≈ 2 点
    expect(mmOf(wrapper, 'width')).toBeCloseTo((99 * 2 * 25.4) / 203, 6)
  })

  it('最大宽高并入可用框参与结算，而不是事后 CSS 缩放', async () => {
    const { wrapper, element } = mountBarcode()
    element.options.maxWidth = 30
    element.options.maxHeight = 10
    await nextTick()
    expect(mmOf(wrapper, 'width')).toBeLessThanOrEqual(30)
    expect(mmOf(wrapper, 'height')).toBeLessThanOrEqual(10)
    expect(wrapper.find('svg').attributes('style')).not.toMatch(/max-width/)
  })
})
