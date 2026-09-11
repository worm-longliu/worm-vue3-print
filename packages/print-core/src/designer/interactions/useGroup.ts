// web/src/components/print/composables/useGroup.ts
// 元素编组/组合逻辑
import type { RuntimeElement } from '../types.js'

export function generateGroupId(): string {
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function useGroup() {
  function group(elements: RuntimeElement[], selectedIds: Set<string>): RuntimeElement[] {
    const selected = elements.filter(e => selectedIds.has(e.id))
    if (selected.length < 2) return elements

    const groupId = generateGroupId()
    return elements.map(e =>
      selectedIds.has(e.id) ? { ...e, options: { ...e.options, groupId } } : e
    )
  }

  function ungroup(elements: RuntimeElement[], selectedIds: Set<string>): RuntimeElement[] {
    const selected = elements.filter(e => selectedIds.has(e.id))
    // 收集选中元素中涉及的 groupId
    const groupIds = new Set(selected.map(e => e.options.groupId).filter(Boolean))

    return elements.map(e =>
      e.options.groupId && groupIds.has(e.options.groupId)
        ? { ...e, options: { ...e.options, groupId: undefined } }
        : e
    )
  }

  /** 获取与选中元素同组的所有元素 ID */
  function getGroupedIds(elements: RuntimeElement[], selectedId: string): Set<string> {
    const el = elements.find(e => e.id === selectedId)
    if (!el?.options.groupId) return new Set([selectedId])

    const ids = new Set<string>()
    for (const e of elements) {
      if (e.options.groupId === el.options.groupId) {
        ids.add(e.id)
      }
    }
    return ids
  }

  return { group, ungroup, getGroupedIds }
}
