/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useStudioChrome } from '../composables/useStudioChrome'

// happy-dom 在 vitest v4 下 localStorage 可能为 undefined，手动 mock
const mockStorage = new Map<string, string>()
if (typeof localStorage === 'undefined' || !localStorage) {
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => mockStorage.get(k) ?? null,
    setItem: (k: string, v: string) => { mockStorage.set(k, v) },
    removeItem: (k: string) => { mockStorage.delete(k) },
    clear: () => { mockStorage.clear() },
    length: 0,
    key: () => null,
  }
}

describe('useStudioChrome', () => {
  beforeEach(() => localStorage.clear())

  it('默认不折叠且不 dirty', () => {
    const { leftCollapsed, rightCollapsed, dirty } = useStudioChrome()
    expect(leftCollapsed.value).toBe(false)
    expect(rightCollapsed.value).toBe(false)
    expect(dirty.value).toBe(false)
  })

  it('toggle 翻转折叠态并写入 localStorage', () => {
    const { leftCollapsed, toggleLeft } = useStudioChrome()
    toggleLeft()
    expect(leftCollapsed.value).toBe(true)
    expect(localStorage.getItem('print-studio:left')).toBe('1')
    toggleLeft()
    expect(leftCollapsed.value).toBe(false)
    expect(localStorage.getItem('print-studio:left')).toBe('0')
  })

  it('markSaved 熄灭 dirty', () => {
    const { dirty, markSaved } = useStudioChrome()
    dirty.value = true
    markSaved()
    expect(dirty.value).toBe(false)
  })
})
