// web/src/components/print/composables/useAlign.ts
import type { RuntimeElement } from '../types.js'
import { resolveElementBoxes } from '../../render/element-margin.js'

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'vertical' | 'horizontal' | 'distributeHor' | 'distributeVer'

export function useAlign() {
  function align(elements: RuntimeElement[], mode: AlignMode) {
    if (elements.length < 2) return

    const boxes = elements.map(element => resolveElementBoxes(element.options).margin)
    const bounds = {
      minLeft: Math.min(...boxes.map(box => box.left)),
      maxRight: Math.max(...boxes.map(box => box.right)),
      minTop: Math.min(...boxes.map(box => box.top)),
      maxBottom: Math.max(...boxes.map(box => box.bottom)),
    }

    switch (mode) {
      case 'left':
        elements.forEach(e => { e.options.left = bounds.minLeft })
        break
      case 'right':
        elements.forEach((e, i) => { e.options.left = bounds.maxRight - boxes[i]!.width })
        break
      case 'top':
        elements.forEach(e => { e.options.top = bounds.minTop })
        break
      case 'bottom':
        elements.forEach((e, i) => { e.options.top = bounds.maxBottom - boxes[i]!.height })
        break
      case 'vertical': {
        const centerX = bounds.minLeft + (bounds.maxRight - bounds.minLeft) / 2
        elements.forEach((e, i) => { e.options.left = centerX - boxes[i]!.width / 2 })
        break
      }
      case 'horizontal': {
        const centerY = bounds.minTop + (bounds.maxBottom - bounds.minTop) / 2
        elements.forEach((e, i) => { e.options.top = centerY - boxes[i]!.height / 2 })
        break
      }
      case 'distributeHor': {
        const sorted = elements.map((element, index) => ({ element, box: boxes[index]! }))
          .sort((a, b) => a.box.left - b.box.left)
        const totalW = sorted.reduce((sum, item) => sum + item.box.width, 0)
        const gap = (bounds.maxRight - bounds.minLeft - totalW) / (sorted.length - 1)
        let x = bounds.minLeft
        sorted.forEach(item => { item.element.options.left = x; x += item.box.width + gap })
        break
      }
      case 'distributeVer': {
        const sorted = elements.map((element, index) => ({ element, box: boxes[index]! }))
          .sort((a, b) => a.box.top - b.box.top)
        const totalH = sorted.reduce((sum, item) => sum + item.box.height, 0)
        const gap = (bounds.maxBottom - bounds.minTop - totalH) / (sorted.length - 1)
        let y = bounds.minTop
        sorted.forEach(item => { item.element.options.top = y; y += item.box.height + gap })
        break
      }
    }
  }

  return { align }
}
