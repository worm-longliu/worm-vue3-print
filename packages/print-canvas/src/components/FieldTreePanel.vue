<template>
  <div class="field-tree-panel" @mouseover="onTipOver" @mouseout="onTipOut" @mouseleave="hideTip">
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
          <span class="group-label" :data-tip="group.label">{{ group.label }}</span>
        </div>
        <div v-show="!group.key || searching || !collapsedGroups.has(group.key)">
          <div
            v-for="field in group.fields"
            :key="field.fieldKey"
            class="field-row"
            draggable="true"
            :data-tip="`${field.fieldLabel} (${field.fieldKey}) · 单击复制字段名 · Ctrl+拖动插入字段名`"
            :style="{ paddingLeft: (group.key ? 22 : 8) + 'px' }"
            @dragstart="onDragStart($event, field)"
            @dragend="onDragEnd"
            @click="onCopyField(field)"
          >
            <span class="node-icon">📄</span>
            <span class="node-meta">
              <span class="node-label">{{ field.fieldLabel }}</span>
              <span class="node-key">({{ field.fieldKey }})</span>
            </span>
            <span v-if="copiedKey === field.fieldKey" class="copy-hint">已复制</span>
          </div>
        </div>
      </template>
    </div>
    <p v-if="filteredGroups.length === 0" class="pd-empty">暂无字段</p>
    <!-- 长名称被省略时悬停看全：侧栏 overflow 会裁掉 CSS ::after 气泡，改用 fixed 浮层 -->
    <div v-if="tip" ref="tipEl" class="pd-hover-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">{{ tip.text }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import type { PrintBusinessField } from '@worm-vue3-print/core/designer'
import { copyTextToClipboard, groupFields, filterGroups } from '@worm-vue3-print/core/designer'
import { useHoverTip } from '../composables/useHoverTip'

const props = defineProps<{
  fields: PrintBusinessField[]
}>()

const emit = defineEmits<{
  'field-drag': [field: PrintBusinessField]
}>()

const searchText = ref('')
const collapsedGroups = ref<Set<string>>(new Set())
/** 最近一次复制成功的字段 key（行内「已复制」提示，1.2s 后自动消失） */
const copiedKey = ref('')
/** 拖拽会话进行中：拖拽起手不该再触发点击复制 */
const dragging = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null
const { tip, tipEl, onTipOver, onTipOut, hideTip } = useHoverTip()

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
  // 拖拽载荷为完整字段路径（如 goods.spec），与打印数据结构一致；
  // 按住 Ctrl/Cmd 松手时由落点侧生成静态文本元素，载荷不变
  dragging.value = true
  event.dataTransfer?.setData('fieldData', JSON.stringify({ fieldKey: field.fieldKey, fieldLabel: field.fieldLabel }))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  emit('field-drag', field)
}

function onDragEnd() {
  dragging.value = false
}

/** 单击字段行复制字段中文名（Gitee #IKRIZM：把字段名当静态文本用，不必手写一遍） */
async function onCopyField(field: PrintBusinessField) {
  // 拖拽起手时浏览器不会再派发 click，这里只兜底：拖拽会话未结束前不复制
  if (dragging.value) return
  const text = field.fieldLabel || field.fieldKey
  if (!(await copyTextToClipboard(text))) return
  copiedKey.value = field.fieldKey
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copiedKey.value = '' }, 1200)
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
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
.node-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 4px;
  row-gap: 1px;
}
.node-label {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-key {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--pd-text-muted, #909399);
}
.group-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 单击复制后的行内反馈：不占位、不换行，1.2s 后由脚本清掉 */
.copy-hint {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 11px;
  color: var(--pd-accent, #165DFF);
  white-space: nowrap;
}
</style>
