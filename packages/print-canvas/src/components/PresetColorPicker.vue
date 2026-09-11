<template>
  <button
    ref="triggerRef"
    type="button"
    class="preset-color-trigger"
    :aria-expanded="visible"
    aria-haspopup="dialog"
    :title="modelValue || '自动'"
    @click="toggle"
  >
    <span class="preset-color-swatch" :style="{ background: normalizedValue }"></span>
  </button>

  <Teleport to="body">
    <div
      v-if="visible"
      ref="panelRef"
      class="preset-color-panel"
      role="dialog"
      aria-label="颜色选择"
      :style="panelStyle"
      @pointerdown.stop
    >
      <div class="picker-preview">
        <span class="picker-current" :style="{ background: activeColor }"></span>
        <input
          v-model="hexInput"
          class="picker-hex"
          type="text"
          maxlength="7"
          spellcheck="false"
          aria-label="颜色值"
          @input="onHexInput"
        />
      </div>

      <div
        ref="areaRef"
        class="picker-area"
        :style="{ '--picker-hue': `${Math.round(hue)}deg` }"
        aria-label="自定义颜色"
        tabindex="0"
        @pointerdown="startAreaDrag"
        @pointermove="moveAreaDrag"
        @pointerup="endAreaDrag"
        @pointercancel="endAreaDrag"
        @keydown="onAreaKeydown"
      >
        <span class="picker-handle" :style="{ left: `${saturation * 100}%`, top: `${(1 - value) * 100}%`, background: activeColor }"></span>
      </div>

      <input
        v-model.number="hueModel"
        class="picker-hue"
        type="range"
        min="0"
        max="360"
        step="1"
        aria-label="色相"
      />

      <div class="picker-heading">常用颜色</div>
      <div class="preset-color-grid">
        <button
          v-for="color in PRESET_COLORS"
          :key="color"
          type="button"
          class="preset-color-item"
          :class="{ active: color.toLowerCase() === activeColor.toLowerCase() }"
          :style="{ background: color }"
          :title="color"
          :aria-label="color"
          @click="select(color)"
        ></button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PRESET_COLORS } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const visible = ref(false)
const triggerRef = ref<HTMLElement>()
const panelRef = ref<HTMLElement>()
const areaRef = ref<HTMLElement>()
const panelStyle = ref<Record<string, string>>({})

const hue = ref(0)
const saturation = ref(0)
const value = ref(0)
const hexInput = ref('#000000')
const areaDragging = ref(false)

const normalizedValue = computed({
  get: () => props.modelValue || '#000000',
  set: (color: string) => emit('update:modelValue', color),
})

const activeColor = computed(() => {
  return rgbToHex(hsvToRgb(hue.value, saturation.value, value.value))
})

const hueModel = computed({
  get: () => Math.round(hue.value),
  set: (degree: number) => setHsv(clampDegree(degree), saturation.value, value.value),
})

watch(normalizedValue, syncFromColor, { immediate: true })

function select(color: string) {
  hexInput.value = color.toUpperCase()
  syncFromColor(color)
  emit('update:modelValue', color)
}

function onHexInput(event: Event) {
  const input = event.target as HTMLInputElement
  const color = input.value.trim()
  if (!parseHex(color)) return
  syncFromColor(color)
  emit('update:modelValue', normalizeHex(color))
}

function syncFromColor(color: string) {
  const rgb = parseHex(color)
  if (!rgb) return
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
  hue.value = hsv.h
  saturation.value = hsv.s
  value.value = hsv.v
  hexInput.value = normalizeHex(color).toUpperCase()
}

function setHsv(h: number, s: number, v: number) {
  hue.value = clampDegree(h)
  saturation.value = clamp01(s)
  value.value = clamp01(v)
  hexInput.value = activeColor.value.toUpperCase()
  emit('update:modelValue', activeColor.value)
}

function startAreaDrag(event: PointerEvent) {
  const area = event.currentTarget as HTMLElement
  area.setPointerCapture(event.pointerId)
  areaDragging.value = true
  setAreaFromEvent(event)
}

function moveAreaDrag(event: PointerEvent) {
  if (!areaDragging.value) return
  setAreaFromEvent(event)
}

function endAreaDrag(event: PointerEvent) {
  areaDragging.value = false
  const area = event.currentTarget as HTMLElement
  if (area.hasPointerCapture(event.pointerId)) {
    area.releasePointerCapture(event.pointerId)
  }
}

function setAreaFromEvent(event: PointerEvent) {
  const area = areaRef.value
  if (!area) return
  const rect = area.getBoundingClientRect()
  const s = clamp01((event.clientX - rect.left) / rect.width)
  const v = clamp01(1 - (event.clientY - rect.top) / rect.height)
  setHsv(hue.value, s, v)
}

function onAreaKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 0.1 : 0.02
  let handled = true
  if (event.key === 'ArrowLeft') setHsv(hue.value, saturation.value - step, value.value)
  else if (event.key === 'ArrowRight') setHsv(hue.value, saturation.value + step, value.value)
  else if (event.key === 'ArrowUp') setHsv(hue.value, saturation.value, value.value + step)
  else if (event.key === 'ArrowDown') setHsv(hue.value, saturation.value, value.value - step)
  else handled = false
  if (handled) event.preventDefault()
}

function toggle() {
  visible.value ? close() : open()
}

async function open() {
  const trigger = triggerRef.value
  if (!trigger) return
  syncFromColor(normalizedValue.value)
  visible.value = true
  await nextTick()
  const rect = trigger.getBoundingClientRect()
  const panelWidth = 190
  const panelHeight = panelRef.value?.offsetHeight ?? 216
  const margin = 8
  const left = Math.min(rect.left, window.innerWidth - panelWidth - margin)
  const below = rect.bottom + 6
  const top = below + panelHeight > window.innerHeight - margin
    ? Math.max(margin, rect.top - panelHeight - 6)
    : below

  panelStyle.value = {
    left: `${Math.max(margin, left)}px`,
    top: `${top}px`,
  }
}

function close() {
  visible.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return
  close()
}

function onWindowCloseEvents() {
  if (visible.value) close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && visible.value) close()
}

function parseHex(color: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  const hex = match[1]!
  const full = hex.length === 3
    ? hex.split('').map(char => char + char).join('')
    : hex
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

function normalizeHex(color: string): string {
  const rgb = parseHex(color)
  return rgb ? rgbToHex(rgb) : '#000000'
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map(part => Math.round(clamp01(part / 255) * 255).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === red) h = ((green - blue) / delta) % 6
    else if (max === green) h = (blue - red) / delta + 2
    else h = (red - green) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const hh = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const [r1, g1, b1] = hh < 1 ? [c, x, 0]
    : hh < 2 ? [x, c, 0]
    : hh < 3 ? [0, c, x]
    : hh < 4 ? [0, x, c]
    : hh < 5 ? [x, 0, c]
    : [c, 0, x]
  const m = v - c
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 }
}

function clampDegree(degree: number): number {
  return (((Number.isFinite(degree) ? degree : 0) % 360) + 360) % 360
}

function clamp01(number: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(number) ? number : 0))
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('scroll', onWindowCloseEvents, true)
  window.addEventListener('resize', onWindowCloseEvents)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('scroll', onWindowCloseEvents, true)
  window.removeEventListener('resize', onWindowCloseEvents)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.preset-color-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 26px;
  padding: 1px;
  border: 1px solid var(--pd-border, #d9dde6);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition: border-color .14s ease, box-shadow .14s ease;
}

.preset-color-trigger:hover,
.preset-color-trigger[aria-expanded="true"] {
  border-color: var(--pd-accent, #165DFF);
}

.preset-color-trigger:focus-visible {
  outline: none;
  border-color: var(--pd-accent, #165DFF);
  box-shadow: 0 0 0 2px rgb(22 93 255 / 12%);
}

.preset-color-swatch {
  width: 100%;
  height: 22px;
  border-radius: 4px;
  background-image: linear-gradient(45deg, #e9ecef 25%, transparent 25%, transparent 75%, #e9ecef 75%);
  background-size: 8px 8px;
  background-position: 0 0, 4px 4px;
}

.preset-color-panel {
  position: fixed;
  z-index: 3000;
  width: 190px;
  padding: 10px;
  border: 1px solid var(--pd-border, #d9dde6);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgb(23 32 60 / 16%);
}

.picker-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.picker-current {
  flex: 0 0 26px;
  height: 24px;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 5px;
}

.picker-hex {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--pd-border, #d9dde6);
  border-radius: 5px;
  color: var(--pd-text, #303133);
  font: inherit;
  font-size: 11px;
  text-transform: uppercase;
}

.picker-hex:focus {
  outline: none;
  border-color: var(--pd-accent, #165DFF);
  box-shadow: 0 0 0 2px rgb(22 93 255 / 12%);
}

.picker-area {
  position: relative;
  height: 100px;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 6px;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
  background:
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, hsl(var(--picker-hue) 100% 50%));
}

.picker-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 3px rgb(0 0 0 / 45%);
  pointer-events: none;
}

.picker-hue {
  width: 100%;
  height: 14px;
  margin: 10px 0 0;
  appearance: none;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 999px;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
  cursor: pointer;
}

.picker-hue::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 3px rgb(0 0 0 / 45%);
}

.picker-hue::-moz-range-thumb {
  width: 8px;
  height: 8px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 3px rgb(0 0 0 / 45%);
}

.picker-heading {
  margin-top: 10px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--pd-text-muted, #909399);
}

.preset-color-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 5px;
}

.preset-color-item {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 5px;
  cursor: pointer;
}

.preset-color-item.active {
  box-shadow: 0 0 0 2px #fff, 0 0 0 3px var(--pd-accent, #165DFF);
}
</style>
