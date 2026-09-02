import { describe, it, expect, vi } from 'vitest'
import { useDrag } from '../composables/useDrag'
import type { AdsorbResult } from '../types'

function createTarget(left = 10, top = 20, width = 100, height = 50): { value: HTMLElement | null } {
  const el = document.createElement('div')
  el.style.left = left + 'px'
  el.style.top = top + 'px'
  el.style.width = width + 'px'
  el.style.height = height + 'px'
  el.style.position = 'absolute'
  return { value: el }
}

function fireMouseEvent(el: HTMLElement | Document, type: string, x: number, y: number) {
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
}

describe('useDrag', () => {
  it('setup 后 mousedown 开始拖拽', () => {
    const target = createTarget(10, 20)
    const onDrag = vi.fn()
    const onStart = vi.fn()
    const { setup, isDragging } = useDrag(target, { onDrag, onStart })

    setup()
    fireMouseEvent(target.value!, 'mousedown', 100, 200)
    expect(onStart).toHaveBeenCalledOnce()
    expect(isDragging.value).toBe(true)

    fireMouseEvent(document, 'mousemove', 150, 250)
    expect(onDrag).toHaveBeenCalledWith({ left: 60, top: 70 })
  })

  it('mouseup 停止拖拽', () => {
    const target = createTarget(0, 0)
    const onStop = vi.fn()
    const { setup, isDragging } = useDrag(target, { onDrag: vi.fn(), onStop })

    setup()
    fireMouseEvent(target.value!, 'mousedown', 100, 100)
    expect(isDragging.value).toBe(true)

    fireMouseEvent(document, 'mouseup', 150, 150)
    expect(onStop).toHaveBeenCalledOnce()
    expect(isDragging.value).toBe(false)
  })

  it('disabled 时忽略拖拽', () => {
    const target = createTarget(0, 0)
    const onDrag = vi.fn()
    const { setup, isDragging } = useDrag(target, { onDrag, disabled: true })

    setup()
    fireMouseEvent(target.value!, 'mousedown', 100, 100)
    expect(isDragging.value).toBe(false)
    expect(onDrag).not.toHaveBeenCalled()
  })

  it('axis: x 限制仅水平移动', () => {
    const target = createTarget(10, 20)
    const onDrag = vi.fn()
    const { setup } = useDrag(target, { onDrag, axis: 'x' })

    setup()
    fireMouseEvent(target.value!, 'mousedown', 100, 200)
    fireMouseEvent(document, 'mousemove', 200, 300)
    expect(onDrag).toHaveBeenCalledWith({ left: 110, top: 20 })
  })

  it('axis: y 限制仅垂直移动', () => {
    const target = createTarget(10, 20)
    const onDrag = vi.fn()
    const { setup } = useDrag(target, { onDrag, axis: 'y' })

    setup()
    fireMouseEvent(target.value!, 'mousedown', 100, 200)
    fireMouseEvent(document, 'mousemove', 200, 300)
    expect(onDrag).toHaveBeenCalledWith({ left: 10, top: 120 })
  })

  it('getScale 影响移动量', () => {
    const target = createTarget(0, 0)
    const onDrag = vi.fn()
    const { setup } = useDrag(target, { onDrag, getScale: () => 2 })

    setup()
    fireMouseEvent(target.value!, 'mousedown', 100, 100)
    fireMouseEvent(document, 'mousemove', 200, 200)
    // dx=(200-100)/2=50
    expect(onDrag).toHaveBeenCalledWith({ left: 50, top: 50 })
  })

  it('onAdsorb 回调影响坐标', () => {
    const target = createTarget(0, 0)
    target.value!.style.width = '100px'
    target.value!.style.height = '50px'
    const onDrag = vi.fn()
    const onAdsorb = vi.fn((pos) => ({ left: pos.left + 5, top: pos.top + 5, lines: [] } as AdsorbResult))
    const { setup } = useDrag(target, { onDrag, onAdsorb })

    setup()
    fireMouseEvent(target.value!, 'mousedown', 100, 100)
    fireMouseEvent(document, 'mousemove', 200, 200)
    // 原始 dx=100, dy=100, newLeft=100, newTop=100
    // 吸附后 +5, +5
    expect(onDrag).toHaveBeenCalledWith({ left: 105, top: 105 })
  })

  it('resize-handle 点击不触发拖拽', () => {
    const target = createTarget(0, 0)
    const handle = document.createElement('div')
    handle.className = 'resize-handle'
    target.value!.appendChild(handle)

    const onDrag = vi.fn()
    const { setup } = useDrag(target, { onDrag })

    setup()
    fireMouseEvent(handle, 'mousedown', 100, 100)
    expect(onDrag).not.toHaveBeenCalled()
  })

  it('cleanup 移除事件监听', () => {
    const target = createTarget(0, 0)
    const onDrag = vi.fn()
    const { setup, cleanup } = useDrag(target, { onDrag })

    setup()
    cleanup()
    // cleanup 后 mousedown 不应触发拖拽
    fireMouseEvent(target.value!, 'mousedown', 100, 100)
    fireMouseEvent(document, 'mousemove', 200, 200)
    expect(onDrag).not.toHaveBeenCalled()
  })

  it('onStart 收到 altKey 信息', () => {
    let info: { altKey: boolean } | null = null
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { setup, cleanup } = useDrag(
      { value: el },
      { onDrag: () => {}, onStart: (i) => { info = i } },
    )

    setup()
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, altKey: true }))
    expect(info).not.toBeNull()
    expect(info!.altKey).toBe(true)
    cleanup()
    document.body.removeChild(el)
  })

  it('onDragEnd 透传 mousedown 时的 altKey', () => {
    let info: { altKey: boolean } | null = null
    const target = createTarget(0, 0)
    const { setup, cleanup } = useDrag(
      target,
      { onDrag: () => {}, onDragEnd: (_pos, i) => { info = i } },
    )

    setup()
    target.value!.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true, altKey: true }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 120, clientY: 120, bubbles: true }))
    expect(info).not.toBeNull()
    expect(info!.altKey).toBe(true)
    cleanup()
  })

  it('拖拽期间维护 dragPreview 状态', () => {
    const target = createTarget(10, 20, 100, 50)
    const { setup, cleanup, dragPreview } = useDrag(target, { onDrag: vi.fn() })

    setup()
    fireMouseEvent(target.value!, 'mousedown', 100, 200)
    expect(dragPreview.value).toEqual({ left: 10, top: 20, width: 100, height: 50 })

    fireMouseEvent(document, 'mousemove', 150, 250)
    expect(dragPreview.value).toEqual({ left: 60, top: 70, width: 100, height: 50 })

    fireMouseEvent(document, 'mouseup', 160, 260)
    expect(dragPreview.value).toBeNull()
    cleanup()
  })
})
