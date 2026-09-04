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
  modelValue: number
  min?: number
  max?: number
  /** 步进单位，默认 1（整数） */
  step?: number
}>(), {
  step: 1,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

/** 当前有效值（始终取整） */
const current = computed(() => round(props.modelValue))

/** 输入框草稿：输入过程中保留原文，失焦/回车后规范化为整数 */
const draft = ref(String(current.value))
watch(current, (v) => {
  draft.value = String(v)
})

const atMin = computed(() => props.min !== undefined && current.value <= props.min)
const atMax = computed(() => props.max !== undefined && current.value >= props.max)

function round(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(v)
}

/** 夹取到 [min, max]，并取整 */
function clamp(v: number): number {
  let next = round(v)
  if (props.min !== undefined && next < props.min) next = props.min
  if (props.max !== undefined && next > props.max) next = props.max
  return next
}

function stepBy(dir: 1 | -1) {
  if ((dir < 0 && atMin.value) || (dir > 0 && atMax.value)) return
  const next = clamp(current.value + dir * props.step)
  draft.value = String(next)
  emit('update:modelValue', next)
}

function onInput(e: Event) {
  draft.value = (e.target as HTMLInputElement).value
}

/** 失焦/回车提交：解析草稿并取整，空值回退为当前值 */
function commit() {
  const raw = draft.value.trim()
  if (raw === '') {
    draft.value = String(current.value)
    return
  }
  const num = Number(raw)
  if (!Number.isFinite(num)) {
    draft.value = String(current.value)
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
