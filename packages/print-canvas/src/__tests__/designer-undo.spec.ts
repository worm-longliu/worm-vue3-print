import { describe, it, expect } from 'vitest'
import { useDesignerState } from '../composables/useDesignerState'

describe('undo/redo 保留元素', () => {
  it('undo 后元素不丢失', () => {
    const { elements, addElement, undo, redo } = useDesignerState()
    addElement('text')
    expect(elements.value.length).toBe(1)
    undo()
    expect(elements.value.length).toBe(0)
    redo()
    expect(elements.value.length).toBe(1)
  })

  it('undo 恢复的是历史快照而非空数组', () => {
    const { elements, addElement, duplicateSelected, undo } = useDesignerState()
    addElement('text')
    duplicateSelected()
    expect(elements.value.length).toBe(2)
    undo()
    expect(elements.value.length).toBe(1)
    expect(elements.value[0]?.id).toBeDefined()
  })
})
