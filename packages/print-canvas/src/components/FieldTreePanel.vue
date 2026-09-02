<template>
  <div class="field-tree-panel">
    <div class="panel-title">业务字段</div>
    <input v-model="searchText" class="pd-input search-input" type="search" placeholder="搜索字段..." aria-label="搜索字段" />
    <div class="tree-container">
      <TreeNode
        v-for="node in filteredTree"
        :key="node.id"
        :node="node"
        :depth="0"
        :parent-is-list="false"
        :search-text="searchText"
        @field-drag="onFieldDrag"
      />
    </div>
    <p v-if="filteredTree.length === 0" class="pd-empty">暂无字段</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { getFieldTree } from '../utils/field-tree-config'
import type { FieldTreeNode } from '../utils/field-tree-config'
import TreeNode from './TreeNode.vue'

const props = defineProps<{
  businessType: string
}>()

const emit = defineEmits<{
  'field-drag': [field: FieldTreeNode]
}>()

const searchText = ref('')

const tree = computed(() => getFieldTree(props.businessType))

const filteredTree = computed(() => {
  if (!searchText.value.trim()) return tree.value
  const keyword = searchText.value.trim().toLowerCase()
  const filter = (nodes: FieldTreeNode[]): FieldTreeNode[] => {
    return nodes.reduce<FieldTreeNode[]>((acc, n) => {
      const matched = n.fieldLabel.toLowerCase().includes(keyword)
      const filteredChildren = filter(n.children)
      if (matched || filteredChildren.length > 0) {
        acc.push({ ...n, children: filteredChildren })
      }
      return acc
    }, [])
  }
  return filter(tree.value)
})

function onFieldDrag(field: FieldTreeNode) {
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
</style>