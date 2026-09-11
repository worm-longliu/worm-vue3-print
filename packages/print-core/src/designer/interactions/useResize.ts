// web/src/components/print/composables/useResize.ts
import type { ResizePoint } from '../types.js'

export interface ResizeRect {
  left: number
  top: number
  width: number
  height: number
}

export interface ResizeOptions {
  minWidth?: number
  minHeight?: number
  getScale?: () => number
  /** 缩放起始时读取元素当前矩形（mm） */
  getRect: () => ResizeRect
  onResize: (rect: ResizeRect) => void
  onStart?: () => void
  onStop?: () => void
}

/** 8 方位缩放手柄，供模板 v-for 渲染 */
export const RESIZE_POINTS: ResizePoint[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** 根据方位与位移计算缩放后矩形（纯函数） */
export function calcResizeRect(
  point: ResizePoint,
  startRect: ResizeRect,
  dx: number,
  dy: number,
  minW: number,
  minH: number,
): ResizeRect {
  let { left, top, width, height } = startRect

  switch (point) {
    case 'e':  width = Math.max(minW, startRect.width + dx); break
    case 'w':  width = Math.max(minW, startRect.width - dx); left = startRect.left + startRect.width - width; break
    case 's':  height = Math.max(minH, startRect.height + dy); break
    case 'n':  height = Math.max(minH, startRect.height - dy); top = startRect.top + startRect.height - height; break
    case 'se': width = Math.max(minW, startRect.width + dx); height = Math.max(minH, startRect.height + dy); break
    case 'sw': width = Math.max(minW, startRect.width - dx); left = startRect.left + startRect.width - width; height = Math.max(minH, startRect.height + dy); break
    case 'ne': width = Math.max(minW, startRect.width + dx); height = Math.max(minH, startRect.height - dy); top = startRect.top + startRect.height - height; break
    case 'nw': width = Math.max(minW, startRect.width - dx); left = startRect.left + startRect.width - width; height = Math.max(minH, startRect.height - dy); top = startRect.top + startRect.height - height; break
  }

  return { left, top, width, height }
}

/** 缩放交互逻辑：手柄由组件模板渲染，mousedown 时调用 startResize */
export function useResize(options: ResizeOptions) {
  let startX = 0, startY = 0
  let startRect: ResizeRect = { left: 0, top: 0, width: 0, height: 0 }
  let activePoint: ResizePoint | null = null

  function startResize(point: ResizePoint, e: MouseEvent) {
    activePoint = point
    startX = e.clientX
    startY = e.clientY
    startRect = { ...options.getRect() }
    options.onStart?.()
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', onResizeEnd)
    e.preventDefault()
  }

  function onResizeMove(e: MouseEvent) {
    if (!activePoint) {
      return
    }
    const scale = options.getScale?.() || 1
    const dx = (e.clientX - startX) / scale
    const dy = (e.clientY - startY) / scale
    const minW = options.minWidth || 20
    const minH = options.minHeight || 20
    options.onResize(calcResizeRect(activePoint, startRect, dx, dy, minW, minH))
  }

  function onResizeEnd() {
    activePoint = null
    options.onStop?.()
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  }

  function cleanup() {
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  }

  return { startResize, cleanup }
}
