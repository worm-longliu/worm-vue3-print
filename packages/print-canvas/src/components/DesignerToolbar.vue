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
      <button class="tb-btn tb-icon" :disabled="!canUndo" @click="$emit('undo')" title="撤销">↶</button>
      <button class="tb-btn tb-icon" :disabled="!canRedo" @click="$emit('redo')" title="重做">↷</button>
    </div>
    <!-- 对齐分布(多选) -->
    <div class="tb-group" v-if="hasMultiSelection">
      <button class="tb-btn tb-icon" @click="$emit('align', 'left')" title="左对齐">⇤</button>
      <button class="tb-btn tb-icon" @click="$emit('align', 'right')" title="右对齐">⇥</button>
      <button class="tb-btn tb-icon" @click="$emit('align', 'top')" title="顶对齐">⇡</button>
      <button class="tb-btn tb-icon" @click="$emit('align', 'bottom')" title="底对齐">⇣</button>
      <button class="tb-btn tb-icon" @click="$emit('align', 'vertical')" title="水平居中">↔</button>
      <button class="tb-btn tb-icon" @click="$emit('align', 'horizontal')" title="垂直居中">↕</button>
      <button class="tb-btn tb-icon" @click="$emit('align', 'distributeHor')" title="水平分布">⇔</button>
      <button class="tb-btn tb-icon" @click="$emit('align', 'distributeVer')" title="垂直分布">⇕</button>
    </div>
    <!-- 组合 -->
    <div class="tb-group" v-if="hasMultiSelection">
      <button class="tb-btn" @click="$emit('group')" title="组合">组合</button>
    </div>
    <div class="tb-group" v-if="!hasMultiSelection && selectedElementHasGroup">
      <button class="tb-btn" @click="$emit('ungroup')" title="取消组合">取消组合</button>
    </div>
    <!-- 层级 -->
    <div class="tb-group" v-if="hasSelection">
      <button class="tb-btn tb-icon" @click="$emit('move-layer', 'top')" data-tip="置顶">⤒</button>
      <button class="tb-btn tb-icon" @click="$emit('move-layer', 'up')" data-tip="上移一层">↑</button>
      <button class="tb-btn tb-icon" @click="$emit('move-layer', 'down')" data-tip="下移一层">↓</button>
      <button class="tb-btn tb-icon" @click="$emit('move-layer', 'bottom')" data-tip="置底">⤓</button>
    </div>
    <!-- 视图 -->
    <div class="tb-group">
      <button class="tb-btn" :class="{ on: showRuler }" title="显示/隐藏标尺" @click="$emit('toggle-ruler')">
        <span class="dot" /> 标尺
      </button>
      <button class="tb-btn" :class="{ on: showGrid }" @click="$emit('toggle-grid')">
        <span class="dot" /> 网格
      </button>
      <button class="tb-btn" :class="{ on: showTableGhostBorder }" title="显示/隐藏无边框表格的虚拟虚线" @click="$emit('toggle-table-ghost-border')">
        <span class="dot" /> 虚框
      </button>
      <button class="tb-btn" :class="{ on: snapToGrid }" @click="$emit('toggle-snap')">
        <span class="dot" /> 吸附
      </button>
      <button class="tb-btn tb-icon" @click="$emit('fit-window')" title="适应窗口">⤢</button>
      <button class="tb-btn tb-icon" @click="$emit('zoom', -10)" title="缩小">−</button>
      <span class="tb-zoom">{{ scale }}%</span>
      <button class="tb-btn tb-icon" @click="$emit('zoom', 10)" title="放大">＋</button>
    </div>
    <!-- 操作 -->
    <div class="tb-spacer" />
    <div class="tb-group">
      <HelpButton @click="$emit('help')" />
    </div>
    <div class="tb-group">
      <button class="tb-btn" @click="$emit('add-overlay-element')">首页专属</button>
      <button class="tb-btn" :class="{ warn: overlayVisible }" @click="$emit('toggle-overlay')">叠层对比</button>
    </div>
    <div class="tb-group">
      <button v-if="showLoadDefault" class="btn-secondary" @click="$emit('load-default')">加载默认布局</button>
      <button class="btn-secondary" @click="$emit('preview')">预览</button>
      <button class="btn-primary" @click="$emit('save')">保存</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import HelpButton from './HelpButton.vue'

const scale = defineModel<number>('scale', { default: 100 })

withDefaults(defineProps<{
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
  /** 是否展示「加载默认布局」按钮（宿主注入 loadDefaultTemplate 时由 PrintDesigner 开启） */
  showLoadDefault?: boolean
}>(), {
  showRuler: true,
})

defineEmits<{
  preview: []
  save: []
  'load-default': []
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
  'add-overlay-element': []
  'fit-window': []
  zoom: [delta: number]
  help: []
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
  z-index: 20;
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
.tb-btn[data-tip] {
  position: relative;
}
.tb-btn[data-tip]::after {
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
.tb-btn[data-tip]:hover::after {
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
