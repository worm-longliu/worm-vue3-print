import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasPaper from '../components/CanvasPaper.vue'
import type { TemplateData, AlignLine } from '@worm-vue3-print/core/designer'

function makeTemplate(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
  } as TemplateData
}

function mountPaper(guides: AlignLine[]) {
  return mount(CanvasPaper, {
    props: {
      templateData: makeTemplate(),
      runtimeElements: [],
      designMode: true,
      printData: [],
      scale: 1,
      guides,
    },
    global: {
      stubs: { BaseElement: true },
    },
  })
}

describe('CanvasPaper 手动参考线边界', () => {
  it('拖动参考线越过纸张边缘时，位置被钳制在纸张范围内', async () => {
    const wrapper = mountPaper([
      { id: 'guide-v', type: 'vertical', position: 50 },
      { id: 'guide-h', type: 'horizontal', position: 60 },
    ])
    const guides = wrapper.findAll('.manual-guide')

    await guides[0]!.trigger('mousedown', { clientX: 50, clientY: 0 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10000, clientY: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 10000, clientY: 0 }))

    await guides[1]!.trigger('mousedown', { clientX: 0, clientY: 60 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: -10000 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 0, clientY: -10000 }))

    const emittedMoves = wrapper.emitted('guide-move') ?? []
    const vEvents = emittedMoves.filter(([, position]) => position === 210)
    const hEvents = emittedMoves.filter(([, position]) => position === 0)
    expect(vEvents.length).toBeGreaterThan(0)
    expect(hEvents.length).toBeGreaterThan(0)
  })
})
