<!--
  视口固定式标尺（单条）
  - 尺条固定在设计区边缘，不随纸张缩放/滚动；刻度随滚动平移、随缩放变密度
  - 横尺产生垂直参考线，竖尺产生水平参考线（与历史语义一致）
  - 在尺上按下并移动显示预览线，松开即生成参考线；主坐标超出尺长则取消
-->
<template>
  <canvas
    ref="canvasRef"
    class="pd-ruler"
    :class="`is-${orientation}`"
    :style="cssSize"
    @mousedown="onDown"
    @mousemove="onHoverMove"
    @mouseleave="onHoverLeave"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { mmToPx } from '../utils/units'
import {
  buildRulerTicks,
  chooseMajorStepMM,
  RULER_THICKNESS,
} from '../utils/ruler'

const props = defineProps<{
  orientation: 'horizontal' | 'vertical'
  /** 尺条可见长度（屏幕 px，不随缩放变化） */
  viewportPx: number
  /** 纸张 0mm 点相对尺条起点的屏幕偏移（滚动时由父级实时更新） */
  originPx: number
  /** 纸张该方向长度（mm），用于边界标记与参考线落点限制 */
  paperLengthMM: number
  scale: number
  /** 鼠标在尺条轴向上的位置（屏幕 px），由画布 mousemove 转发 */
  cursorPx?: number | null
}>()

const emit = defineEmits<{
  'add-guide': [type: 'vertical' | 'horizontal', positionMm: number]
  /** 拖拽参考线过程中的虚线预览，null 表示隐藏 */
  'guide-dragging': [mm: number | null]
}>()

const horizontal = computed(() => props.orientation === 'horizontal')
/** 横尺界定横向位置，产生的是垂直参考线 */
const guideType = computed<'vertical' | 'horizontal'>(() =>
  horizontal.value ? 'vertical' : 'horizontal',
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
/** 鼠标悬停在尺条上的轴向位置（优先于外部传入的 cursorPx） */
const hoverPx = ref<number | null>(null)
const effectiveCursorPx = computed(() => hoverPx.value ?? props.cursorPx ?? null)

const cssSize = computed(() => {
  if (horizontal.value) {
    return { width: props.viewportPx + 'px', height: RULER_THICKNESS + 'px' }
  }
  return { width: RULER_THICKNESS + 'px', height: props.viewportPx + 'px' }
})

let rafId = 0
function scheduleDraw() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    draw()
  })
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  // happy-dom 等无 canvas 环境直接跳过绘制
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const length = Math.max(0, Math.round(props.viewportPx))
  const thickness = RULER_THICKNESS
  canvas.width = (horizontal.value ? length : thickness) * dpr
  canvas.height = (horizontal.value ? thickness : length) * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const style = getComputedStyle(canvas)
  const bg = style.getPropertyValue('--pd-ruler-bg').trim() || '#F8F9FC'
  const fg = style.getPropertyValue('--pd-ruler').trim() || '#9AA1AF'
  const accent = style.getPropertyValue('--pd-accent').trim() || '#165DFF'

  // 背景
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, horizontal.value ? length : thickness, horizontal.value ? thickness : length)

  const s = props.scale > 0 ? props.scale : 1
  const pxPerMM = mmToPx(1) * s
  if (pxPerMM <= 0) return

  // 可见毫米范围（含纸张外区域）
  const startMM = -props.originPx / pxPerMM
  const endMM = (length - props.originPx) / pxPerMM
  const majorStep = chooseMajorStepMM(s)
  const ticks = buildRulerTicks(startMM, endMM, majorStep)

  // 纸外刻度淡化处理：先画纸外，再画纸内
  drawTicks(ctx, ticks, pxPerMM, fg, true)
  drawTicks(ctx, ticks, pxPerMM, fg, false)

  // 纸张 0 / 末端边界标记
  drawPaperEdge(ctx, 0, accent)
  drawPaperEdge(ctx, props.paperLengthMM, accent)

  // 鼠标位置指示线
  const cursor = effectiveCursorPx.value
  if (cursor !== null && cursor >= 0 && cursor <= length) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5
    ctx.beginPath()
    if (horizontal.value) {
      const x = Math.round(cursor) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, thickness)
    } else {
      const y = Math.round(cursor) + 0.5
      ctx.moveTo(0, y)
      ctx.lineTo(thickness, y)
    }
    ctx.stroke()
  }
}

function drawTicks(
  ctx: CanvasRenderingContext2D,
  ticks: ReturnType<typeof buildRulerTicks>,
  pxPerMM: number,
  fg: string,
  outside: boolean,
) {
  const thickness = RULER_THICKNESS
  ctx.strokeStyle = fg
  ctx.fillStyle = fg
  ctx.globalAlpha = outside ? 0.32 : 1
  ctx.lineWidth = 1
  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.textBaseline = 'top'

  for (const tick of ticks) {
    const isOutside = tick.mm < 0 || tick.mm > props.paperLengthMM
    if (isOutside !== outside) continue
    const pos = Math.round(props.originPx + tick.mm * pxPerMM) + 0.5
    const len = tick.major ? 8 : 4
    ctx.beginPath()
    if (horizontal.value) {
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, len)
    } else {
      ctx.moveTo(0, pos)
      ctx.lineTo(len, pos)
    }
    ctx.stroke()
    if (tick.major && tick.label) {
      if (horizontal.value) {
        ctx.fillText(tick.label, pos + 2, 11)
      } else {
        ctx.save()
        // 旋转 -90° 后，文字沿屏幕 +x 方向铺开（9px 字体约占 9px）。
        // x=11 时文字落在 11..20px，完整处于 22px 尺宽内，
        // 且与横尺标签（y=11）对称；此前 x=18 会延伸到 27px 被裁切。
        ctx.translate(11, pos + 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(tick.label, 0, 0)
        ctx.restore()
      }
    }
  }
  ctx.globalAlpha = 1
}

function drawPaperEdge(ctx: CanvasRenderingContext2D, mm: number, color: string) {
  const pxPerMM = mmToPx(1) * (props.scale > 0 ? props.scale : 1)
  const pos = Math.round(props.originPx + mm * pxPerMM) + 0.5
  if (pos <= 0 || pos >= props.viewportPx) return
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 1
  ctx.beginPath()
  if (horizontal.value) {
    ctx.moveTo(pos, 0)
    ctx.lineTo(pos, RULER_THICKNESS)
  } else {
    ctx.moveTo(0, pos)
    ctx.lineTo(RULER_THICKNESS, pos)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
}

watch(
  () => [props.viewportPx, props.originPx, props.paperLengthMM, props.scale, props.cursorPx, props.orientation],
  scheduleDraw,
)
onMounted(scheduleDraw)
onBeforeUnmount(() => { if (rafId) cancelAnimationFrame(rafId) })

// ─── 拖出参考线 ───
let dragging = false

function axialFromEvent(e: MouseEvent): number | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const along = horizontal.value ? e.clientX - rect.left : e.clientY - rect.top
  // 主坐标超出尺条长度（含两端）即视为取消；横向/纵向另一方向不限制，允许拖入纸面
  if (along < 0 || along > props.viewportPx) return null
  const pxPerMM = mmToPx(1) * (props.scale > 0 ? props.scale : 1)
  return (along - props.originPx) / pxPerMM
}

function onDown(e: MouseEvent) {
  dragging = true
  e.preventDefault()
  window.addEventListener('mousemove', onWinMove)
  window.addEventListener('mouseup', onWinUp)
  updateDragPreview(e)
}

function onHoverMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  hoverPx.value = horizontal.value ? e.clientX - rect.left : e.clientY - rect.top
  scheduleDraw()
}

function onHoverLeave() {
  hoverPx.value = null
  scheduleDraw()
}

function updateDragPreview(e: MouseEvent) {
  const mm = axialFromEvent(e)
  emit('guide-dragging', mm)
}

function onWinMove(e: MouseEvent) {
  if (!dragging) return
  updateDragPreview(e)
}

function onWinUp(e: MouseEvent) {
  if (!dragging) return
  dragging = false
  window.removeEventListener('mousemove', onWinMove)
  window.removeEventListener('mouseup', onWinUp)
  const mm = axialFromEvent(e)
  if (mm !== null && mm >= 0 && mm <= props.paperLengthMM) {
    emit('add-guide', guideType.value, mm)
  }
  emit('guide-dragging', null)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onWinMove)
  window.removeEventListener('mouseup', onWinUp)
})
</script>

<style scoped>
.pd-ruler {
  position: absolute;
  display: block;
  pointer-events: auto;
  cursor: crosshair;
  z-index: 1;
  background: var(--pd-ruler-bg, #f8f9fc);
}
.pd-ruler.is-horizontal {
  box-shadow: 0 1px 0 var(--pd-border-soft, #e9ecf2);
}
.pd-ruler.is-vertical {
  box-shadow: 1px 0 0 var(--pd-border-soft, #e9ecf2);
}
</style>
