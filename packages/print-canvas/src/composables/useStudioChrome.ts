import { ref, watch } from 'vue'

const LEFT_KEY = 'print-studio:left'
const RIGHT_KEY = 'print-studio:right'

function readStored(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw === '1'
  } catch {
    return fallback
  }
}

export function useStudioChrome() {
  const leftCollapsed = ref(readStored(LEFT_KEY, false))
  const rightCollapsed = ref(readStored(RIGHT_KEY, false))
  const dirty = ref(false)

  watch(leftCollapsed, v => { try { localStorage.setItem(LEFT_KEY, v ? '1' : '0') } catch { /* ignore */ } }, { flush: 'sync' })
  watch(rightCollapsed, v => { try { localStorage.setItem(RIGHT_KEY, v ? '1' : '0') } catch { /* ignore */ } }, { flush: 'sync' })

  function toggleLeft() { leftCollapsed.value = !leftCollapsed.value }
  function toggleRight() { rightCollapsed.value = !rightCollapsed.value }
  function markSaved() { dirty.value = false }

  return { leftCollapsed, rightCollapsed, toggleLeft, toggleRight, dirty, markSaved }
}
