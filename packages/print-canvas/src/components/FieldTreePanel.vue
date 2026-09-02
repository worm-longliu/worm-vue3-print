<template>
  <div class="field-tree-panel">
    <div class="panel-title">业务字段</div>
    <input v-model="searchText" class="pd-input search-input" type="search" placeholder="搜索字段..." aria-label="搜索字段" />
    <div class="tree-container">
      <template v-for="group in filteredGroups" :key="group.key || '_top'">
        <div
          v-if="group.key"
          class="field-group-header"
          :class="{ 'is-list': group.isList }"
          @click="toggleGroup(group.key)"
        >
          <span class="expand-icon">{{ collapsedGroups.has(group.key) && !searching ? '▶' : '▼' }}</span>
          <span class="node-icon">{{ group.isList ? '📋' : '📁' }}</span>
          <span class="group-label">{{ group.label }}</span>
        </div>
        <div v-show="!group.key || searching || !collapsedGroups.has(group.key)">
          <div
            v-for="field in group.fields"
            :key="field.fieldKey"
            class="field-row"
            draggable="true"
            :style="{ paddingLeft: (group.key ? 22 : 8) + 'px' }"
            @dragstart="onDragStart($event, field)"
          >
            <span class="node-icon">📄</span>
            <span class="node-label">{{ field.fieldLabel }}</span>
            <span class="node-key">({{ field.fieldKey }})</span>
          </div>
        </div>
      </template>
    </div>
    <p v-if="filteredGroups.length === 0" class="pd-empty">暂无字段</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PrintBusinessField } from '../types'
import { groupFields, filterGroups } from '../utils/field-groups'

const props = defineProps<{
  fields: PrintBusinessField[]
}>()

const emit = defineEmits<{
  'field-drag': [field: PrintBusinessField]
}>()

const searchText = ref('')
const collapsedGroups = ref<Set<string>>(new Set())

const searching = computed(() => !!searchText.value.trim())
const filteredGroups = computed(() =>
  filterGroups(groupFields(props.fields), searchText.value),
)

function toggleGroup(key: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedGroups.value = next
}

function onDragStart(event: DragEvent, field: PrintBusinessField) {
  // 拖拽载荷为完整字段路径（如 goods.spec），与打印数据结构一致
  event.dataTransfer?.setData('fieldData', JSON.stringify({ fieldKey: field.fieldKey, fieldLabel: field.fieldLabel }))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  emit('field-drag', field)
}
</script>

<style scoped>
.field-tree-panel {
  padding: 0;
}
.panel-title {
  font-size: 11px;
  color: var(--pd-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 0 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--pd-border);
}
.search-input {
  margin-bottom: 8px;
}
.tree-container {
  overflow-y: auto;
  min-height: 0;
}
.field-group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--pd-text, #303133);
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}
.field-group-header:hover {
  background: var(--pd-sidebar-hover, #f0f2f5);
}
.field-group-header.is-list {
  color: var(--pd-accent, #165DFF);
  font-weight: 500;
}
.expand-icon {
  width: 12px;
  font-size: 8px;
  flex-shrink: 0;
  color: var(--pd-text-muted, #909399);
}
.field-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--pd-text, #303133);
  cursor: grab;
  user-select: none;
  transition: background 0.1s;
}
.field-row:hover {
  background: var(--pd-sidebar-hover, #f0f2f5);
}
.node-icon {
  font-size: 14px;
  flex-shrink: 0;
  filter: saturate(.6);
  opacity: .9;
}
.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-key {
  font-size: 11px;
  color: var(--pd-text-muted, #909399);
  flex-shrink: 0;
}
.group-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
