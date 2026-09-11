// web/src/components/print/composables/useAlign.ts
import type { RuntimeElement } from '../types.js'

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'vertical' | 'horizontal' | 'distributeHor' | 'distributeVer'

export function useAlign() {
  function align(elements: RuntimeElement[], mode: AlignMode) {
    if (elements.length < 2) return

    const bounds = {
      minLeft: Math.min(...elements.map(e => e.options.left)),
      maxRight: Math.max(...elements.map(e => e.options.left + e.options.width)),
      minTop: Math.min(...elements.map(e => e.options.top)),
      maxBottom: Math.max(...elements.map(e => e.options.top + e.options.height)),
    }

    switch (mode) {
      case 'left':
        elements.forEach(e => { e.options.left = bounds.minLeft })
        break
      case 'right':
        elements.forEach(e => { e.options.left = bounds.maxRight - e.options.width })
        break
      case 'top':
        elements.forEach(e => { e.options.top = bounds.minTop })
        break
      case 'bottom':
        elements.forEach(e => { e.options.top = bounds.maxBottom - e.options.height })
        break
      case 'vertical': {
        const centerX = bounds.minLeft + (bounds.maxRight - bounds.minLeft) / 2
        elements.forEach(e => { e.options.left = centerX - e.options.width / 2 })
        break
      }
      case 'horizontal': {
        const centerY = bounds.minTop + (bounds.maxBottom - bounds.minTop) / 2
        elements.forEach(e => { e.options.top = centerY - e.options.height / 2 })
        break
      }
      case 'distributeHor': {
        const sorted = [...elements].sort((a, b) => a.options.left - b.options.left)
        const totalW = sorted.reduce((s, e) => s + e.options.width, 0)
        const gap = (bounds.maxRight - bounds.minLeft - totalW) / (sorted.length - 1)
        let x = bounds.minLeft
        sorted.forEach(e => { e.options.left = x; x += e.options.width + gap })
        break
      }
      case 'distributeVer': {
        const sorted = [...elements].sort((a, b) => a.options.top - b.options.top)
        const totalH = sorted.reduce((s, e) => s + e.options.height, 0)
        const gap = (bounds.maxBottom - bounds.minTop - totalH) / (sorted.length - 1)
        let y = bounds.minTop
        sorted.forEach(e => { e.options.top = y; y += e.options.height + gap })
        break
      }
    }
  }

  return { align }
}
