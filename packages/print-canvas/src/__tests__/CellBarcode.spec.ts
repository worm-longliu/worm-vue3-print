// 单元格条形码：与出图端同源的 jsbarcode 参数 + 整数打印点对齐
import { describe, it, expect, beforeAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import CellBarcode from '../components/elements/CellBarcode.vue'

// happy-dom 不实现 canvas 2d 上下文；jsbarcode 文本测量需要 getContext('2d')
beforeAll(() => {
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = function () {
    return { font: '', measureText: (t: string) => ({ width: String(t).length * 8 }) }
  }
})

/** 挂载并等一个 tick：svg 尺寸/显示状态在 onMounted 内同步赋值，需刷新后才落到 DOM */
async function mountCell(props: Record<string, any> = {}) {
  const wrapper = mount(CellBarcode, {
    props: { cellType: 'barcode', value: '12345678', showText: true, ...props },
  })
  await nextTick()
  await flushPromises()
  return wrapper
}

describe('CellBarcode 与出图端同源（jsbarcode 参数以模块为单位）', () => {
  it('条高 30 模块、字号 10 模块、左右静区各 10 模块（与 browser-code-renderer 一致）', async () => {
    const svg = (await mountCell()).find('svg').element as SVGSVGElement
    // 79 模块码值 + 左右各 10 模块静区 = 99；30 条高 + 12 文本区 + 2 下间距 = 44
    expect(svg.getAttribute('viewBox')).toBe('0 0 99 44')
  })

  it('关闭抗锯齿（crispEdges），与出图端一致', async () => {
    const svg = (await mountCell()).find('svg').element as SVGSVGElement
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges')
  })
})

/** 挂载后取 svg style 中的宽高（mm） */
async function mountCellStyle(props: Record<string, any> = {}) {
  const wrapper = await mountCell(props)
  return wrapper.find('svg').attributes('style') ?? ''
}

function mmOf(style: string, prop: 'width' | 'height'): number {
  return Number(new RegExp(`(?:^|;)\\s*${prop}:\\s*([\\d.]+)mm`).exec(style)?.[1])
}

describe('CellBarcode 落纸尺寸（条宽 → dpi → 等比缩小）', () => {
  it('未设 printerDpi 时按条宽折算 mm 尺寸', async () => {
    const style = await mountCellStyle({ targetWidthMm: 0, targetHeightMm: 0 })
    // 99×44 模块 × 0.25mm（默认 barWidth=2）
    expect(mmOf(style, 'width')).toBeCloseTo(99 * 0.25, 6)
    expect(mmOf(style, 'height')).toBeCloseTo(44 * 0.25, 6)
  })

  it('条宽加倍 → 尺寸同比加倍（barWidth 是尺寸的第一来源）', async () => {
    const base = await mountCellStyle({ targetWidthMm: 0, targetHeightMm: 0 })
    const thick = await mountCellStyle({ targetWidthMm: 0, targetHeightMm: 0, barWidth: 4 })
    expect(mmOf(thick, 'width')).toBeCloseTo(mmOf(base, 'width') * 2, 6)
  })

  it('可用框放不下首选尺寸时等比缩小（宽高比不变，不溢出单元格）', async () => {
    // 单元格内容区 38×6mm：放不下 24.75×11mm → 按高度受限缩到 13.5×6mm
    const style = await mountCellStyle({ targetWidthMm: 38, targetHeightMm: 6 })
    expect(mmOf(style, 'height')).toBeCloseTo(6, 6)
    expect(mmOf(style, 'width') / mmOf(style, 'height')).toBeCloseTo(99 / 44, 6)
  })

  it('给出 printerDpi 时尺寸吸附到整数打印点，且不超框', async () => {
    const style = await mountCellStyle({ printerDpi: 203, targetWidthMm: 38, targetHeightMm: 6 })
    const widthMm = mmOf(style, 'width')
    const heightMm = mmOf(style, 'height')
    expect(widthMm).toBeGreaterThan(0)
    expect(heightMm).toBeGreaterThan(0)
    // 折算回打印点必须是整数，否则打印机仍会各自取整
    // （DOM 序列化把 mm 截断到 6 位小数 ≈ 1nm，折算回点的偏差远小于一个打印点）
    expect(Math.abs((widthMm * 203) / 25.4 - Math.round((widthMm * 203) / 25.4))).toBeLessThan(1e-4)
    expect(Math.abs((heightMm * 203) / 25.4 - Math.round((heightMm * 203) / 25.4))).toBeLessThan(1e-4)
    expect(widthMm).toBeLessThanOrEqual(38)
    expect(heightMm).toBeLessThanOrEqual(6)
    // 结算尺寸不再叠加最大宽高（叠加会把它重新缩成非整数点）
    expect(style).not.toMatch(/max-width/)
  })

  it('连 1 点/模块都放不下时退回等比缩放（不对齐也不溢出单元格）', async () => {
    const style = await mountCellStyle({ printerDpi: 203, targetWidthMm: 38, targetHeightMm: 0.5 })
    expect(mmOf(style, 'height')).toBeCloseTo(0.5, 6)
    expect(mmOf(style, 'width') / mmOf(style, 'height')).toBeCloseTo(99 / 44, 6)
  })

  it('宽度足够时不放大填满：按条宽原样落纸', async () => {
    const style = await mountCellStyle({ targetWidthMm: 100, targetHeightMm: 100 })
    expect(mmOf(style, 'width')).toBeCloseTo(99 * 0.25, 6)
  })

  it('二维码不受 printerDpi 影响（不渲染条码 svg）', async () => {
    const wrapper = mount(CellBarcode, { props: { cellType: 'qrcode', value: 'x', printerDpi: 203 } })
    await nextTick()
    await flushPromises()
    const svg = wrapper.find('svg')
    // 条码 svg 保留在 DOM 但被 v-show 隐藏，且没有被 jsbarcode 渲染（无 viewBox）
    expect(svg.attributes('style')).toContain('display: none')
    expect(svg.attributes('viewBox')).toBeUndefined()
  })
})
