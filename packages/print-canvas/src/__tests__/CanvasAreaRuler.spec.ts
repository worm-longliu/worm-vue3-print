import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CanvasArea from '../components/CanvasArea.vue'
import Ruler from '../components/Ruler.vue'
import { mmToPx } from '../utils/units'
import type { TemplateData } from '../types'

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

describe('CanvasArea 标尺几何同步', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('纸张缩放过渡期间，标尺使用纸张的实时视觉比例', async () => {
    const paperWidth = mmToPx(210)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('canvas-area')) {
        return { left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      }
      if (this.classList.contains('hiprint-printPaper')) {
        return {
          left: 66,
          top: 66,
          width: paperWidth / 2,
          height: mmToPx(297) / 2,
          right: 66 + paperWidth / 2,
          bottom: 66 + mmToPx(297) / 2,
          x: 66,
          y: 66,
          toJSON: () => ({}),
        } as DOMRect
      }
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('canvas-area') ? 300 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('canvas-area') ? 200 : 0
    })

    const wrapper = mount(CanvasArea, {
      props: {
        templateData: makeTemplate(),
        elements: [],
        scale: 1,
      },
      global: {
        stubs: {
          CanvasPaper: {
            template: '<div class="paper-wrapper"><div class="hiprint-printPaper"></div></div>',
          },
        },
      },
    })
    await nextTick()
    await nextTick()

    const rulers = wrapper.findAllComponents(Ruler)
    expect(rulers).toHaveLength(2)
    for (const ruler of rulers) {
      expect(ruler.props('scale') as number).toBeCloseTo(0.5, 5)
    }
  })
})
