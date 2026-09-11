import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Ruler from '../components/Ruler.vue'
import { RULER_THICKNESS } from '@worm-vue3-print/core/designer'

function createCanvasContext() {
  return {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  }
}

const flushFrame = () => new Promise(resolve => setTimeout(resolve, 30))

describe('Ruler 视口固定标尺', () => {
  let ctx: ReturnType<typeof createCanvasContext>
  let getContextSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    ctx = createCanvasContext()
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 100,
      height: RULER_THICKNESS,
      right: 100,
      bottom: RULER_THICKNESS,
      toJSON: () => ({}),
    } as DOMRect)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('竖尺数字旋转后完整位于 22px 尺宽内', async () => {
    mount(Ruler, {
      props: {
        orientation: 'vertical',
        viewportPx: 100,
        originPx: 10,
        paperLengthMM: 297,
        scale: 1,
      },
    })
    await flushFrame()

    // 首个主刻度位于 10.5px；9px 高文字旋转后横向占 9px，
    // x=11 时落在 11..20px，不会超出 22px 尺宽
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.translate).toHaveBeenCalledWith(11, 12.5)
    expect(ctx.rotate).toHaveBeenCalledWith(-Math.PI / 2)
    expect(ctx.restore).toHaveBeenCalled()
  })

  it('鼠标在横尺上移动时立即重绘指示线', async () => {
    const wrapper = mount(Ruler, {
      props: {
        orientation: 'horizontal',
        viewportPx: 100,
        originPx: 10,
        paperLengthMM: 210,
        scale: 1,
      },
    })
    await flushFrame()
    vi.clearAllMocks()

    await wrapper.get('canvas').trigger('mousemove', { clientX: 50, clientY: 5 })
    await flushFrame()

    expect(ctx.moveTo).toHaveBeenCalledWith(50.5, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(50.5, RULER_THICKNESS)
    expect(getContextSpy).toHaveBeenCalled()
  })
})
