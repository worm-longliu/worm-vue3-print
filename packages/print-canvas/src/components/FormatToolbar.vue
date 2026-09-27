<!-- 格式工具栏（第二行）：仿 Word/Excel，对选中文本元素或表格单元格批量应用字体/对齐/边框等常用样式 -->
<template>
  <div class="format-toolbar">
    <!-- 字体组 -->
    <div class="ft-group">
      <div class="ft-font">
        <FontSelect
          :model-value="fontFamilyDisplay"
          :placeholder="fontFamilyPlaceholder"
          :disabled="fontDisabled"
          @update:model-value="v => format.applyStyle({ fontFamily: v })"
        />
      </div>
      <div class="ft-size" data-test="font-size">
        <StepperInput
          :model-value="fontSizeDisplay"
          :min="5"
          :max="72"
          :placeholder="fontSizePlaceholder"
          :disabled="fontDisabled"
          @update:model-value="v => format.applyStyle({ fontSize: v })"
        />
      </div>
    </div>
    <!-- 文字样式组 -->
    <div class="ft-group">
      <button type="button" class="ft-btn" data-test="bold" :class="{ on: boldOn }" :disabled="fontDisabled" data-tip="加粗" @click="format.toggleBold()">
        <Bold :size="15" />
      </button>
      <button type="button" class="ft-btn" data-test="underline" :class="{ on: values.underline === true }" :disabled="decoDisabled" data-tip="下划线" @click="format.toggleUnderline()">
        <Underline :size="15" />
      </button>
      <button type="button" class="ft-btn" data-test="strike" :class="{ on: values.strike === true }" :disabled="decoDisabled" data-tip="删除线" @click="format.toggleStrike()">
        <Strikethrough :size="15" />
      </button>
    </div>
    <!-- 颜色组 -->
    <div class="ft-group">
      <span class="ft-color-btn" :class="{ dim: fontDisabled }" :title="`字体颜色${fontDisabled ? '（需选中或混选文本元素）' : ''}`">
        <PresetColorPicker
          :model-value="textColor"
          @update:model-value="v => format.applyStyle({ color: v })"
        />
        <span class="ft-glyph">A</span>
      </span>
      <span class="ft-color-btn" :class="{ dim: borderDisabled }" title="背景色">
        <PresetColorPicker
          :model-value="bgColor"
          @update:model-value="v => format.applyStyle({ backgroundColor: v })"
        />
        <span class="ft-glyph"><PaintBucket :size="14" /></span>
      </span>
    </div>
    <!-- 对齐组 -->
    <div class="ft-group">
      <button type="button" class="ft-btn" data-test="align-left" :class="{ on: values.textAlign === 'left' }" :disabled="fontDisabled" data-tip="左对齐" @click="format.applyStyle({ textAlign: 'left' })">
        <TextAlignStart :size="15" />
      </button>
      <button type="button" class="ft-btn" data-test="align-center" :class="{ on: values.textAlign === 'center' }" :disabled="fontDisabled" data-tip="水平居中" @click="format.applyStyle({ textAlign: 'center' })">
        <TextAlignCenter :size="15" />
      </button>
      <button type="button" class="ft-btn" data-test="align-right" :class="{ on: values.textAlign === 'right' }" :disabled="fontDisabled" data-tip="右对齐" @click="format.applyStyle({ textAlign: 'right' })">
        <TextAlignEnd :size="15" />
      </button>
      <span class="ft-sep" />
      <button type="button" class="ft-btn" data-test="valign-top" :class="{ on: values.verticalAlign === 'top' }" :disabled="fontDisabled" data-tip="顶端对齐" @click="format.applyStyle({ verticalAlign: 'top' })">
        <ArrowUpToLine :size="15" />
      </button>
      <button type="button" class="ft-btn" data-test="valign-middle" :class="{ on: values.verticalAlign === 'middle' }" :disabled="fontDisabled" data-tip="垂直居中" @click="format.applyStyle({ verticalAlign: 'middle' })">
        <ChevronsUpDown :size="15" />
      </button>
      <button type="button" class="ft-btn" data-test="valign-bottom" :class="{ on: values.verticalAlign === 'bottom' }" :disabled="fontDisabled" data-tip="底端对齐" @click="format.applyStyle({ verticalAlign: 'bottom' })">
        <ArrowDownToLine :size="15" />
      </button>
    </div>
    <!-- 边框组 -->
    <div ref="borderWrapRef" class="ft-group ft-relative">
      <button type="button" class="ft-btn" data-test="border" :disabled="borderDisabled" data-tip="边框" @click="panelOpen = !panelOpen">
        <Grid3x3 :size="15" />
        <span class="ft-btn-text">边框</span>
      </button>
      <div v-if="panelOpen" class="ft-border-panel" data-test="border-panel">
        <div class="ft-border-grid">
          <button type="button" class="ft-cell-btn" data-test="preset-none" title="无边框" @click="onPreset('none')">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <rect class="g-faint" x="2.5" y="2.5" width="13" height="13" />
              <line class="g-solid" x1="4" y1="14" x2="14" y2="4" />
            </svg>
          </button>
          <button type="button" class="ft-cell-btn" data-test="preset-all" title="所有边框" @click="onPreset('all')">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <rect class="g-solid" x="2.5" y="2.5" width="13" height="13" fill="none" />
              <line class="g-solid" x1="9" y1="3" x2="9" y2="15" />
              <line class="g-solid" x1="3" y1="9" x2="15" y2="9" />
            </svg>
          </button>
          <button type="button" class="ft-cell-btn" data-test="preset-outer" title="外侧边框" @click="onPreset('outer')">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <rect class="g-solid" x="2.5" y="2.5" width="13" height="13" fill="none" />
            </svg>
          </button>
          <button type="button" class="ft-cell-btn" data-test="preset-inner" :disabled="!isCells" title="内部边框" @click="onPreset('inner')">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <rect class="g-faint" x="2.5" y="2.5" width="13" height="13" />
              <line class="g-solid" x1="9" y1="3" x2="9" y2="15" />
              <line class="g-solid" x1="3" y1="9" x2="15" y2="9" />
            </svg>
          </button>
          <button type="button" class="ft-cell-btn" data-test="edge-top" :class="{ on: edgeOn('top') }" title="上边框" @click="onEdge('top')">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <rect class="g-faint" x="2.5" y="2.5" width="13" height="13" />
              <line class="g-solid" x1="2" y1="3" x2="16" y2="3" />
            </svg>
          </button>
          <button type="button" class="ft-cell-btn" data-test="edge-bottom" :class="{ on: edgeOn('bottom') }" title="下边框" @click="onEdge('bottom')">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <rect class="g-faint" x="2.5" y="2.5" width="13" height="13" />
              <line class="g-solid" x1="2" y1="15" x2="16" y2="15" />
            </svg>
          </button>
          <button type="button" class="ft-cell-btn" data-test="edge-left" :class="{ on: edgeOn('left') }" title="左边框" @click="onEdge('left')">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <rect class="g-faint" x="2.5" y="2.5" width="13" height="13" />
              <line class="g-solid" x1="3" y1="2" x2="3" y2="16" />
            </svg>
          </button>
          <button type="button" class="ft-cell-btn" data-test="edge-right" :class="{ on: edgeOn('right') }" title="右边框" @click="onEdge('right')">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <rect class="g-faint" x="2.5" y="2.5" width="13" height="13" />
              <line class="g-solid" x1="15" y1="2" x2="15" y2="16" />
            </svg>
          </button>
        </div>
        <div class="ft-style-row">
          <button
            v-for="s in LINE_STYLES" :key="s.key"
            type="button" class="ft-style-btn" :class="{ on: borderStyle === s.key }"
            :data-test="`style-${s.key}`" :title="s.label" @click="borderStyle = s.key"
          >
            <span class="ft-style-line" :style="{ borderTop: s.preview }"></span>
          </button>
        </div>
        <div class="ft-border-style-row">
          <span class="ft-edge-label">粗细</span>
          <div class="ft-line-width">
            <StepperInput v-model="borderWidth" :min="0.25" :max="5" :step="0.25" />
          </div>
        </div>
        <div class="ft-border-style-row">
          <span class="ft-edge-label">颜色</span>
          <PresetColorPicker v-model="borderColor" :clearable="false" />
        </div>
      </div>
    </div>
    <div class="ft-spacer" />
    <!-- 剪贴板组 -->
    <div class="ft-group">
      <button type="button" class="ft-btn" data-test="copy" :disabled="clipboardDisabled" data-tip="复制 (Ctrl+C)" @click="$emit('copy')">
        <Copy :size="15" />
      </button>
      <button type="button" class="ft-btn" data-test="paste" :disabled="clipboardDisabled || !hasClipboard" data-tip="粘贴 (Ctrl+V)" @click="$emit('paste')">
        <ClipboardPaste :size="15" />
      </button>
      <button type="button" class="ft-btn danger" data-test="delete" :disabled="clipboardDisabled" data-tip="删除 (Delete)" @click="$emit('delete')">
        <Trash2 :size="15" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Bold, Underline, Strikethrough, TextAlignStart, TextAlignCenter, TextAlignEnd,
  ArrowUpToLine, ChevronsUpDown, ArrowDownToLine, Grid3x3,
  Copy, ClipboardPaste, Trash2, PaintBucket,
} from 'lucide-vue-next'
import type { BorderPreset } from '@worm-vue3-print/core/designer'
import type { FormatToolbar } from '../composables/useFormatToolbar'
import { MIXED } from '../composables/useFormatToolbar'
import FontSelect from './property/FontSelect.vue'
import StepperInput from './property/StepperInput.vue'
import PresetColorPicker from './PresetColorPicker.vue'

const props = withDefaults(defineProps<{
  format: FormatToolbar
  hasClipboard?: boolean
}>(), {
  hasClipboard: false,
})

defineEmits<{
  copy: []
  paste: []
  delete: []
}>()

const values = computed(() => props.format.values.value)

const fontDisabled = computed(() => !props.format.fontEditable.value)
const decoDisabled = computed(() => fontDisabled.value || props.format.context.value === 'cells')
const borderDisabled = computed(() => props.format.context.value === 'none')
const clipboardDisabled = computed(() => props.format.context.value !== 'elements')

/** 混合态：控件留空并以「混合」占位提示（仿 Word 多样式选中） */
const fontFamilyDisplay = computed(() => (values.value.fontFamily === MIXED ? undefined : values.value.fontFamily))
const fontFamilyPlaceholder = computed(() => (values.value.fontFamily === MIXED ? '混合' : '默认'))
const fontSizeDisplay = computed(() => (values.value.fontSize === MIXED ? undefined : values.value.fontSize))
const fontSizePlaceholder = computed(() => (values.value.fontSize === MIXED ? '混合' : '默认'))
const boldOn = computed(() => values.value.bold === true)
const textColor = computed(() => (values.value.color === MIXED ? undefined : values.value.color))
const bgColor = computed(() => (values.value.backgroundColor === MIXED ? undefined : values.value.backgroundColor))

/* 边框面板（WPS 式）：线型/粗细/颜色为面板内草稿，点图标按钮时整体落盘 */
const panelOpen = ref(false)
const borderWrapRef = ref<HTMLElement | null>(null)
const borderStyle = ref<'solid' | 'dashed' | 'dotted' | 'double'>('solid')
const borderWidth = ref(0.75)
const borderColor = ref('#333333')

const isCells = computed(() => props.format.context.value === 'cells')

const LINE_STYLES = [
  { key: 'solid', label: '实线', preview: '2px solid currentColor' },
  { key: 'dashed', label: '虚线', preview: '2px dashed currentColor' },
  { key: 'dotted', label: '点线', preview: '2px dotted currentColor' },
  { key: 'double', label: '双线', preview: '3px double currentColor' },
] as const

type BorderSide = 'top' | 'right' | 'bottom' | 'left'

function borderSpec() {
  return { width: borderWidth.value, style: borderStyle.value, color: borderColor.value }
}

function onPreset(p: BorderPreset) {
  if (isCells.value) {
    props.format.applyCellBorderPreset(p, borderSpec())
  } else {
    props.format.applyElementBorder(p === 'none' ? 'none' : 'all', borderSpec())
  }
}

/** 单边按下态：单元格看选区 borders，元素看 options.borders */
function edgeOn(side: BorderSide): boolean {
  const edges = isCells.value ? props.format.cellEdges.value : props.format.elementEdges.value
  return edges?.[side] === true
}

function onEdge(side: BorderSide) {
  if (isCells.value) props.format.toggleCellEdge(side, borderSpec())
  else props.format.toggleElementEdge(side, borderSpec())
}

function onDocPointerDown(e: PointerEvent) {
  if (!panelOpen.value) return
  if (borderWrapRef.value?.contains(e.target as Node)) return
  panelOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointerDown))
</script>

<style scoped>
.format-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 12px;
  height: 40px;
  background: var(--pd-surface, #ffffff);
  border-bottom: 1px solid var(--pd-border-soft, #e9ecf2);
  flex-shrink: 0;
  position: relative;
  z-index: 99;
}
.ft-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
}
.ft-group + .ft-group {
  border-left: 1px solid var(--pd-border-soft, #e9ecf2);
}
.ft-relative {
  position: relative;
}
.ft-spacer {
  flex: 1;
}
.ft-btn {
  height: 28px;
  min-width: 28px;
  padding: 0 5px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--pd-text-muted, #8b909c);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: background .14s ease, color .14s ease;
}
.ft-btn:hover:not(:disabled) {
  color: var(--pd-text, #2a2e37);
  background: var(--pd-sidebar-hover, #f0f3f9);
}
.ft-btn:disabled {
  opacity: .32;
  cursor: default;
}
.ft-btn.on {
  color: var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, .09));
}
.ft-btn.danger:hover:not(:disabled) {
  color: var(--pd-accent-secondary, #f56c6c);
  background: var(--pd-danger-soft, rgba(245, 108, 108, .10));
}
.ft-btn-text {
  font-size: 12px;
}
.ft-btn[data-tip] {
  position: relative;
}
.ft-btn[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  top: 34px;
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
.ft-btn[data-tip]:hover:not(:disabled)::after {
  opacity: 1;
}
.ft-font {
  width: 150px;
}
.ft-size {
  width: 96px;
}
.ft-sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--pd-border-soft, #e9ecf2);
}
/* Word 式颜色按钮：图标本体即触发器，底部色条显示当前颜色（A=字色，油漆桶=填充色） */
.ft-color-btn {
  position: relative;
  width: 28px;
  height: 28px;
  display: inline-flex;
  margin-left: 2px;
}
.ft-color-btn.dim {
  opacity: .35;
}
.ft-color-btn :deep(.preset-color-trigger) {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  align-items: flex-end;
  justify-content: center;
}
.ft-color-btn :deep(.preset-color-trigger:hover),
.ft-color-btn :deep(.preset-color-trigger[aria-expanded="true"]) {
  background: var(--pd-sidebar-hover, #f0f3f9);
  border-color: var(--pd-border-soft, #e9ecf2);
}
.ft-color-btn :deep(.preset-color-swatch) {
  width: 16px;
  height: 4px;
  margin-bottom: 3px;
  border-radius: 1px;
  background-image: none;
  border-bottom: 1px solid var(--pd-text-faint, #b4b9c4);
}
.ft-glyph {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 7px;
  font-size: 13px;
  font-weight: 700;
  color: var(--pd-text, #2a2e37);
  pointer-events: none;
}
.ft-border-panel {
  position: absolute;
  top: 36px;
  left: 4px;
  width: 196px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--pd-surface, #fff);
  border: 1px solid var(--pd-border, #d9dde6);
  border-radius: 8px;
  box-shadow: var(--pd-shadow-md, 0 2px 8px rgba(23, 32, 60, .06), 0 10px 28px rgba(23, 32, 60, .07));
  z-index: 200;
}
.ft-border-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.ft-cell-btn {
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--pd-text, #2a2e37);
  cursor: pointer;
}
.ft-cell-btn:hover:not(:disabled) {
  background: var(--pd-sidebar-hover, #f0f3f9);
  border-color: var(--pd-border-soft, #e9ecf2);
}
.ft-cell-btn.on {
  color: var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, .09));
  border-color: rgba(22, 93, 255, .35);
}
.ft-cell-btn:disabled {
  opacity: .32;
  cursor: default;
}
.ft-cell-btn .g-faint {
  fill: none;
  stroke: var(--pd-text-faint, #b4b9c4);
  stroke-width: 1;
  stroke-dasharray: 2 2;
}
.ft-cell-btn .g-solid {
  stroke: currentColor;
  stroke-width: 1.6;
}
.ft-style-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.ft-style-btn {
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--pd-text, #2a2e37);
  cursor: pointer;
}
.ft-style-btn:hover {
  background: var(--pd-sidebar-hover, #f0f3f9);
}
.ft-style-btn.on {
  color: var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, .09));
  border-color: rgba(22, 93, 255, .35);
}
.ft-style-line {
  width: 100%;
  height: 0;
}
.ft-border-style-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ft-line-width {
  width: 96px;
}
.ft-edge-label {
  font-size: 12px;
  color: var(--pd-text-muted, #8b909c);
}
</style>
