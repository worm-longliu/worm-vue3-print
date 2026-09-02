// web/src/components/print/composables/useKeyboard.ts

export interface KeyboardHandlers {
  onMove?: (dx: number, dy: number) => void
  onDelete?: () => void
  onCopy?: () => void
  onPaste?: () => void
  onSelectAll?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onDuplicate?: () => void
  onResetZoom?: () => void
  onAlignLeft?: () => void
  onAlignRight?: () => void
  onAlignCenterH?: () => void
  onAlignTop?: () => void
  onAlignBottom?: () => void
  onGroup?: () => void
  onUngroup?: () => void
}

const STEP = 1 // mm
const STEP_LARGE = 10
const STEP_SMALL = 0.5

export function useKeyboard(handlers: KeyboardHandlers) {
  function onKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const ctrl = e.ctrlKey || e.metaKey

    // 方向键:Shift=大步,Ctrl=微步,默认标准步
    if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      const step = e.shiftKey ? STEP_LARGE : e.ctrlKey ? STEP_SMALL : STEP
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      handlers.onMove?.(dx, dy)
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      handlers.onDelete?.()
      return
    }

    // Ctrl+0 适应窗口需容器尺寸,由 PrintDesigner 单独监听,此处不处理
    if (ctrl) {
      const k = e.key.toLowerCase()
      if (k === 'c') { e.preventDefault(); handlers.onCopy?.() }
      else if (k === 'v') { e.preventDefault(); handlers.onPaste?.() }
      else if (k === 'a') { e.preventDefault(); handlers.onSelectAll?.() }
      else if (k === 'd') { e.preventDefault(); handlers.onDuplicate?.() }
      else if (k === 'z') { e.preventDefault(); e.shiftKey ? handlers.onRedo?.() : handlers.onUndo?.() }
      else if (k === 'y') { e.preventDefault(); handlers.onRedo?.() }
      else if (k === '1') { e.preventDefault(); handlers.onResetZoom?.() }
      else if (k === 'l') { e.preventDefault(); handlers.onAlignLeft?.() }
      else if (k === 'r') { e.preventDefault(); handlers.onAlignRight?.() }
      else if (k === 'e') { e.preventDefault(); handlers.onAlignCenterH?.() }
      else if (k === 't') { e.preventDefault(); handlers.onAlignTop?.() }
      else if (k === 'b') { e.preventDefault(); handlers.onAlignBottom?.() }
      else if (k === 'g') { e.preventDefault(); e.shiftKey ? handlers.onUngroup?.() : handlers.onGroup?.() }
    }
  }

  function setup() { document.addEventListener('keydown', onKeyDown) }
  function cleanup() { document.removeEventListener('keydown', onKeyDown) }

  return { setup, cleanup }
}
