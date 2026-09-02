// web/src/components/print/composables/useClipboard.ts
import { ref } from 'vue'
import type { RuntimeElement, PrintElementData } from '../types'
import { generateId } from '../utils/element-factory'

export function useClipboard() {
  const clipboard = ref<PrintElementData[] | null>(null)

  function copy(elements: RuntimeElement[]) {
    clipboard.value = elements.map(e => ({
      options: { ...e.options },
      printElementType: { ...e.printElementType },
    }))
  }

  function paste(offset = 10): RuntimeElement[] | null {
    if (!clipboard.value) return null
    return clipboard.value.map(item => ({
      id: generateId(),
      options: {
        ...item.options,
        left: item.options.left + offset,
        top: item.options.top + offset,
      },
      printElementType: { ...item.printElementType },
    }))
  }

  function hasData() { return clipboard.value !== null && clipboard.value.length > 0 }

  return { clipboard, copy, paste, hasData }
}
