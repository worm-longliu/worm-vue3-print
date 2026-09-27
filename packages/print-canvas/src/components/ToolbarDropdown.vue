<!-- 工具栏通用下拉壳：触发钮 + 弹层 + 外点/失能自动关闭（从格式工具栏边框面板抽出） -->
<template>
  <div ref="wrapRef" class="tb-dd">
    <button
      type="button" class="tb-dd-trigger" :class="{ on: open }"
      :disabled="disabled" :data-test="testId" :data-tip="tip"
      @click="open = !open"
    >
      <slot name="trigger" />
      <ChevronDown :size="12" class="tb-dd-arrow" :class="{ up: open }" />
    </button>
    <div v-if="open" class="tb-dd-panel" :class="panelClass"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  disabled?: boolean
  /** 触发钮 data-test，便于组件级测试定位 */
  testId?: string
  tip?: string
  panelClass?: string
}>(), {
  disabled: false,
  testId: 'dd-trigger',
})

const open = ref(false)
const wrapRef = ref<HTMLElement | null>(null)

function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return
  if (wrapRef.value?.contains(e.target as Node)) return
  open.value = false
}
watch(() => props.disabled, (v) => { if (v) open.value = false })
onMounted(() => document.addEventListener('pointerdown', onDocPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointerDown))
</script>

<style scoped>
.tb-dd {
  position: relative;
  display: inline-flex;
}
.tb-dd-trigger {
  height: 28px;
  min-width: 28px;
  padding: 0 5px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--pd-text-muted, #8b909c);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 12px;
  transition: background .14s ease, color .14s ease;
}
.tb-dd-trigger:hover:not(:disabled) {
  color: var(--pd-text, #2a2e37);
  background: var(--pd-sidebar-hover, #f0f3f9);
}
.tb-dd-trigger:disabled {
  opacity: .32;
  cursor: default;
}
.tb-dd-trigger.on {
  color: var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, .09));
}
.tb-dd-arrow {
  opacity: .6;
  transition: transform .14s ease;
}
.tb-dd-arrow.up {
  transform: rotate(180deg);
}
.tb-dd-trigger[data-tip] {
  position: relative;
}
.tb-dd-trigger[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  top: 34px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  font-size: 12px;
  color: #fff;
  background: rgba(30, 35, 48, .88);
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity .15s ease;
  z-index: 100;
}
.tb-dd-trigger[data-tip]:hover::after {
  opacity: 1;
}
.tb-dd-panel {
  position: absolute;
  top: 34px;
  left: 0;
  background: var(--pd-surface, #fff);
  border: 1px solid var(--pd-border, #d9dde6);
  border-radius: 8px;
  box-shadow: var(--pd-shadow-md, 0 2px 8px rgba(23, 32, 60, .06), 0 10px 28px rgba(23, 32, 60, .07));
  z-index: 200;
}
</style>
