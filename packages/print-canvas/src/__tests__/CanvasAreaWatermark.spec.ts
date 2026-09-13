// 设计工作台（CanvasArea → CanvasPaper）必须显示水印：工作台 printData 恒为空数组，
// 表达式取不到数据时应回退到测试值 / [表达式]，而不是整层不渲染。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasArea from '../components/CanvasArea.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

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

function mountArea(watermark: Record<string, any> | undefined) {
  return mount(CanvasArea, {
    props: {
      templateData: makeTemplate(watermark),
      elements: [],
      scale: 100,
    },
    global: { stubs: { BaseElement: true } },
  })
}

describe('设计工作台水印渲染', () => {
  it('表达式水印（无打印数据）在工作台可见：回退为 [表达式]', () => {
    const wrapper = mountArea({ mode: 'binding', binding: '{order.no}' })
    const tiles = wrapper.findAll('.watermark-tile')
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles[0].text()).toBe('[{order.no}]')
  })

  it('表达式水印优先用测试值', () => {
    const wrapper = mountArea({ mode: 'binding', binding: '{order.no}', testData: '示例单号' })
    expect(wrapper.findAll('.watermark-tile')[0].text()).toBe('示例单号')
  })

  it('系统变量表达式在工作台可见（打印日期/页码）', () => {
    const wrapper = mountArea({ mode: 'binding', binding: '第{pageIndex}页 {printDate}' })
    const text = wrapper.findAll('.watermark-tile')[0].text()
    expect(text).toMatch(/^第1页 \d{4}-\d{2}-\d{2}$/)
  })

  it('固定文本水印可见', () => {
    const wrapper = mountArea({ mode: 'fixed', content: '内部资料' })
    expect(wrapper.findAll('.watermark-tile')[0].text()).toBe('内部资料')
  })
})
