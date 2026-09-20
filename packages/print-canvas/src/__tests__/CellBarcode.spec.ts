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

describe('CellBarcode 打印机分辨率点对齐', () => {
  it('未设 printerDpi 时沿用填格（不写死尺寸）', async () => {
    const style = (await mountCell({ targetWidthMm: 38, targetHeightMm: 6 })).find('svg').attributes('style') ?? ''
    expect(style).toMatch(/max-width:\s*100%/)
    expect(style).not.toMatch(/width:\s*[\d.]+mm/)
  })

  it('给出 printerDpi 与单元格可用宽高时，尺寸恰好为整数打印点且不超框', async () => {
    const wrapper = await mountCell({ printerDpi: 203, targetWidthMm: 38, targetHeightMm: 6 })
    const style = wrapper.find('svg').attributes('style') ?? ''
    const widthMm = Number(/(?:^|;)\s*width:\s*([\d.]+)mm/.exec(style)?.[1])
    const heightMm = Number(/(?:^|;)\s*height:\s*([\d.]+)mm/.exec(style)?.[1])
    expect(widthMm).toBeGreaterThan(0)
    expect(heightMm).toBeGreaterThan(0)
    // 折算回打印点必须是整数，否则打印机仍会各自取整
    expect(Math.abs((widthMm * 203) / 25.4 - Math.round((widthMm * 203) / 25.4))).toBeLessThan(1e-3)
    expect(Math.abs((heightMm * 203) / 25.4 - Math.round((heightMm * 203) / 25.4))).toBeLessThan(1e-3)
    expect(widthMm).toBeLessThanOrEqual(38)
    expect(heightMm).toBeLessThanOrEqual(6)
    // 点对齐后不再叠加最大宽高（叠加会把对齐结果重新缩成非整数点）
    expect(style).toMatch(/max-width:\s*none/)
  })

  it('可用框放不下整数点布局时退回填格（不为对齐而让条码溢出单元格）', async () => {
    const style = (await mountCell({ printerDpi: 203, targetWidthMm: 38, targetHeightMm: 0.5 })).find('svg').attributes('style') ?? ''
    expect(style).not.toMatch(/width:\s*[\d.]+mm/)
    expect(style).toMatch(/max-width:\s*100%/)
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
