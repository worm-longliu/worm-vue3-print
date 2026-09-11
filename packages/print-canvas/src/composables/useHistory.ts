// web/src/components/print/composables/useHistory.ts
import { ref } from 'vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

export interface HistoryState {
  elements: any[]
  templateData?: TemplateData
}

export interface UseHistoryOptions {
  /** 历史记录上限，默认 50 步 */
  maxSteps?: number
  /** 是否启用增量快照（减少内存占用），默认 false */
  useIncremental?: boolean
}

/**
 * 撤销/重做历史管理（操作级快照粒度）。
 *
 * 语义说明：
 * - `push(state)` 记录一次操作后的快照（检查点），并清空 redo 栈。
 * - `undo(currentState?)` 弹出栈顶检查点（当前状态）压入 redo 栈，
 *   返回新的栈顶（即上一个待恢复状态）；栈空时返回 null。
 * - `redo(currentState?)` 弹出 redo 栈顶（待重做状态）压回 undo 栈并返回。
 * - 所有快照均做 JSON 深拷贝，避免外部对象突变污染历史。
 *
 * 调用约定：若希望"撤销到初始状态"，应在首次操作前先 `push(initialState)`。
 */
export function useHistory(options?: UseHistoryOptions) {
  const maxSteps = options?.maxSteps ?? 50
  const useIncremental = options?.useIncremental ?? false
  const undoStack = ref<HistoryState[]>([])
  const redoStack = ref<HistoryState[]>([])

  const canUndo = ref(false)
  const canRedo = ref(false)

  function updateFlags() {
    canUndo.value = undoStack.value.length > 0
    canRedo.value = redoStack.value.length > 0
  }

  /** 深拷贝快照，避免外部对象突变污染历史 */
  function clone(state: HistoryState | undefined): HistoryState {
    return {
      elements: JSON.parse(JSON.stringify(state?.elements ?? [])),
      templateData: JSON.parse(JSON.stringify(state?.templateData ?? {})),
    }
  }

  /** 增量快照：只记录元素变更，templateData 只记录非 elements 部分 */
  function cloneIncremental(state: HistoryState): HistoryState {
    const clonedElements = JSON.parse(JSON.stringify(state.elements))
    const td = state.templateData
    if (!td) return { elements: clonedElements }
    return {
      elements: clonedElements,
      templateData: {
        paperSize: td.paperSize,
        orientation: td.orientation,
        margins: { ...td.margins },
        header: { height: td.header.height, elements: [] },
        footer: { height: td.footer.height, elements: [] },
        firstPageOverlay: { height: td.firstPageOverlay.height, elements: [] },
        elements: [], // 元素已在顶层存储
        customWidth: td.customWidth,
        customHeight: td.customHeight,
        watermark: td.watermark ? { ...td.watermark } : undefined,
        guides: td.guides ? [...td.guides] : undefined,
      },
    }
  }

  function cloneState(state: HistoryState): HistoryState {
    return useIncremental ? cloneIncremental(state) : clone(state)
  }

  /** 记录操作后快照（深拷贝），并清空 redo 栈 */
  function push(state: HistoryState) {
    undoStack.value.push(cloneState(state))
    // 新操作清空 redo 栈
    redoStack.value = []
    // 超出上限丢弃最早
    if (undoStack.value.length > maxSteps) {
      undoStack.value.shift()
    }
    updateFlags()
  }

  /**
   * 撤销：弹出当前栈顶检查点（压入 redo 栈），返回上一个待恢复状态。
   * @param currentState 可选，若提供则用其替代弹出的检查点压入 redo 栈
   *                     （显式传入当前实时状态时使用）
   */
  function undo(currentState?: HistoryState): HistoryState | null {
    if (undoStack.value.length === 0) return null
    const popped = undoStack.value.pop()!
    redoStack.value.push(currentState ? cloneState(currentState) : clone(popped))
    updateFlags()
    // 返回新的栈顶（上一个待恢复状态）；栈空表示无更早历史
    return undoStack.value.length > 0
      ? clone(undoStack.value[undoStack.value.length - 1])
      : null
  }

  /**
   * 重做：弹出 redo 栈顶（待重做状态）压回 undo 栈并返回。
   * @param currentState 可选，若提供则用其替代弹出的状态压回 undo 栈
   */
  function redo(currentState?: HistoryState): HistoryState | null {
    if (redoStack.value.length === 0) return null
    const popped = redoStack.value.pop()!
    undoStack.value.push(currentState ? cloneState(currentState) : clone(popped))
    updateFlags()
    return clone(popped)
  }

  /** 清空全部历史 */
  function clear() {
    undoStack.value = []
    redoStack.value = []
    updateFlags()
  }

  return { push, undo, redo, canUndo, canRedo, clear }
}
