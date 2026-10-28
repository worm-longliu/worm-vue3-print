import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  defaultZoomKey,
  fitZoom,
  paperWidthPx,
  resolvePrinterDpi,
  viewZoomHint,
  zoomPresets,
} from '@worm-vue3-print/core/designer'

const MM_TO_PX = 96 / 25.4

/** 预览 iframe 的渲染产物与本用例无关：桩掉 core/browser，只验缩放写进文档 */
const PREVIEW_HTML = '<html><head></head><body><div class="print-page">纸面</div></body></html>'
vi.mock('@worm-vue3-print/core/browser', () => ({
  renderHtmlPages: async () => ({ html: PREVIEW_HTML, pageCount: 1, copies: 1 }),
  browserCodeRenderer: { render: () => '<svg />' },
}))

const TEMPLATE_WITH_DPI = {
  paperSize: 'CUSTOM',
  customWidth: 95,
  customHeight: 75,
  elements: [
    { type: 'barcode', options: { printerDpi: 203 } },
    {
      type: 'table',
      options: { tableRows: [{ cells: [{ cellType: 'barcode', printerDpi: 300 }] }] },
    },
  ],
}

describe('预览缩放档位计算（判据在 core 的 designer/utils/preview-zoom）', () => {
  it('从元素与表格单元格收集 printerDpi，多档取最细点距', () => {
    expect(resolvePrinterDpi(TEMPLATE_WITH_DPI)).toBe(300)
    expect(resolvePrinterDpi({ elements: [{ options: {} }] })).toBeNull()
    expect(resolvePrinterDpi(null)).toBeNull()
    // 多页模板要能翻到 pages 里的元素
    expect(resolvePrinterDpi({ pages: [{ elements: [{ options: { printerDpi: 203 } }] }] })).toBe(203)
  })

  it('纸张宽度按 CSS 96px/in 换算，自定义、预设、横版与热敏纸都走 core 同一口径', () => {
    // customWidth 按模板契约只在 CUSTOM / 连续纸下生效，其余纸型忽略（与出纸 getPaperDimensions 同口径）
    expect(paperWidthPx({ paperSize: 'CUSTOM', customWidth: 95 })).toBeCloseTo(95 * MM_TO_PX, 6)
    expect(paperWidthPx({ paperSize: 'A4', customWidth: 95 })).toBeCloseTo(210 * MM_TO_PX, 6)
    expect(paperWidthPx({ paperSize: 'A4', orientation: 'portrait' })).toBeCloseTo(210 * MM_TO_PX, 6)
    expect(paperWidthPx({ paperSize: 'A4', orientation: 'landscape' })).toBeCloseTo(297 * MM_TO_PX, 6)
    // 横版不是「特判 A4」：A3 / A5 交换后分别是 420 / 210
    expect(paperWidthPx({ paperSize: 'A3', orientation: 'landscape' })).toBeCloseTo(420 * MM_TO_PX, 6)
    expect(paperWidthPx({ paperSize: 'A5', orientation: 'landscape' })).toBeCloseTo(210 * MM_TO_PX, 6)
    // 热敏/连续纸取纸宽，不再落到 A4 兜底
    expect(paperWidthPx({ paperSize: 'THERMAL_80', orientation: 'portrait' })).toBeCloseTo(80 * MM_TO_PX, 6)
    expect(paperWidthPx({ paperSize: 'CONTINUOUS', customWidth: 57 })).toBeCloseTo(57 * MM_TO_PX, 6)
    expect(paperWidthPx(undefined)).toBeCloseTo(210 * MM_TO_PX, 6)
    // 多页模板按第一页
    expect(paperWidthPx({ pages: [{ paperSize: 'A5', orientation: 'portrait' }] })).toBeCloseTo(148 * MM_TO_PX, 6)
  })

  it('适配档只给整数倍，且夹在 1~8 之间', () => {
    const paper = 95 * MM_TO_PX
    expect(fitZoom(800, paper)).toBe(2)
    expect(fitZoom(200, paper)).toBe(1)
    expect(fitZoom(5000, paper)).toBe(8)
    expect(fitZoom(0, paper)).toBe(1)
  })

  it('点阵档 = dpi/96，即 1 屏幕像素 = 1 打印点；无 dpi 时不给该档', () => {
    const withDpi = zoomPresets(203, 800, 95 * MM_TO_PX)
    expect(withDpi[0]!.key).toBe('dots')
    expect(withDpi[0]!.value).toBeCloseTo(203 / 96, 6)
    expect(zoomPresets(null, 800, 95 * MM_TO_PX)[0]!.key).toBe('fit')
  })

  it('默认档恒为 100%：声明点距与否都不改变落点', () => {
    expect(defaultZoomKey(203)).toBe('100')
    expect(defaultZoomKey(null)).toBe('100')
  })

  it('切档提示只在「有点距 + 当前不是点阵档」时出现，且点名可切的档位', () => {
    expect(viewZoomHint(203, '100')).toBe('条码看不清？切「点阵 203dpi」档（1 屏幕像素 = 1 打印点）')
    expect(viewZoomHint(203, 'dots')).toBe('')
    expect(viewZoomHint(null, '100')).toBe('')
  })
})

describe('PrintHtmlPreview 档位状态', () => {
  // happy-dom 的 iframe 没有 contentWindow.document，缩放写进文档这一步只能在真实浏览器验；
  // 这里锁住可控的部分：默认档、档位表、切档与非法档位忽略，且缺文档时不抛错。
  async function make(templateJson: Record<string, any>) {
    const { default: PrintHtmlPreview } = await import('../components/PrintHtmlPreview.vue')
    const wrapper = mount(PrintHtmlPreview, { props: { templateJson } })
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('带 printerDpi 的模板默认落在 100% 档，并给出切点阵档的提示', async () => {
    const wrapper = await make(TEMPLATE_WITH_DPI)
    expect(wrapper.vm.zoomKey).toBe('100')
    const dots = wrapper.vm.presets.find((p: any) => p.key === 'dots')
    expect(dots!.value).toBeCloseTo(300 / 96, 6)
    expect(wrapper.vm.viewHint).toBe('条码看不清？切「点阵 300dpi」档（1 屏幕像素 = 1 打印点）')
    expect(wrapper.text()).toContain('点阵 300dpi')
    wrapper.unmount()
  })

  it('没有 printerDpi 时不给点阵档，默认 100% 且不出切档提示', async () => {
    const wrapper = await make({ elements: [{ options: {} }] })
    expect(wrapper.vm.zoomKey).toBe('100')
    expect(wrapper.vm.presets.some((p: any) => p.key === 'dots')).toBe(false)
    expect(wrapper.vm.viewHint).toBe('')
    wrapper.unmount()
  })

  it('点档位按钮切档，setViewZoom 忽略不在册的档位', async () => {
    const wrapper = await make(TEMPLATE_WITH_DPI)
    const btn = wrapper.findAll('.print-html-preview-zoom-btn').find(b => b.text() === '200%')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.vm.zoomKey).toBe('200')
    wrapper.vm.setViewZoom('nope')
    expect(wrapper.vm.zoomKey).toBe('200')
    wrapper.vm.setViewZoom('dots')
    expect(wrapper.vm.zoomKey).toBe('dots')
    wrapper.unmount()
  })

  it('错误态不渲染缩放条，避免在空文档上写档位', async () => {
    const { default: PrintHtmlPreview } = await import('../components/PrintHtmlPreview.vue')
    const wrapper = mount(PrintHtmlPreview, { props: { templateJson: null } })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.print-html-preview-zoom-btn').length).toBe(0)
    wrapper.unmount()
  })
})
