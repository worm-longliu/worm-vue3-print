// print-canvas/src/__tests__/CanvasPaperWatermark.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasPaper from '../components/CanvasPaper.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

// 说明：水印文本的解析取值（完整路径/表达式/回退/时间戳）与瓦片网格计算
// 在 print-core 的 watermark.test.ts 中已完整覆盖（与画布共用同一核心函数）。
// 本组测试校验 CanvasPaper 与 core 的接线：是否按配置渲染水印层与瓦片、
// 以及是否仍保留「显式矢量瓦片、不用 CSS 平铺背景」这一关键约束。
function makeTemplate(watermark: Record<string, any> | undefined): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    watermark: watermark as TemplateData['watermark'],
  } as TemplateData
}

function mountPaper(watermark: Record<string, any> | undefined, printData: any = []) {
  return mount(CanvasPaper, {
    props: {
      templateData: makeTemplate(watermark),
      runtimeElements: [],
      designMode: true,
      printData,
      scale: 1,
      guides: [],
    },
    global: {
      stubs: { BaseElement: true },
    },
  })
}

describe('CanvasPaper 水印渲染（与 core 同构接线）', () => {
  it('未配置水印时不渲染水印层', () => {
    const wrapper = mountPaper(undefined)
    expect(wrapper.find('.watermark-layer').exists()).toBe(false)
  })

  it('固定文本水印渲染层且 opacity 注入', () => {
    const wrapper = mountPaper({ mode: 'fixed', content: '内部资料', opacity: 0.2 })
    const layer = wrapper.find('.watermark-layer')
    expect(layer.exists()).toBe(true)
    expect(layer.attributes('style') ?? '').toContain('opacity: 0.2')
    // 显式矢量瓦片：每块一个 <svg class="watermark-tile">，不能再用 CSS 平铺背景
    const tiles = wrapper.findAll('.watermark-tile')
    expect(tiles.length).toBeGreaterThan(0)
    expect(layer.attributes('style') ?? '').not.toContain('background')
    expect(layer.html()).not.toContain('background-image')
    expect(layer.html()).not.toContain('data:image/svg')
  })

  it('瓦片几何与 core 网格一致（A4 默认密度 4 列 × 7 行）', () => {
    const wrapper = mountPaper({ mode: 'fixed', content: '内部资料' })
    expect(wrapper.findAll('.watermark-tile')).toHaveLength(28)
    const first = wrapper.findAll('.watermark-tile')[0]
    expect(first.attributes('viewBox')).toBe('0 0 260 180')
    expect(first.attributes('style') ?? '').toContain('left: 0mm')
    expect(first.text()).toBe('内部资料')
  })

  it('旧模板（无 mode）按 fixed 兼容处理，可显示水印', () => {
    const wrapper = mountPaper({ content: '兼容水印' })
    expect(wrapper.find('.watermark-layer').exists()).toBe(true)
  })

  it('绑定字段模式与数据无关地可渲染水印层', () => {
    const wrapper = mountPaper({ mode: 'binding', binding: 'order.no' }, [{ order: { no: 'SO-200' } }])
    expect(wrapper.find('.watermark-layer').exists()).toBe(true)
  })
})
