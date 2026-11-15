<!-- demo 顶部区的「更多」面板：机制来自 @worm-vue3-print/canvas 的收纳 composable，
     面板 DOM 与视觉由宿主自己掌握，落位容器只要带上 data-overflow-slot 属性即可被找到。 -->
<template>
  <div v-if="ctx" v-show="hasMoved" ref="rootRef" class="demo-more-group" data-overflow-more :class="{ 'is-open': open }">
    <button
      type="button"
      class="demo-more-trigger"
      :class="{ on: open }"
      data-test="demo-more"
      title="横向空间不足时，顶部其余操作会折叠到这里"
      @click="open = !open"
    >
      <svg class="demo-more-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
      </svg>
      <span>更多</span>
      <span class="demo-more-caret" :class="{ up: open }" aria-hidden="true" /></button>
    <!-- 面板常驻 DOM（只靠显隐切换）：Teleport 落位容器必须一直存在，否则单元会被丢回行内 -->
    <div v-show="open" class="demo-more-panel">
      <p class="demo-more-note">仅在横向空间不足时，顶部操作才会折叠到这里</p>
      <div
        v-for="unit in chain"
        :key="unit.id"
        v-show="movedIds.has(unit.id)"
        class="demo-more-item"
        :data-unit="unit.id"
      >
        <span class="demo-more-label">{{ unit.label }}</span>
        <div class="demo-more-slot" :data-overflow-slot="unit.id" :data-unit="unit.id" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useToolbarOverflow } from '@worm-vue3-print/common/vue3'

const ctx = useToolbarOverflow()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const chain = computed(() => ctx?.chain.value ?? [])
const movedIds = computed(() => ctx?.movedIds.value ?? new Set<string>())
const hasMoved = computed(() => !!ctx && ctx.hasMoved.value)

// 收纳项全部回到行内时收起面板，避免下次展开是个空壳
watch(() => ctx?.hasMoved.value ?? false, (moved) => {
  if (!moved) open.value = false
})

function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return
  if (rootRef.value?.contains(e.target as Node)) return
  open.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointerDown))
</script>

<style scoped>
.demo-more-group {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.demo-more-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid #d9dde6;
  border-radius: 6px;
  background: #fff;
  color: #5a667f;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  transition: background .14s ease, border-color .14s ease, color .14s ease;
}
.demo-more-trigger:hover {
  border-color: #165dff;
  color: #165dff;
  background: #f7faff;
}
.demo-more-trigger.on {
  border-color: #165dff;
  color: #165dff;
  background: rgba(22, 93, 255, .07);
}
.demo-more-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
/* 顶部条给子项统一设了 nowrap，说明文字要能自然换行得显式放开 */
.demo-more-note {
  margin: 0;
  padding: 0 2px 8px;
  border-bottom: 1px solid #eef1f6;
  font-size: 12px;
  line-height: 1.5;
  color: #8b909c;
  white-space: normal;
}
.demo-more-caret {
  width: 0;
  height: 0;
  margin-left: 5px;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
  opacity: .6;
  transition: transform .14s ease;
}
.demo-more-caret.up {
  transform: rotate(180deg);
}
.demo-more-panel {
  position: absolute;
  top: 38px;
  right: 0;
  z-index: 300;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 276px;
  max-width: 320px;
  padding: 10px;
  border: 1px solid #d9dde6;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(23, 32, 60, .14);
}
.demo-more-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.demo-more-label {
  font-size: 11px;
  color: #8b909c;
}
.demo-more-slot {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
