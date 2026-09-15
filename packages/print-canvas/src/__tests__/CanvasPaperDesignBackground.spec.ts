import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasPaper from '../components/CanvasPaper.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function makeTemplate(designBackground?: TemplateData['designBackground']): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    designBackground,
  } as TemplateData
}

function mountPaper(templateData: TemplateData, designMode = true) {
  return mount(CanvasPaper, {
    props: { templateData, runtimeElements: [], designMode, printData: [], scale: 1, guides: [] },
    global: { stubs: { BaseElement: true } },
  })
}

const SRC = 'https://host.example.com/scan-form.png'

describe('CanvasPaper 设计背景', () => {
  it('未设置背景时不渲染背景图层', () => {
    expect(mountPaper(makeTemplate()).find('.design-background').exists()).toBe(false)
  })

  it('非设计模式不渲染背景图层', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 0 }), false)
    expect(wrapper.find('.design-background').exists()).toBe(false)
  })

  it('0° 时图层与纸张同尺寸、无旋转、不拦截事件', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 0 }))
    const layer = wrapper.find('.design-background')
    const img = wrapper.find('.design-background img')
    expect(layer.exists()).toBe(true)
    expect(img.attributes('src')).toBe(SRC)
    expect(img.attributes('draggable')).toBe('false')
    const style = layer.attributes('style') ?? ''
    expect(style).toContain('width: 210mm')
    expect(style).toContain('height: 297mm')
    expect(style).toContain('left: 0mm')
    expect(style).toContain('top: 0mm')
    expect(style).not.toContain('rotate')
  })

  it('90° 时图层宽高交换并居中，绕纸张中心旋转', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 90 }))
    const style = wrapper.find('.design-background').attributes('style') ?? ''
    expect(style).toContain('width: 297mm')
    expect(style).toContain('height: 210mm')
    expect(style).toContain('left: -43.5mm')
    expect(style).toContain('top: 43.5mm')
    expect(style).toContain('rotate(90deg)')
  })

  it('非法旋转值按 0 处理', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 45 as 0 }))
    const style = wrapper.find('.design-background').attributes('style') ?? ''
    expect(style).toContain('width: 210mm')
    expect(style).toContain('height: 297mm')
    expect(style).not.toContain('rotate')
  })

  it('背景图层位于纸张容器内、内容层之前（最底层）', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 0 }))
    const paper = wrapper.find('.hiprint-printPaper')
    expect(paper.findAll('.design-background')).toHaveLength(1)
    expect(paper.element.children[0]?.classList.contains('design-background')).toBe(true)
  })
})
