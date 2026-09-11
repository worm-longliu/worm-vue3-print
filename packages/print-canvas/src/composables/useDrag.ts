// web/src/components/print/composables/useDrag.ts
import { ref } from 'vue'
import type { AdsorbResult } from '@worm-vue3-print/core/designer'

export interface DragOptions {
  axis?: 'x' | 'y'
  disabled?: boolean
  getScale?: () => number
  /** 拖拽过程中每帧回调，提供修正后的绝对坐标（调用方用 transform 做视觉跟随） */
  onDrag: (pos: { left: number; top: number }) => void
  /** 拖拽结束回调，提供最终坐标与修饰符信息（调用方一次性写入响应式数据） */
  onDragEnd?: (pos: { left: number; top: number }, info: { altKey: boolean }) => void
  onStart?: (info: { altKey: boolean }) => void
  onStop?: () => void
  onAdsorb?: (pos: { left: number; top: number; width: number; height: number }) => AdsorbResult
}

export function useDrag(target: { value: HTMLElement | null }, options: DragOptions) {
  const isDragging = ref(false)
  /** 拖拽预览状态:半透明副本的绝对坐标与尺寸(pt),供上层渲染预览层 */
  const dragPreview = ref<{ left: number; top: number; width: number; height: number } | null>(null)

  let startX = 0, startY = 0
  let startLeft = 0, startTop = 0
  // 记录 mousedown 时的 altKey，供 onDragEnd 判定是否复制
  let downAltKey = false

  function onMouseDown(e: MouseEvent) {
    if (options.disabled) return
    // 忽略 resize 手柄点击
    const targetEl = e.target
    if (!(targetEl instanceof HTMLElement) || targetEl.classList.contains('resize-handle')) return

    isDragging.value = true
    downAltKey = e.altKey
    startX = e.clientX
    startY = e.clientY

    const el = target.value
    if (!el) return
    startLeft = parseFloat(el.style.left) || 0
    startTop = parseFloat(el.style.top) || 0
    // 初始化拖拽预览副本(记录起始位置与尺寸)
    dragPreview.value = {
      left: startLeft,
      top: startTop,
      width: parseFloat(el.style.width) || 0,
      height: parseFloat(el.style.height) || 0,
    }

    options.onStart?.({ altKey: downAltKey })

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    e.preventDefault()
  }

  /** 由鼠标坐标计算吸附修正后的绝对坐标 */
  function computePos(e: MouseEvent) {
    const scale = options.getScale?.() ?? 1
    let newLeft = startLeft + (e.clientX - startX) / scale
    let newTop = startTop + (e.clientY - startY) / scale

    if (options.axis === 'x') newTop = startTop
    if (options.axis === 'y') newLeft = startLeft

    if (options.onAdsorb) {
      const el = target.value
      if (el) {
        const w = parseFloat(el.style.width) || 0
        const h = parseFloat(el.style.height) || 0
        const result = options.onAdsorb({ left: newLeft, top: newTop, width: w, height: h })
        newLeft = result.left
        newTop = result.top
      }
    }
    return { left: newLeft, top: newTop }
  }

  function onMouseMove(e: MouseEvent) {
    const pos = computePos(e)
    // 更新预览副本位置(响应式,供渲染层实时跟随)
    if (dragPreview.value) {
      dragPreview.value.left = pos.left
      dragPreview.value.top = pos.top
    }
    options.onDrag(pos)
  }

  function onMouseUp(e: MouseEvent) {
    isDragging.value = false
    const pos = computePos(e)
    // 一次性通知调用方最终坐标与修饰符，写入响应式数据
    options.onDragEnd?.(pos, { altKey: downAltKey })
    options.onStop?.()
    // 清空预览副本
    dragPreview.value = null

    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  function cleanup() {
    const el = target.value
    if (el) {
      el.removeEventListener('mousedown', onMouseDown)
    }
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  function setup() {
    cleanup()
    const el = target.value
    if (el) {
      el.addEventListener('mousedown', onMouseDown)
    }
  }

  return { isDragging, dragPreview, setup, cleanup }
}
