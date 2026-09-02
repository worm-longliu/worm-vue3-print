// web/src/components/print/composables/useDesignerState.ts
// 设计器核心状态管理：模板数据/选择/历史/剪贴板/编组/键盘/序列化
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type {
  RuntimeElement, ElementType, ElementZone, PrintBusinessField, TemplateData,
  TableSelection, PrintElementData,
} from '../types'
import { createRuntimeElement, generateId } from '../utils/element-factory'
import { createFieldElement } from '../utils/binding'
import { normalizeTemplateUnits } from '../utils/migrate'
import { syncTableElementSize } from '../utils/table-matrix'
import { getPaperDimensions } from '../utils/default-config'
import { computeFitScale } from '../utils/scale'
import {
  getZoneRects, zoneFromPaperPoint, clampToZone, finalizeElementZone, ZONE_ALLOWED_TYPES,
} from '../utils/zone-layout'
import { useSelection } from './useSelection'
import { useClipboard } from './useClipboard'
import { useAlign, type AlignMode } from './useAlign'
import { useGroup } from './useGroup'
import { useHistory, type HistoryState } from './useHistory'
import { useKeyboard } from './useKeyboard'

export interface DesignerStateOptions {
  initialTemplate?: TemplateData
  initialElements?: RuntimeElement[]
  initialFields?: PrintBusinessField[]
}

/** 创建默认模板数据 */
export function createDefaultTemplate(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    unit: 'mm',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    watermark: {},
  }
}

/** 三区元素合并为统一运行时元素池（补建 id、打 zone 标） */
export function toRuntimePool(data: TemplateData): TemplateData {
  const mk = (els: PrintElementData[], zone: ElementZone): RuntimeElement[] =>
    (els ?? []).map(e => {
      const options = { ...e.options }
      // 表格尺寸恒由列宽/行高派生（mm），加载时重算以自愈历史污染数据
      if ((e.printElementType?.type ?? e.type) === 'table') {
        syncTableElementSize(options)
      }
      return {
        id: e.id || generateId(),
        zone,
        options,
        printElementType: { ...e.printElementType },
      }
    })
  return {
    ...data,
    margins: { ...data.margins },
    header: { height: data.header?.height ?? 10, elements: [] },
    footer: { height: data.footer?.height ?? 10, elements: [] },
    firstPageOverlay: {
      height: data.firstPageOverlay?.height ?? 0,
      elements: [...(data.firstPageOverlay?.elements ?? [])],
    },
    guides: [...(data.guides ?? [])],
    elements: [
      ...mk(data.elements ?? [], 'content'),
      ...mk(data.header?.elements ?? [], 'header'),
      ...mk(data.footer?.elements ?? [], 'footer'),
    ],
  }
}

export function useDesignerState(options: DesignerStateOptions = {}) {
  const scale = ref(100)
  const showGrid = ref(true)
  const snapToGrid = ref(false)
  // 设计态下无边框表格单元格的虚拟虚线边框开关（默认开启）
  const showTableGhostBorder = ref(true)

  // 单一模板状态（三区元素归一化进运行时元素池）
  const templateData = ref<TemplateData>(
    toRuntimePool(options.initialTemplate || createDefaultTemplate())
  )

  // 内容区主体元素（快捷访问）
  // 优化：setter 直接修改 elements 属性，避免展开替换整个 templateData 触发全量通知
  const elements = computed({
    get: () => templateData.value.elements as RuntimeElement[],
    set: (els: RuntimeElement[]) => {
      templateData.value.elements = els
    },
  })

  const fields = ref<PrintBusinessField[]>(options.initialFields || [])

  const { selectedIds, selectedElements, select, clearSelection, selectAll: selectAllIds, previewIds, setPreview, clearPreview, commitPreview } = useSelection(elements)

  // 编组
  const { group: groupElements, ungroup: ungroupElements } = useGroup()

  // 复制粘贴 / 对齐 / 撤销重做
  const { copy: copyElements, paste: pasteElements, hasData: hasClipboardData } = useClipboard()
  const { align } = useAlign()
  const { push: pushHistory, undo: undoHistory, redo: redoHistory, canUndo, canRedo } = useHistory()

  const selectedElement = computed(() => {
    if (selectedIds.value.size === 0) return null
    const id = selectedIds.value.values().next().value
    return elements.value.find(e => e.id === id) || null
  })

  // 表格单元格选区（Excel 风格表格编辑）
  const tableSelection = ref<TableSelection | null>(null)
  function setTableSelection(s: TableSelection | null) {
    tableSelection.value = s
  }

  /** 当前设计器状态的深拷贝快照（用于历史记录） */
  function getHistoryState(): HistoryState {
    return {
      elements: elements.value.map(e => ({
        id: e.id,
        zone: e.zone,
        // JSON 深拷贝：tableRows 等嵌套结构若浅拷会在撤销时共享引用
        options: JSON.parse(JSON.stringify(e.options)),
        printElementType: { ...e.printElementType },
      })),
      templateData: {
        paperSize: templateData.value.paperSize,
        orientation: templateData.value.orientation,
        margins: { ...templateData.value.margins },
        header: { height: templateData.value.header.height, elements: [] },
        footer: { height: templateData.value.footer.height, elements: [] },
        firstPageOverlay: { height: templateData.value.firstPageOverlay.height, elements: [] },
        elements: [], // 元素已在顶层存储，避免重复
        customWidth: templateData.value.customWidth,
        customHeight: templateData.value.customHeight,
        watermark: templateData.value.watermark ? { ...templateData.value.watermark } : undefined,
        guides: [...(templateData.value.guides ?? [])],
      },
    }
  }

  function recordHistory() {
    pushHistory(getHistoryState())
  }

  function undo() {
    const state = undoHistory(getHistoryState())
    if (state?.templateData) {
      templateData.value = { ...state.templateData, elements: state.elements }
    }
  }

  function redo() {
    const state = redoHistory(getHistoryState())
    if (state?.templateData) {
      templateData.value = { ...state.templateData, elements: state.elements }
    }
  }

  function copy() {
    copyElements(selectedElements.value)
  }

  /** 剪切:复制到剪贴板后删除选中元素 */
  function cutSelected() {
    copyElements(selectedElements.value)
    deleteSelected()
  }

  function paste() {
    const pasted = pasteElements()
    if (pasted && pasted.length > 0) {
      elements.value.push(...pasted)
      recordHistory()
    }
  }

  /** Ctrl+D 原地复制:复用剪贴板克隆选中元素,叠加小幅偏移 */
  function duplicateSelected() {
    copyElements(selectedElements.value)
    const pasted = pasteElements()
    if (pasted && pasted.length > 0) {
      pasted.forEach(e => { e.options.left += 5; e.options.top += 5 })
      elements.value.push(...pasted)
      select(pasted[0]!.id, false)
      recordHistory()
    }
  }

  /** Ctrl+1 重置缩放至 100% */
  function resetZoom() {
    scale.value = 100
  }

  const hasClipboard = computed(() => hasClipboardData())

  let moveSessionActive = false
  let moveDebounceTimer: ReturnType<typeof setTimeout> | null = null
  const MOVE_SESSION_GAP_MS = 300

  function moveSelected(dx: number, dy: number) {
    const movable = selectedElements.value.filter(e => !e.options.locked)
    if (movable.length === 0) return
    movable.forEach(e => {
      e.options.left += dx
      e.options.top += dy
    })
    if (!moveSessionActive) {
      moveSessionActive = true
      recordHistory()
    }
    if (moveDebounceTimer) clearTimeout(moveDebounceTimer)
    moveDebounceTimer = setTimeout(() => {
      moveSessionActive = false
      moveDebounceTimer = null
    }, MOVE_SESSION_GAP_MS)
  }

  function selectAll() {
    selectAllIds(elements.value.map(e => e.id))
  }

  function alignSelected(mode: AlignMode) {
    align(selectedElements.value, mode)
    recordHistory()
  }

  function groupSelected() {
    elements.value = groupElements(elements.value, selectedIds.value)
    recordHistory()
  }

  function ungroupSelected() {
    elements.value = ungroupElements(elements.value, selectedIds.value)
    recordHistory()
  }

  function deleteSelected() {
    if (selectedIds.value.size === 0) return
    elements.value = elements.value.filter(e => !selectedIds.value.has(e.id))
    clearSelection()
    recordHistory()
  }

  // 键盘快捷键
  const { setup: setupKeyboard, cleanup: cleanupKeyboard } = useKeyboard({
    onMove: moveSelected,
    onDelete: deleteSelected,
    onCopy: copy,
    onPaste: paste,
    onSelectAll: selectAll,
    onUndo: undo,
    onRedo: redo,
    onDuplicate: duplicateSelected,
    onResetZoom: resetZoom,
    // 多选对齐快捷键:Ctrl+L 左对齐 / Ctrl+R 右对齐 / Ctrl+E 水平居中 / Ctrl+T 顶对齐 / Ctrl+B 底对齐
    onAlignLeft: () => alignSelected('left'),
    onAlignRight: () => alignSelected('right'),
    onAlignCenterH: () => alignSelected('vertical'),
    onAlignTop: () => alignSelected('top'),
    onAlignBottom: () => alignSelected('bottom'),
    // 编组快捷键:Ctrl+G 组合 / Ctrl+Shift+G 取消组合
    onGroup: groupSelected,
    onUngroup: ungroupSelected,
  })

  let draggingBeforeState: HistoryState | null = null

  function dragStart() {
    draggingBeforeState = getHistoryState()
  }

  function dragStop() {
    if (!draggingBeforeState) return
    // 拖拽/缩放结束：对位置或尺寸变化的元素做归区收尾（跨区换算 + 区域 clamp）
    const before = new Map(draggingBeforeState.elements.map(e => [e.id, e]))
    let rejected = false
    for (const el of elements.value) {
      const prev = before.get(el.id)
      if (!prev) continue
      const moved = prev.options.left !== el.options.left
        || prev.options.top !== el.options.top
        || prev.options.width !== el.options.width
        || prev.options.height !== el.options.height
      if (moved && finalizeElementZone(el, templateData.value).rejected) {
        rejected = true
      }
    }
    if (rejected) {
      alert('该元素类型不能放入页眉/页脚')
    }
    const sig = (e: RuntimeElement) =>
      `${e.id}:${e.zone || 'content'}:${e.options.left},${e.options.top},${e.options.width},${e.options.height}`
    const beforeIds = draggingBeforeState.elements.map(sig).join('|')
    const afterIds = getHistoryState().elements.map(sig).join('|')
    draggingBeforeState = null
    if (beforeIds !== afterIds) {
      recordHistory()
    }
  }

  /** 按落点将新元素放入对应区域；页眉/页脚不允许的类型拒绝并提示 */
  function placeAtDropPoint(el: RuntimeElement, dropPoint: { x: number; y: number }): boolean {
    // dropPoint 为 mm（由 CanvasArea.toPaperPoint 返回）
    const zone = zoneFromPaperPoint(templateData.value, dropPoint.x, dropPoint.y)
    if (zone !== 'content' && !ZONE_ALLOWED_TYPES.includes(el.printElementType.type)) {
      alert('该元素类型不能放入页眉/页脚')
      return false
    }
    const rect = getZoneRects(templateData.value)[zone] // mm
    el.zone = zone
    // 元素 options 以 mm 存储：落点相对区域左上角的偏移即 mm 坐标
    el.options.left = dropPoint.x - rect.left
    el.options.top = dropPoint.y - rect.top
    if (zone !== 'content') {
      clampToZone(el, rect)
    }
    return true
  }

  function addElement(type: string, dropPoint?: { x: number; y: number }) {
    const el = createRuntimeElement(type as ElementType)
    if (dropPoint && !placeAtDropPoint(el, dropPoint)) return
    elements.value.push(el)
    select(el.id, false)
    recordHistory()
  }

  function addFieldElement(field: { fieldKey: string; fieldLabel: string }, dropPoint?: { x: number; y: number }) {
    const el = createFieldElement(field)
    if (dropPoint && !placeAtDropPoint(el, dropPoint)) return
    elements.value.push(el)
    select(el.id, false)
    recordHistory()
  }

  function moveLayer(direction: string) {
    if (selectedIds.value.size === 0) return
    const id = selectedIds.value.values().next().value
    const el = elements.value.find(e => e.id === id)
    if (!el) return
    const currentZ = el.options.zIndex ?? 0
    const allZ = elements.value.map(e => e.options.zIndex ?? 0)
    const maxZ = Math.max(...allZ, 0)
    const minZ = Math.min(...allZ, 0)
    switch (direction) {
      case 'top': el.options.zIndex = maxZ + 1; break
      case 'bottom': el.options.zIndex = minZ - 1; break
      case 'up': el.options.zIndex = currentZ + 1; break
      case 'down': el.options.zIndex = currentZ - 1; break
    }
    recordHistory()
  }

  /** 适应窗口:根据容器尺寸(px)与纸张尺寸(mm->px)计算缩放 */
  function fitToWindow(containerW: number, containerH: number) {
    const { width, height } = getPaperDimensions(templateData.value)
    const MM_TO_PX = 96 / 25.4
    scale.value = computeFitScale(containerW, containerH, width * MM_TO_PX, height * MM_TO_PX)
  }

  function updateTemplateData(data: TemplateData) {
    templateData.value = { ...data }
    recordHistory()
  }

  /** 当前设计器状态序列化为模板 JSON（单一出口，按 zone 拆回三区，保留 id/type 供渲染服务使用） */
  function getTemplateJson(): TemplateData {
    const all = elements.value
    const ser = (zone: ElementZone) => all
      .filter(e => (e.zone || 'content') === zone)
      .map(e => ({
        id: e.id,
        type: e.printElementType.type,
        options: { ...e.options },
        printElementType: { ...e.printElementType },
      }))
    return {
      unit: 'mm' as const,
      ...templateData.value,
      header: { ...templateData.value.header, elements: ser('header') },
      footer: { ...templateData.value.footer, elements: ser('footer') },
      // 首页叠加层也需补 id/type
      firstPageOverlay: {
        ...templateData.value.firstPageOverlay,
        elements: templateData.value.firstPageOverlay.elements.map(e => ({
          id: e.id || generateId(),
          type: e.printElementType?.type || 'text',
          options: { ...e.options },
          printElementType: { ...e.printElementType },
        })),
      },
      elements: ser('content'),
      guides: [...(templateData.value.guides ?? [])],
    }
  }

  /** 加载模板数据（三区合并进运行时元素池；旧数据按 pt 迁移为 mm） */
  function loadTemplate(data: TemplateData, els?: RuntimeElement[]) {
    const migrated = normalizeTemplateUnits(data)
    templateData.value = toRuntimePool(migrated)
    if (els) {
      templateData.value = {
        ...templateData.value,
        elements: els.map(e => ({
          ...e,
          id: e.id || generateId(),
          zone: e.zone || 'content',
          options: { ...e.options },
          printElementType: { ...e.printElementType },
        })),
      }
    }
    pushHistory(getHistoryState())
  }

  // 记录设计器初始状态快照
  pushHistory(getHistoryState())

  onMounted(() => setupKeyboard())
  onUnmounted(() => {
    cleanupKeyboard()
    if (moveDebounceTimer) {
      clearTimeout(moveDebounceTimer)
      moveDebounceTimer = null
    }
  })

  return {
    scale, showGrid, snapToGrid, showTableGhostBorder,
    templateData, elements, fields,
    selectedIds, selectedElements, selectedElement, select, clearSelection, selectAll,
    previewIds, setPreview, clearPreview, commitPreview,
    hasClipboard, copy, paste, cutSelected,
    tableSelection, setTableSelection,
    canUndo, canRedo, undo, redo,
    recordHistory,
    alignSelected, groupSelected, ungroupSelected, deleteSelected,
    duplicateSelected, resetZoom,
    dragStart, dragStop,
    addElement, addFieldElement, moveLayer, fitToWindow, updateTemplateData,
    getTemplateJson, loadTemplate,
  }
}
