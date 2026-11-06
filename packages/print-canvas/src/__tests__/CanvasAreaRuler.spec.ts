// 视口固定标尺的滚动口径回归：与 print-common 的 ruler-scroll.spec.ts 成对，
// 保证 Vue3 版在响应式重渲染下仍保持滚动位置、浮层平移与刻度原点口径。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CanvasArea from '../components/CanvasArea.vue'
import Ruler from '../components/Ruler.vue'
import { mmToPx, RULER_THICKNESS } from '@worm-vue3-print/core/designer'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function makeTemplate(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    elements: [],
  } as TemplateData
}

/** happy-dom 无真实布局：固定纸面与视口矩形，让标尺几何可断言 */
function mockGeometry(paperScale = 1) {
  const paperWidth = mmToPx(210) * paperScale
  const paperHeight = mmToPx(297) * paperScale
  const rect = (left: number, top: number, width: number, height: number) => ({
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top, toJSON: () => ({}),
  }) as DOMRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('canvas-area')) return rect(0, 0, 300, 200)
    if (this.classList.contains('hiprint-printPaper')) return rect(66, 66, paperWidth, paperHeight)
    return rect(0, 0, 0, 0)
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('canvas-area') ? 300 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('canvas-area') ? 200 : 0
  })
}

function mountArea() {
  return mount(CanvasArea, {
    props: { templateData: makeTemplate(), elements: [], scale: 1 },
    global: {
      stubs: {
        CanvasPaper: {
          template: '<div class="paper-wrapper"><div class="hiprint-printPaper"></div></div>',
        },
      },
    },
  })
}

/** 写入滚动位置并派发原生 scroll，等 Vue 响应式刷新 */
async function scrollTo(wrapper: ReturnType<typeof mountArea>, x: number, y: number) {
  const area = wrapper.find('.canvas-area')
  const el = area.element as HTMLElement
  el.scrollLeft = x
  el.scrollTop = y
  await area.trigger('scroll')
  await nextTick()
  return el
}

const overlayTransform = (wrapper: ReturnType<typeof mountArea>) =>
  (wrapper.find('.ruler-overlay').element as HTMLElement).style.transform

describe('CanvasArea 标尺几何同步', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('纸张缩放过渡期间，标尺使用纸张的实时视觉比例', async () => {
    mockGeometry(0.5)
    const wrapper = mountArea()
    await nextTick()
    await nextTick()

    const rulers = wrapper.findAllComponents(Ruler)
    expect(rulers).toHaveLength(2)
    for (const ruler of rulers) {
      expect(ruler.props('scale') as number).toBeCloseTo(0.5, 5)
    }
  })

  it('滚动后标尺浮层按 scrollPos 平移补偿', async () => {
    mockGeometry()
    const wrapper = mountArea()
    const el = await scrollTo(wrapper, 30, 120)
    expect(el.scrollLeft).toBe(30)
    expect(el.scrollTop).toBe(120)
    expect(overlayTransform(wrapper)).toBe('translate(30px, 120px)')
  })

  it('模板状态更新重渲染后，滚动容器复用且滚动位置与浮层平移保持', async () => {
    mockGeometry()
    const wrapper = mountArea()
    const el = await scrollTo(wrapper, 30, 120)
    await wrapper.setProps({ templateData: makeTemplate() })
    await nextTick()
    expect(wrapper.find('.canvas-area').element).toBe(el)
    expect(el.scrollLeft).toBe(30)
    expect(el.scrollTop).toBe(120)
    expect(overlayTransform(wrapper)).toBe('translate(30px, 120px)')
  })

  it('标尺原点只取纸面与视口的实时矩形差，不叠加 scrollPos', async () => {
    mockGeometry()
    const wrapper = mountArea()
    await nextTick()
    await nextTick()
    const origin = () => wrapper.findAllComponents(Ruler).map(r => r.props('originPx'))
    expect(origin()).toEqual([66 - RULER_THICKNESS, 66 - RULER_THICKNESS])
    await scrollTo(wrapper, 40, 120)
    expect(origin()).toEqual([66 - RULER_THICKNESS, 66 - RULER_THICKNESS])
  })
})
