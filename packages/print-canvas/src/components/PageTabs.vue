<template>
  <div class="page-tabs">
    <div class="page-tabs-list">
      <template v-for="(p, i) in pages" :key="i">
        <input
          v-if="editingIndex === i"
          v-model="renameText"
          class="page-tab-rename"
          data-test="page-rename-input"
          @blur="commitRename(i)"
          @keydown.enter="commitRename(i)"
          @keydown.esc="cancelRename"
        />
        <button
          v-else
          class="page-tab"
          :class="{ active: i === activeIndex }"
          :title="p.name ? `双击重命名` : undefined"
          @click="$emit('select', i)"
          @dblclick="startRename(i)"
        >
          {{ p.name || `页面 ${i + 1}` }}
        </button>
      </template>
    </div>
    <div class="page-tabs-actions">
      <button data-test="add-page" title="新增页面" @click="$emit('add')">＋</button>
      <button data-test="duplicate-page" title="复制当前页" @click="$emit('duplicate')">⧉</button>
      <button data-test="delete-page" title="删除当前页" :disabled="!multi" @click="$emit('delete', activeIndex)">✕</button>
      <button data-test="move-left" title="左移" :disabled="activeIndex <= 0" @click="$emit('move', activeIndex, activeIndex - 1)">←</button>
      <button data-test="move-right" title="右移" :disabled="activeIndex >= pages.length - 1" @click="$emit('move', activeIndex, activeIndex + 1)">→</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  pages: TemplateData[]
  activeIndex: number
  /** 多页模式（≥2 页）才可删除；单页回落单模板 */
  multi: boolean
}>()

const emit = defineEmits<{
  select: [index: number]
  add: []
  duplicate: []
  delete: [index: number]
  rename: [index: number, name: string]
  move: [from: number, to: number]
}>()

// 行内重命名：双击页签进入编辑，blur/Enter 提交，Esc 取消
const editingIndex = ref(-1)
const renameText = ref('')

function startRename(i: number) {
  editingIndex.value = i
  renameText.value = props.pages[i]?.name ?? ''
}

function commitRename(i: number) {
  if (editingIndex.value !== i) return
  const name = renameText.value.trim()
  if (name) emit('rename', i, name)
  editingIndex.value = -1
}

function cancelRename() {
  editingIndex.value = -1
}
</script>

<style scoped>
.page-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--pd-sidebar, #fff);
  border-bottom: 1px solid var(--pd-border, #d9dde6);
  flex-shrink: 0;
}
.page-tabs-list {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  align-items: center;
}
.page-tab {
  padding: 4px 12px;
  border: 1px solid var(--pd-border, #d9dde6);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  color: var(--pd-text, #2a2e37);
  font-size: 12px;
}
.page-tab.active {
  background: var(--pd-accent, #165DFF);
  color: #fff;
}
.page-tab-rename {
  padding: 4px 8px;
  width: 96px;
  border: 1px solid var(--pd-accent, #165DFF);
  border-radius: 4px;
  font-size: 12px;
  color: var(--pd-text, #2a2e37);
  outline: none;
}
.page-tabs-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.page-tabs-actions button {
  padding: 4px 8px;
  border: 1px solid var(--pd-border, #d9dde6);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: var(--pd-text-muted, #8b909c);
  font-size: 12px;
  line-height: 1;
}
.page-tabs-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>