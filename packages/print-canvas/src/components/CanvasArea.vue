<template>
  <div
    ref="rootRef"
    class="canvas-area"
    @dragover.prevent
    @drop="onDrop"
    @mousedown="onCanvasMouseDown"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
    @wheel="onWheel"
    @contextmenu.prevent="onContextMenu"
  >
    <div class="canvas-scroll">
      <CanvasPaper
        :template-data="templateData"
        :runtime-elements="elements"
        :design-mode="true"
        :print-data="[]"
        :scale="scale"
        :show-grid="showGrid"
        :snap-to-grid="snapToGrid"
        :show-table-ghost-border="showTableGhostBorder"
        :guides="guides"
        @select="onSelectElement"
        @add-guide="(t: 'vertical' | 'horizontal', p: number) => $emit('add-guide', t, p)"
        @guide-move="(id: string, p: number) => $emit('guide-move', id, p)"
        @guide-remove="(id: string) => $emit('guide-remove', id)"
        @drag-start="$emit('drag-start')"
        @drag-stop="$emit('drag-stop')"
        @dblclick-element="(id: string) => $emit('dblclick-element', id)"
        @dblclick-cell="(id: string, r: number, c: number) => $emit('dblclick-cell', id, r, c)"
        @contextmenu="(id: string, e: MouseEvent) => onContextMenu(e, id)"
        @zone-height-change="(zone: 'header' | 'footer', h: number) => $emit('zone-height-change', zone, h)"
        @zone-height-commit="(zone: 'header' | 'footer') => $emit('zone-height-commit', zone)"
        @clone-element="(el, pos) => $emit('clone-element', el, pos)"
      />
      <!-- 叠层对比截图 -->
      <div v-if="overlayVisible && screenshotUrl" class="overlay-layer">
        <img :src="screenshotUrl" class="overlay-image" :style="{ opacity: overlayOpacity ?? 0.5 }" />
      </div>
    </div>

    <!-- 框选选框 -->
    <div
      v-if="marquee.visible"
      class="marquee-selection"
      :style="{
        left: marquee.x + 'px',
        top: marquee.y + 'px',
        width: marquee.w + 'px',
        height: marquee.h + 'px',
      }"
    />

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <template v-if="contextMenu.targetId">
        <div class="context-menu-item" @click="emitAction('copy')">复制</div>
        <div class="context-menu-item" @click="emitAction('cut')">剪切</div>
        <div class="context-menu-item" :class="{ disabled: !hasClipboard }" @click="emitAction('paste')">粘贴</div>
        <div class="context-menu-item" @click="emitAction('delete')">删除</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="emitAction('move-layer', 'top')">置顶</div>
        <div class="context-menu-item" @click="emitAction('move-layer', 'up')">上移</div>
        <div class="context-menu-item" @click="emitAction('move-layer', 'down')">下移</div>
        <div class="context-menu-item" @click="emitAction('move-layer', 'bottom')">置底</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="emitAction('group')">编组 Ctrl+G</div>
        <div class="context-menu-item" :class="{ disabled: !selectedElementHasGroup }" @click="emitAction('ungroup')">取消编组 Ctrl+Shift+G</div>
      </template>
      <template v-else>
        <div class="context-menu-item" :class="{ disabled: !hasClipboard }" @click="handlePaste">粘贴</div>
        <div class="context-menu-item" @click="handleSelectAll">全选</div>
        <div class="context-menu-item" @click="handleClearSelection">取消选择</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onBeforeUnmount } from 'vue'
import type { RuntimeElement, TemplateData, AlignLine } from '../types'
import { pxToMm } from '../utils/units'
import { nextWheelScale } from '../utils/scale'
import CanvasPaper from './CanvasPaper.vue'

const props = defineProps<{
  templateData: TemplateData
  elements: RuntimeElement[]
  scale: number
  showGrid?: boolean
  snapToGrid?: boolean
  showTableGhostBorder?: boolean
  hasClipboard?: boolean
  guides?: AlignLine[]
  overlayVisible?: boolean
  screenshotUrl?: string
  overlayOpacity?: number
  selectedElementHasGroup?: boolean
}>()

const emit = defineEmits<{
  select: [id: string, multiple: boolean]
  'drop-element': [type: string, dropPoint?: { x: number; y: number }]
  'drop-field': [field: { fieldKey: string; fieldLabel: string }, dropPoint?: { x: number; y: number }]
  'drag-start': []
  'drag-stop': []
  'dblclick-element': [id: string]
  'dblclick-cell': [elementId: string, r: number, c: number]
  'zone-height-change': [zone: 'header' | 'footer', height: number]
  'zone-height-commit': [zone: 'header' | 'footer']
  'select-all': []
  'clear-selection': []
  'preview': [ids: string[]]
  'commit-preview': []
  'paste': []
  'copy': []
  'cut': []
  'delete': []
  'move-layer': [direction: string]
  group: []
  ungroup: []
  'coordinate': [pos: { x: number; y: number } | null]
  'add-guide': [type: 'vertical' | 'horizontal', positionMm: number]
  'guide-move': [id: string, positionMm: number]
  'guide-remove': [id: string]
  'zoom': [delta: number]
  'clone-element': [element: RuntimeElement, position: { left: number; top: number }]
}>()

function onSelectElement(id: string, multiple: boolean) {
  emit('select', id, multiple)
}

const rootRef = ref<HTMLElement | null>(null)

/** 客户端坐标 → 纸面 mm 坐标；纸张未挂载或落点在纸外时返回 undefined（走默认落位） */
function toPaperPoint(e: DragEvent): { x: number; y: number } | undefined {
  const paper = rootRef.value?.querySelector('.hiprint-printPaper') as HTMLElement | null
  if (!paper) return undefined
  const rect = paper.getBoundingClientRect()
  const scale = props.scale || 1
  const x = pxToMm((e.clientX - rect.left) / scale)
  const y = pxToMm((e.clientY - rect.top) / scale)
  if (x < 0 || y < 0) return undefined
  return { x, y }
}

function onDrop(e: DragEvent) {
  const dropPoint = toPaperPoint(e)
  const fieldData = e.dataTransfer?.getData('fieldData')
  if (fieldData) {
    try {
      const field = JSON.parse(fieldData) as { fieldKey: string; fieldLabel: string }
      emit('drop-field', field, dropPoint)
      return
    } catch {
      // 解析失败，忽略
    }
  }
  const elementType = e.dataTransfer?.getData('elementType')
  if (elementType) {
    emit('drop-element', elementType, dropPoint)
  }
}

// ─── 鼠标框选 ───
const marquee = reactive({ visible: false, x: 0, y: 0, w: 0, h: 0 })
let marqueeStart = { x: 0, y: 0 }

/** 判断点击目标是否为画布空白区域（非元素） */
function isCanvasBackground(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  // 点击在画布容器、滚动层、纸张本身上视为空白区域
  if (target === rootRef.value) return true
  if (target.classList.contains('canvas-scroll')) return true
  if (target.classList.contains('hiprint-printPaper')) return true
  if (target.classList.contains('hiprint-printPaper-content')) return true
  if (target.classList.contains('zone-layer')) return true
  if (target.classList.contains('grid-bg')) return true
  if (target.classList.contains('watermark-layer')) return true
  return false
}

const MM_TO_PX = 96 / 25.4
function onMouseMove(e: MouseEvent) {
  const paper = rootRef.value?.querySelector('.hiprint-printPaper') as HTMLElement | null
  if (!paper) return
  const rect = paper.getBoundingClientRect()
  const s = props.scale || 1
  const xMm = pxToMm((e.clientX - rect.left) / s)
  const yMm = pxToMm((e.clientY - rect.top) / s)
  if (xMm < 0 || yMm < 0) { emit('coordinate', null); return }
  emit('coordinate', { x: xMm, y: yMm })
}
function onMouseLeave() { emit('coordinate', null) }

/** Ctrl/Cmd+滚轮缩放:以鼠标位置为缩放中心,缩放前后保持鼠标下的内容点不动 */
function onWheel(e: WheelEvent) {
  if (!(e.ctrlKey || e.metaKey)) return
  e.preventDefault()
  // props.scale 为小数;统一在百分比整数域做乘性步进,
  // 取消放大上限,同时避免浮点累加产生脏显示
  const oldScale = props.scale || 1
  const oldPercent = Math.round(oldScale * 100)
  const newPercent = nextWheelScale(oldPercent, e.deltaY > 0 ? -1 : 1)
  if (newPercent === oldPercent) return
  const newScale = newPercent / 100

  const container = rootRef.value
  // 记录鼠标下的内容点(相对滚动内容原点)。容器存在非对称 padding,
  // 换算时必须扣除,否则每次缩放锚点会漂移 pad*(ratio-1)
  let anchor: { x: number; y: number; ratio: number; mouseX: number; mouseY: number } | null = null
  if (container) {
    const rect = container.getBoundingClientRect()
    const cs = getComputedStyle(container)
    const padX = parseFloat(cs.paddingLeft) || 0
    const padY = parseFloat(cs.paddingTop) || 0
    anchor = {
      x: container.scrollLeft + (e.clientX - rect.left) - padX,
      y: container.scrollTop + (e.clientY - rect.top) - padY,
      ratio: newScale / oldScale,
      mouseX: e.clientX - rect.left,
      mouseY: e.clientY - rect.top,
    }
  }

  // 以百分比整数增量上报(父级 scale 为百分比)
  emit('zoom', newPercent - oldPercent)

  // 待新比例应用到 DOM 后再校正滚动位置:缩放前若该方向没有滚动条,
  // 提前写入 scrollTop/Left 会被浏览器钳制为 0,导致锚点失效
  if (container && anchor) {
    const a = anchor
    void nextTick(() => {
      const cs = getComputedStyle(container)
      const padX = parseFloat(cs.paddingLeft) || 0
      const padY = parseFloat(cs.paddingTop) || 0
      container.scrollLeft = a.x * a.ratio - a.mouseX + padX
      container.scrollTop = a.y * a.ratio - a.mouseY + padY
    })
  }
}

function onCanvasMouseDown(e: MouseEvent) {
  // 右键由 contextmenu 处理
  if (e.button === 2) return
  if (!isCanvasBackground(e.target)) return

  // 点击空白区域取消选择
  emit('clear-selection')

  // 启动框选
  marqueeStart = { x: e.clientX, y: e.clientY }
  marquee.visible = true
  marquee.x = e.clientX
  marquee.y = e.clientY
  marquee.w = 0
  marquee.h = 0

  window.addEventListener('mousemove', onMarqueeMove)
  window.addEventListener('mouseup', onMarqueeUp)
}

/** 框选命中测试:左->右拖=交集,右->左拖=包含;返回命中元素 id */
function hitTestIds(): string[] {
  if (marquee.w < 3 || marquee.h < 3) return []
  const paper = rootRef.value?.querySelector('.hiprint-printPaper') as HTMLElement | null
  if (!paper) return []
  const paperRect = paper.getBoundingClientRect()
  const s = props.scale || 1
  // marquee.x 是选框左边缘;小于起点 x 表示从右向左拖(包含模式)
  const containMode = marquee.x < marqueeStart.x
  const ids: string[] = []
  for (const el of props.elements) {
    if (el.options.visible === false || el.options.locked) continue
    const elLeft = paperRect.left + el.options.left * MM_TO_PX * s
    const elTop = paperRect.top + el.options.top * MM_TO_PX * s
    const elRight = elLeft + el.options.width * MM_TO_PX * s
    const elBottom = elTop + el.options.height * MM_TO_PX * s
    const inter = elLeft < marquee.x + marquee.w && elRight > marquee.x
      && elTop < marquee.y + marquee.h && elBottom > marquee.y
    const contained = elLeft >= marquee.x && elRight <= marquee.x + marquee.w
      && elTop >= marquee.y && elBottom <= marquee.y + marquee.h
    if (containMode ? contained : inter) ids.push(el.id)
  }
  return ids
}

function onMarqueeMove(e: MouseEvent) {
  const dx = e.clientX - marqueeStart.x
  const dy = e.clientY - marqueeStart.y
  marquee.x = dx >= 0 ? marqueeStart.x : e.clientX
  marquee.y = dy >= 0 ? marqueeStart.y : e.clientY
  marquee.w = Math.abs(dx)
  marquee.h = Math.abs(dy)
  // 实时预选高亮
  emit('preview', hitTestIds())
}

function onMarqueeUp() {
  window.removeEventListener('mousemove', onMarqueeMove)
  window.removeEventListener('mouseup', onMarqueeUp)

  const ids = hitTestIds()
  emit('preview', ids) // 确保预选为最终状态
  if (ids.length > 0) emit('commit-preview')
  else emit('clear-selection')
  emit('preview', []) // 清除预选高亮

  marquee.visible = false
}

// ─── 右键菜单 ───
const contextMenu = reactive({ visible: false, x: 0, y: 0, targetId: null as string | null })

function onContextMenu(e: MouseEvent, elId?: string) {
  // 元素右键:由 BaseElement 上抛(已 stop);空白右键:无 elId,仅背景区域弹菜单
  if (!elId && !isCanvasBackground(e.target)) return
  const containerRect = rootRef.value?.getBoundingClientRect()
  if (!containerRect) return
  contextMenu.x = e.clientX - containerRect.left
  contextMenu.y = e.clientY - containerRect.top
  contextMenu.targetId = elId ?? null
  contextMenu.visible = true

  // 点击其他区域关闭：先清理旧监听器防止重复绑定
  window.removeEventListener('mousedown', closeContextMenu)
  setTimeout(() => {
    window.addEventListener('mousedown', closeContextMenu, { once: true })
  }, 0)
}

function closeContextMenu() {
  contextMenu.visible = false
  window.removeEventListener('mousedown', closeContextMenu)
}

function handlePaste() {
  contextMenu.visible = false
  if (props.hasClipboard) emit('paste')
}

function handleSelectAll() {
  contextMenu.visible = false
  emit('select-all')
}

function handleClearSelection() {
  contextMenu.visible = false
  emit('clear-selection')
}

/** 元素右键菜单动作派发 */
function emitAction(action: string, arg?: string) {
  contextMenu.visible = false
  if (action === 'copy') emit('copy')
  else if (action === 'cut') emit('cut')
  else if (action === 'paste') emit('paste')
  else if (action === 'delete') emit('delete')
  else if (action === 'move-layer') emit('move-layer', arg!)
  else if (action === 'group') emit('group')
  else if (action === 'ungroup' && props.selectedElementHasGroup) emit('ungroup')
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMarqueeMove)
  window.removeEventListener('mouseup', onMarqueeUp)
})
</script>

<style scoped>
.canvas-area {
  flex: 1;
  overflow: auto;
  /* 制图垫：略深冷灰 + 极淡点阵，让白纸浮起 */
  background-color: var(--pd-canvas-bg, #e6e9f0);
  background-image: radial-gradient(circle, rgba(23, 32, 60, .13) 1px, transparent 1.2px);
  background-size: 20px 20px;
  background-position: center;
  padding: 44px 28px 32px 44px;
  position: relative;
}
.canvas-scroll {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  position: relative;
  margin: 0 auto;
  width: fit-content;
}
/* 叠层对比 */
.overlay-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 100;
}
.overlay-image {
  width: 100%;
  display: block;
}
/* 框选选框 */
.marquee-selection {
  position: fixed;
  border: 1.5px solid rgba(22, 93, 255, 0.7);
  background: rgba(22, 93, 255, 0.08);
  border-radius: 2px;
  pointer-events: none;
  z-index: 10000;
}
/* 右键菜单 */
.context-menu {
  position: absolute;
  background: var(--pd-surface, #ffffff);
  border: 1px solid var(--pd-border-soft, #e9ecf2);
  border-radius: 8px;
  box-shadow: var(--pd-shadow-md, 0 10px 28px rgba(23, 32, 60, .12));
  padding: 5px;
  z-index: 10001;
  min-width: 132px;
}
.context-menu-item {
  padding: 7px 12px;
  border-radius: 5px;
  font-size: 12.5px;
  cursor: pointer;
  color: var(--pd-text, #2a2e37);
  user-select: none;
  transition: background .12s ease, color .12s ease;
}
.context-menu-item:hover {
  background: var(--pd-accent-soft, rgba(22, 93, 255, .09));
  color: var(--pd-accent, #165DFF);
}
.context-menu-item.disabled {
  color: var(--pd-text-faint, #b4b9c4);
  cursor: not-allowed;
}
.context-menu-item.disabled:hover {
  background: transparent;
  color: var(--pd-text-faint, #b4b9c4);
}
.context-menu-sep {
  height: 1px;
  background: var(--pd-border-soft, #e9ecf2);
  margin: 5px 8px;
}
</style>
