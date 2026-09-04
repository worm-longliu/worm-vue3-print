<!-- 表格单元格分组：格式化/样式/边框/合并拆分 -->
<template>
  <PropertyGroup title="单元格" icon="Menu" default-expanded group-key="table-cell">
    <form class="pd-form" @submit.prevent>
      <div class="pd-field"><span class="pd-label">单元格类型</span>
        <div class="pd-radio-group" role="radiogroup">
          <label class="pd-radio"><input type="radio" value="text" :checked="(mainCell.cellType || 'text') === 'text'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>文本</span></label>
          <label class="pd-radio"><input type="radio" value="barcode" :checked="mainCell.cellType === 'barcode'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>条形码</span></label>
          <label class="pd-radio"><input type="radio" value="qrcode" :checked="mainCell.cellType === 'qrcode'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>二维码</span></label>
          <label class="pd-radio"><input type="radio" value="image" :checked="mainCell.cellType === 'image'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>图片</span></label>
        </div>
      </div>

      <div class="pd-field" v-if="isBarcodeCell"><span class="pd-label">码制</span>
        <select :value="mainCell.barcodeType || 'CODE128'" class="pd-select" @change="write(c => { c.barcodeType = ($event.target as HTMLSelectElement).value || undefined })">
          <option value="CODE128">CODE128（通用）</option>
          <option value="EAN13">EAN13（商品码）</option>
          <option value="EAN8">EAN8</option>
          <option value="UPC">UPC</option>
          <option value="CODE39">CODE39</option>
          <option value="ITF14">ITF14</option>
        </select>
      </div>
      <div class="pd-field" v-if="isBarcodeCell"><span class="pd-label">显示文本</span>
        <input :checked="mainCell.showBarcodeText !== false" type="checkbox" class="pd-switch" @input="write(c => { c.showBarcodeText = !!($event.target as HTMLInputElement).checked })" />
      </div>
      <div class="pd-field" v-if="isQrcodeCell"><span class="pd-label">纠错级别</span>
        <select :value="mainCell.qrCodeLevel || 'M'" class="pd-select" @change="write(c => { c.qrCodeLevel = ($event.target as HTMLSelectElement).value || undefined })">
          <option value="L">L（最低，容量大）</option>
          <option value="M">M（推荐）</option>
          <option value="Q">Q</option>
          <option value="H">H（最高）</option>
        </select>
      </div>

      <div class="pd-field" v-if="isImageCell"><span class="pd-label">缩放模式</span>
        <select :value="mainCell.fit || 'contain'" class="pd-select" @change="write(c => { c.fit = ($event.target as HTMLSelectElement).value as any })">
          <option value="contain">包含（保持比例）</option>
          <option value="cover">覆盖（保持比例）</option>
          <option value="fill">拉伸填满</option>
          <option value="none">原始尺寸</option>
          <option value="scale-down">缩小（保持比例）</option>
        </select>
      </div>
      <div class="pd-field" v-if="isImageCell"><span class="pd-label">最大宽度 (mm)</span>
        <StepperInput :model-value="mainCell.maxWidth"
          :min="1"
          :max="200"
          placeholder="默认" @update:model-value="write(c => { c.maxWidth = $event ?? undefined })" />
      </div>
      <div class="pd-field" v-if="isImageCell"><span class="pd-label">最大高度 (mm)</span>
        <StepperInput :model-value="mainCell.maxHeight"
          :min="1"
          :max="200"
          placeholder="默认" @update:model-value="write(c => { c.maxHeight = $event ?? undefined })" />
      </div>

      <div class="pd-field"><span class="pd-label">内容</span>
        <input :value="mainCell.formatter || ''" class="pd-input"
          placeholder="输入内容，支持 {字段} 表达式"
          @input="write(c => { c.formatter = ($event.target as HTMLInputElement).value || undefined })"
          @dblclick="openFormatterEditor" />
      </div>

      <div class="pd-field"><span class="pd-label">水平对齐</span>
        <div class="pd-radio-group" role="radiogroup">
          <label class="pd-radio"><input type="radio" value="left" :checked="mainCell.align === 'left'" @change="onAlignChange(($event.target as HTMLInputElement).value)"><span>左</span></label>
          <label class="pd-radio"><input type="radio" value="center" :checked="mainCell.align === 'center'" @change="onAlignChange(($event.target as HTMLInputElement).value)"><span>中</span></label>
          <label class="pd-radio"><input type="radio" value="right" :checked="mainCell.align === 'right'" @change="onAlignChange(($event.target as HTMLInputElement).value)"><span>右</span></label>
        </div>
      </div>
      <div class="pd-field"><span class="pd-label">垂直对齐</span>
        <div class="pd-radio-group" role="radiogroup">
          <label class="pd-radio"><input type="radio" value="top" :checked="mainCell.valign === 'top'" @change="onValignChange(($event.target as HTMLInputElement).value)"><span>上</span></label>
          <label class="pd-radio"><input type="radio" value="middle" :checked="mainCell.valign === 'middle'" @change="onValignChange(($event.target as HTMLInputElement).value)"><span>中</span></label>
          <label class="pd-radio"><input type="radio" value="bottom" :checked="mainCell.valign === 'bottom'" @change="onValignChange(($event.target as HTMLInputElement).value)"><span>下</span></label>
        </div>
      </div>
      <div class="cell-style-grid">
        <div class="pd-field"><span class="pd-label">字体</span>
          <select :value="mainCell.fontFamily" class="pd-select"
            placeholder="继承默认" @change="write(c => { c.fontFamily = ($event.target as HTMLSelectElement).value || undefined })">
            <option value="SimSun">宋体</option>
            <option value="SimHei">黑体</option>
            <option value="Microsoft YaHei">微软雅黑</option>
            <option value="KaiTi">楷体</option>
            <option value="FangSong">仿宋</option>
            <option value="Arial">Arial</option>
          </select>
        </div>
        <div class="pd-field"><span class="pd-label">字号 (pt)</span>
          <StepperInput :model-value="mainCell.fontSize"
            :min="5"
            :max="72"
            placeholder="默认" @update:model-value="write(c => { c.fontSize = $event ?? undefined })" />
        </div>
        <div class="pd-field"><span class="pd-label">加粗</span>
          <input :checked="mainCell.fontWeight === 'bold'" type="checkbox" class="pd-switch" @input="write(c => { c.fontWeight = ($event.target as HTMLInputElement).checked ? 'bold' : undefined })" />
        </div>
        <div class="pd-field"><span class="pd-label">文字颜色</span>
          <PresetColorPicker :model-value="mainCell.color" @update:model-value="write(c => { c.color = $event })" />
        </div>
        <div class="pd-field"><span class="pd-label">背景色</span>
          <PresetColorPicker :model-value="mainCell.backgroundColor" @update:model-value="write(c => { c.backgroundColor = $event })" />
        </div>
      </div>

      <h3 class="pd-divider">边框</h3>
      <div class="border-style-row">
        <select class="pd-select" v-model="borderStyle" style="width: 90px">
          <option value="solid">实线</option>
          <option value="dashed">虚线</option>
          <option value="dotted">点线</option>
          <option value="double">双线</option>
        </select>
        <div style="width: 112px; flex-shrink: 0"><StepperInput v-model="borderWidth"
          :min="0.25"
          :max="5"
          :step="0.25" /></div>
        <PresetColorPicker v-model="borderColor" />
      </div>
      <div class="pd-button-group border-presets">
        <button type="button" class="pd-button small" @click="preset('all')">全部</button>
        <button type="button" class="pd-button small" @click="preset('outer')">外侧</button>
        <button type="button" class="pd-button small" @click="preset('inner')">内部</button>
        <button type="button" class="pd-button small" @click="preset('none')">无</button>
      </div>
      <div class="pd-checkbox-group">
        <label class="pd-checkbox"><input type="checkbox" v-model="edgeChecks" value="top" @change="onEdgesChange($event)"><span>上</span></label>
        <label class="pd-checkbox"><input type="checkbox" v-model="edgeChecks" value="right" @change="onEdgesChange($event)"><span>右</span></label>
        <label class="pd-checkbox"><input type="checkbox" v-model="edgeChecks" value="bottom" @change="onEdgesChange($event)"><span>下</span></label>
        <label class="pd-checkbox"><input type="checkbox" v-model="edgeChecks" value="left" @change="onEdgesChange($event)"><span>左</span></label>
      </div>

      <div class="pd-field"><span class="pd-label">内边距 (mm)</span>
        <StepperInput :model-value="mainCell.padding"
          :min="0"
          :max="10"
          :step="0.5"
          placeholder="默认" @update:model-value="write(c => { c.padding = $event ?? undefined })" />
      </div>
      <div class="pd-field"><span class="pd-label">自动换行</span>
        <input :checked="mainCell.wordWrap ?? true" type="checkbox" class="pd-switch" @input="write(c => { c.wordWrap = !!($event.target as HTMLInputElement).checked })" />
      </div>

      <div class="merge-btns">
        <button type="button" class="pd-button small" :disabled="!!mergeReason" :title="mergeReason || ''" @click="doMerge">
          合并单元格
        </button>
        <button type="button" class="pd-button small" :disabled="!canSplit" @click="doSplit">拆分单元格</button>
      </div>
    </form>
  </PropertyGroup>

  <ExpressionEditor
    v-model="formatterEditorVisible"
    :fields="fields"
    :expression="pendingFormatterValue"
    @update:expression="onFormatterEditorConfirm"
  />
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type {
  RuntimeElement, TableSelection, TableCell, TableCellBorder, TableCellBorders, TableCellType, TextAlign,
  PrintBusinessField,
} from '../../types'
import {
  canMergeReason, mergeCells, splitCells, applyBorderPreset, findMainCell, type BorderPreset,
} from '../../utils/table-matrix'
import { TABLE_EDIT_KEY } from '../../composables/useTableSelection'
import PropertyGroup from './PropertyGroup.vue'
import StepperInput from './StepperInput.vue'
import ExpressionEditor from '../ExpressionEditor.vue'
import PresetColorPicker from '../PresetColorPicker.vue'

const props = defineProps<{
  element: RuntimeElement
  selection: TableSelection
  fields: PrintBusinessField[]
}>()
const ctx = inject(TABLE_EDIT_KEY)!

const rows = computed(() => props.element.options.tableRows!)

const mainCell = computed<TableCell>(() => {
  const m = findMainCell(rows.value, props.selection.r1, props.selection.c1)
  return rows.value[m.r]!.cells[m.c]!
})

const formatterEditorVisible = ref(false)
const pendingFormatterValue = ref('')

const isBarcodeCell = computed(() => mainCell.value.cellType === 'barcode')
const isQrcodeCell = computed(() => mainCell.value.cellType === 'qrcode')
const isImageCell = computed(() => mainCell.value.cellType === 'image')

function onAlignChange(v: string) {
  write(c => { c.align = v as TextAlign })
}

function onValignChange(v: string) {
  write(c => { c.valign = v as TableCell['valign'] })
}

function onCellTypeChange(v: string) {
  write(c => {
    c.cellType = v === 'text' ? undefined : (v as TableCellType)
    if (v !== 'barcode') {
      c.barcodeType = undefined
      c.showBarcodeText = undefined
    }
    if (v !== 'qrcode') c.qrCodeLevel = undefined
    if (v !== 'image') {
      c.fit = undefined
      c.maxWidth = undefined
      c.maxHeight = undefined
    }
  })
}

function openFormatterEditor() {
  pendingFormatterValue.value = mainCell.value.formatter || ''
  formatterEditorVisible.value = true
}

function onFormatterEditorConfirm(val: string) {
  write(c => { c.formatter = val || undefined })
}

function write(fn: (c: TableCell) => void) {
  const s = props.selection
  for (let r = s.r1; r <= s.r2; r++) {
    for (let c = s.c1; c <= s.c2; c++) {
      const cell = rows.value[r]!.cells[c]!
      if (!cell.merged) fn(cell)
    }
  }
  ctx.recordHistory()
}

const borderStyle = ref<TableCellBorder['style']>('solid')
const borderWidth = ref(0.75)
const borderColor = ref('#333333')
const edgeChecks = ref<string[]>([])

function currentBorder(): TableCellBorder {
  return { width: borderWidth.value, style: borderStyle.value, color: borderColor.value }
}

function preset(p: BorderPreset) {
  applyBorderPreset(rows.value, props.selection, p, currentBorder())
  ctx.recordHistory()
}

function onEdgesChange(event: Event) {
  const input = event.target as HTMLInputElement
  const edges = new Set(edgeChecks.value)
  if (input.checked) edges.add(input.value)
  else edges.delete(input.value)
  edgeChecks.value = [...edges]
  const b = currentBorder()
  write(c => {
    const nb = { ...(c.borders ?? {}) } as Record<string, TableCellBorder | undefined>
    for (const side of ['top', 'right', 'bottom', 'left']) {
      if (edges.has(side)) nb[side] = { ...b }
      else delete nb[side]
    }
    c.borders = nb as TableCellBorders
  })
}

const mergeReason = computed(() => canMergeReason(rows.value, props.selection))

const canSplit = computed(() => {
  const s = props.selection
  for (let r = s.r1; r <= s.r2; r++) {
    for (let c = s.c1; c <= s.c2; c++) {
      const cell = rows.value[r]!.cells[c]!
      if (!cell.merged && ((cell.rowspan ?? 1) > 1 || (cell.colspan ?? 1) > 1)) return true
    }
  }
  return false
})

function doMerge() {
  mergeCells(rows.value, props.selection)
  ctx.recordHistory()
}

function doSplit() {
  splitCells(rows.value, props.selection)
  ctx.recordHistory()
}

defineExpose({ openFormatterEditor })
</script>

<style scoped>
.cell-style-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 8px;
}
.border-style-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.border-presets {
  margin-bottom: 8px;
}
.merge-btns {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
</style>
