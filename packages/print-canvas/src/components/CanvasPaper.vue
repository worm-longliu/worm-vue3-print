<template>
  <div
    class="hiprint-printPaper"
    :style="paperStyle"
  >
    <div
      class="hiprint-printPaper-content"
      ref="contentRef"
      :style="contentStyle"
    >
      <!-- 刻度标尺 -->
      <template v-if="showRulerComputed">
        <Ruler orientation="horizontal" :length-m-m="paperWidthMM" :scale="scale" @add-guide="(t: 'vertical' | 'horizontal', p: number) => emit('add-guide', t, p)" />
        <Ruler orientation="vertical" :length-m-m="paperHeightMM" :scale="scale" @add-guide="(t: 'vertical' | 'horizontal', p: number) => emit('add-guide', t, p)" />
      </template>
      <!-- 网格背景 -->
      <div
        v-if="showGrid && designMode"
        class="grid-bg"
        :style="gridBgStyle"
      />
      <!-- 吸附高亮指示点(吸附发生时闪烁) -->
      <div
        v-if="snapIndicator"
        :key="snapIndicator.key"
        class="snap-indicator"
        :style="{
          left: snapIndicator.left + 'mm',
          top: snapIndicator.top + 'mm',
        }"
      />

      <!-- 水印渲染层（在所有元素之下） -->
      <div
        v-if="watermarkVisible"
        class="watermark-layer"
        :style="watermarkStyle"
      />

      <!-- ─── 三段式区域层：上边距→页眉→内容→页脚→下边距 ─── -->
      <!-- 页眉层 -->
      <div
        class="zone-layer zone-header"
        :class="{ 'design-mode': designMode }"
        :style="layerStyle(zoneRectsMM.header)"
      >
        <span v-if="designMode" class="zone-label">页眉</span>
        <BaseElement
          v-for="el in headerElements"
          :key="el.id"
          :element="el"
          :design-mode="designMode"
          :print-data="printData"
          :scale="scale"
          :all-elements="headerElements"
          :snap-to-grid="snapToGrid"
          :show-table-ghost-border="showTableGhostBorder"
          zone="header"
          :adsorb-handler="requestAdsorb"
          :clear-adsorb-guides="clearGuides"
          @select="onSelectElement"
          @drag-start="$emit('drag-start')"
          @drag-stop="$emit('drag-stop')"
          @dblclick-element="(id: string) => $emit('dblclick-element', id)"
          @dblclick-cell="(id: string, r: number, c: number) => $emit('dblclick-cell', id, r, c)"
          @contextmenu="(id: string, e: MouseEvent) => $emit('contextmenu', id, e)"
          @clone-element="(el, pos) => $emit('clone-element', el, pos)"
        />
        <div
          v-if="designMode"
          class="zone-resize-handle handle-bottom"
          @mousedown.prevent.stop="startZoneResize('header', $event)"
        >
          <div v-if="zoneResizing?.zone === 'header'" class="zone-height-tip">
            {{ templateData.header.height.toFixed(1) }}mm
          </div>
        </div>
      </div>

      <!-- 内容层 -->
      <div
        class="zone-layer zone-content"
        :class="{ 'design-mode': designMode }"
        :style="layerStyle(zoneRectsMM.content)"
      >
        <!-- 首页叠加占位（本次不可编辑） -->
        <div
          v-if="designMode && templateData.firstPageOverlay.height > 0"
          class="zone-overlay"
          :style="{ height: templateData.firstPageOverlay.height + 'mm' }"
        >
          <span class="zone-label">首页叠加</span>
        </div>
        <BaseElement
          v-for="el in contentElements"
          :key="el.id"
          :element="el"
          :design-mode="designMode"
          :print-data="printData"
          :scale="scale"
          :all-elements="contentElements"
          :snap-to-grid="snapToGrid"
          :show-table-ghost-border="showTableGhostBorder"
          zone="content"
          :adsorb-handler="requestAdsorb"
          :clear-adsorb-guides="clearGuides"
          @select="onSelectElement"
          @drag-start="$emit('drag-start')"
          @drag-stop="$emit('drag-stop')"
          @dblclick-element="(id: string) => $emit('dblclick-element', id)"
          @dblclick-cell="(id: string, r: number, c: number) => $emit('dblclick-cell', id, r, c)"
          @contextmenu="(id: string, e: MouseEvent) => $emit('contextmenu', id, e)"
          @clone-element="(el, pos) => $emit('clone-element', el, pos)"
        />
      </div>

      <!-- 页脚层 -->
      <div
        class="zone-layer zone-footer"
        :class="{ 'design-mode': designMode }"
        :style="layerStyle(zoneRectsMM.footer)"
      >
        <span v-if="designMode" class="zone-label">页脚</span>
        <BaseElement
          v-for="el in footerElements"
          :key="el.id"
          :element="el"
          :design-mode="designMode"
          :print-data="printData"
          :scale="scale"
          :all-elements="footerElements"
          :snap-to-grid="snapToGrid"
          :show-table-ghost-border="showTableGhostBorder"
          zone="footer"
          :adsorb-handler="requestAdsorb"
          :clear-adsorb-guides="clearGuides"
          @select="onSelectElement"
          @drag-start="$emit('drag-start')"
          @drag-stop="$emit('drag-stop')"
          @dblclick-element="(id: string) => $emit('dblclick-element', id)"
          @dblclick-cell="(id: string, r: number, c: number) => $emit('dblclick-cell', id, r, c)"
          @contextmenu="(id: string, e: MouseEvent) => $emit('contextmenu', id, e)"
          @clone-element="(el, pos) => $emit('clone-element', el, pos)"
        />
        <div
          v-if="designMode"
          class="zone-resize-handle handle-top"
          @mousedown.prevent.stop="startZoneResize('footer', $event)"
        >
          <div v-if="zoneResizing?.zone === 'footer'" class="zone-height-tip">
            {{ templateData.footer.height.toFixed(1) }}mm
          </div>
        </div>
      </div>

      <!-- 吸附引导线（v-for 渲染，拖拽结束后自动清除） -->
      <div
        v-for="(line, idx) in guideLines"
        :key="idx"
        class="adsorb-guide"
        :class="[`guide-${line.type}`]"
        :style="line.type === 'vertical'
          ? { left: line.position + 'mm', top: '0', height: guidePaperSize.height + 'mm', borderLeftColor: line.color || 'var(--pd-accent-secondary, #f56c6c)' }
          : { top: line.position + 'mm', left: '0', width: guidePaperSize.width + 'mm', borderTopColor: line.color || 'var(--pd-accent-secondary, #f56c6c)' }"
      />
      <!-- 手动参考线(常驻,可拖动/双击删除) -->
      <div
        v-for="g in guides"
        :key="'mg-' + g.id"
        class="manual-guide"
        :class="[`guide-${g.type}`]"
        :style="g.type === 'vertical'
          ? { left: g.position + 'mm', top: '0', height: paperHeightMM + 'mm' }
          : { top: g.position + 'mm', left: '0', width: paperWidthMM + 'mm' }"
        @mousedown.prevent.stop="onGuideDown($event, g)"
        @dblclick.prevent.stop="g.id && emit('guide-remove', g.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import type { RuntimeElement, TemplateData, ElementRect, ElementZone, AlignLine } from '../types'
import { getPaperDimensions } from '../utils/default-config'
import BaseElement from './elements/BaseElement.vue'
import Ruler from './Ruler.vue'
import { useAdsorbManager } from '../composables/useAdsorbManager'

const props = defineProps<{
  templateData: TemplateData
  runtimeElements: RuntimeElement[]
  designMode?: boolean
  printData?: Record<string, any>[]
  scale?: number
  showRuler?: boolean
  showGrid?: boolean
  snapToGrid?: boolean
  showTableGhostBorder?: boolean
  guides?: AlignLine[]
}>()

const emit = defineEmits<{
  select: [id: string, multiple: boolean]
  'drag-start': []
  'drag-stop': []
  'dblclick-element': [id: string]
  'dblclick-cell': [elementId: string, r: number, c: number]
  'contextmenu': [id: string, e: MouseEvent]
  'zone-height-change': [zone: 'header' | 'footer', height: number]
  'zone-height-commit': [zone: 'header' | 'footer']
  'add-guide': [type: 'vertical' | 'horizontal', positionMm: number]
  'guide-move': [id: string, positionMm: number]
  'guide-remove': [id: string]
  'clone-element': [element: RuntimeElement, position: { left: number; top: number }]
}>()

const contentRef = ref<HTMLElement | null>(null)

/** 根据纸张尺寸和方向计算宽高（mm） */
const paperWidthMM = computed(() => {
  return getPaperDimensions(props.templateData).width
})
const paperHeightMM = computed(() => {
  return getPaperDimensions(props.templateData).height
})

/** 三区矩形（mm，纸面坐标系）：上边距→页眉→内容→页脚→下边距 */
const zoneRectsMM = computed(() => {
  const m = props.templateData.margins
  const headerH = props.templateData.header.height
  const footerH = props.templateData.footer.height
  const contentW = paperWidthMM.value - m.left - m.right
  return {
    header: { left: m.left, top: m.top, width: contentW, height: headerH },
    content: {
      left: m.left,
      top: m.top + headerH,
      width: contentW,
      height: paperHeightMM.value - m.top - m.bottom - headerH - footerH,
    },
    footer: {
      left: m.left,
      top: paperHeightMM.value - m.bottom - footerH,
      width: contentW,
      height: footerH,
    },
  }
})

function layerStyle(r: { left: number; top: number; width: number; height: number }) {
  return {
    position: 'absolute' as const,
    left: r.left + 'mm',
    top: r.top + 'mm',
    width: r.width + 'mm',
    height: r.height + 'mm',
  }
}

// 优化：一次遍历完成三区分类，避免三次全量 filter
const zoneElements = computed(() => {
  const result = { header: [] as RuntimeElement[], footer: [] as RuntimeElement[], content: [] as RuntimeElement[] }
  for (const el of props.runtimeElements) {
    if (el.zone === 'header') result.header.push(el)
    else if (el.zone === 'footer') result.footer.push(el)
    else result.content.push(el)
  }
  return result
})
const headerElements = computed(() => zoneElements.value.header)
const footerElements = computed(() => zoneElements.value.footer)
const contentElements = computed(() => zoneElements.value.content)

// 吸附管理器：仅同区元素间吸附，引导线通过 Vue 响应式渲染
let currentDragZone: ElementZone = 'content'

const { requestAdsorb: rawRequestAdsorb, clearGuides, guideLines, paperSize: guidePaperSize } = useAdsorbManager({
  // 优化：直接使用预计算的 zoneElements，避免每次拖拽都 filter
  getElements: () => zoneElements.value[currentDragZone],
  getPaperSize: () => {
    const r = zoneRectsMM.value[currentDragZone]
    return { width: r.width, height: r.height }
  },
  getGuides: () => {
    const v: number[] = [], h: number[] = []
    for (const g of props.guides ?? []) {
      if (g.type === 'vertical') v.push(g.position)
      else h.push(g.position)
    }
    return { vertical: v, horizontal: h }
  },
})

function requestAdsorb(rect: ElementRect): ReturnType<typeof rawRequestAdsorb> {
  const el = props.runtimeElements.find(e => e.id === rect.id)
  currentDragZone = el?.zone || 'content'
  const result = rawRequestAdsorb(rect)
  // 位置被修正即发生吸附,在元素中心闪烁网格高亮点
  if (result.left !== rect.left || result.top !== rect.top) {
    showSnapIndicator(result.left + rect.width / 2, result.top + rect.height / 2)
  }
  return result
}

/** 拖动手动参考线 */
function onGuideDown(e: MouseEvent, g: AlignLine) {
  const startPt = g.position
  const startX = e.clientX, startY = e.clientY
  const s = props.scale ?? 1
  const MM_PER_PX = 25.4 / 96
  const onMove = (ev: MouseEvent) => {
    const delta = (g.type === 'vertical' ? (ev.clientX - startX) : (ev.clientY - startY)) / s * MM_PER_PX
    emit('guide-move', g.id!, startPt + delta)
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

const paperStyle = computed(() => ({
  width: paperWidthMM.value + 'mm',
  minHeight: paperHeightMM.value + 'mm',
  background: 'var(--pd-paper, #fff)',
  boxShadow: 'var(--pd-shadow-paper, 0 1px 2px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.08))',
  margin: '0 auto',
  overflow: 'hidden',
  position: 'relative' as const,
  transform: props.scale ? `scale(${props.scale})` : undefined,
  transformOrigin: '0 0',
}))

const contentStyle = computed(() => {
  const m = props.templateData.margins
  return {
    padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`,
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
    minHeight: paperHeightMM.value + 'mm',
  }
})

const showRulerComputed = computed(() => props.showRuler !== false && !!props.designMode)

const gridBgStyle = computed(() => {
  const size = 5 // mm
  // 虚线网格：SVG 平铺图案，颜色调淡避免干扰元素视觉
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M0 .5H20M.5 0V20" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1" stroke-dasharray="4 4"/></svg>`
  return {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${size}mm ${size}mm`,
    backgroundPosition: '0 0',
  }
})

// ─── 吸附高亮指示 ───
let snapSeq = 0
let snapTimer: ReturnType<typeof setTimeout> | null = null
const snapIndicator = ref<{ left: number; top: number; key: number } | null>(null)

/** 在吸附对齐位置闪烁一个高亮点 */
function showSnapIndicator(left: number, top: number) {
  snapSeq += 1
  snapIndicator.value = { left, top, key: snapSeq }
  if (snapTimer) clearTimeout(snapTimer)
  snapTimer = setTimeout(() => {
    snapIndicator.value = null
  }, 300)
}

// ─── 水印渲染 ───
const watermarkVisible = computed(() => {
  const w = props.templateData.watermark
  if (!w) return false
  // 向后兼容：如果没有 mode 字段，使用 content
  if (!w.mode || w.mode === 'fixed') {
    return !!w.content && w.content.trim().length > 0
  }
  // 绑定字段模式
  return !!w.binding
})

const watermarkStyle = computed(() => {
  const w = props.templateData.watermark || {}
  const color = w.color || '#cccccc'
  const opacity = w.opacity ?? 0.15
  const rotate = w.rotate ?? -30
  // 获取水印文本
  let text = getWatermarkText(w)
  if (w.timestamp) {
    const now = new Date()
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    text = text ? `${text} ${ts}` : ts
  }
  return {
    position: 'absolute' as const,
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none' as const,
    zIndex: '0',
    overflow: 'hidden',
    opacity: String(opacity),
    backgroundImage: buildWatermarkSvg(text, color, rotate),
    backgroundRepeat: 'repeat',
  }
})

/** 获取水印文本（支持绑定字段） */
function getWatermarkText(w: { mode?: 'fixed' | 'binding'; content?: string; binding?: string; testData?: string }): string {
  // 向后兼容：如果没有 mode 字段，使用 content
  if (!w.mode || w.mode === 'fixed') {
    return w.content || ''
  }
  // 绑定字段模式
  if (w.binding) {
    // 从打印数据中取值
    const printData = props.printData?.[0]
    if (printData && printData[w.binding] !== undefined && printData[w.binding] !== null) {
      return String(printData[w.binding])
    }
    // 回退到测试值
    return w.testData || `[${w.binding}]`
  }
  return ''
}

/** 用内联 SVG 生成水印背景图案 */
function buildWatermarkSvg(text: string, color: string, rotate: number): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="180">
    <text x="130" y="90" font-size="16" fill="${color}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rotate},130,90)">${escaped}</text>
  </svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// ─── 页眉/页脚高度拖拽 ───
const zoneResizing = ref<{ zone: 'header' | 'footer'; startY: number; startH: number } | null>(null)

function startZoneResize(zone: 'header' | 'footer', e: MouseEvent) {
  // 防止重复绑定：先清理再绑定
  cleanupZoneResize()
  zoneResizing.value = { zone, startY: e.clientY, startH: props.templateData[zone].height }
  window.addEventListener('mousemove', onZoneResizeMove)
  window.addEventListener('mouseup', onZoneResizeUp)
}

function onZoneResizeMove(e: MouseEvent) {
  if (!zoneResizing.value) return
  const { zone, startY, startH } = zoneResizing.value
  const dyPx = (e.clientY - startY) / (props.scale || 1)
  const dyMM = dyPx * 25.4 / 96
  const delta = zone === 'header' ? dyMM : -dyMM
  // 0.1mm 步进；上限 100mm 与属性面板一致，且保证内容区至少 10mm
  const maxH = Math.min(
    100,
    paperHeightMM.value - props.templateData.margins.top - props.templateData.margins.bottom
      - (zone === 'header' ? props.templateData.footer.height : props.templateData.header.height)
      - 10,
  )
  const h = Math.min(maxH, Math.max(0, Math.round((startH + delta) * 10) / 10))
  emit('zone-height-change', zone, h)
}

function onZoneResizeUp() {
  if (!zoneResizing.value) return
  const zone = zoneResizing.value.zone
  zoneResizing.value = null
  window.removeEventListener('mousemove', onZoneResizeMove)
  window.removeEventListener('mouseup', onZoneResizeUp)
  emit('zone-height-commit', zone)
}

/** 清理区域拖拽事件监听器 */
function cleanupZoneResize() {
  window.removeEventListener('mousemove', onZoneResizeMove)
  window.removeEventListener('mouseup', onZoneResizeUp)
  zoneResizing.value = null
}

onUnmounted(() => {
  cleanupZoneResize()
  if (snapTimer) clearTimeout(snapTimer)
})

function onSelectElement(id: string, multiple: boolean) {
  emit('select', id, multiple)
}

defineExpose({ contentRef })
</script>

<style scoped>
/* 纸张缩放平滑过渡(配合鼠标位置缩放中心) */
.hiprint-printPaper {
  transition: transform 0.15s ease-out;
}
/* ─── 三段式区域层 ─── */
.zone-layer {
  box-sizing: border-box;
}
.zone-layer.zone-header.design-mode,
.zone-layer.zone-footer.design-mode {
  outline: 1px dashed var(--pd-ink-green, #67c23a);
  background: rgba(103, 194, 58, 0.04);
}
.zone-layer.zone-content.design-mode {
  outline: 1px dashed #C3C9D6;
}
.zone-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  outline: 1px dashed #06B6D4;
  background: rgba(6, 182, 212, 0.04);
  box-sizing: border-box;
  pointer-events: none;
  z-index: 1;
}
.zone-label {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 9px;
  color: #909399;
  pointer-events: none;
  user-select: none;
}
/* 区域高度拖拽手柄 */
.zone-resize-handle {
  position: absolute;
  left: 0;
  width: 100%;
  height: 6px;
  cursor: ns-resize;
  z-index: 5;
}
.zone-resize-handle.handle-bottom {
  bottom: -3px;
}
.zone-resize-handle.handle-top {
  top: -3px;
}
.zone-resize-handle:hover {
  background: rgba(16, 185, 129, 0.25);
}
.zone-height-tip {
  position: absolute;
  right: 4px;
  top: -22px;
  padding: 1px 6px;
  font-size: 11px;
  color: #fff;
  background: #10B981;
  border-radius: 3px;
  white-space: nowrap;
  pointer-events: none;
}
/* 刻度标尺由 Ruler.vue Canvas 绘制 */
.grid-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}
/* 吸附高亮指示点 */
.snap-indicator {
  position: absolute;
  width: 6px;
  height: 6px;
  background: var(--pd-accent, #165DFF);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
  animation: snap-pulse 0.3s ease-out;
}
@keyframes snap-pulse {
  from { transform: translate(-50%, -50%) scale(2); opacity: 0.5; }
  to { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}
/* 水印层 */
.watermark-layer {
  pointer-events: none;
}
/* 吸附引导线 */
.adsorb-guide {
  position: absolute;
  pointer-events: none;
  z-index: 9999;
}
.adsorb-guide.guide-vertical {
  border-left: 1px dashed var(--pd-accent-secondary, #f56c6c);
}
.adsorb-guide.guide-horizontal {
  border-top: 1px dashed var(--pd-accent-secondary, #f56c6c);
}
/* 手动参考线 */
.manual-guide { position: absolute; pointer-events: auto; z-index: 9998; cursor: move; }
.manual-guide.guide-vertical { border-left: 1px solid #3B82F6; width: 0; }
.manual-guide.guide-horizontal { border-top: 1px solid #3B82F6; height: 0; }
.manual-guide:hover { border-color: #EF4444 !important; }
</style>
