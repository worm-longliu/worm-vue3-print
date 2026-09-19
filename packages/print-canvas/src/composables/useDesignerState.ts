// web/src/components/print/composables/useDesignerState.ts
// 设计器核心状态管理：模板数据/选择/历史/剪贴板/编组/键盘/序列化
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { MultiPageTemplateData } from '@worm-vue3-print/core'
import type {
  RuntimeElement, ElementType, ElementZone, PrintBusinessField, TemplateData,
  TableSelection, PrintElementData,
} from '@worm-vue3-print/core/designer'
import { createRuntimeElement, generateId } from '@worm-vue3-print/core/designer'
import { createFieldElement } from '@worm-vue3-print/core/designer'
import { normalizeTemplateUnits } from '@worm-vue3-print/core/designer'
import { syncTableElementSize } from '@worm-vue3-print/core/designer'
import { getPaperDimensions } from '@worm-vue3-print/core/designer'
import { computeFitScale } from '@worm-vue3-print/core/designer'
import {
  getZoneRects, zoneFromPaperPoint, clampToZone, finalizeElementZone, ZONE_ALLOWED_TYPES,
} from '@worm-vue3-print/core/designer'
import { useSelection } from './useSelection'
import { useClipboard } from './useClipboard'
import { useAlign, type AlignMode } from '@worm-vue3-print/core/designer'
import { useGroup } from '@worm-vue3-print/core/designer'
import { useHistory, type HistoryState } from './useHistory'
import { useKeyboard } from '@worm-vue3-print/core/designer'

export interface DesignerStateOptions {
  initialTemplate?: TemplateData | MultiPageTemplateData
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

/** 解析初始模板为运行时页面池：多页 wrapper 展开，单页归一为单元素数组 */
function resolveInitialPages(initial?: TemplateData | MultiPageTemplateData): TemplateData[] {
  if (!initial) return [toRuntimePool(createDefaultTemplate())]
  const list = Array.isArray((initial as MultiPageTemplateData).pages)
    ? (initial as MultiPageTemplateData).pages
    : [initial as TemplateData]
  return list.length ? list.map(p => toRuntimePool(normalizeTemplateUnits(p))) : [toRuntimePool(createDefaultTemplate())]
}

/** 单页运行时池序列化回三区模板 JSON（按 zone 拆回，补 id/type） */
function serializePage(page: TemplateData): TemplateData {
  const all = page.elements as RuntimeElement[]
  const ser = (zone: ElementZone) => all
    .filter(e => (e.zone || 'content') === zone)
    .map(e => ({ id: e.id, type: e.printElementType.type, options: { ...e.options }, printElementType: { ...e.printElementType } }))
  return {
    unit: 'mm' as const, ...page,
    header: { ...page.header, elements: ser('header') },
    footer: { ...page.footer, elements: ser('footer') },
    firstPageOverlay: {
      ...page.firstPageOverlay,
      elements: (page.firstPageOverlay?.elements ?? []).map(e => ({
        id: e.id || generateId(), type: e.printElementType?.type || 'text',
        options: { ...e.options }, printElementType: { ...e.printElementType },
      })),
    },
    elements: ser('content'),
    guides: [...(page.guides ?? [])],
  }
}

export function useDesignerState(options: DesignerStateOptions = {}) {
  const scale = ref(100)
  const showRuler = ref(true)
  const showGrid = ref(true)
  const snapToGrid = ref(false)
  // 设计态下无边框表格单元格的虚拟虚线边框开关（默认开启）
  const showTableGhostBorder = ref(true)

  // 多页面模板：pages 列表 + 当前激活页
  const pages = ref<TemplateData[]>(resolveInitialPages(options.initialTemplate))
  const activePageIndex = ref(0)
  const templateData = ref<TemplateData>(pages.value[0] ?? toRuntimePool(createDefaultTemplate()))

  function flushActivePage() {
    pages.value[activePageIndex.value] = templateData.value
  }

  function switchPage(i: number) {
    if (i < 0 || i >= pages.value.length) return
    flushActivePage()
    activePageIndex.value = i
    templateData.value = pages.value[i]!
    resetPageSelection()
  }

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
  const { group: groupElements, ungroup: ungroupElements, getGroupedIds } = useGroup()

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

  /** 页操作收尾：清空元素选中与表格单元格选区 */
  function resetPageSelection() {
    clearSelection()
    setTableSelection(null)
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
      pages: JSON.parse(JSON.stringify(pages.value)),
      activePageIndex: activePageIndex.value,
    }
  }

  function recordHistory() {
    pushHistory(getHistoryState())
  }

  /** 从历史快照取「激活页」元素（多页读 pages[activePageIndex]，单页回退 elements） */
  function historyActiveElements(state: HistoryState): any[] {
    return state.pages?.[state.activePageIndex ?? 0]?.elements ?? state.elements
  }

  function undo() {
    const state = undoHistory(getHistoryState())
    if (state?.pages) {
      pages.value = state.pages
      activePageIndex.value = state.activePageIndex ?? 0
      templateData.value = pages.value[activePageIndex.value] ?? pages.value[0]!
      resetPageSelection()
    } else if (state?.templateData) {
      templateData.value = { ...state.templateData, elements: state.elements }
    }
  }

  function redo() {
    const state = redoHistory(getHistoryState())
    if (state?.pages) {
      pages.value = state.pages
      activePageIndex.value = state.activePageIndex ?? 0
      templateData.value = pages.value[activePageIndex.value] ?? pages.value[0]!
      resetPageSelection()
    } else if (state?.templateData) {
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

  /**
   * 画布/图层面板点击选择：普通点击组内任一成员 → 选中整组；
   * Ctrl/⌘ 多选仍按单元素切换，不做整组扩展。
   */
  function selectElement(id: string, multiple = false) {
    if (multiple) {
      select(id, true)
      return
    }
    selectedIds.value = new Set(getGroupedIds(elements.value, id))
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
    const beforeIds = historyActiveElements(draggingBeforeState).map(sig).join('|')
    const afterIds = historyActiveElements(getHistoryState()).map(sig).join('|')
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
    // 收敛引用：templateData 被重新赋值后同步回 pages，避免 renamePage 等原地改丢失
    pages.value[activePageIndex.value] = templateData.value
    if (pages.value.length > 1) {
      const paper = {
        paperSize: data.paperSize, orientation: data.orientation,
        customWidth: data.customWidth, customHeight: data.customHeight,
      }
      for (const p of pages.value) Object.assign(p, paper)
    }
    recordHistory()
  }

  /** 当前设计器状态序列化为模板 JSON（单一出口：多页出 wrapper，单页出裸值） */
  function getTemplateJson(): TemplateData | MultiPageTemplateData {
    flushActivePage()
    if (pages.value.length <= 1) return serializePage(pages.value[0]!)
    return { version: 1, pages: pages.value.map(serializePage) }
  }

  /** 加载模板数据（多页 wrapper 展开；三区合并进运行时元素池；旧数据按 pt 迁移为 mm） */
  function loadTemplate(data: TemplateData | MultiPageTemplateData, els?: RuntimeElement[]) {
    pages.value = resolveInitialPages(data)
    activePageIndex.value = 0
    templateData.value = pages.value[0]!
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
      // 收敛引用：templateData 被重新赋值后同步回 pages[0]
      pages.value[activePageIndex.value] = templateData.value
    }
    pushHistory(getHistoryState())
  }

  /** 新增页面：继承当前页纸张，激活并定位到新页 */
  function addPage() {
    flushActivePage()
    const base = pages.value[activePageIndex.value] ?? createDefaultTemplate()
    const np = toRuntimePool({
      ...createDefaultTemplate(),
      paperSize: base.paperSize, orientation: base.orientation,
      customWidth: base.customWidth, customHeight: base.customHeight,
      name: `页面 ${pages.value.length + 1}`,
    })
    pages.value.push(np)
    activePageIndex.value = pages.value.length - 1
    templateData.value = np
    resetPageSelection()
    recordHistory()
  }

  /** 复制当前页：重建元素 id 避免同文档冲突，插入当前页之后并激活 */
  function duplicatePage() {
    flushActivePage()
    const src = pages.value[activePageIndex.value]!
    const cp: TemplateData = JSON.parse(JSON.stringify(src))
    cp.name = `${src.name ?? `页面 ${activePageIndex.value + 1}`} 副本`
    cp.elements = cp.elements.map((e: any) => ({ ...e, id: generateId() }))
    cp.firstPageOverlay = { ...cp.firstPageOverlay, elements: (cp.firstPageOverlay?.elements ?? []).map((e: any) => ({ ...e, id: generateId() })) }
    pages.value.splice(activePageIndex.value + 1, 0, cp)
    switchPage(activePageIndex.value + 1)
    recordHistory()
  }

  function deletePage(i: number) {
    if (pages.value.length <= 1) return
    flushActivePage()
    pages.value.splice(i, 1)
    if (i < activePageIndex.value) activePageIndex.value--
    else if (i === activePageIndex.value && activePageIndex.value >= pages.value.length) activePageIndex.value = pages.value.length - 1
    templateData.value = pages.value[activePageIndex.value]!
    resetPageSelection()
    recordHistory()
  }

  function renamePage(i: number, name: string) {
    if (pages.value[i]) pages.value[i].name = name
  }

  function movePage(from: number, to: number) {
    if (from === to) return
    flushActivePage()
    const [moved] = pages.value.splice(from, 1)
    pages.value.splice(to, 0, moved!)
    activePageIndex.value = to
    templateData.value = moved!
    resetPageSelection()
    recordHistory()
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
    scale, showRuler, showGrid, snapToGrid, showTableGhostBorder,
    templateData, elements, fields,
    pages, activePageIndex, switchPage, addPage, duplicatePage, deletePage, renamePage, movePage,
    selectedIds, selectedElements, selectedElement, select, selectElement, clearSelection, selectAll,
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
