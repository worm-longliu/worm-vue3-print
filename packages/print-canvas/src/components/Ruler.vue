<template>
  <canvas ref="canvasRef" class="pd-ruler" :style="cssSize" @mousedown="onDown" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { buildRulerTicks } from '../utils/ruler'

const MM_TO_PX = 96 / 25.4
const THICKNESS = 16

const props = defineProps<{
  orientation: 'horizontal' | 'vertical'
  lengthMM: number
  scale?: number
}>()
const emit = defineEmits<{ 'add-guide': [type: 'vertical' | 'horizontal', positionMm: number] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

const cssSize = computed(() => {
  if (props.orientation === 'horizontal') {
    return { width: props.lengthMM + 'mm', height: THICKNESS + 'px' }
  }
  return { width: THICKNESS + 'px', height: props.lengthMM + 'mm' }
})

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const lengthPx = props.lengthMM * MM_TO_PX
  const horizontal = props.orientation === 'horizontal'
  canvas.width = (horizontal ? lengthPx : THICKNESS) * dpr
  canvas.height = (horizontal ? THICKNESS : lengthPx) * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)

  const style = getComputedStyle(canvas)
  const bg = style.getPropertyValue('--pd-ruler-bg').trim() || '#FFFFFF'
  const fg = style.getPropertyValue('--pd-ruler').trim() || '#9CA3AF'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, horizontal ? lengthPx : THICKNESS, horizontal ? THICKNESS : lengthPx)

  ctx.strokeStyle = fg
  ctx.fillStyle = fg
  ctx.lineWidth = 1
  ctx.font = '8px ui-monospace, Menlo, monospace'

  for (const tick of buildRulerTicks(props.lengthMM)) {
    const pos = Math.round(tick.mm * MM_TO_PX) + 0.5
    const len = tick.major ? 8 : 4
    ctx.beginPath()
    if (horizontal) {
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, len)
    } else {
      ctx.moveTo(0, pos)
      ctx.lineTo(len, pos)
    }
    ctx.stroke()
    if (tick.major && tick.label) {
      if (horizontal) {
        ctx.fillText(tick.label, pos + 2, 14)
      } else {
        ctx.save()
        ctx.translate(12, pos + 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(tick.label, -ctx.measureText(tick.label).width, 0)
        ctx.restore()
      }
    }
  }
}

watch(() => [props.lengthMM, props.orientation], draw)
onMounted(draw)

// ─── 拖出生成参考线 ───
let dragging = false
function onDown(e: MouseEvent) {
  dragging = true
  e.preventDefault()
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
function onMove() {
  // 拖动中不显示预览,mouseup 时生成
}
function onUp(e: MouseEvent) {
  if (!dragging) return
  dragging = false
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const s = props.scale ?? 1
  const offset = props.orientation === 'horizontal'
    ? (e.clientX - rect.left) / s
    : (e.clientY - rect.top) / s
  const posMM = offset / MM_TO_PX
  if (posMM > 0 && posMM < props.lengthMM) {
    emit('add-guide', props.orientation === 'horizontal' ? 'horizontal' : 'vertical', posMM)
  }
}
</script>

<style scoped>
.pd-ruler {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: auto;
  cursor: crosshair;
  z-index: 5;
  display: block;
}
/* 横尺压下沿、竖尺压右沿，构成 L 型制图尺框 */
.pd-ruler:nth-of-type(1) {
  box-shadow: 0 1px 0 var(--pd-border-soft, #e9ecf2);
}
.pd-ruler:nth-of-type(2) {
  box-shadow: 1px 0 0 var(--pd-border-soft, #e9ecf2);
}
</style>
