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
    @scroll="onScroll"
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

    <!-- 视口固定式标尺：不随纸张滚动/缩放，刻度随滚动平移 -->
    <div v-if="showRuler" class="ruler-overlay" :style="overlayStyle">
      <div class="ruler-corner" />
      <Ruler
        orientation="horizontal"
        :viewport-px="rulerGeom.viewW"
        :origin-px="rulerGeom.originX"
        :paper-length-m-m="paperWidthMM"
        :scale="rulerGeom.paperScale"
        :cursor-px="rulerCursor.x"
        @add-guide="(t: 'vertical' | 'horizontal', p: number) => emit('add-guide', t, p)"
        @guide-dragging="(mm: number | null) => onGuideDragging('vertical', mm)"
      />
      <Ruler
        orientation="vertical"
        :viewport-px="rulerGeom.viewH"
        :origin-px="rulerGeom.originY"
        :paper-length-m-m="paperHeightMM"
        :scale="rulerGeom.paperScale"
        :cursor-px="rulerCursor.y"
        @add-guide="(t: 'vertical' | 'horizontal', p: number) => emit('add-guide', t, p)"
        @guide-dragging="(mm: number | null) => onGuideDragging('horizontal', mm)"
      />
    </div>
    <!-- 从标尺拖出参考线时的预览虚线（fixed 定位，不能放进带 transform 的 overlay） -->
    <div
      v-if="guidePreview"
      class="ruler-guide-preview"
      :class="`guide-${guidePreview.type}`"
      :style="guidePreviewStyle"
    />

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
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { RuntimeElement, TemplateData, AlignLine } from '../types'
import { pxToMm, mmToPx } from '../utils/units'
import { nextWheelScale, FIT_SCALE_MIN_PERCENT } from '../utils/scale'
import { getPaperDimensions } from '../utils/default-config'
import { RULER_THICKNESS } from '../utils/ruler'
import CanvasPaper from './CanvasPaper.vue'
import Ruler from './Ruler.vue'

const props = withDefaults(defineProps<{
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
  /** 是否显示视口固定标尺，默认开启 */
  showRuler?: boolean
}>(), {
  showRuler: true,
})

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

// ─── 视口固定标尺：纸张几何测量与滚动/缩放同步 ───
const paperWidthMM = computed(() => getPaperDimensions(props.templateData).width)
const paperHeightMM = computed(() => getPaperDimensions(props.templateData).height)

/** 纸张原点相对各尺条起点的屏幕偏移 + 尺条可见长度 */
const rulerGeom = reactive({ originX: 0, originY: 0, viewW: 0, viewH: 0, paperScale: 1 })
/** 鼠标相对各尺条起点的屏幕位置，驱动尺上指示线 */
const rulerCursor = reactive<{ x: number | null; y: number | null }>({ x: null, y: null })
/** 滚动偏移：绝对定位的标尺层会随滚动内容移动，用同向 transform 补偿以保持视口固定 */
const scrollPos = reactive({ x: 0, y: 0 })
const overlayStyle = computed(() => ({
  transform: `translate(${scrollPos.x}px, ${scrollPos.y}px)`,
}))

function measureRuler() {
  const area = rootRef.value
  // 读取纸张本体而非 wrapper：缩放时 wrapper 尺寸立即变为目标值，
  // 纸张本体有 150ms transform 过渡，标尺需要跟随实时视觉位置与比例。
  const paper = area?.querySelector('.hiprint-printPaper') as HTMLElement | null
  if (!area || !paper) return
  const ar = area.getBoundingClientRect()
  const pr = paper.getBoundingClientRect()
  const targetScale = props.scale || 1
  const measuredScale = pr.width / mmToPx(paperWidthMM.value)
  // 过渡终点附近消除子像素误差，静止时保持与业务 scale 完全一致
  rulerGeom.paperScale = Math.abs(measuredScale - targetScale) < 0.002
    ? targetScale
    : measuredScale
  rulerGeom.originX = pr.left - ar.left - RULER_THICKNESS
  rulerGeom.originY = pr.top - ar.top - RULER_THICKNESS
  rulerGeom.viewW = area.clientWidth - RULER_THICKNESS
  rulerGeom.viewH = area.clientHeight - RULER_THICKNESS
}

function onScroll() {
  scrollPos.x = rootRef.value?.scrollLeft ?? 0
  scrollPos.y = rootRef.value?.scrollTop ?? 0
  measureRuler()
}

let resizeObserver: ResizeObserver | null = null
/** 缩放切换后纸张有 150ms CSS 过渡，期间持续重测，刻度才不会跳变 */
let scaleMeasureRaf = 0
function startScaleMeasureLoop() {
  cancelAnimationFrame(scaleMeasureRaf)
  const endAt = performance.now() + 220
  const loop = () => {
    measureRuler()
    if (performance.now() < endAt) scaleMeasureRaf = requestAnimationFrame(loop)
  }
  scaleMeasureRaf = requestAnimationFrame(loop)
}

/** 从标尺拖出参考线的预览态（纸面 mm 坐标） */
const guidePreview = ref<{ type: 'vertical' | 'horizontal'; mm: number } | null>(null)
function onGuideDragging(type: 'vertical' | 'horizontal', mm: number | null) {
  guidePreview.value = mm === null ? null : { type, mm }
}
const guidePreviewStyle = computed(() => {
  const g = guidePreview.value
  const paper = rootRef.value?.querySelector('.hiprint-printPaper') as HTMLElement | null
  if (!g || !paper) return {}
  // position: fixed，直接采用视口坐标（与框选选框一致）
  const pr = paper.getBoundingClientRect()
  const liveScale = pr.width / mmToPx(paperWidthMM.value)
  const along = mmToPx(g.mm) * (liveScale > 0 ? liveScale : (props.scale || 1))
  if (g.type === 'vertical') {
    return { left: pr.left + along + 'px', top: pr.top + 'px', height: pr.height + 'px' }
  }
  return { left: pr.left + 'px', top: pr.top + along + 'px', width: pr.width + 'px' }
})

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
  const area = rootRef.value
  const paper = area?.querySelector('.hiprint-printPaper') as HTMLElement | null
  if (!area || !paper) return
  const areaRect = area.getBoundingClientRect()
  rulerCursor.x = e.clientX - areaRect.left - RULER_THICKNESS
  rulerCursor.y = e.clientY - areaRect.top - RULER_THICKNESS
  const rect = paper.getBoundingClientRect()
  const s = props.scale || 1
  const xMm = pxToMm((e.clientX - rect.left) / s)
  const yMm = pxToMm((e.clientY - rect.top) / s)
  if (xMm < 0 || yMm < 0) { emit('coordinate', null); return }
  emit('coordinate', { x: xMm, y: yMm })
}
function onMouseLeave() {
  emit('coordinate', null)
  rulerCursor.x = null
  rulerCursor.y = null
}

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

// ─── 适应窗口:一步到位(调用方已算好目标比例),以视口中心为锚点,
//    与 Ctrl+滚轮同一管线;平滑动画由纸张 150ms transform 过渡自然产生 ───
function fitToWindow(targetPercent: number) {
  const container = rootRef.value
  if (!container) return
  const target = Math.max(FIT_SCALE_MIN_PERCENT, Math.round(targetPercent))
  const cur = Math.round((props.scale || 1) * 100)
  if (target === cur) return

  // 锚点取视口几何中心(相对内容原点,扣除容器 padding),与 onWheel 换算一致
  const oldScale = props.scale || 1
  const newScale = target / 100
  const ratio = newScale / oldScale
  const cs = getComputedStyle(container)
  const padX = parseFloat(cs.paddingLeft) || 0
  const padY = parseFloat(cs.paddingTop) || 0
  const mouseX = container.clientWidth / 2
  const mouseY = container.clientHeight / 2
  const ax = container.scrollLeft + mouseX - padX
  const ay = container.scrollTop + mouseY - padY

  emit('zoom', target - cur)
  void nextTick(() => {
    const cs2 = getComputedStyle(container)
    const padX2 = parseFloat(cs2.paddingLeft) || 0
    const padY2 = parseFloat(cs2.paddingTop) || 0
    container.scrollLeft = ax * ratio - mouseX + padX2
    container.scrollTop = ay * ratio - mouseY + padY2
  })
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

onMounted(() => {
  nextTick(measureRuler)
  if (rootRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measureRuler)
    resizeObserver.observe(rootRef.value)
  }
})

watch(() => props.scale, startScaleMeasureLoop)
watch([paperWidthMM, paperHeightMM], () => nextTick(measureRuler))

/** 适应窗口后将滚动位置归中。
 *  纸张有 150ms CSS transform 过渡，期间 scrollWidth/Height 持续变化，
 *  用多帧检测数值稳定后再设置居中，避免固定 setTimeout 落在过渡中间。 */
function centerScroll() {
  const container = rootRef.value
  if (!container) return
  let stableFrames = 0
  let prevSW = 0, prevSH = 0
  const deadline = performance.now() + 800
  const loop = () => {
    const { scrollWidth: sw, scrollHeight: sh } = container
    if (sw === prevSW && sh === prevSH) {
      stableFrames++
    } else {
      stableFrames = 0
    }
    prevSW = sw; prevSH = sh
    if (stableFrames >= 2 || performance.now() > deadline) {
      const sw2 = container.scrollWidth, sh2 = container.scrollHeight
      const cw = container.clientWidth, ch = container.clientHeight
      container.scrollLeft = Math.max(0, (sw2 - cw) / 2)
      container.scrollTop  = Math.max(0, (sh2 - ch) / 2)
      return
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

defineExpose({ centerScroll, fitToWindow })

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMarqueeMove)
  window.removeEventListener('mouseup', onMarqueeUp)
  resizeObserver?.disconnect()
  cancelAnimationFrame(scaleMeasureRaf)
})
</script>

<style scoped>
.canvas-area {
  flex: 1;
  overflow: auto;
  /* flex + margin:auto：纸张在可视区内水平/垂直居中；内容超出容器时
     margin auto 自动退化为起点对齐，滚动条仍可达纸张两端 */
  display: flex;
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
  /* 禁 dock 到容器的收缩，部件宽高始终以纸张真实尺寸为准 */
  flex: none;
  margin: auto;
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

/* ─── 视口固定标尺 ─── */
.ruler-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 60;
}
.ruler-corner {
  position: absolute;
  top: 0;
  left: 0;
  width: 22px;
  height: 22px;
  background: var(--pd-ruler-bg, #f8f9fc);
  box-shadow: 1px 1px 0 var(--pd-border-soft, #e9ecf2);
  z-index: 2;
}
.ruler-overlay :deep(.pd-ruler.is-horizontal) {
  top: 0;
  left: 22px;
}
.ruler-overlay :deep(.pd-ruler.is-vertical) {
  top: 22px;
  left: 0;
}
/* 拖出参考线的预览虚线 */
.ruler-guide-preview {
  position: fixed;
  pointer-events: none;
  z-index: 9997;
}
.ruler-guide-preview.guide-vertical {
  width: 0;
  border-left: 1px dashed var(--pd-accent, #165dff);
}
.ruler-guide-preview.guide-horizontal {
  height: 0;
  border-top: 1px dashed var(--pd-accent, #165dff);
}
</style>
