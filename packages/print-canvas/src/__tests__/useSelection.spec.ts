import { describe, it, expect } from 'vitest'
import { useSelection } from '../composables/useSelection'
import type { RuntimeElement } from '../types'

function makeEl(id: string, left = 0, top = 0, width = 100, height = 50): RuntimeElement {
  return { id, options: { left, top, width, height }, printElementType: { type: 'text', title: '文本' } }
}

describe('useSelection', () => {
  it('初始状态为空', () => {
    const els = { value: [] as RuntimeElement[] }
    const { selectedIds, hasSelection } = useSelection(els)
    expect(selectedIds.value.size).toBe(0)
    expect(hasSelection.value).toBe(false)
  })

  it('select(id) 单选后选中该元素', () => {
    const els = { value: [makeEl('a'), makeEl('b')] }
    const { select, selectedIds, selectedElements } = useSelection(els)
    select('a')
    expect(selectedIds.value.has('a')).toBe(true)
    expect(selectedIds.value.size).toBe(1)
    expect(selectedElements.value).toHaveLength(1)
    expect(selectedElements.value[0]!.id).toBe('a')
  })

  it('select(id, true) 多选 toggle 添加', () => {
    const els = { value: [makeEl('a'), makeEl('b'), makeEl('c')] }
    const { select, selectedIds } = useSelection(els)
    select('a')
    select('b', true)
    expect(selectedIds.value.has('a')).toBe(true)
    expect(selectedIds.value.has('b')).toBe(true)
    expect(selectedIds.value.size).toBe(2)
  })

  it('select(id, true) 多选 toggle 删除', () => {
    const els = { value: [makeEl('a'), makeEl('b')] }
    const { select, selectedIds } = useSelection(els)
    select('a')
    select('b', true)
    select('a', true) // toggle 掉 a
    expect(selectedIds.value.has('a')).toBe(false)
    expect(selectedIds.value.has('b')).toBe(true)
    expect(selectedIds.value.size).toBe(1)
  })

  it('clearSelection 清空', () => {
    const els = { value: [makeEl('a'), makeEl('b')] }
    const { select, clearSelection, selectedIds } = useSelection(els)
    select('a')
    clearSelection()
    expect(selectedIds.value.size).toBe(0)
  })

  it('selectAll 全选', () => {
    const els = { value: [makeEl('a'), makeEl('b'), makeEl('c')] }
    const { selectAll, selectedIds } = useSelection(els)
    selectAll(['a', 'b', 'c'])
    expect(selectedIds.value.size).toBe(3)
    expect(selectedIds.value.has('a')).toBe(true)
    expect(selectedIds.value.has('b')).toBe(true)
    expect(selectedIds.value.has('c')).toBe(true)
  })

  it('selectedElements computed 正确过滤', () => {
    const els = { value: [makeEl('a'), makeEl('b'), makeEl('c')] }
    const { select, selectedElements } = useSelection(els)
    select('b')
    expect(selectedElements.value).toHaveLength(1)
    expect(selectedElements.value[0]!.id).toBe('b')
  })

  it('getSelectionBounds 空时返回 null', () => {
    const els = { value: [] as RuntimeElement[] }
    const { getSelectionBounds } = useSelection(els)
    expect(getSelectionBounds()).toBeNull()
  })

  it('getSelectionBounds 单元素返回自身', () => {
    const els = { value: [makeEl('a', 10, 20, 100, 50)] }
    const { select, getSelectionBounds } = useSelection(els)
    select('a')
    const b = getSelectionBounds()
    expect(b).toEqual({ left: 10, top: 20, width: 100, height: 50 })
  })

  it('getSelectionBounds 多元素计算包围盒', () => {
    const els = { value: [makeEl('a', 0, 0, 50, 50), makeEl('b', 100, 100, 80, 60)] }
    const { select, getSelectionBounds } = useSelection(els)
    select('a')
    select('b', true)
    const b = getSelectionBounds()
    expect(b).toEqual({ left: 0, top: 0, width: 180, height: 160 })
  })

  it('hasSelection 状态正确', () => {
    const els = { value: [makeEl('a')] }
    const { select, clearSelection, hasSelection } = useSelection(els)
    expect(hasSelection.value).toBe(false)
    select('a')
    expect(hasSelection.value).toBe(true)
    clearSelection()
    expect(hasSelection.value).toBe(false)
  })

  it('setPreview/commitPreview 预选转正式', () => {
    const els = { value: [
      { id: 'a', options: { left: 0, top: 0, width: 10, height: 10 }, printElementType: { type: 'text' } },
      { id: 'b', options: { left: 0, top: 0, width: 10, height: 10 }, printElementType: { type: 'text' } },
    ] } as any
    const { previewIds, setPreview, commitPreview, selectedIds } = useSelection(els)
    setPreview(['a', 'b'])
    expect(previewIds.value.has('a')).toBe(true)
    commitPreview()
    expect(selectedIds.value.has('a')).toBe(true)
    expect(selectedIds.value.has('b')).toBe(true)
  })
})
