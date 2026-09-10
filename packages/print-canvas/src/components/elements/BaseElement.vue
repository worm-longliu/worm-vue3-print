<template>
  <div
    ref="elRef"
    class="print-element"
    :class="{
      selected: isSelected,
      previewed: isPreviewed,
      'design-mode': designMode,
      locked: element.options.locked,
      hidden: element.options.visible === false,
      'drag-ghost': isDragging,
      [`type-${element.printElementType.type}`]: true,
      [`zone-${zone || 'content'}`]: true,
    }"
    :style="elementStyle"
    @mousedown.stop="onMouseDown"
    @dblclick.stop="onDblClick"
    @contextmenu.prevent.stop="$emit('contextmenu', element.id, $event)"
  >
    <component
      :is="contentComponent"
      :element="element"
      :data="printData"
      :design-mode="designMode"
      :is-selected="isSelected"
      v-bind="contentAttrs"
      @dblclick-cell="onDblClickCell"
    />

    <!-- 拖拽半透明预览副本 -->
    <div v-if="isDragging" class="drag-preview" />

    <div v-if="resizeEnabled" class="resize-handles">
      <div
        v-for="p in RESIZE_POINTS"
        :key="p"
        :class="['resize-handle', `handle-${p}`]"
        @mousedown.stop="startResize(p, $event)"
      />
    </div>

    <div v-if="isSelected && designMode" class="selected-indicator">
      <div class="position-label">{{ posLabel }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, markRaw, reactive, ref, watchEffect, onMounted, onUnmounted } from 'vue'
import type { RuntimeElement, ElementRect, AdsorbResult } from '../../types'
import { useDrag } from '../../composables/useDrag'
import type { DragOptions } from '../../composables/useDrag'
import { generateId } from '../../utils/element-factory'
import { useResize, RESIZE_POINTS } from '../../composables/useResize'

import { SELECTED_IDS_KEY, PREVIEW_IDS_KEY } from '../../composables/useSelection'
import TextElement from './TextElement.vue'
import ImageElement from './ImageElement.vue'
import LongTextElement from './LongTextElement.vue'
import TableElement from './TableElement.vue'
import LineElement from './LineElement.vue'
import ShapeElement from './ShapeElement.vue'
import BarcodeElement from './BarcodeElement.vue'
import QrcodeElement from './QrcodeElement.vue'
import HtmlElement from './HtmlElement.vue'
import PageNumberElement from './PageNumberElement.vue'

const props = defineProps<{
  element: RuntimeElement
  /** @deprecated 通过 inject 获取，保留用于向后兼容 */
  isSelected?: boolean
  designMode?: boolean
  printData?: Record<string, any>[]
  scale?: number
  allElements?: RuntimeElement[]
  snapToGrid?: boolean
  /** 设计态下无边框表格单元格的虚拟虚线开关（透传给 TableElement） */
  showTableGhostBorder?: boolean
  /** 元素所在区域（影响设计态边框颜色） */
  zone?: 'content' | 'header' | 'footer' | 'overlay'
  /** 由 CanvasPaper 层吸附管理器提供：同步返回吸附修正结果并渲染引导线 */
  adsorbHandler?: (rect: ElementRect) => AdsorbResult
  clearAdsorbGuides?: () => void
}>()

const emit = defineEmits<{
  select: [id: string, multiple: boolean]
  'update:element': [element: RuntimeElement]
  'drag-start': []
  'drag-stop': []
  'dblclick-element': [id: string]
  'dblclick-cell': [elementId: string, r: number, c: number]
  'contextmenu': [id: string, e: MouseEvent]
  'clone-element': [element: RuntimeElement, position: { left: number; top: number }]
}>()

const elRef = ref<HTMLElement | null>(null)

// 通过 inject 精确追踪自身选中状态，避免父组件因 selectedIds 变化全量重渲染
const injectedSelectedIds = inject(SELECTED_IDS_KEY, null)
const isSelected = computed(() => {
  if (injectedSelectedIds?.value) {
    return injectedSelectedIds.value.has(props.element.id)
  }
  return props.isSelected ?? false
})

// 框选实时预选高亮(未提交前)
const injectedPreviewIds = inject(PREVIEW_IDS_KEY, null)
const isPreviewed = computed(() => injectedPreviewIds?.value.has(props.element.id) ?? false)

const componentMap: Record<string, any> = {
  text: markRaw(TextElement),
  image: markRaw(ImageElement),
  longText: markRaw(LongTextElement),
  table: markRaw(TableElement),
  hline: markRaw(LineElement),
  vline: markRaw(LineElement),
  rect: markRaw(ShapeElement),
  oval: markRaw(ShapeElement),
  barcode: markRaw(BarcodeElement),
  qrcode: markRaw(QrcodeElement),
    html: markRaw(HtmlElement),
    pageNumber: markRaw(PageNumberElement),
}

const contentComponent = computed(() => componentMap[props.element.printElementType.type])

/** 仅表格元素需要虚拟虚线开关，避免其它元素根节点出现无关 attribute */
const contentAttrs = computed(() =>
  props.element.printElementType.type === 'table'
    ? { showTableGhostBorder: props.showTableGhostBorder, scale: props.scale }
    : {},
)

const elementStyle = computed(() => {
  const o = props.element.options
  return {
    position: 'absolute' as const,
    left: o.left + 'mm',
    top: o.top + 'mm',
    width: o.width + 'mm',
    height: o.height + 'mm',
    zIndex: o.zIndex || 'auto',
  }
})

const posLabel = computed(() => {
  const o = props.element.options
  return `x:${Math.round(o.left)} y:${Math.round(o.top)} ${Math.round(o.width)}×${Math.round(o.height)}mm`
})

// 吸附检测与引导线由 CanvasPaper 层的 useAdsorbManager 统一管理

// 拖拽：拖拽期间用 CSS transform 做视觉跟随，不触发响应式更新；
// mouseup 时通过 onDragEnd 一次性写入最终坐标。
let dragStartLeft = 0
let dragStartTop = 0
const dragConfig = reactive<DragOptions>({
  disabled: !props.designMode || !!props.element.options.locked,
  getScale: () => props.scale || 1,
  // 拖拽中：仅设置 style.transform，不修改响应式数据
  onDrag: (pos) => {
    const dx = pos.left - dragStartLeft
    const dy = pos.top - dragStartTop
    if (elRef.value) {
      elRef.value.style.transform = `translate(${dx}mm, ${dy}mm)`
    }
    // 同组元素拖拽跟随：拖拽期间不处理，mouseup 时通过 onDragEnd 一次性更新响应式坐标
  },
  // 拖拽结束：一次性写入最终坐标，清除 transform
  onDragEnd: (pos, info) => {
    // Alt+拖拽：在落点生成副本，原元素留在原位不动
    if (info.altKey) {
      const clone = JSON.parse(JSON.stringify(props.element)) as RuntimeElement
      clone.id = generateId()
      clone.options.left = pos.left
      clone.options.top = pos.top
      // 通过 emit 事件通知父组件处理克隆，而非直接操作 props
      emit('clone-element', clone, { left: pos.left, top: pos.top })
      if (elRef.value) {
        elRef.value.style.transform = ''
      }
      return
    }
    const finalDx = pos.left - dragStartLeft
    const finalDy = pos.top - dragStartTop
    // 写入主元素响应式坐标
    props.element.options.left = pos.left
    props.element.options.top = pos.top
    if (elRef.value) {
      elRef.value.style.transform = ''
    }
    // 同组元素一次性更新坐标（响应式写入，Vue 自动刷新 DOM）
    if (props.element.options.groupId && props.allElements) {
      for (const sibling of props.allElements) {
        if (sibling.id !== props.element.id && sibling.options.groupId === props.element.options.groupId) {
          sibling.options.left += finalDx
          sibling.options.top += finalDy
        }
      }
    }
  },
  onStart: () => {
    // 记录拖拽起始坐标（用于计算 transform 偏移量）
    dragStartLeft = props.element.options.left
    dragStartTop = props.element.options.top
    emit('select', props.element.id, false)
    emit('drag-start')
  },
  onStop: () => {
    props.clearAdsorbGuides?.()
    emit('drag-stop')
  },
  onAdsorb: (pos) => {
    // 网格吸附
    let left = pos.left
    let top = pos.top
    if (props.snapToGrid) {
      const grid = 5 // 5mm
      left = Math.round(pos.left / grid) * grid
      top = Math.round(pos.top / grid) * grid
    }

    // 元素间吸附交给 CanvasPaper 层管理器（含引导线渲染）
    if (props.adsorbHandler) {
      return props.adsorbHandler({
        id: props.element.id,
        left,
        top,
        width: props.element.options.width,
        height: props.element.options.height,
      })
    }
    return { left, top, lines: [] }
  },
})
const { setup: setupDrag, cleanup: cleanupDrag, isDragging } = useDrag(elRef, dragConfig)

// 锁定/设计态变化时自动同步拖拽禁用标志（useDrag.onMouseDown 实时读取 dragConfig.disabled）
watchEffect(() => {
  dragConfig.disabled = !props.designMode || !!props.element.options.locked
})

// 缩放：手柄由模板渲染，resizeEnabled 控制显隐；table 尺寸由列宽/行高派生，禁用缩放
const resizeEnabled = computed(
  () =>
    isSelected.value &&
    !!props.designMode &&
    !props.element.options.locked &&
    props.element.printElementType.type !== 'table',
)

const { startResize, cleanup: cleanupResize } = useResize({
  minWidth: 3.5,
  minHeight: 3.5,
  getScale: () => props.scale || 1,
  getRect: () => ({
    left: props.element.options.left,
    top: props.element.options.top,
    width: props.element.options.width,
    height: props.element.options.height,
  }),
  onResize: (rect) => {
    props.element.options.left = rect.left
    props.element.options.top = rect.top
    props.element.options.width = rect.width
    props.element.options.height = rect.height
  },
  // 复用 drag-start/drag-stop 事件链记录历史：onStart 记录缩放前快照，
  // onStop 触发 PrintDesigner.onDragStop 的前后对比（含 width/height）入栈。
  onStart: () => {
    emit('drag-start')
  },
  onStop: () => {
    emit('drag-stop')
  },
})

function onMouseDown(e: MouseEvent) {
  if (!props.designMode) return
  emit('select', props.element.id, e.ctrlKey || e.metaKey)
}

function onDblClick() {
  if (!props.designMode) return
  emit('dblclick-element', props.element.id)
}

/** 表格单元格双击转发（仅表格元素的 TableElement 会触发） */
function onDblClickCell(elementId: string, r: number, c: number) {
  if (!props.designMode) return
  emit('dblclick-cell', elementId, r, c)
}

onMounted(() => {
  // 始终挂载拖拽监听：useDrag.onMouseDown 在事件触发时实时读取 dragConfig.disabled，
  // 即使元素加载时 locked:true 也能正确门控；解锁后 locked watcher 更新 disabled 即生效。
  if (props.designMode) {
    setupDrag()
  }
})

function cleanup() {
  cleanupDrag()
  cleanupResize()
  props.clearAdsorbGuides?.()
}

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped>
.print-element {
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
}
/* 设计态下所有元素显示浅灰虚线边框，标示占位空间大小 */
.print-element.design-mode {
  outline: 1px dashed #C3C9D6;
}
/* 页眉/页脚区域元素：油墨绿虚线 */
.print-element.design-mode.zone-header,
.print-element.design-mode.zone-footer {
  outline: 1px dashed var(--pd-ink-green, #67c23a);
}
/* 首页叠加区域元素：青色虚线 */
.print-element.design-mode.zone-overlay {
  outline: 1px dashed #06B6D4;
}
.print-element.selected {
  outline: 1.5px solid var(--pd-accent, #165DFF);
  background: rgba(22, 93, 255, 0.04);
}
/* 框选实时预选:墨蓝高亮(未提交) */
.print-element.previewed {
  outline: 1.5px solid rgba(22, 93, 255, 0.5);
  background: rgba(22, 93, 255, 0.1);
}
.print-element.design-mode:hover {
  outline: 1px dashed var(--pd-accent, #165DFF);
}
.print-element.locked {
  cursor: not-allowed;
}
.print-element.locked:not(.selected) {
  outline: 1.5px dashed #999;
}
.print-element.hidden {
  opacity: 0.3;
  pointer-events: none;
}
/* 拖拽半透明预览:拖拽中元素变淡,叠加虚线副本框 */
.print-element.drag-ghost {
  opacity: 0.4;
}
.drag-preview {
  position: absolute;
  inset: 0;
  border: 2px dashed var(--pd-accent, #165DFF);
  pointer-events: none;
  z-index: 1000;
  box-sizing: border-box;
}
.selected-indicator {
  position: absolute;
  top: -18px;
  left: 0;
  font-size: 10px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 20;
}
.position-label {
  background: var(--pd-accent, #165DFF);
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}
.resize-handles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.resize-handle {
  position: absolute;
  width: 7px;
  height: 7px;
  background: var(--pd-handle, #165DFF);
  border: 1.5px solid #fff;
  border-radius: 2px;
  box-sizing: border-box;
  transform: translate(-50%, -50%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  z-index: 10;
  pointer-events: auto;
}
.handle-nw { top: 0; left: 0; cursor: nw-resize; }
.handle-n { top: 0; left: 50%; cursor: n-resize; }
.handle-ne { top: 0; left: 100%; cursor: ne-resize; }
.handle-e { top: 50%; left: 100%; cursor: e-resize; }
.handle-se { top: 100%; left: 100%; cursor: se-resize; }
.handle-s { top: 100%; left: 50%; cursor: s-resize; }
.handle-sw { top: 100%; left: 0; cursor: sw-resize; }
.handle-w { top: 50%; left: 0; cursor: w-resize; }
</style>
