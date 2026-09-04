<template>
  <div class="pd-stepper">
    <button
      type="button"
      class="pd-step-btn pd-step-minus"
      :disabled="atMin"
      title="减小"
      aria-label="减小"
      @click="stepBy(-1)"
    >−</button>
    <input
      type="number"
      class="pd-input pd-step-input"
      :value="draft"
      :placeholder="placeholder"
      :min="min"
      :max="max"
      :step="step"
      @input="onInput"
      @change="commit"
      @blur="commit"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
    />
    <button
      type="button"
      class="pd-step-btn pd-step-plus"
      :disabled="atMax"
      title="增大"
      aria-label="增大"
      @click="stepBy(1)"
    >+</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  /** 数值；undefined 表示未设置（继承默认），输入框显示空占位 */
  modelValue?: number
  min?: number
  max?: number
  /** 步进单位，默认 1（整数）；小数步进时按小数位数保留精度 */
  step?: number
  /** 未设置（继承默认）时输入框的占位提示 */
  placeholder?: string
}>(), {
  step: 1,
})

const emit = defineEmits<{
  'update:modelValue': [value: number | undefined]
}>()

/** 步进小数位数：由 step 推导（0.5→1 位，0.25→2 位，0.1→1 位，1→0 位） */
const precision = computed(() => {
  const s = String(props.step)
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
})

/** 按 step 精度取整，规避浮点误差（0.30000000000000004 → 0.3） */
function roundTo(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Number(v.toFixed(precision.value))
}

/** 当前有效值：undefined 表示未设置（继承默认） */
const current = computed<number | undefined>(() => {
  const v = props.modelValue
  if (v === undefined || v === null || !Number.isFinite(v)) return undefined
  return roundTo(v)
})

/** 输入框草稿：输入过程中保留原文，失焦/回车后按精度规范化 */
const draft = ref(current.value === undefined ? '' : String(current.value))
watch(current, (v) => {
  draft.value = v === undefined ? '' : String(v)
})

/** 步进基准：未设置时从 min（无 min 则为 0）起步 */
const base = computed(() => {
  if (current.value !== undefined) return current.value
  return props.min !== undefined ? props.min : 0
})

const atMin = computed(() => props.min !== undefined && base.value <= props.min)
const atMax = computed(() => props.max !== undefined && base.value >= props.max)

/** 夹取到 [min, max]，并按 step 精度取整 */
function clamp(v: number): number {
  let next = roundTo(v)
  if (props.min !== undefined && next < props.min) next = props.min
  if (props.max !== undefined && next > props.max) next = props.max
  return next
}

function stepBy(dir: 1 | -1) {
  if ((dir < 0 && atMin.value) || (dir > 0 && atMax.value)) return
  const next = clamp(base.value + dir * props.step)
  draft.value = String(next)
  emit('update:modelValue', next)
}

function onInput(e: Event) {
  draft.value = (e.target as HTMLInputElement).value
}

/** 失焦/回车提交：解析草稿并按精度取整；空值回退为当前值（未设置则保持未设置） */
function commit() {
  const raw = draft.value.trim()
  if (raw === '') {
    if (current.value !== undefined) {
      draft.value = String(current.value)
    }
    return
  }
  const num = Number(raw)
  if (!Number.isFinite(num)) {
    draft.value = current.value === undefined ? '' : String(current.value)
    return
  }
  const next = clamp(num)
  draft.value = String(next)
  // change 与 blur 会先后触发，仅当值真正变化时 emit，避免重复提交
  if (next !== current.value) {
    emit('update:modelValue', next)
  }
}
</script>

<style scoped>
.pd-stepper {
  display: flex;
  align-items: center;
  width: 100%;
}
.pd-step-btn {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: 1px solid var(--pd-border, #d9dde6);
  background: var(--pd-field-bg, #f4f6fa);
  color: var(--pd-text, #2a2e37);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .14s ease, border-color .14s ease, color .14s ease;
}
.pd-step-btn:hover:not(:disabled) {
  background: var(--pd-sidebar-hover, #f0f3f9);
  border-color: var(--pd-text-faint, #b4b9c4);
}
.pd-step-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pd-step-minus {
  border-radius: 6px 0 0 6px;
  border-right: none;
}
.pd-step-plus {
  border-radius: 0 6px 6px 0;
  border-left: none;
}
.pd-step-input.pd-input {
  border-radius: 0;
  min-width: 0;
  flex: 1;
  text-align: center;
  -moz-appearance: textfield;
}
.pd-step-input.pd-input::-webkit-outer-spin-button,
.pd-step-input.pd-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
