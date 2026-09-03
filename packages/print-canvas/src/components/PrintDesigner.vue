<template>
  <div class="designer-container">
    <DesignerToolbar
      :is-edit="isEdit"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :has-multi-selection="selectedIds.size >= 2"
      :has-selection="selectedIds.size >= 1"
      :show-grid="showGrid"
      :snap-to-grid="snapToGrid"
      :show-table-ghost-border="showTableGhostBorder"
      :selected-element-has-group="selectedElement?.options.groupId ? true : false"
      :overlay-visible="overlayVisible"
      :show-load-default="!!loadDefaultTemplate"
      v-model:scale="scale"
      @back="$emit('back')"
      @preview="$emit('preview')"
      @save="handleSave"
      @load-default="handleLoadDefault"
      @undo="onUndo"
      @redo="onRedo"
      @align="(mode: string) => onAlign(mode as AlignMode)"
      @move-layer="onMoveLayer"
      @toggle-grid="showGrid = !showGrid"
      @toggle-snap="snapToGrid = !snapToGrid"
      @toggle-table-ghost-border="showTableGhostBorder = !showTableGhostBorder"
      @toggle-overlay="toggleOverlay"
      @group="onGroup"
      @ungroup="onUngroup"
      @add-overlay-element="onAddOverlayElement"
      @fit-window="onFitWindow"
      @zoom="onZoom"
    />

    <!-- 三栏布局 -->
    <div class="designer-body">
      <LeftPanel
        :fields="fields"
        :elements="elements"
        :selected-ids="selectedIds"
        :collapsed="leftCollapsed"
        @select="onSelectElement"
        @move-layer="onMoveLayer"
        @toggle-visible="onToggleVisible"
        @toggle-locked="onToggleLocked"
        @toggle-collapse="toggleLeft"
      />
      <CanvasArea
        ref="canvasAreaRef"
        :template-data="templateData"
        :elements="elements"
        :scale="scale / 100"
        :show-grid="showGrid"
        :snap-to-grid="snapToGrid"
        :show-table-ghost-border="showTableGhostBorder"
        :has-clipboard="hasClipboard"
        :guides="guides"
        :overlay-visible="overlayVisible"
        :screenshot-url="screenshotUrl"
        :overlay-opacity="overlayOpacity"
        :selected-element-has-group="selectedElement?.options.groupId ? true : false"
        @select="onSelectElement"
        @drop-element="onDropElement"
        @drop-field="onDropField"
        @drag-start="onDragStart"
        @drag-stop="onDragStop"
        @dblclick-element="onDblClickElement"
        @dblclick-cell="onDblClickCell"
        @zone-height-change="onZoneHeightChange"
        @zone-height-commit="onZoneHeightCommit"
        @select-all="selectAll"
        @clear-selection="clearSelection"
        @preview="setPreview"
        @commit-preview="commitPreview"
        @paste="paste"
        @copy="copy"
        @cut="cutSelected"
        @delete="onDeleteElement"
        @move-layer="onMoveLayer"
        @coordinate="onCoordinate"
        @group="onGroup"
        @ungroup="onUngroup"
        @add-guide="addGuide"
        @guide-move="moveGuide"
        @guide-remove="removeGuide"
        @zoom="onZoom"
        @clone-element="onCloneElement"
      />
      <PropertyPanel
        :element="selectedElement"
        :template-data="templateData"
        :fields="fields"
        :table-selection="tableSelection"
        :record-history="recordHistory"
        :collapsed="rightCollapsed"
        v-model:active-tab="activePropertyTab"
        @delete-element="onDeleteElement"
        @update:template-data="onTemplateDataChanged"
        @toggle-collapse="toggleRight"
      />
    </div>
    <StatusBar
      :coordinate="coordinate"
      :scale="scale"
      :element-count="elements.length"
      :selected-count="selectedIds.size"
      :paper="paperLabel"
      :dirty="dirty"
    />

    <!-- 设计稿双击元素/单元格打开的表达式编辑器 -->
    <ExpressionEditor
      v-model="dblEditorVisible"
      :fields="fields"
      :expression="dblEditorExpression"
      @update:expression="onDblEditorConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import '../styles/native-controls.css'
import { ref, watch, provide, computed, onMounted, onUnmounted } from 'vue'
import type { RuntimeElement, PrintBusinessField, TemplateData, TableCell, RequestScreenshotFn, UploadImageFn } from '../types'
import { useDesignerState } from '../composables/useDesignerState'
import { useGuides } from '../composables/useGuides'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'
import { SELECTED_IDS_KEY, PREVIEW_IDS_KEY } from '../composables/useSelection'
import { getZoneRects } from '../utils/zone-layout'
import { getPaperDimensions } from '../utils/default-config'
import { DEFAULT_DEMO_DATA } from '../utils/demo-data'
import { findMainCell } from '../utils/table-matrix'
import { UPLOAD_IMAGE_KEY } from '../composables/useHostAdapter'
import type { AlignMode } from '../composables/useAlign'
import DesignerToolbar from './DesignerToolbar.vue'
import LeftPanel from './LeftPanel.vue'
import CanvasArea from './CanvasArea.vue'
import PropertyPanel from './PropertyPanel.vue'
import StatusBar from './StatusBar.vue'
import ExpressionEditor from './ExpressionEditor.vue'
import { useStudioChrome } from '../composables/useStudioChrome'

const props = defineProps<{
  initialTemplate?: TemplateData
  initialElements?: RuntimeElement[]
  fields?: PrintBusinessField[]
  isEdit?: boolean
  /** 截图适配器（叠层对比）：未注入时该功能不可用 */
  requestScreenshot?: RequestScreenshotFn
  /** 图片上传适配器：未注入时图片上传不可用 */
  uploadImage?: UploadImageFn
  /** 加载默认布局回调（宿主实现业务逻辑；未注入时工具栏不展示该按钮），返回 null/undefined 视为无默认布局 */
  loadDefaultTemplate?: () => TemplateData | Promise<TemplateData | null | undefined> | null | undefined
}>()

const emit = defineEmits<{
  back: []
  preview: []
  save: [json: string]
}>()

// 装配层状态：面板折叠（localStorage 持久）+ 未保存 dirty
const { leftCollapsed, rightCollapsed, toggleLeft, toggleRight, dirty, markSaved } = useStudioChrome()

// 设计器核心状态统一由 useDesignerState 管理
const {
  scale, showGrid, snapToGrid, showTableGhostBorder,
  templateData, elements, fields,
  selectedIds, selectedElement, select, clearSelection, selectAll,
  previewIds, setPreview, commitPreview,
  hasClipboard, copy, paste, cutSelected,
  canUndo, canRedo, undo: onUndo, redo: onRedo,
  alignSelected: onAlign,
  groupSelected: onGroup, ungroupSelected: onUngroup, deleteSelected: onDeleteElement,
  dragStart: onDragStart, dragStop: onDragStop,
  addElement: onDropElement, addFieldElement: onDropField,
  moveLayer: onMoveLayer, updateTemplateData, fitToWindow,
  getTemplateJson, loadTemplate,
  tableSelection, setTableSelection, recordHistory,
} = useDesignerState({
  initialTemplate: props.initialTemplate,
  initialElements: props.initialElements,
  initialFields: props.fields,
})

// 未保存信号：任何元素/模板数据变化点亮
watch([elements, templateData], () => { dirty.value = true }, { deep: true })

const { guides, addGuide, moveGuide, removeGuide } = useGuides(templateData, recordHistory)

// 表格单元格编辑上下文
const maxTableWidth = computed(() => {
  const t = templateData.value
  const { width: paperW } = getPaperDimensions(t)
  return paperW - t.margins.left - t.margins.right
})
provide(TABLE_EDIT_KEY, { tableSelection, setTableSelection, recordHistory, maxTableWidth })
provide(SELECTED_IDS_KEY, selectedIds)
provide(PREVIEW_IDS_KEY, previewIds)

provide(UPLOAD_IMAGE_KEY, computed(() => props.uploadImage))
watch(selectedElement, el => {
  if (!el || el.printElementType.type !== 'table') setTableSelection(null)
})

const canvasAreaRef = ref<InstanceType<typeof CanvasArea> | null>(null)

// 叠层对比模式
const overlayVisible = ref(false)
const screenshotUrl = ref('')
const overlayOpacity = ref(0.5)

async function toggleOverlay() {
  if (overlayVisible.value) {
    overlayVisible.value = false
    return
  }
  const templateJson = getTemplateJson()
  if (!templateJson) {
    alert('模板数据为空')
    return
  }
  if (!props.requestScreenshot) {
    alert('截图服务未配置')
    return
  }
  try {
    const blob = await props.requestScreenshot({ templateJson, printData: DEFAULT_DEMO_DATA })
    if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value)
    screenshotUrl.value = URL.createObjectURL(blob)
    overlayVisible.value = true
  } catch {
    alert('截图生成失败')
  }
}

// 状态栏:鼠标坐标(纸面 mm)
const coordinate = ref<{ x: number; y: number } | null>(null)
function onCoordinate(pos: { x: number; y: number } | null) { coordinate.value = pos }

const paperLabel = computed(() => {
  const t = templateData.value
  const dim = getPaperDimensions(t)
  const orient = t.orientation === 'landscape' ? '横向' : '纵向'
  return `${t.paperSize} ${orient} ${Math.round(dim.width)}×${Math.round(dim.height)}mm`
})

function onFitWindow() {
  const el = (canvasAreaRef.value as any)?.$el as HTMLElement | undefined
  if (el) fitToWindow(el.clientWidth, el.clientHeight)
}
function onZoom(delta: number) {
  scale.value = Math.min(200, Math.max(50, scale.value + delta))
}

// Ctrl+0 适应窗口:需容器尺寸,由本组件单独监听(useKeyboard 不处理)
function onKeyFitWindow(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    e.preventDefault()
    onFitWindow()
  }
}
onMounted(() => document.addEventListener('keydown', onKeyFitWindow))
onUnmounted(() => document.removeEventListener('keydown', onKeyFitWindow))

function onTemplateDataChanged(data: TemplateData) {
  const prevHeader = templateData.value.header.height
  const prevFooter = templateData.value.footer.height
  updateTemplateData(data)
  if (data.header.height < prevHeader) warnZoneOverflow('header')
  if (data.footer.height < prevFooter) warnZoneOverflow('footer')
}

function onZoneHeightChange(zone: 'header' | 'footer', height: number) {
  templateData.value = {
    ...templateData.value,
    [zone]: { ...templateData.value[zone], height },
  }
}

function onZoneHeightCommit(zone: 'header' | 'footer') {
  updateTemplateData({ ...templateData.value })
  warnZoneOverflow(zone)
}

function warnZoneOverflow(zone: 'header' | 'footer') {
  const rect = getZoneRects(templateData.value)[zone]
  const overflow = elements.value.some(e => e.zone === zone
    && (e.options.top + e.options.height > rect.height
      || e.options.left + e.options.width > rect.width))
  if (overflow) {
    alert(`${zone === 'header' ? '页眉' : '页脚'}高度已小于区域内元素,请手动调整元素位置`)
  }
}

function onAddOverlayElement() {
  const overlay = templateData.value.firstPageOverlay
  const newEl = {
    options: { left: 0, top: 0, width: 50, height: 10, title: '首页叠加' },
    printElementType: { type: 'text' as const, title: '首页叠加' },
  }
  templateData.value = {
    ...templateData.value,
    firstPageOverlay: { ...overlay, elements: [...overlay.elements, newEl] },
  }
}

const onSelectElement = select

function onToggleVisible(id: string) {
  const el = elements.value.find(e => e.id === id)
  if (el) el.options.visible = el.options.visible === false ? true : false
}

function onToggleLocked(id: string) {
  const el = elements.value.find(e => e.id === id)
  if (el) el.options.locked = !el.options.locked
}

const activePropertyTab = ref<'element' | 'page'>('page')
watch(selectedElement, (el) => {
  activePropertyTab.value = el ? 'element' : 'page'
})

/** 双击可打开表达式编辑器的元素类型 → 对应表达式字段（无内容表达式的类型不在此列） */
const DBL_EDITABLE_FIELD: Record<string, string> = {
  text: 'formatter',
  longText: 'formatter',
  barcode: 'formatter',
  qrcode: 'formatter',
  image: 'src',
}
const dblEditorVisible = ref(false)
const dblEditTarget = ref<
  { kind: 'element'; element: RuntimeElement; field: string } | { kind: 'cell'; cell: TableCell } | null
>(null)
const dblEditorExpression = ref('')

function onDblClickElement(id: string) {
  const el = elements.value.find(e => e.id === id)
  if (!el) return
  select(id, false)
  activePropertyTab.value = 'element'
  // 锁定元素不弹编辑器（保持选中，避免绕过锁定护栏）
  if (el.options.locked) return
  const field = DBL_EDITABLE_FIELD[el.printElementType.type]
  if (!field) return
  dblEditTarget.value = { kind: 'element', element: el, field }
  dblEditorExpression.value = (el.options as any)[field] || ''
  dblEditorVisible.value = true
}

function onDblClickCell(elId: string, r: number, c: number) {
  const el = elements.value.find(e => e.id === elId)
  if (!el) return
  select(elId, false)
  activePropertyTab.value = 'element'
  if (el.options.locked) return
  const rows = el.options.tableRows ?? []
  const main = findMainCell(rows, r, c)
  const cell = rows[main.r]?.cells[main.c]
  if (!cell) return
  dblEditTarget.value = { kind: 'cell', cell }
  dblEditorExpression.value = cell.formatter || ''
  dblEditorVisible.value = true
}

function onDblEditorConfirm(value: string) {
  const t = dblEditTarget.value
  if (t?.kind === 'element') {
    ;(t.element.options as any)[t.field] = value || undefined
  } else if (t?.kind === 'cell') {
    t.cell.formatter = value || undefined
  }
  recordHistory()
  dblEditorVisible.value = false
  dblEditTarget.value = null
}

/** Alt+拖拽克隆元素：将克隆元素添加到元素池并选中 */
function onCloneElement(el: RuntimeElement, _pos: { left: number; top: number }) {
  elements.value.push(el)
  select(el.id, false)
  recordHistory()
}

watch(() => props.initialTemplate, (t) => {
  if (t) loadTemplate(t, props.initialElements)
})
watch(() => props.initialElements, (els) => {
  if (els && !props.initialTemplate) {
    templateData.value = {
      ...templateData.value,
      elements: els.map(e => ({ ...e, options: { ...e.options }, printElementType: { ...e.printElementType } })),
    }
  }
})
watch(() => props.fields, (f) => { fields.value = f || [] })

defineExpose({ getTemplateJson })

async function handleLoadDefault() {
  if (!props.loadDefaultTemplate) return
  if (!confirm('将覆盖当前画布内容，是否继续？')) return
  try {
    const tpl = await props.loadDefaultTemplate()
    if (!tpl) {
      alert('未获取到默认布局')
      return
    }
    loadTemplate(tpl)
    alert('默认布局已加载')
  } catch {
    alert('加载默认布局失败')
  }
}

function handleSave() {
  emit('save', JSON.stringify(getTemplateJson()))
  markSaved()
}
</script>

<style scoped>
.designer-container {
  /* ── 精工排版工作台令牌：冷灰底 + 白纸 + 蓝墨点缀 ── */
  --pd-bg: #f3f5f9;            /* 应用底色 / 内嵌控件底 */
  --pd-surface: #ffffff;       /* 工具栏、状态栏、面板表面 */
  --pd-field-bg: #f4f6fa;      /* 卡片、内嵌输入槽 */
  --pd-sidebar: #ffffff;
  --pd-sidebar-hover: #f0f3f9;
  --pd-canvas-bg: #e6e9f0;     /* 排版垫：略深，托起纸张 */
  --pd-paper: #FFFFFF;
  --pd-accent: #165DFF;
  --pd-accent-2: #3D7BFF;
  --pd-accent-soft: rgba(22, 93, 255, .09);
  --pd-accent-secondary: #f56c6c;
  --pd-danger-soft: rgba(245, 108, 108, .10);
  --pd-ink-green: #67c23a;
  --pd-text: #2a2e37;
  --pd-text-muted: #8b909c;
  --pd-text-faint: #b4b9c4;
  --pd-border: #d9dde6;
  --pd-border-soft: #e9ecf2;
  --pd-handle: #165DFF;
  --pd-ruler: #9aa1af;
  --pd-ruler-bg: #f8f9fc;
  --pd-ruler-cursor: #165DFF;
  --pd-radius: 6px;
  --pd-shadow-sm: 0 1px 2px rgba(23, 32, 60, .05);
  --pd-shadow-md: 0 2px 8px rgba(23, 32, 60, .06), 0 10px 28px rgba(23, 32, 60, .07);
  --pd-shadow-paper: 0 0 0 1px rgba(23, 32, 60, .05),
                     0 1px 2px rgba(23, 32, 60, .06),
                     0 8px 20px rgba(23, 32, 60, .08),
                     0 26px 60px rgba(23, 32, 60, .15);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--pd-bg);
}
.designer-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
