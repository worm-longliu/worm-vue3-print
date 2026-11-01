<!-- 表格单元格分组：格式化/样式/边框/合并拆分 -->
<template>
  <PropertyGroup title="单元格" icon="Menu" default-expanded group-key="table-cell">
    <form class="pd-form" @submit.prevent>
      <p class="pd-hint" v-if="isMulti">已选 {{ cellCount }} 格 · 批量设置：不显示单格配置，改动会应用到全部选中格</p>
      <div class="pd-field"><span class="pd-label">单元格类型</span>
        <div class="pd-radio-group" role="radiogroup">
          <label class="pd-radio"><input type="radio" value="text" :checked="isTextTypeChecked" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>文本</span></label>
          <label class="pd-radio"><input type="radio" value="barcode" :checked="cellTypeDisplay === 'barcode'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>条形码</span></label>
          <label class="pd-radio"><input type="radio" value="qrcode" :checked="cellTypeDisplay === 'qrcode'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>二维码</span></label>
          <label class="pd-radio"><input type="radio" value="image" :checked="cellTypeDisplay === 'image'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>图片</span></label>
        </div>
      </div>

      <div class="pd-field" v-if="isBarcodeCell"><span class="pd-label">码制</span>
        <select :value="barcodeTypeDisplay" class="pd-select" @change="onBarcodeTypeChange(($event.target as HTMLSelectElement).value)">
          <option v-if="isMulti" :value="MULTI_VALUE" disabled>多选</option>
          <option value="CODE128">CODE128（通用）</option>
          <option value="EAN13">EAN13（商品码）</option>
          <option value="EAN8">EAN8</option>
          <option value="UPC">UPC</option>
          <option value="CODE39">CODE39</option>
          <option value="ITF14">ITF14</option>
        </select>
      </div>
      <div class="pd-field" v-if="isBarcodeCell"><span class="pd-label"><span class="pd-label-t">显示文本</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="showBarcodeText" :tip-override="CELL_TIP" :write="(v) => writeField('showBarcodeText', v)" />
        </span>
        <input :checked="showBarcodeTextChecked" type="checkbox" class="pd-switch" @input="writeField('showBarcodeText', !!($event.target as HTMLInputElement).checked)" />
      </div>
      <div class="pd-field" v-if="isBarcodeCell"><span class="pd-label"><span class="pd-label-t">条宽（倍率）</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="barWidth" :tip-override="CELL_TIP" :write="(v) => writeField('barWidth', v)" />
        </span>
        <StepperInput :model-value="barWidthDisplay"
          :min="2"
          :max="8"
          :step="0.5"
          :placeholder="isMulti ? '多选' : undefined"
          @update:model-value="writeField('barWidth', $event)" />
      </div>
      <p class="pd-hint" v-if="isBarcodeCell">{{ barWidthHint }}</p>
      <div class="pd-field" v-if="isBarcodeCell"><span class="pd-label"><span class="pd-label-t">静区 (模块)<button type="button" class="pd-help" :data-tip="barQuietTip" aria-label="字段说明" /></span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="barQuietZone" :tip-override="CELL_TIP" :write="(v) => writeField('barQuietZone', v)" />
        </span>
        <StepperInput :model-value="cellValue('barQuietZone')"
          :min="0"
          :max="20"
          :placeholder="isMulti ? '多选' : '默认 10'"
          @update:model-value="writeField('barQuietZone', $event ?? undefined)" />
      </div>
      <div class="pd-field" v-if="isBarcodeCell"><span class="pd-label"><span class="pd-label-t">条高 (mm)<button type="button" class="pd-help" :data-tip="barHeightTip" aria-label="字段说明" /></span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="barHeight" :tip-override="CELL_TIP" :write="(v) => writeField('barHeight', v)" />
        </span>
        <StepperInput :model-value="cellValue('barHeight')"
          :min="1"
          :max="100"
          :placeholder="isMulti ? '多选' : '默认 30 模块'"
          @update:model-value="writeField('barHeight', $event ?? undefined)" />
      </div>
      <div class="pd-field" v-if="isBarcodeCell"><span class="pd-label"><span class="pd-label-t">文本字号（相对条高，条高为 30）</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="barFontSize" :tip-override="CELL_TIP" :write="(v) => writeField('barFontSize', v)" />
        </span>
        <StepperInput :model-value="barFontSizeDisplay"
          :min="5"
          :max="24"
          :placeholder="isMulti ? '多选' : '默认 10'"
          @update:model-value="writeField('barFontSize', $event ?? undefined)" />
      </div>
      <div class="pd-field" v-if="isBarcodeCell"><span class="pd-label"><span class="pd-label-t">打印机分辨率</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="printerDpi" :tip-override="CELL_TIP" :write="(v) => writeField('printerDpi', v)" />
        </span>
        <select :value="printerDpiDisplay" class="pd-select" @change="onPrinterDpiChange(($event.target as HTMLSelectElement).value)">
          <option v-if="isMulti" :value="MULTI_VALUE" disabled>多选</option>
          <option value="">不指定（按条宽渲染）</option>
          <option value="203">203 dpi（8 点/mm）</option>
          <option value="300">300 dpi（11.8 点/mm）</option>
          <option value="600">600 dpi（23.6 点/mm）</option>
        </select>
      </div>
      <p class="pd-hint" v-if="isBarcodeCell">填写后条宽吸附到整数打印点（消除出纸「条宽忽宽忽窄」）：条码先按条宽渲染，可用宽度够就原样落纸，不够才整体等比缩小</p>
      <div class="pd-field" v-if="isQrcodeCell"><span class="pd-label"><span class="pd-label-t">纠错级别</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="qrCodeLevel" :tip-override="CELL_TIP" :write="(v) => writeField('qrCodeLevel', v)" />
        </span>
        <select :value="qrCodeLevelDisplay" class="pd-select" @change="onQrLevelChange(($event.target as HTMLSelectElement).value)">
          <option v-if="isMulti" :value="MULTI_VALUE" disabled>多选</option>
          <option value="L">L（最低，容量大）</option>
          <option value="M">M（推荐）</option>
          <option value="Q">Q</option>
          <option value="H">H（最高）</option>
        </select>
      </div>

      <div class="pd-field" v-if="isQrcodeCell"><span class="pd-label"><span class="pd-label-t">静区 (模块)<button type="button" class="pd-help" :data-tip="quietTip" aria-label="字段说明" /></span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="qrQuietZone" :tip-override="CELL_TIP" :write="(v) => writeField('qrQuietZone', v)" />
        </span>
        <StepperInput :model-value="cellValue('qrQuietZone')"
          :min="0"
          :max="8"
          :placeholder="isMulti ? '多选' : '默认 0'" @update:model-value="writeField('qrQuietZone', $event ?? undefined)" />
      </div>

      <p class="pd-hint" v-if="isBarcodeCell">单元格条码尺寸由「条宽」与「打印机分辨率」结算：可用宽度足够时按条宽原样落纸，不足时整体等比缩小；拉伸会把条宽变成非整数，故条形码不提供缩放模式，可用「最大宽高」限制上限。要放大条码：先加条宽倍率，再收窄静区（左右白边会换成条宽），必要时关掉显示文本以让出文本区高度</p>
      <div class="pd-field" v-if="isQrcodeCell || isImageCell"><span class="pd-label"><span class="pd-label-t">缩放模式</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="fit" :tip-override="CELL_TIP" :write="(v) => writeField('fit', v)" />
        </span>
        <select :value="fitDisplay" class="pd-select" @change="onFitChange(($event.target as HTMLSelectElement).value)">
          <option v-if="isMulti" :value="MULTI_VALUE" disabled>多选</option>
          <option v-for="o in IMAGE_FIT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
      <div class="pd-cell-anchor" v-if="isImageCell && !isMulti && mainCell.fit === 'cover'">
        <CropAnchorField field-key="ap-img-object-position"
          label="裁剪锚点"
          :options="mainCell" :base="CELL_FACTORY" :tip-override="CELL_TIP"
          :write-anchor="(v) => writeField('objectPosition', v)"
          :write-scale="(v) => writeField('fitScale', v)"
          :src="cellImageSrc"
          :fit="mainCell.fit"
          :width-mm="cellBoxMm.width"
          :height-mm="cellBoxMm.height"
          :scale="mainCell.fitScale"
          :model-value="mainCell.objectPosition"
          @update:model-value="writeField('objectPosition', $event)"
          @update:scale="writeField('fitScale', $event)" />
      </div>
      <div class="pd-field" v-if="isBarcodeCell || isQrcodeCell || isImageCell"><span class="pd-label"><span class="pd-label-t">最大宽度 (mm)</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="maxWidth" :tip-override="CELL_TIP" :write="(v) => writeField('maxWidth', v)" />
        </span>
        <StepperInput :model-value="cellValue('maxWidth')"
          :min="1"
          :max="200"
          :placeholder="isMulti ? '多选' : '默认'" @update:model-value="writeField('maxWidth', $event ?? undefined)" />
      </div>
      <div class="pd-field" v-if="isBarcodeCell || isQrcodeCell || isImageCell"><span class="pd-label"><span class="pd-label-t">最大高度 (mm)</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="maxHeight" :tip-override="CELL_TIP" :write="(v) => writeField('maxHeight', v)" />
        </span>
        <StepperInput :model-value="cellValue('maxHeight')"
          :min="1"
          :max="200"
          :placeholder="isMulti ? '多选' : '默认'" @update:model-value="writeField('maxHeight', $event ?? undefined)" />
      </div>

      <div class="pd-field"><span class="pd-label">内容</span>
        <input :value="cellValue('formatter') || ''" class="pd-input"
          :placeholder="isMulti ? '多选（输入后覆盖全部选中格）' : '输入内容，支持 {字段} 表达式'"
          @input="writeField('formatter', ($event.target as HTMLInputElement).value || undefined)"
          @dblclick="openFormatterEditor" />
      </div>

      <div class="pd-field"><span class="pd-label"><span class="pd-label-t">水平对齐</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="align" :tip-override="CELL_TIP" :write="(v) => writeField('align', v)" />
        </span>
        <div class="pd-radio-group" role="radiogroup">
          <label class="pd-radio"><input type="radio" value="left" :checked="cellValue('align') === 'left'" @change="onAlignChange(($event.target as HTMLInputElement).value)"><span>左</span></label>
          <label class="pd-radio"><input type="radio" value="center" :checked="cellValue('align') === 'center'" @change="onAlignChange(($event.target as HTMLInputElement).value)"><span>中</span></label>
          <label class="pd-radio"><input type="radio" value="right" :checked="cellValue('align') === 'right'" @change="onAlignChange(($event.target as HTMLInputElement).value)"><span>右</span></label>
          <label class="pd-radio"><input type="radio" value="justify" :checked="cellValue('align') === 'justify'" @change="onAlignChange(($event.target as HTMLInputElement).value)"><span>两端</span></label>
        </div>
      </div>
      <div class="pd-field"><span class="pd-label"><span class="pd-label-t">垂直对齐</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="valign" :tip-override="CELL_TIP" :write="(v) => writeField('valign', v)" />
        </span>
        <div class="pd-radio-group" role="radiogroup">
          <label class="pd-radio"><input type="radio" value="top" :checked="cellValue('valign') === 'top'" @change="onValignChange(($event.target as HTMLInputElement).value)"><span>上</span></label>
          <label class="pd-radio"><input type="radio" value="middle" :checked="cellValue('valign') === 'middle'" @change="onValignChange(($event.target as HTMLInputElement).value)"><span>中</span></label>
          <label class="pd-radio"><input type="radio" value="bottom" :checked="cellValue('valign') === 'bottom'" @change="onValignChange(($event.target as HTMLInputElement).value)"><span>下</span></label>
        </div>
      </div>
      <div class="cell-style-grid">
        <div class="pd-field cell-font-field"><span class="pd-label"><span class="pd-label-t">字体</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="fontFamily" :tip-override="CELL_TIP" :write="(v) => writeField('fontFamily', v)" />
        </span>
          <FontSelect
            :model-value="cellValue('fontFamily')"
            :placeholder="isMulti ? '多选' : '继承默认'"
            @update:model-value="writeField('fontFamily', $event)"
          />
        </div>
        <div class="pd-field"><span class="pd-label"><span class="pd-label-t">字号 (pt)</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="fontSize" :tip-override="CELL_TIP" :write="(v) => writeField('fontSize', v)" />
        </span>
          <StepperInput :model-value="cellValue('fontSize')"
            :min="5"
            :max="72"
            :placeholder="isMulti ? '多选' : '默认'" @update:model-value="writeField('fontSize', $event ?? undefined)" />
        </div>
        <div class="pd-field"><span class="pd-label"><span class="pd-label-t">加粗</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="fontWeight" :tip-override="CELL_TIP" :write="(v) => writeField('fontWeight', v)" />
        </span>
          <input :checked="cellValue('fontWeight') === 'bold'" type="checkbox" class="pd-switch" @input="writeField('fontWeight', ($event.target as HTMLInputElement).checked ? 'bold' : undefined)" />
        </div>
        <div class="pd-field"><span class="pd-label"><span class="pd-label-t">文字颜色</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="color" :tip-override="CELL_TIP" :write="(v) => writeField('color', v)" />
        </span>
          <PresetColorPicker :model-value="cellValue('color')" @update:model-value="writeField('color', $event)" />
        </div>
        <div class="pd-field"><span class="pd-label"><span class="pd-label-t">背景色</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="backgroundColor" :tip-override="CELL_TIP" :write="(v) => writeField('backgroundColor', v)" />
        </span>
          <PresetColorPicker :model-value="cellValue('backgroundColor')" @update:model-value="writeField('backgroundColor', $event)" />
        </div>
      </div>

      <h3 class="pd-divider">边框</h3>
      <div class="border-style-row">
        <select class="pd-select" :value="borderStyleDisplay" style="width: 90px"
          @change="onBorderStyleChange(($event.target as HTMLSelectElement).value)">
          <option v-if="mixedActive.style" :value="BORDER_MIXED_VALUE" disabled>混合</option>
          <option v-for="s in BORDER_LINE_STYLES" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
        <div style="width: 112px; flex-shrink: 0"><StepperInput :model-value="borderWidthDisplay"
          :min="0.25"
          :max="5"
          :step="0.25"
          :placeholder="isMulti ? '多选' : (mixedActive.width ? '混合' : undefined)"
          @update:model-value="overrideBorder('width', $event ?? DEFAULT_BORDER.width)" /></div>
        <PresetColorPicker :model-value="borderColorDisplay" :clearable="false"
          :empty-title="mixedActive.color ? '混合' : undefined"
          @update:model-value="overrideBorder('color', $event)" />
      </div>
      <div class="pd-button-group border-presets">
        <button type="button" class="pd-button small" @click="preset('all')">全部</button>
        <button type="button" class="pd-button small" @click="preset('outer')">外侧</button>
        <button type="button" class="pd-button small" @click="preset('inner')">内部</button>
        <button type="button" class="pd-button small" @click="preset('none')">无</button>
      </div>
      <div class="pd-checkbox-group">
        <label class="pd-checkbox" v-for="e in BORDER_EDGES" :key="e.value">
          <input type="checkbox" :checked="edgeStates[e.value] === 'on'"
            :indeterminate.prop="edgeStates[e.value] === 'mixed'"
            @change="onEdgeChange(e.value, $event)"><span>{{ e.label }}</span>
        </label>
      </div>
      <p class="pd-hint">{{ isMulti ? CELL_BORDER_APPLY_HINT_MULTI : (mixedActiveAny ? CELL_BORDER_APPLY_HINT_MIXED : CELL_BORDER_APPLY_HINT) }}</p>

      <div class="pd-field"><span class="pd-label"><span class="pd-label-t">内边距 (mm)</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="padding" :tip-override="CELL_TIP" :write="(v) => writeField('padding', v)" />
        </span>
        <StepperInput :model-value="cellValue('padding')"
          :min="0"
          :max="10"
          :step="0.5"
          :placeholder="isMulti ? '多选' : '默认'" @update:model-value="writeField('padding', $event ?? undefined)" />
      </div>
      <div class="pd-field"><span class="pd-label"><span class="pd-label-t">自动换行</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="wordWrap" :tip-override="CELL_TIP" :write="(v) => writeField('wordWrap', v)" />
        </span>
        <input :checked="wordWrapChecked" type="checkbox" class="pd-switch" @input="writeField('wordWrap', !!($event.target as HTMLInputElement).checked)" />
      </div>
      <div class="pd-field" v-if="isTextCell"><span class="pd-label"><span class="pd-label-t">文字溢出</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="textFit" :tip-override="CELL_TIP" :write="(v) => writeField('textFit', v)" />
        </span>
        <select class="pd-select" :value="cellTextFit ?? MULTI_VALUE" style="width: 100%" @change="onTextFitChange">
          <option v-if="isMulti" :value="MULTI_VALUE" disabled>多选</option>
          <option value="clip">截断</option>
          <option value="shrink">自动缩小</option>
          <option value="autoHeight">自适应行高</option>
        </select>
      </div>
      <div class="pd-field" v-if="isTextCell && cellTextFit === 'shrink'"><span class="pd-label"><span class="pd-label-t">最小字号 (pt)</span>
          <ResetButton :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="shrinkMinFontSize" :tip-override="CELL_TIP" :write="(v) => writeField('shrinkMinFontSize', v)" />
        </span>
        <StepperInput :model-value="cellValue('shrinkMinFontSize')"
          :min="1"
          :max="72"
          :step="0.5"
          :placeholder="isMulti ? '多选' : '默认 6'"
          @update:model-value="writeField('shrinkMinFontSize', $event ?? undefined)" />
      </div>

      <div class="merge-card">
        <div class="merge-card-title">单元格合并</div>
        <div class="merge-btns">
          <button type="button" class="pd-button small" :disabled="!!mergeReason" :title="mergeReason || ''" @click="doMerge">
            合并单元格
          </button>
          <button type="button" class="pd-button small" :disabled="!canSplit" @click="doSplit">拆分单元格</button>
        </div>
        <div class="merge-card-divider" />
        <div class="pd-field"><span class="pd-label"><span class="pd-label-t">按值合并</span>
            <ResetButton v-if="mergeSameValueEnabled" :force="isMulti" :target="mainCell" :base="CELL_FACTORY" prop-key="mergeSameValue" :tip-override="CELL_TIP" :write="(v) => writeField('mergeSameValue', v)" />
          </span>
          <input :checked="mergeSameValueChecked" type="checkbox" class="pd-switch" :disabled="!mergeSameValueEnabled" :title="mergeSameValueReason" @input="writeField('mergeSameValue', !!($event.target as HTMLInputElement).checked)" />
        </div>
        <div class="merge-card-hint">明细相邻行同值时自动纵向合并，跨页整段后移不切开</div>
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
import { computed, inject, ref, watch } from 'vue'
import type {
  ElementBorderSide, RuntimeElement, TableSelection, TableCell, TableCellBorder, TableCellType, TextAlign,
  PrintBusinessField,
} from '@worm-vue3-print/core/designer'
import {
  canMergeReason, mergeCells, splitCells, applyBorderPreset, setCellBorderEdge, findMainCell,
  resolveBorderEdgeStates, resolveCellBorderDisplay, collectWritableCells, resolveCellGroupMode,
  resolveSharedCellType, BORDER_LINE_STYLES, DEFAULT_BORDER, type BorderPreset, type BorderEdgeState,
  resolveCellTextFit, type TextFit, propertyTip, IMAGE_FIT_OPTIONS, evaluateTemplate, DEFAULT_DEMO_DATA, barcodeBarWidthRecommendText,
  cellFitCapMm, cellFitWidthMm, CELL_BORDER_APPLY_HINT, CELL_BORDER_APPLY_HINT_MULTI,
  CELL_BORDER_APPLY_HINT_MIXED,
} from '@worm-vue3-print/core/designer'
import { TABLE_EDIT_KEY } from '../../composables/useTableSelection'
import PropertyGroup from './PropertyGroup.vue'
import ResetButton from './ResetButton.vue'
import StepperInput from './StepperInput.vue'
import ExpressionEditor from '../ExpressionEditor.vue'
import PresetColorPicker from '../PresetColorPicker.vue'
import FontSelect from './FontSelect.vue'
import CropAnchorField from './CropAnchorField.vue'

/** 静区说明：文案单一来源在 core 的属性注册表，与元素台、common 宿主共用同一条 */
const quietTip = propertyTip('cd-quiet-zone')
/** 条形码静区说明：与二维码共用注册表入口 */
const barQuietTip = propertyTip('cd-bar-quiet-zone')
/** 条高说明：与元素台同源，两条宿主共用一条文案 */
const barHeightTip = propertyTip('cd-bar-height')

const props = defineProps<{
  element: RuntimeElement
  selection: TableSelection
  fields: PrintBusinessField[]
}>()
const ctx = inject(TABLE_EDIT_KEY)!

const rows = computed(() => props.element.options.tableRows!)

const main = computed(() => findMainCell(rows.value, props.selection.r1, props.selection.c1))
const mainCell = computed<TableCell>(() => rows.value[main.value.r]!.cells[main.value.c]!)

/** 单/多选：可写格（跳过合并占位格）=1 才回显单格配置；跨行/跨列的合并格仍算单选 */
const groupMode = computed(() => resolveCellGroupMode(rows.value, props.selection))
const cellCount = computed(() => groupMode.value.count)
const isMulti = computed(() => groupMode.value.mode === 'multi')
/** 本次选区内的批写草稿：多选写完控件显示它，换选区即清空（不是任何一格的回显） */
const batchDraft = ref<Partial<TableCell>>({})
/** 多选时单边按钮的批写草稿：不取选区三态，只记本次点过的边 */
const batchEdges = ref<Partial<Record<ElementBorderSide, boolean>>>({})

/** 显示取值：单选取该格真实值；多选只取本次批写草稿，未写过即空 */
function cellValue<K extends keyof TableCell>(key: K): TableCell[K] | undefined {
  if (!isMulti.value) return mainCell.value[key]
  return (batchDraft.value as Partial<TableCell>)[key]
}

const cellTypeDisplay = computed<TableCellType | undefined>(
  () => (isMulti.value ? batchDraft.value.cellType : mainCell.value.cellType),
)
const isTextTypeChecked = computed(() => (isMulti.value
  ? 'cellType' in batchDraft.value && (batchDraft.value.cellType ?? 'text') === 'text'
  : (mainCell.value.cellType ?? 'text') === 'text'))

/** 类型专属行的共有类型：多选时只有全部可写格同类型才出该类型的行；批写草稿里的新类型优先 */
const groupCellType = computed<TableCellType | null>(() => {
  if (!isMulti.value) return mainCell.value.cellType ?? 'text'
  if ('cellType' in batchDraft.value) return batchDraft.value.cellType ?? 'text'
  return resolveSharedCellType(rows.value, props.selection)
})
const isBarcodeCell = computed(() => groupCellType.value === 'barcode')
const isQrcodeCell = computed(() => groupCellType.value === 'qrcode')
const isImageCell = computed(() => groupCellType.value === 'image')
const isTextCell = computed(() => groupCellType.value === 'text')
/** 条码点对齐：仅条形码单元格 + 已配打印机分辨率；此时缩放模式与最大宽高不参与 */
const dotAligned = computed(() => isBarcodeCell.value && !!cellValue('printerDpi'))

/** 条宽提示：结算口径 + 选了打印机分辨率后的推荐倍率（只给参考，不回写 barWidth） */
const barWidthHint = computed(() => {
  const base = dotAligned.value
    ? '已设置打印机分辨率：条宽会被吸附到最近的整数打印点（DPI 优先于毫米值），单元格放不下时整体等比缩小'
    : '热敏/针式打印建议 3 及以上：决定条码的落纸尺寸，条越粗出纸后条宽越稳定'
  const rec = barcodeBarWidthRecommendText(cellValue('printerDpi'), cellValue('barWidth'))
  return rec ? `${base}。${rec}` : base
})

/** 未配置时：不换行→截断，否则自适应行高（与打印端同一判定）；多选只认批写草稿 */
const storedTextFit = computed(() => resolveCellTextFit(mainCell.value))
const cellTextFit = computed<TextFit | undefined>(
  () => (isMulti.value ? batchDraft.value.textFit : storedTextFit.value),
)

/** 多选占位项：禁用 + 哨兵值，避免和「不指定/默认」这类真实空值撞车 */
const MULTI_VALUE = '__multi__'
const hasDraft = (key: keyof TableCell): boolean => isMulti.value && key in batchDraft.value
const barcodeTypeDisplay = computed(() => (isMulti.value
  ? batchDraft.value.barcodeType ?? MULTI_VALUE
  : mainCell.value.barcodeType || 'CODE128'))
const printerDpiDisplay = computed(() => {
  if (!isMulti.value) return mainCell.value.printerDpi ? String(mainCell.value.printerDpi) : ''
  if (!hasDraft('printerDpi')) return MULTI_VALUE
  const dpi = batchDraft.value.printerDpi
  return dpi ? String(dpi) : ''
})
const qrCodeLevelDisplay = computed(() => (isMulti.value
  ? batchDraft.value.qrCodeLevel ?? MULTI_VALUE
  : mainCell.value.qrCodeLevel || 'M'))
const fitDisplay = computed(() => (isMulti.value
  ? batchDraft.value.fit ?? MULTI_VALUE
  : mainCell.value.fit || 'contain'))
/** 未设置时的默认档只在单选照旧展示；多选留空走「多选」占位 */
const barWidthDisplay = computed(() => (isMulti.value
  ? batchDraft.value.barWidth
  : mainCell.value.barWidth ?? 2))
const barFontSizeDisplay = computed(() => (isMulti.value
  ? batchDraft.value.barFontSize
  : mainCell.value.barFontSize ?? 10))
const showBarcodeTextChecked = computed(() => (isMulti.value
  ? batchDraft.value.showBarcodeText === true
  : mainCell.value.showBarcodeText !== false))
const wordWrapChecked = computed(() => (isMulti.value
  ? batchDraft.value.wordWrap === true
  : mainCell.value.wordWrap ?? true))

/** 按值合并仅对数据行模板格有意义：选区覆盖行全为 data 才可用（多选跨行类型不一致时禁用） */
const mergeSameValueEnabled = computed(() => {
  for (let r = props.selection.r1; r <= props.selection.r2; r++) {
    if (rows.value[r]!.type !== 'data') { return false }
  }
  return true
})
const mergeSameValueReason = computed(() => (mergeSameValueEnabled.value
  ? '' : '仅数据行（明细行）支持按值合并'))
const mergeSameValueChecked = computed(() => (isMulti.value
  ? batchDraft.value.mergeSameValue === true
  : mainCell.value.mergeSameValue === true))

/** 单元格内容盒近似：列宽合计 × 行高合计（内边距与塌陷边框不计，只用于判哪一轴能挪） */
/** 剪裁盒尺寸取「可用内容框」：与出纸钉盒同一口径（扣内边距与塌陷边框），报原始行列和会让可挪量虚高 */
const cellBoxMm = computed(() => {
  const cell = mainCell.value
  const widths = props.element.options.tableColWidths ?? []
  const defaultPadding = props.element.options.tableDefaultPadding ?? 1
  return {
    width: cellFitWidthMm(widths, main.value.c, cell, defaultPadding),
    height: cellFitCapMm(rows.value, main.value.r, cell, defaultPadding),
  }
})

/** 示意图取设计态已解析地址：{字段} 用 demo 数据求值，与 CellImage 的 designMode 分支同口径 */
const cellImageSrc = computed(() => {
  const raw = String(mainCell.value.formatter ?? '')
  return raw.includes('{') ? String(evaluateTemplate(raw, DEFAULT_DEMO_DATA)) : raw
})

const formatterEditorVisible = ref(false)
const pendingFormatterValue = ref('')

function onTextFitChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  if (value === MULTI_VALUE) return
  writeField('textFit', value as TextFit)
}

function onBarcodeTypeChange(v: string) {
  if (v === MULTI_VALUE) return
  writeField('barcodeType', v || undefined)
}

function onQrLevelChange(v: string) {
  if (v === MULTI_VALUE) return
  writeField('qrCodeLevel', v || undefined)
}

function onFitChange(v: string) {
  if (v === MULTI_VALUE) return
  writeField('fit', v as TableCell['fit'])
}

function onAlignChange(v: string) {
  writeField('align', v as TextAlign)
}

function onValignChange(v: string) {
  writeField('valign', v as TableCell['valign'])
}

function onPrinterDpiChange(v: string) {
  if (v === MULTI_VALUE) return
  const dpi = Number(v)
  writeField('printerDpi', dpi > 0 ? dpi : undefined)
}

function onCellTypeChange(v: string) {
  const type = v === 'text' ? undefined : (v as TableCellType)
  const patch: Partial<TableCell> = { cellType: type }
  if (v !== 'barcode') {
    Object.assign(patch, {
      barcodeType: undefined, showBarcodeText: undefined, printerDpi: undefined,
      barQuietZone: undefined, barHeight: undefined,
    })
  }
  if (v !== 'qrcode') {
    Object.assign(patch, { qrCodeLevel: undefined, qrQuietZone: undefined })
  }
  write(c => {
    c.cellType = type
    if (v !== 'barcode') {
      c.barcodeType = undefined
      c.showBarcodeText = undefined
      c.printerDpi = undefined
      c.barQuietZone = undefined
      c.barHeight = undefined
    }
    if (v !== 'qrcode') {
      c.qrCodeLevel = undefined
      c.qrQuietZone = undefined
    }
    // fit、maxWidth、maxHeight 对所有类型都有效，不再清除
  }, patch)
}

function openFormatterEditor() {
  pendingFormatterValue.value = String(cellValue('formatter') ?? '')
  formatterEditorVisible.value = true
}

function onFormatterEditorConfirm(val: string) {
  writeField('formatter', val || undefined)
}

/** 单元格的出厂态就是"未设"：落点恒为 undefined，删键后回落到该表格自己的表格级默认 */
const CELL_FACTORY: Record<string, any> = {}
/** 回落目标是作者可改的表级默认，写死数字就是假承诺，故整组固定这一句 */
const CELL_TIP = '恢复默认值（跟随表格默认）'

/** 整选区写入；多选时把本次写入值记进批写草稿，控件显示它（不是任何一格的回显） */
function write(fn: (c: TableCell) => void, patch?: Partial<TableCell>) {
  for (const cell of collectWritableCells(rows.value, props.selection)) fn(cell)
  if (isMulti.value && patch) batchDraft.value = { ...batchDraft.value, ...patch }
  ctx.recordHistory()
}

/** 单键批写：多选下同时更新草稿，避免写完整组控件弹回「多选」 */
function writeField<K extends keyof TableCell>(key: K, value: TableCell[K]) {
  write(c => { (c as Record<string, any>)[key] = value }, { [key]: value } as Partial<TableCell>)
}

/** 待应用规格（线型 / 宽度 / 颜色）：单选取选区真实边框；多选不回显单格，只用缺省档 + 本次草稿 */
const borderOverride = ref<Partial<TableCellBorder>>({})
const borderDisplay = computed(() => (isMulti.value
  ? { width: undefined, style: undefined, color: undefined }
  : resolveCellBorderDisplay(rows.value, props.selection)))
/** 单选格四边是否至少有一条边：没有边时三行显示「无 / 0」，而不是缺省档 */
const hasBorderEdges = computed(() => !isMulti.value
  && collectWritableCells(rows.value, props.selection)
    .some(c => !!c.borders && !!(c.borders.top || c.borders.right || c.borders.bottom || c.borders.left)))
const draftBorder = computed<TableCellBorder>(() => {
  const d = borderDisplay.value
  const noBorder = !isMulti.value && !hasBorderEdges.value
  return {
    width: noBorder ? 0 : (typeof d.width === 'number' ? d.width : DEFAULT_BORDER.width),
    style: (noBorder ? 'none' : (typeof d.style === 'string' && d.style !== 'mixed' ? d.style : DEFAULT_BORDER.style)) as TableCellBorder['style'],
    color: typeof d.color === 'string' && d.color !== 'mixed' ? d.color : DEFAULT_BORDER.color,
    ...borderOverride.value,
  }
})

/** 单格四边规格不一致（mixed）且用户尚未改该项：界面显示「混合」，批写仍按缺省档 */
const BORDER_MIXED_VALUE = '__mixed__'
const borderMixed = computed(() => ({
  style: !isMulti.value && borderDisplay.value.style === 'mixed',
  width: !isMulti.value && borderDisplay.value.width === 'mixed',
  color: !isMulti.value && borderDisplay.value.color === 'mixed',
}))
const mixedActive = computed(() => ({
  style: borderMixed.value.style && borderOverride.value.style === undefined,
  width: borderMixed.value.width && borderOverride.value.width === undefined,
  color: borderMixed.value.color && borderOverride.value.color === undefined,
}))
const mixedActiveAny = computed(() => mixedActive.value.style || mixedActive.value.width || mixedActive.value.color)
const borderStyleDisplay = computed(() => (mixedActive.value.style ? BORDER_MIXED_VALUE : draftBorder.value.style))
const borderWidthDisplay = computed(() => (mixedActive.value.width ? undefined : draftBorder.value.width))
const borderColorDisplay = computed(() => (mixedActive.value.color ? undefined : draftBorder.value.color))

function onBorderStyleChange(v: string) {
  if (v === BORDER_MIXED_VALUE) return
  const style = v as TableCellBorder['style']
  overrideBorder('style', style)
  // 无边框格选非无线型时补缺省宽度，否则会按 0 宽写出一条看不见的框；选无且本来无框则宽度归零
  if (style !== 'none' && borderWidthDisplay.value === 0) {
    overrideBorder('width', DEFAULT_BORDER.width)
  } else if (style === 'none' && !hasBorderEdges.value) {
    overrideBorder('width', 0)
  }
}

/** 选区标识带上元素 id：跨表格同名坐标也不复用草稿 */
const selectionKey = computed(() => {
  const s = props.selection
  return `${props.element.id}:${s.r1}:${s.c1}:${s.r2}:${s.c2}`
})
watch(selectionKey, () => {
  borderOverride.value = {}
  batchDraft.value = {}
  batchEdges.value = {}
})

function overrideBorder<K extends keyof TableCellBorder>(key: K, value: TableCellBorder[K]) {
  borderOverride.value = { ...borderOverride.value, [key]: value }
}

/** 四条边：勾选框的状态由选区派生，不再用本地草稿 */
const BORDER_EDGES: { value: ElementBorderSide; label: string }[] = [
  { value: 'top', label: '上' }, { value: 'right', label: '右' },
  { value: 'bottom', label: '下' }, { value: 'left', label: '左' },
]

/** 单选：边位状态由选区真实边框派生（全有＝勾选、部分＝半选）；多选不回显，只认本次点过的边 */
const edgeStates = computed<Record<ElementBorderSide, BorderEdgeState>>(() => {
  if (isMulti.value) {
    const out = {} as Record<ElementBorderSide, BorderEdgeState>
    for (const e of BORDER_EDGES) out[e.value] = batchEdges.value[e.value] ? 'on' : 'off'
    return out
  }
  return resolveBorderEdgeStates(collectWritableCells(rows.value, props.selection).map(c => c.borders))
})

function currentBorder(): TableCellBorder {
  return draftBorder.value
}

function preset(p: BorderPreset) {
  // 线型＝无 ⇒ 预设就是清边框（不写一条隐形的 none 边，否则勾选框亮着却看不见线）
  applyBorderPreset(rows.value, props.selection, draftBorder.value.style === 'none' ? 'none' : p, currentBorder())
  ctx.recordHistory()
}

/** 单边只切那一条：半选态点下去是补齐（与工具栏单边按钮一致），不能整组覆盖掉其余三边 */
function onEdgeChange(side: ElementBorderSide, event: Event) {
  const on = (event.target as HTMLInputElement).checked
  // 线型＝无时勾边不会出线：一律按"没有这条边"处理（与工具栏取消态同口径）
  const visible = on && draftBorder.value.style !== 'none'
  if (isMulti.value) batchEdges.value = { ...batchEdges.value, [side]: visible }
  write(c => { setCellBorderEdge(c, side, visible ? currentBorder() : null) })
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
/* 字体含输入框 + 查询按钮 + 状态提示，半栏放不下，独占一行 */
.cell-font-field {
  grid-column: 1 / -1;
  /* 栅格行距为 0，独占一行时需自己与下方「字号 / 加粗」留出间距 */
  padding-bottom: 8px;
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
  display: flex;
  gap: 8px;
}
/* 合并相关三件套（动作按钮 + 按值开关）的子卡：动作与声明开关同区聚拢 */
.merge-card {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--pd-border, #dcdfe6);
  border-radius: 6px;
}
.merge-card-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--pd-text, #303133);
  margin-bottom: 8px;
}
.merge-card-divider {
  height: 1px;
  background: var(--pd-menu-divider, #ebeef5);
  margin: 8px 0;
}
.merge-card-hint {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pd-text-muted, #8b909c);
}
</style>
