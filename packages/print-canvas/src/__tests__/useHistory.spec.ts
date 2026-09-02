import { describe, it, expect } from 'vitest'
import { useHistory } from '../composables/useHistory'

describe('useHistory', () => {
  it('push 后可 undo', () => {
    const { push, undo, canUndo } = useHistory()
    push({ elements: [{ id: '1' }] })
    push({ elements: [{ id: '1' }, { id: '2' }] })
    expect(canUndo.value).toBe(true)
    const state = undo()
    expect(state).not.toBeNull()
    expect(state?.elements).toHaveLength(1)
  })

  it('undo 后可 redo', () => {
    const { push, undo, redo, canRedo } = useHistory()
    push({ elements: [{ id: '1' }] })
    push({ elements: [{ id: '1' }, { id: '2' }] })
    undo()
    expect(canRedo.value).toBe(true)
    const state = redo()
    expect(state).not.toBeNull()
    expect(state?.elements).toHaveLength(2)
  })

  it('超过50步丢弃最早记录', () => {
    const { push, undo } = useHistory({ maxSteps: 3 })
    push({ elements: [{ id: '1' }] })
    push({ elements: [{ id: '2' }] })
    push({ elements: [{ id: '3' }] })
    push({ elements: [{ id: '4' }] })
    // undo 最多回到第2步（第1步被丢弃）
    undo()
    const state = undo()
    expect(state?.elements[0].id).toBe('2')
  })

  it('无历史时 undo 返回 null', () => {
    const { undo, canUndo } = useHistory()
    expect(canUndo.value).toBe(false)
    expect(undo()).toBeNull()
  })
})