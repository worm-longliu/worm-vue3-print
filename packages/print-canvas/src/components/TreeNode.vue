<template>
  <div class="tree-node">
    <div
      class="node-row"
      :class="{ 'is-list': node.isList, 'draggable': !node.isList && node.children.length === 0 }"
      draggable="true"
      :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
      @dragstart="onDragStart"
      @click="onNodeClick"
      @dblclick="onNodeDblClick"
    >
      <span class="expand-icon" v-if="node.children.length > 0" @click.stop="toggleExpand">
        {{ expanded ? '▼' : '▶' }}
      </span>
      <input
        v-if="selectedFields"
        class="pd-checkbox"
        type="checkbox"
        :checked="selectedFields.has(node.fieldKey)"
        @change="() => $emit('field-check', node)"
        @click.stop
      >
      <span class="node-icon">{{ node.isList ? '📋' : (node.children.length > 0 ? '📁' : '📄') }}</span>
      <span class="node-label">{{ nodeLabel }}</span>
      <span class="node-key">({{ node.fieldKey }})</span>
    </div>
    <div v-if="expanded && node.children.length > 0" class="children">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :parent-is-list="node.isList"
        :search-text="searchText"
        :show-list-prefix="showListPrefix"
        :selected-fields="selectedFields"
        @field-drag="(f: FieldTreeNode) => $emit('field-drag', f)"
        @field-click="(f: FieldTreeNode) => $emit('field-click', f)"
        @field-dblclick="(f: FieldTreeNode) => $emit('field-dblclick', f)"
        @field-check="(f: FieldTreeNode) => $emit('field-check', f)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FieldTreeNode } from '../utils/field-tree-config'

const props = defineProps<{
  node: FieldTreeNode
  depth: number
  parentIsList: boolean
  searchText: string
  showListPrefix?: boolean
  selectedFields?: Set<string>
}>()

const emit = defineEmits<{
  'field-drag': [field: FieldTreeNode]
  'field-click': [field: FieldTreeNode]
  'field-dblclick': [field: FieldTreeNode]
  'field-check': [field: FieldTreeNode]
}>()

const expanded = ref(props.depth < 1) // 顶层默认展开

function toggleExpand() {
  if (props.node.children.length > 0) {
    expanded.value = !expanded.value
  }
}

function onNodeClick() {
  emit('field-click', props.node)
  toggleExpand()
}

function onNodeDblClick() {
  emit('field-dblclick', props.node)
}

const nodeLabel = computed(() => {
  // 列表子节点显示为 "明细.字段名"
  if (props.parentIsList && props.showListPrefix !== false) {
    return `明细.${props.node.fieldLabel}`
  }
  return props.node.fieldLabel
})

function onDragStart(event: DragEvent) {
  if (props.node.isList || props.node.children.length > 0) return
  event.dataTransfer?.setData('fieldData', JSON.stringify(props.node))
  event.dataTransfer!.effectAllowed = 'copy'
  emit('field-drag', props.node)
}
</script>

<style scoped>
.tree-node { user-select: none; }
.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--pd-text, #303133);
  transition: background 0.1s;
}
.node-row:hover { background: var(--pd-sidebar-hover, #f0f2f5); }
.node-row.draggable { cursor: grab; }
.node-row.is-list { color: var(--pd-accent, #165DFF); font-weight: 500; }
.expand-icon { width: 12px; font-size: 8px; flex-shrink: 0; color: var(--pd-text-muted, #909399); }
.node-icon { font-size: 14px; flex-shrink: 0; filter: saturate(.6); opacity: .9; }
.node-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-key { font-size: 11px; color: var(--pd-text-muted, #909399); flex-shrink: 0; }
.children { margin-left: 0; }</style>