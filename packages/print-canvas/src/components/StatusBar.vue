<template>
  <div class="status-bar">
    <span class="status-item coord" v-if="coordinate">
      x:{{ coordinate.x.toFixed(1) }}&nbsp;y:{{ coordinate.y.toFixed(1) }}mm
    </span>
    <span class="status-item">缩放 {{ scale }}%</span>
    <span class="status-item">元素 {{ elementCount }}{{ selectedCount ? ` (选中 ${selectedCount})` : '' }}</span>
    <span class="status-dirty" :class="{ on: dirty }">
      <span class="dirty-dot" />{{ dirty ? '未保存' : '已保存' }}
    </span>
    <span class="status-item status-paper">{{ paper }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  coordinate: { x: number; y: number } | null
  scale: number
  elementCount: number
  selectedCount: number
  paper: string
  dirty: boolean
}>()
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 30px;
  padding: 0 16px;
  background: var(--pd-surface, #ffffff);
  border-top: 1px solid var(--pd-border-soft, #e9ecf2);
  box-shadow: 0 -1px 2px rgba(23, 32, 60, .03);
  font-size: 11.5px;
  color: var(--pd-text-muted, #8b909c);
  user-select: none;
  flex-shrink: 0;
}
.status-item {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
}
.coord {
  font-variant-numeric: tabular-nums;
  color: var(--pd-text, #2a2e37);
}
.status-paper {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--pd-accent, #165DFF);
  font-weight: 600;
}
.status-dirty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  color: var(--pd-text-muted, #8b909c);
}
.status-dirty.on {
  color: var(--pd-accent-secondary, #f56c6c);
}
.dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--pd-ink-green, #67c23a);
}
.status-dirty.on .dirty-dot {
  background: var(--pd-accent-secondary, #f56c6c);
  box-shadow: 0 0 0 3px rgba(245, 108, 108, .14);
  animation: dirty-pulse 1.6s ease-in-out infinite;
}
@keyframes dirty-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(245, 108, 108, .12); }
  50% { box-shadow: 0 0 0 4px rgba(245, 108, 108, .05); }
}
@media (prefers-reduced-motion: reduce) {
  .status-dirty.on .dirty-dot { animation: none; }
}
</style>
