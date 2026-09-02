<template>
  <div class="layer-panel">
    <div class="panel-title">图层</div>
    <div
      v-for="layer in sortedLayers"
      :key="layer.id"
      class="layer-item"
      :class="{ active: selectedIds.has(layer.id) }"
      @click="$emit('select', layer.id, false)"
    >
      <span class="layer-icon">{{ layerIcon(layer) }}</span>
      <span class="layer-name">{{ layerName(layer) }}</span>
      <span v-if="zoneTag(layer)" class="layer-zone">{{ zoneTag(layer) }}</span>
      <span class="layer-zindex">z:{{ layer.options.zIndex ?? 0 }}</span>
    </div>
    <div class="layer-actions" v-if="sortedLayers.length > 0">
      <button type="button" class="pd-button small" @click="$emit('move-layer', 'top')" title="置顶">
        ⤒
      </button>
      <button type="button" class="pd-button small" @click="$emit('move-layer', 'up')" title="上移">
        ↑
      </button>
      <button type="button" class="pd-button small" @click="$emit('move-layer', 'down')" title="下移">
        ↓
      </button>
      <button type="button" class="pd-button small" @click="$emit('move-layer', 'bottom')" title="置底">
        ⤓
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '../types'

const props = defineProps<{
  elements: RuntimeElement[]
  selectedIds: Set<string>
}>()

defineEmits<{
  select: [id: string, multiple: boolean]
  'move-layer': [direction: string]
}>()

const sortedLayers = computed(() =>
  [...props.elements].sort((a, b) => (b.options.zIndex ?? 0) - (a.options.zIndex ?? 0))
)

const elementIconMap: Record<string, string> = {
  text: 'T',
  longText: '¶',
  table: '⊞',
  image: '🖼',
  barcode: '≡',
  qrcode: '▣',
  hline: '—',
  vline: '|',
  rect: '□',
  oval: '○',
  html: '<>',
}

function layerIcon(el: RuntimeElement): string {
  return elementIconMap[el.printElementType.type] || '?'
}

function layerName(el: RuntimeElement): string {
  return el.options.title || el.printElementType.title || el.printElementType.type
}

function zoneTag(el: RuntimeElement): string {
  if (el.zone === 'header') return '页眉'
  if (el.zone === 'footer') return '页脚'
  return ''
}
</script>

<style scoped>
.layer-panel {
  border-top: 1px solid var(--pd-border);
  padding: 8px 12px;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
}
.panel-title {
  font-size: 11px;
  color: var(--pd-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.layer-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  margin-bottom: 2px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.1s;
}
.layer-item:hover {
  background: var(--pd-sidebar-hover, #f0f2f5);
}
.layer-item.active {
  background: rgba(22, 93, 255, 0.10);
  color: var(--pd-accent, #165DFF);
  box-shadow: inset 2px 0 0 var(--pd-accent, #165DFF);
}
.layer-icon {
  width: 18px;
  text-align: center;
  font-size: 12px;
  color: var(--pd-text-muted, #909399);
}
.layer-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pd-text, #303133);
}
.layer-zone {
  flex-shrink: 0;
  padding: 0 4px;
  font-size: 10px;
  line-height: 14px;
  color: var(--pd-ink-green, #67c23a);
  background: rgba(103, 194, 58, 0.1);
  border-radius: 3px;
}
.layer-zindex {
  font-size: 10px;
  color: var(--pd-text-muted, #909399);
  font-variant-numeric: tabular-nums;
}
.layer-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
</style>
