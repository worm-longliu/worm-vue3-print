<template>
  <div class="left-panel" :class="{ collapsed }">
    <!-- 折叠态：竖排图标，点击即展开对应页签 -->
    <div v-if="collapsed" class="left-collapsed">
      <button class="lc-btn" title="展开素材台" @click="expandTab(activeTab)">»</button>
      <button class="lc-btn" :class="{ on: activeTab === 'elements' }" title="元素" @click="expandTab('elements')">▦</button>
      <button class="lc-btn" :class="{ on: activeTab === 'fields' }" title="字段" @click="expandTab('fields')">⊛</button>
      <button class="lc-btn" :class="{ on: activeTab === 'layers' }" title="图层" @click="expandTab('layers')">≡</button>
    </div>
    <template v-else>
      <div class="left-head">
        <span class="left-title">素材台</span>
        <button class="collapse-btn" title="收起素材台" @click="$emit('toggle-collapse')">«</button>
      </div>
      <div class="pd-tabs left-tabs">
        <div class="pd-tab-bar" role="tablist">
          <button type="button" class="pd-tab" :class="{ active: activeTab === 'elements' }" @click="activeTab = 'elements'">元素</button>
          <button type="button" class="pd-tab" :class="{ active: activeTab === 'fields' }" @click="activeTab = 'fields'">字段</button>
          <button type="button" class="pd-tab" :class="{ active: activeTab === 'layers' }" @click="activeTab = 'layers'">图层</button>
        </div>
        <div v-show="activeTab === 'elements'" class="pd-tab-pane" role="tabpanel">
          <div class="panel-title">拖拽元素到画布</div>
          <div
            v-for="item in elementTypes"
            :key="item.type"
            class="material-card"
            draggable="true"
            @dragstart="onDragStart($event, item.type)"
          >
            <span class="material-icon">{{ item.icon }}</span>
            <span class="material-label">{{ item.label }}</span>
          </div>
        </div>
        <div v-show="activeTab === 'fields'" class="pd-tab-pane" role="tabpanel">
          <FieldTreePanel
            :business-type="businessType"
            @field-drag="onFieldDrag"
          />
        </div>
        <div v-show="activeTab === 'layers'" class="pd-tab-pane" role="tabpanel">
          <LayerPanel
            :elements="elements"
            :selected-ids="selectedIds"
            @select="(id: string, m: boolean) => $emit('select', id, m)"
            @move-layer="(d: string) => $emit('move-layer', d)"
            @toggle-visible="(id: string) => $emit('toggle-visible', id)"
            @toggle-locked="(id: string) => $emit('toggle-locked', id)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ElementType, PrintBusinessField, RuntimeElement } from '../types'
import type { FieldTreeNode } from '../utils/field-tree-config'
import LayerPanel from './LayerPanel.vue'
import FieldTreePanel from './FieldTreePanel.vue'

defineProps<{
  fields: PrintBusinessField[]
  elements: RuntimeElement[]
  selectedIds: Set<string>
  businessType: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  select: [id: string, multiple: boolean]
  'move-layer': [direction: string]
  'toggle-visible': [id: string]
  'toggle-locked': [id: string]
  'field-drag': [field: FieldTreeNode]
  'toggle-collapse': []
}>()

const activeTab = ref('elements')

const elementTypes: { type: ElementType; label: string; icon: string }[] = [
  { type: 'text', label: '文本', icon: 'Ｔ' },
  { type: 'barcode', label: '条形码', icon: '▍▍' },
  { type: 'qrcode', label: '二维码', icon: '▦' },
  { type: 'image', label: '图片', icon: '▧' },
  { type: 'table', label: '表格', icon: '⊞' },
  { type: 'longText', label: '长文', icon: '¶' },
  { type: 'hline', label: '横线', icon: '―' },
  { type: 'vline', label: '竖线', icon: '│' },
  { type: 'rect', label: '矩形', icon: '▭' },
  { type: 'oval', label: '椭圆', icon: '◯' },
  { type: 'html', label: 'HTML', icon: '<>' },
]

function onDragStart(event: DragEvent, type: string) {
  event.dataTransfer?.setData('elementType', type)
}

function onFieldDrag(field: FieldTreeNode) {
  emit('field-drag', field)
}

function expandTab(tab: string) {
  activeTab.value = tab
  emit('toggle-collapse')
}
</script>

<style scoped>
.left-panel {
  width: 224px;
  min-width: 224px;
  background: var(--pd-sidebar, #ffffff);
  border-right: 1px solid var(--pd-border-soft, #e9ecf2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width .18s ease;
}
.left-panel.collapsed {
  width: 36px;
  min-width: 36px;
  border-right: 1px solid var(--pd-border-soft, #e9ecf2);
}
.left-collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  flex: 1;
}
.lc-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--pd-text-muted, #8b909c);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .14s ease;
}
.lc-btn:hover {
  color: var(--pd-text, #2a2e37);
  background: var(--pd-sidebar-hover, #f0f3f9);
}
.lc-btn.on {
  color: var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, .09));
}
.left-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--pd-border-soft, #e9ecf2);
}
.left-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--pd-text, #2a2e37);
  letter-spacing: 1.2px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.left-title::before {
  content: "";
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--pd-accent-2, #3D7BFF), var(--pd-accent, #165DFF));
}
.collapse-btn {
  border: none;
  background: transparent;
  color: var(--pd-text-muted, #8b909c);
  font-size: 14px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  transition: all .14s ease;
}
.collapse-btn:hover {
  color: var(--pd-text, #2a2e37);
  background: var(--pd-sidebar-hover, #f0f3f9);
}
.left-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.left-tabs .pd-tab-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}
.panel-title {
  font-size: 11px;
  color: var(--pd-text-muted, #8b909c);
  letter-spacing: .6px;
  padding: 2px 2px 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--pd-border-soft, #e9ecf2);
}
.material-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 7px;
  border: 1px solid var(--pd-border-soft, #e9ecf2);
  border-radius: 8px;
  background: var(--pd-field-bg, #f4f6fa);
  cursor: grab;
  user-select: none;
  transition: border-color .14s ease, background .14s ease, transform .14s ease, box-shadow .14s ease;
}
.material-card:hover {
  border-color: rgba(22, 93, 255, .45);
  background: var(--pd-surface, #ffffff);
  transform: translateY(-1px);
  box-shadow: var(--pd-shadow-sm, 0 1px 2px rgba(23, 32, 60, .05));
}
.material-card:active {
  cursor: grabbing;
  transform: translateY(0);
}
.material-icon {
  width: 30px;
  height: 24px;
  border: 1px dashed var(--pd-border, #d9dde6);
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--pd-accent, #165DFF);
  background: var(--pd-surface, #ffffff);
  flex-shrink: 0;
  transition: border-color .14s ease, background .14s ease;
}
.material-card:hover .material-icon {
  border-style: solid;
  border-color: var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, .09));
}
.material-label {
  font-size: 12.5px;
  color: var(--pd-text, #2a2e37);
}
</style>
