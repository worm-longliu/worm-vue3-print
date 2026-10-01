<template>
  <div class="designer-toolbar">
    <!-- 文件 -->
    <div class="tb-group">
      <span class="tb-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="3" width="14" height="18" rx="2.5" />
          <line x1="8.5" y1="8.5" x2="15.5" y2="8.5" />
          <line x1="8.5" y1="12.5" x2="15.5" y2="12.5" />
          <line x1="8.5" y1="16.5" x2="12.5" y2="16.5" />
        </svg>
      </span>
      <div class="tb-title">
        <span class="tb-title-name">{{ isEdit ? '编辑模板' : '新建模板' }}</span>
        <span class="tb-title-sub">打印模板设计器</span>
      </div>
    </div>
    <!-- 编辑 -->
    <div class="tb-group">
      <button class="tb-btn tb-icon" :disabled="!canUndo" @click="$emit('undo')" data-tip="撤销"><Undo2 :size="15" /></button>
      <button class="tb-btn tb-icon" :disabled="!canRedo" @click="$emit('redo')" data-tip="重做"><Redo2 :size="15" /></button>
    </div>
    <!-- 格式化区段（默认 slot 注入 FormatToolbar：字体/样式/对齐/边框） -->
    <slot />
    <!-- 排列下拉：对齐分布/层级/组合常驻，无对应选中时置灰 -->
    <div class="tb-group">
      <ToolbarDropdown test-id="arrange-dd" tip="排列">
        <template #trigger>
          <Layers :size="15" />
          <span class="tb-btn-text">排列</span>
        </template>
        <div class="tb-menu" data-test="arrange-panel">
          <div class="tb-menu-label">对齐 / 分布</div>
          <div class="tb-menu-grid">
            <button class="tb-btn tb-icon" :disabled="!hasMultiSelection" @click="$emit('align', 'left')" data-tip="左对齐"><AlignStartVertical :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasMultiSelection" @click="$emit('align', 'right')" data-tip="右对齐"><AlignEndVertical :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasMultiSelection" @click="$emit('align', 'top')" data-tip="顶对齐"><AlignStartHorizontal :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasMultiSelection" @click="$emit('align', 'bottom')" data-tip="底对齐"><AlignEndHorizontal :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasMultiSelection" @click="$emit('align', 'vertical')" data-tip="水平居中"><AlignCenterVertical :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasMultiSelection" @click="$emit('align', 'horizontal')" data-tip="垂直居中"><AlignCenterHorizontal :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasMultiSelection" @click="$emit('align', 'distributeHor')" data-tip="水平分布"><AlignHorizontalSpaceBetween :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasMultiSelection" @click="$emit('align', 'distributeVer')" data-tip="垂直分布"><AlignVerticalSpaceBetween :size="15" /></button>
          </div>
          <div class="tb-menu-label">层级</div>
          <div class="tb-menu-grid">
            <button class="tb-btn tb-icon" :disabled="!hasSelection" @click="$emit('move-layer', 'top')" data-tip="置顶"><ArrowUpToLine :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasSelection" @click="$emit('move-layer', 'up')" data-tip="上移一层"><ArrowUp :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasSelection" @click="$emit('move-layer', 'down')" data-tip="下移一层"><ArrowDown :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!hasSelection" @click="$emit('move-layer', 'bottom')" data-tip="置底"><ArrowDownToLine :size="15" /></button>
          </div>
          <div class="tb-menu-label">组合</div>
          <div class="tb-menu-grid">
            <button class="tb-btn tb-icon" :disabled="!hasMultiSelection" @click="$emit('group')" data-tip="组合 (Ctrl+G)"><GroupIcon :size="15" /></button>
            <button class="tb-btn tb-icon" :disabled="!selectedElementHasGroup" @click="$emit('ungroup')" data-tip="取消组合 (Ctrl+Shift+G)"><UngroupIcon :size="15" /></button>
          </div>
        </div>
      </ToolbarDropdown>
      <!-- 视图下拉：标尺/网格/虚框/吸附开关 + 首页专属 / 叠层对比 -->
      <ToolbarDropdown test-id="view-dd" tip="视图">
        <template #trigger>
          <Eye :size="15" />
          <span class="tb-btn-text">视图</span>
        </template>
        <div class="tb-menu tb-menu-rows" data-test="view-panel">
          <button class="tb-btn tb-menu-row" :class="{ on: showRuler }" data-tip="显示/隐藏标尺" @click="$emit('toggle-ruler')">
            <span class="dot" /> 标尺
          </button>
          <button class="tb-btn tb-menu-row" :class="{ on: showGrid }" data-tip="显示/隐藏网格背景" @click="$emit('toggle-grid')">
            <span class="dot" /> 网格
          </button>
          <button class="tb-btn tb-menu-row" :class="{ on: showTableGhostBorder }" data-tip="显示/隐藏无边框表格的虚拟虚线" @click="$emit('toggle-table-ghost-border')">
            <span class="dot" /> 虚框
          </button>
          <button class="tb-btn tb-menu-row" :class="{ on: snapToGrid }" data-tip="开启/关闭元素吸附到网格" @click="$emit('toggle-snap')">
            <span class="dot" /> 吸附
          </button>
          <button class="tb-btn tb-menu-row" :class="{ warn: overlayVisible }" data-tip="叠加显示渲染截图，与设计稿对比效果" @click="$emit('toggle-overlay')">叠层对比</button>
        </div>
      </ToolbarDropdown>
    </div>
    <!-- 缩放 -->
    <div class="tb-group">
      <button class="tb-btn tb-icon" @click="$emit('fit-window')" data-tip="适应窗口"><Maximize :size="15" /></button>
      <button class="tb-btn tb-icon" @click="$emit('zoom', -10)" data-tip="缩小"><ZoomOut :size="15" /></button>
      <span class="tb-zoom">{{ scale }}%</span>
      <button class="tb-btn tb-icon" @click="$emit('zoom', 10)" data-tip="放大"><ZoomIn :size="15" /></button>
    </div>
    <!-- 剪贴板：元素上下文可用，其余置灰 -->
    <div class="tb-group">
      <button class="tb-btn tb-icon" data-test="copy" :disabled="clipboardDisabled" @click="$emit('copy')" :data-tip="clipboardDisabled ? '复制 (Ctrl+C)，需选中元素' : '复制 (Ctrl+C)'"><Copy :size="15" /></button>
      <button class="tb-btn tb-icon" data-test="paste" :disabled="clipboardDisabled || !hasClipboard" @click="$emit('paste')" :data-tip="pasteTip"><ClipboardPaste :size="15" /></button>
      <button class="tb-btn tb-icon danger" data-test="delete" :disabled="clipboardDisabled" @click="$emit('delete')" :data-tip="clipboardDisabled ? '删除 (Delete)，需选中元素' : '删除 (Delete)'"><Trash2 :size="15" /></button>
    </div>
    <div class="tb-spacer" />
    <div class="tb-group" v-if="showHelp">
      <HelpButton @click="$emit('help')" />
    </div>
    <div class="tb-group">
      <button class="btn-secondary" data-tip="预览模板打印效果" @click="$emit('preview')">预览</button>
      <button class="btn-primary" data-tip="保存模板" @click="$emit('save')">保存</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Undo2,
  Redo2,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterVertical,
  AlignCenterHorizontal,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  ArrowUpToLine,
  ArrowUp,
  ArrowDown,
  ArrowDownToLine,
  Maximize,
  ZoomOut,
  ZoomIn,
  Group as GroupIcon,
  Ungroup as UngroupIcon,
  Layers,
  Eye,
  Copy,
  ClipboardPaste,
  Trash2,
} from 'lucide-vue-next'
import HelpButton from './HelpButton.vue'
import ToolbarDropdown from './ToolbarDropdown.vue'

const scale = defineModel<number>('scale', { default: 100 })

const props = withDefaults(defineProps<{
  isEdit?: boolean
  canUndo?: boolean
  canRedo?: boolean
  hasMultiSelection?: boolean
  hasSelection?: boolean
  showRuler?: boolean
  showGrid?: boolean
  snapToGrid?: boolean
  showTableGhostBorder?: boolean
  selectedElementHasGroup?: boolean
  overlayVisible?: boolean
  /** 是否展示帮助入口（工具栏帮助按钮）；默认开启，传 false 关闭 */
  showHelp?: boolean
  /** 剪贴板组置灰（非元素上下文时由宿主传入） */
  clipboardDisabled?: boolean
  /** 剪贴板是否有内容（控制粘贴可用） */
  hasClipboard?: boolean
}>(), {
  showRuler: true,
  showHelp: true,
  clipboardDisabled: true,
  hasClipboard: false,
})

const pasteTip = computed(() =>
  props.clipboardDisabled ? '粘贴 (Ctrl+V)，需选中元素'
    : !props.hasClipboard ? '粘贴 (Ctrl+V)，剪贴板为空'
      : '粘贴 (Ctrl+V)')

defineEmits<{
  preview: []
  save: []
  undo: []
  redo: []
  align: [mode: string]
  'move-layer': [direction: string]
  'toggle-ruler': []
  'toggle-grid': []
  'toggle-snap': []
  'toggle-table-ghost-border': []
  'toggle-overlay': []
  group: []
  ungroup: []
  'fit-window': []
  zoom: [delta: number]
  help: []
  copy: []
  paste: []
  delete: []
}>()
</script>

<style scoped>
.designer-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 12px;
  height: 50px;
  background: var(--pd-surface, #ffffff);
  border-bottom: 1px solid var(--pd-border-soft, #e9ecf2);
  box-shadow: 0 1px 2px rgba(23, 32, 60, .04), 0 6px 16px -12px rgba(23, 32, 60, .25);
  flex-shrink: 0;
  position: relative;
  z-index: 100;
}
.tb-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
}
.tb-group + .tb-group {
  border-left: 1px solid var(--pd-border-soft, #e9ecf2);
}
.tb-btn {
  height: 30px;
  min-width: 30px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--pd-text-muted, #8b909c);
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: background .14s ease, color .14s ease, border-color .14s ease, box-shadow .14s ease;
}
.tb-btn:hover {
  color: var(--pd-text, #2a2e37);
  background: var(--pd-sidebar-hover, #f0f3f9);
}
.tb-btn:active {
  background: var(--pd-border-soft, #e9ecf2);
}
.tb-btn:disabled {
  opacity: .32;
  cursor: default;
  background: transparent;
  color: var(--pd-text-faint, #b4b9c4);
}
.tb-btn.danger:hover:not(:disabled) {
  color: var(--pd-accent-secondary, #f56c6c);
  background: var(--pd-danger-soft, rgba(245, 108, 108, .10));
}
.tb-btn.on {
  color: var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, .09));
  font-weight: 600;
}
.tb-btn.warn {
  color: var(--pd-accent-secondary, #f56c6c);
  background: var(--pd-danger-soft, rgba(245, 108, 108, .10));
  font-weight: 600;
}
.tb-btn .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pd-text-faint, #b4b9c4);
  display: inline-block;
  transition: background .14s ease, box-shadow .14s ease;
}
.tb-btn.on .dot {
  background: var(--pd-accent, #165DFF);
  box-shadow: 0 0 0 3px rgba(22, 93, 255, .12);
}
.tb-icon {
  font-size: 15px;
  line-height: 1;
}
/* 顶部栏所有带 data-tip 的按钮统一提示（含置灰态，便于看到禁用原因） */
.designer-toolbar [data-tip] {
  position: relative;
}
.designer-toolbar [data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  bottom: -32px;
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
.designer-toolbar [data-tip]:hover::after {
  opacity: 1;
}
.tb-mark {
  width: 28px;
  height: 28px;
  margin-right: 2px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(150deg, var(--pd-accent-2, #3D7BFF), var(--pd-accent, #165DFF));
  box-shadow: 0 3px 8px rgba(22, 93, 255, .28), inset 0 1px 0 rgba(255, 255, 255, .22);
  flex-shrink: 0;
}
.tb-mark svg {
  width: 16px;
  height: 16px;
}
.tb-title {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  padding-left: 6px;
}
.tb-title-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--pd-text, #2a2e37);
  letter-spacing: .2px;
}
.tb-title-sub {
  font-size: 10px;
  color: var(--pd-text-muted, #8b909c);
  letter-spacing: .8px;
}
.tb-zoom {
  font-size: 12px;
  color: var(--pd-text, #2a2e37);
  font-variant-numeric: tabular-nums;
  min-width: 46px;
  text-align: center;
}
.tb-spacer {
  flex: 1;
}
/* 顶部栏内的下拉触发钮与 tb-btn 对齐 */
.tb-group :deep(.tb-dd-trigger) {
  height: 30px;
  min-width: 30px;
  padding: 0 8px;
}
.tb-btn-text {
  font-size: 12px;
}
.tb-menu {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tb-menu-rows {
  width: 148px;
}
.tb-menu-label {
  padding: 2px 4px;
  font-size: 11px;
  color: var(--pd-text-muted, #8b909c);
}
.tb-menu-grid {
  display: grid;
  grid-template-columns: repeat(4, 32px);
  gap: 2px;
  margin-bottom: 4px;
}
.tb-menu-row {
  justify-content: flex-start;
  width: 100%;
}
.tb-menu-sep {
  height: 1px;
  margin: 4px 0;
  background: var(--pd-border-soft, #e9ecf2);
}
.btn-primary,
.btn-secondary {
  height: 32px;
  padding: 0 16px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: filter .14s ease, background .14s ease, border-color .14s ease, box-shadow .14s ease;
}
.btn-secondary {
  background: var(--pd-field-bg, #f4f6fa);
  color: var(--pd-text-muted, #606266);
  border: 1px solid var(--pd-border, #d9dde6);
}
.btn-secondary:hover {
  border-color: var(--pd-accent, #165DFF);
  color: var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, .06));
}
.btn-primary {
  background: linear-gradient(180deg, var(--pd-accent-2, #3D7BFF), var(--pd-accent, #165DFF));
  color: #fff;
  border: none;
  box-shadow: 0 3px 10px rgba(22, 93, 255, .28), inset 0 1px 0 rgba(255, 255, 255, .18);
}
.btn-primary:hover {
  filter: brightness(1.07);
  box-shadow: 0 5px 14px rgba(22, 93, 255, .34), inset 0 1px 0 rgba(255, 255, 255, .18);
}
.btn-primary:active {
  filter: brightness(.97);
}
</style>
