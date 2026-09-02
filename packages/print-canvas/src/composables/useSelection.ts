// web/src/components/print/composables/useSelection.ts
import { ref, computed, type InjectionKey, type Ref } from 'vue'
import type { RuntimeElement } from '../types'

/** 通过 provide/inject 共享选中状态，每个 BaseElement 精确追踪自身是否被选中 */
export const SELECTED_IDS_KEY: InjectionKey<Ref<Set<string>>> = Symbol('selected-ids')
/** 框选实时预选状态：拖拽过程中高亮即将选中的元素，提交后转为正式选中 */
export const PREVIEW_IDS_KEY: InjectionKey<Ref<Set<string>>> = Symbol('preview-ids')
export const BUSINESS_TYPE_KEY: InjectionKey<Ref<string>> = Symbol('business-type')

export function useSelection(elements: { value: RuntimeElement[] }) {
  const selectedIds = ref<Set<string>>(new Set())
  // 框选预选：拖拽中实时计算，提交时拷贝进 selectedIds
  const previewIds = ref<Set<string>>(new Set())

  const selectedElements = computed(() =>
    elements.value.filter(e => selectedIds.value.has(e.id))
  )

  const hasSelection = computed(() => selectedIds.value.size > 0)

  function select(id: string, multiple = false) {
    if (multiple) {
      const s = new Set(selectedIds.value)
      if (s.has(id)) { s.delete(id) } else { s.add(id) }
      selectedIds.value = s
    } else {
      selectedIds.value = new Set([id])
    }
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  function selectAll(allIds: string[]) {
    selectedIds.value = new Set(allIds)
  }

  /** 设置框选预选集合（拖拽中实时调用） */
  function setPreview(ids: string[]) {
    previewIds.value = new Set(ids)
  }
  /** 清除预选 */
  function clearPreview() {
    previewIds.value = new Set()
  }
  /** 提交预选：将预选集合转为正式选中，并清空预选 */
  function commitPreview() {
    selectedIds.value = new Set(previewIds.value)
    previewIds.value = new Set()
  }

  function getSelectionBounds(): { left: number; top: number; width: number; height: number } | null {
    const els = selectedElements.value
    if (els.length === 0) return null
    let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity
    els.forEach(e => {
      minL = Math.min(minL, e.options.left)
      minT = Math.min(minT, e.options.top)
      maxR = Math.max(maxR, e.options.left + e.options.width)
      maxB = Math.max(maxB, e.options.top + e.options.height)
    })
    return { left: minL, top: minT, width: maxR - minL, height: maxB - minT }
  }

  return { selectedIds, selectedElements, hasSelection, select, clearSelection, selectAll, getSelectionBounds, previewIds, setPreview, clearPreview, commitPreview }
}
