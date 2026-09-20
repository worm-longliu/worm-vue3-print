<template>
  <div class="property-panel" :class="{ collapsed }">
    <!-- 折叠态：竖排图标，点击即展开对应页签 -->
    <div v-if="collapsed" class="prop-collapsed">
      <button class="pc-btn" title="展开属性台" @click="expandTab(currentTab)">«</button>
      <button class="pc-btn" :class="{ on: currentTab === 'element' }" title="元素属性" @click="expandTab('element')">▦</button>
      <button class="pc-btn" :class="{ on: currentTab === 'page' }" title="页面属性" @click="expandTab('page')">▤</button>
    </div>
    <template v-else>
      <div class="prop-head">
        <span class="prop-title">属性台</span>
        <button class="collapse-btn" title="收起属性台" @click="$emit('toggle-collapse')">»</button>
      </div>
      <div class="pd-tabs prop-tabs">
        <div class="pd-tab-bar" role="tablist">
          <button type="button" class="pd-tab" :class="{ active: (activeTab || 'page') === 'element' }" @click="$emit('update:activeTab', 'element')">元素属性</button>
          <button type="button" class="pd-tab" :class="{ active: (activeTab || 'page') === 'page' }" @click="$emit('update:activeTab', 'page')">页面属性</button>
        </div>
      <div v-show="(activeTab || 'page') === 'element'" class="pd-tab-pane" role="tabpanel">
        <template v-if="element">
          <PropertySearch @search="onSearch" />
          <div class="property-content">
            <PositionSizeGroup v-if="filteredGroups.includes('position-size') && !isTableCellSelected" :element="element" :matched-keys="matchedKeys" :searching="searching" />
            <AppearanceGroup v-if="filteredGroups.includes('appearance')" :element="element" :is-text-type="isTextType" :matched-keys="matchedKeys" :searching="searching" />
            <!-- 条码/二维码设置（码制、条宽、缩放模式、最大宽高等） -->
            <CodeGroup v-if="filteredGroups.includes('code') && isCodeType" :element="element" :matched-keys="matchedKeys" :searching="searching" @change="recordHistory?.()" />
            <PropertyGroup v-if="filteredGroups.includes('binding')" title="内容" icon="Document" default-expanded group-key="binding">
              <BindingControl
                v-for="desc in bindingDescriptors"
                :key="desc.targetPath"
                :descriptor="desc"
                :fields="fields"
                :model-value="getBindingValue(desc.targetPath)"
                @update:model-value="(v: string) => setBindingValue(desc.targetPath, v)"
              />
              <ImageContentUpload
                v-if="isImageType"
                @success="onImageUploadSuccess"
              />
            </PropertyGroup>
            <!-- 表格行/单元格属性（需有选区） -->
            <template v-if="isTableType && tableSelection && tableSelection.elementId === element!.id">
              <TableRowGroup :element="element!" :selection="tableSelection" />
              <TableCellGroup :element="element!" :selection="tableSelection" :fields="fields" />
            </template>
            <!-- 表格设置（表格元素时显示） -->
            <TableSettingsGroup
              v-if="isTableType && filteredGroups.includes('content')"
              :element="element!"
              :fields="fields"
            />
            <BorderBgGroup v-if="filteredGroups.includes('border-bg')" :element="element" :matched-keys="matchedKeys" :searching="searching" />
            <!-- 分页配置（表格元素） -->
            <PaginationGroup
              v-if="filteredGroups.includes('pagination') && isTableType"
              :element="element"
              :matched-keys="matchedKeys"
              :searching="searching"
            />
            <!-- 分页配置（非表格元素） -->
            <PaginationGroup
              v-if="filteredGroups.includes('pagination') && !isTableType"
              :element="element"
              :matched-keys="matchedKeys"
              :searching="searching"
            />
            <AdvancedGroup v-if="filteredGroups.includes('advanced')" :element="element" :matched-keys="matchedKeys" :searching="searching" @delete-element="$emit('delete-element')" />
          </div>
        </template>
        <p class="pd-empty" v-else>请在画布中选择一个元素</p>
      </div>

      <div v-show="(activeTab || 'page') === 'page'" class="pd-tab-pane" role="tabpanel">
        <form class="pd-form" @submit.prevent>
          <h3 class="pd-divider">纸张设置</h3>

          <div class="pd-field"><span class="pd-label">纸张尺寸</span>
            <select :value="paperSizeModel" class="pd-select" @change="onPaperSizeChange(($event.target as HTMLSelectElement).value)" style="width: 100%">
              <optgroup v-for="group in paperPresetGroups" :key="group.group" :label="group.group">
                <option v-for="item in group.items" :key="item.key" :value="item.key">{{ item.label }}</option>
              </optgroup>
              <option value="CUSTOM">自定义宽高</option>
            </select>
          </div>
          <p v-if="labelPaper" class="pd-hint">标签纸默认整张给内容区：已取消页边距与页眉页脚，可在下方自行改回</p>
          <div class="pd-field" v-if="continuousPaper || paperSizeModel === 'CUSTOM'"><span class="pd-label">{{ continuousPaper ? '纸宽 (mm)' : '自定义宽高 (mm)' }}</span>
            <div class="custom-size-grid">
              <StepperInput :model-value="customWidth"
                :min="25"
                :max="2000"
                @update:model-value="onCustomWidthChange" />
              <template v-if="paperSizeModel === 'CUSTOM'">
                <span class="custom-size-x">×</span>
                <StepperInput :model-value="customHeight"
                  :min="25"
                  :max="2000"
                  @update:model-value="onCustomHeightChange" />
              </template>
            </div>
          </div>
          <div class="pd-field" v-if="!continuousPaper"><span class="pd-label">纸张方向</span>
            <div class="pd-radio-group" role="radiogroup">
              <label class="pd-radio"><input type="radio" value="portrait" :checked="orientationModel === 'portrait'" @change="onOrientationChange(($event.target as HTMLInputElement).value)"><span>纵向</span></label>
              <label class="pd-radio"><input type="radio" value="landscape" :checked="orientationModel === 'landscape'" @change="onOrientationChange(($event.target as HTMLInputElement).value)"><span>横向</span></label>
            </div>
            <p class="pd-hint">切换即交换纸张长宽（设计稿内容随之铺在该尺寸上）</p>
          </div>
          <div class="pd-field" v-if="!continuousPaper && !tilingEnabled"><span class="pd-label">内容旋转角度</span>
            <div class="pd-radio-group pd-radio-group--2col" role="radiogroup">
              <label class="pd-radio"><input type="radio" value="0" :checked="outputRotationModel === 0" @change="onOutputRotationChange(($event.target as HTMLInputElement).value)"><span>0°</span></label>
              <label class="pd-radio"><input type="radio" value="90" :checked="outputRotationModel === 90" @change="onOutputRotationChange(($event.target as HTMLInputElement).value)"><span>90°</span></label>
              <label class="pd-radio"><input type="radio" value="180" :checked="outputRotationModel === 180" @change="onOutputRotationChange(($event.target as HTMLInputElement).value)"><span>180°</span></label>
              <label class="pd-radio"><input type="radio" value="270" :checked="outputRotationModel === 270" @change="onOutputRotationChange(($event.target as HTMLInputElement).value)"><span>270°</span></label>
            </div>
            <p class="pd-hint">整页内容旋转对应角度出纸；90°/270° 时纸张长宽互换以贴合内容，内容不变形不裁切；0° 为不旋转（默认）</p>
          </div>
          <div class="pd-field"><span class="pd-label">页面背景色</span>
            <div class="page-bg-row">
              <PresetColorPicker v-model="pageBackgroundModel" class="page-bg-picker" />
              <button type="button" class="pd-reset" title="恢复为默认白色" @click="onPageBackgroundReset">默认</button>
            </div>
          </div>

          <DesignBackgroundConfig
            :model-value="designBackgroundModel"
            @update:model-value="onDesignBackgroundChange"
          />

          <TilingConfig
            v-if="!multiPage"
            :model-value="templateData?.tiling"
            :template-data="templateData"
            @update:model-value="emitUpdate({ tiling: $event })"
          />

          <h3 class="pd-divider">页边距 (mm)</h3>
          <p v-if="continuousPaper" class="pd-hint">底部边距即连续纸走纸留白</p>
          <div class="margin-grid">
            <div class="pd-field"><span class="pd-label">上</span>
              <StepperInput :model-value="marginTop" :min="0" :max="50" @update:model-value="onMarginTopChange" />
            </div>
            <div class="pd-field"><span class="pd-label">下</span>
              <StepperInput :model-value="marginBottom" :min="0" :max="100" @update:model-value="onMarginBottomChange" />
            </div>
            <div class="pd-field"><span class="pd-label">左</span>
              <StepperInput :model-value="marginLeft" :min="0" :max="50" @update:model-value="onMarginLeftChange" />
            </div>
            <div class="pd-field"><span class="pd-label">右</span>
              <StepperInput :model-value="marginRight" :min="0" :max="50" @update:model-value="onMarginRightChange" />
            </div>
          </div>

          <h3 class="pd-divider">三区高度 (mm)</h3>
          <div class="pd-field"><span class="pd-label">页眉高度</span>
            <StepperInput :model-value="headerHeight" :min="0" :max="100" :step="0.1" @update:model-value="onHeaderHeightChange" />
          </div>
          <div class="pd-field"><span class="pd-label">页脚高度</span>
            <StepperInput :model-value="footerHeight" :min="0" :max="100" :step="0.1" @update:model-value="onFooterHeightChange" />
          </div>
          <div class="pd-field"><span class="pd-label">首页叠加高度</span>
            <StepperInput :model-value="overlayHeight" :min="0" :max="200" @update:model-value="onOverlayHeightChange" />
          </div>
        </form>

        <WatermarkConfig :model-value="watermarkModel" :fields="fields" @update:model-value="onWatermarkChange" />
      </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RuntimeElement, PrintBusinessField, TemplateData, TableSelection } from '@worm-vue3-print/core/designer'
import { PAPER_PRESETS, isContinuousPaperSize, isLabelPaperSize, labelPaperDefaults } from '@worm-vue3-print/core/designer'
import { searchProperties } from '@worm-vue3-print/core/designer'
import PropertySearch from './property/PropertySearch.vue'
import PositionSizeGroup from './property/PositionSizeGroup.vue'
import AppearanceGroup from './property/AppearanceGroup.vue'
import CodeGroup from './property/CodeGroup.vue'
import PropertyGroup from './property/PropertyGroup.vue'
import StepperInput from './property/StepperInput.vue'
import BindingControl from './property/BindingControl.vue'
import TableSettingsGroup from './property/TableSettingsGroup.vue'
import BorderBgGroup from './property/BorderBgGroup.vue'
import AdvancedGroup from './property/AdvancedGroup.vue'
import PaginationGroup from './property/PaginationGroup.vue'
import ImageContentUpload from './property/ImageContentUpload.vue'
import TableRowGroup from './property/TableRowGroup.vue'
import TableCellGroup from './property/TableCellGroup.vue'
import PresetColorPicker from './PresetColorPicker.vue'
import WatermarkConfig from './WatermarkConfig.vue'
import DesignBackgroundConfig from './property/DesignBackgroundConfig.vue'
import TilingConfig from './property/TilingConfig.vue'
import type { WatermarkOptions } from '@worm-vue3-print/core/designer'
import { getElementBindings, getTableCellBindings } from '@worm-vue3-print/core/designer'
import type { BindingDescriptor } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement | null
  templateData?: TemplateData
  fields: PrintBusinessField[]
  activeTab?: 'element' | 'page'
  tableSelection?: TableSelection | null
  recordHistory?: () => void
  collapsed: boolean
  /** 多页模式：隐藏拼版配置并禁用连续纸纸型 */
  multiPage?: boolean
}>()

const emit = defineEmits<{
  'delete-element': []
  'update:templateData': [data: TemplateData]
  'update:activeTab': [tab: 'element' | 'page']
  'toggle-collapse': []
}>()

/** 纸张下拉分组：按 PAPER_PRESETS 的 group 聚合，保持预设声明顺序；多页时过滤连续纸（小票纸/热敏卷纸） */
const paperPresetGroups = computed(() => {
  const groups: { group: string; items: { key: string; label: string }[] }[] = []
  for (const [key, preset] of Object.entries(PAPER_PRESETS)) {
    if (props.multiPage && isContinuousPaperSize(key)) continue
    const group = preset.group ?? '其他'
    let bucket = groups.find(g => g.group === group)
    if (!bucket) {
      bucket = { group, items: [] }
      groups.push(bucket)
    }
    bucket.items.push({ key, label: preset.label ?? key })
  }
  return groups
})
const searchText = ref('')

const isTextType = computed(() => {
  if (!props.element) return false
  return ['text', 'longText'].includes(props.element.printElementType.type)
})

const isImageType = computed(() => {
  if (!props.element) return false
  return props.element.printElementType.type === 'image'
})

/** 条码/二维码元素：属性台挂载「条码设置」分组 */
const isCodeType = computed(() => {
  if (!props.element) return false
  return ['barcode', 'qrcode'].includes(props.element.printElementType.type)
})

/** 是否处于表格单元格选中态：单元格的位置与宽高由行高/列宽控制，隐藏「位置与尺寸」组 */
const isTableCellSelected = computed(() => {
  if (!props.element) return false
  if (props.element.printElementType.type !== 'table') return false
  return !!props.tableSelection && props.tableSelection.elementId === props.element.id
})

const isTableType = computed(() => {
  if (!props.element) return false
  return props.element.printElementType.type === 'table'
})

const searchResult = computed(() => searchProperties(searchText.value))
const filteredGroups = computed(() => searchResult.value.groups)
const matchedKeys = computed(() => searchResult.value.itemKeys)
const searching = computed(() => !!searchText.value.trim())

const bindingDescriptors = computed<BindingDescriptor[]>(() => {
  if (!props.element) return []

  // 当有表格选区时，只返回选中单元格的绑定描述符
  if (props.element.printElementType.type === 'table' && props.tableSelection) {
    const { r1, c1 } = props.tableSelection
    const rows = props.element.options.tableRows
    if (rows && rows[r1]) {
      const row = rows[r1]
      const listField = props.element.options.fields?.[0]?.dataSource
      return getTableCellBindings(row.type, r1, c1, listField)
    }
  }

  return getElementBindings(props.element)
})

/**
 * 统一解析带点分段与数组下标的 targetPath 为段/索引混排数组
 * 例：'options.formatter'                         → ['options','formatter']
 * 例：'options.tableRows[0].cells[1].formatter' → ['options','tableRows',0,'cells',1,'formatter']
 */
function parsePath(targetPath: string): (string | number)[] {
  return targetPath.split('.').flatMap(segment => {
    const match = segment.match(/^([^\[]+)((?:\[\d+\])*)$/)
    if (!match) return [segment]
    const baseName = match[1]!
    const indices = [...match[2]!.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]!))
    return [baseName, ...indices]
  })
}

function getBindingValue(targetPath: string): string {
  if (!props.element) return ''
  const segments = parsePath(targetPath)
  const result = segments.reduce((current, seg) => {
    if (current === null || current === undefined) return ''
    return current[seg as keyof typeof current]
  }, props.element as any)
  return result ?? ''
}

function setBindingValue(targetPath: string, value: string) {
  if (!props.element) return
  const segments = parsePath(targetPath)
  const lastKey = segments.pop()!
  const obj = segments.reduce((current, seg) => {
    if (current[seg] === undefined || current[seg] === null) current[seg] = {}
    return current[seg]
  }, props.element as any)
  obj[lastKey] = value || undefined
  props.recordHistory?.()
}

function onSearch(text: string) {
  searchText.value = text
}

/** 图片上传成功：将相对路径写入 options.src（内容输入框绑定路径） */
function onImageUploadSuccess(url: string) {
  if (!props.element) return
  setBindingValue('options.src', url)
}

// ─── 页面属性模型（直接读写 templateData） ───

const paperSizeModel = computed(() => props.templateData?.paperSize || 'A4')
/** 连续纸（含小票纸）：强制纵向、纸宽可调、出纸高度按内容推导；多页模式不可用 */
const continuousPaper = computed(() => !props.multiPage && isContinuousPaperSize(paperSizeModel.value))
/** 标签纸：切到该纸型时已套用「无页边距、无页眉页脚」默认版面 */
const labelPaper = computed(() => isLabelPaperSize(paperSizeModel.value))
const orientationModel = computed(() => props.templateData?.orientation || 'portrait')
/** 拼版（标签铺格）无出纸方向概念，隐藏出纸方向控件 */
const tilingEnabled = computed(() => !!props.templateData?.tiling?.enabled)
/**
 * 内容旋转角度：缺省 0（不旋转）；可设为 90/180/270，整页内容旋转对应角度出纸。
 * 渲染端仅在固定纸（非连续纸、非拼版）场景按角度旋转整页。
 */
const outputRotationModel = computed(() => props.templateData?.outputRotation ?? 0)

const pageBackgroundModel = computed({
  get: () => props.templateData?.pageBackground || '#ffffff',
  set: (v: string) => onPageBackgroundChange(v),
})

const marginTop = computed(() => props.templateData?.margins.top ?? 10)
const marginBottom = computed(() => props.templateData?.margins.bottom ?? 10)
const marginLeft = computed(() => props.templateData?.margins.left ?? 10)
const marginRight = computed(() => props.templateData?.margins.right ?? 10)

const headerHeight = computed(() => props.templateData?.header.height ?? 10)
const footerHeight = computed(() => props.templateData?.footer.height ?? 10)
const overlayHeight = computed(() => props.templateData?.firstPageOverlay.height ?? 0)

const customWidth = computed(() => props.templateData?.customWidth ?? PAPER_PRESETS[paperSizeModel.value]?.width ?? 210)
const customHeight = computed(() => props.templateData?.customHeight ?? 297)

const designBackgroundModel = computed(() => props.templateData?.designBackground)

function onDesignBackgroundChange(value: TemplateData['designBackground'] | undefined) {
  if (!props.templateData) return
  if (!value) {
    const rest = { ...props.templateData }
    delete rest.designBackground
    emit('update:templateData', rest)
    return
  }
  emitUpdate({ designBackground: value })
}

/** 水印配置（缺省时给空对象，WatermarkConfig 内部按默认值展示） */
const watermarkModel = computed<WatermarkOptions>(() => props.templateData?.watermark ?? {})

function onWatermarkChange(value: WatermarkOptions) {
  emitUpdate({ watermark: value })
}

function emitUpdate(partial: Partial<TemplateData>) {
  if (!props.templateData) return
  const next = {
    ...props.templateData,
    ...partial,
  } as TemplateData
  emit('update:templateData', next)
}

function onPaperSizeChange(size: string) {
  if (!props.templateData) return
  if (isContinuousPaperSize(size)) {
    // 连续纸默认：纵向、底边距 0（走纸留白由用户配置）；
    // 纸宽取 customWidth，切到具体小票纸预设时清掉旧自定义宽度，回到预设纸宽
    emitUpdate({
      paperSize: size as TemplateData['paperSize'],
      customWidth: size === 'CONTINUOUS' ? props.templateData?.customWidth ?? 80 : undefined,
      orientation: 'portrait',
      margins: {
        ...props.templateData!.margins,
        bottom: props.templateData?.margins.bottom ?? 0,
      },
    })
    return
  }
  if (size === 'CUSTOM') {
    emitUpdate({ paperSize: 'CUSTOM' })
    return
  }
  if (!PAPER_PRESETS[size]) return
  if (isLabelPaperSize(size)) {
    // 标签纸默认：整张纸都给内容区（无页边距、无页眉页脚），用户仍可在下方自行改回
    emitUpdate({ paperSize: size as TemplateData['paperSize'], ...labelPaperDefaults(props.templateData) })
    return
  }
  emitUpdate({ paperSize: size as TemplateData['paperSize'] })
}

function onOrientationChange(val: string | number | boolean | undefined) {
  emitUpdate({ orientation: String(val) as TemplateData['orientation'] })
}

function onOutputRotationChange(val: string | number | boolean | undefined) {
  emitUpdate({ outputRotation: Number(val) as TemplateData['outputRotation'] })
}

function onPageBackgroundChange(v: string) {
  const value = v && v.toLowerCase() !== '#ffffff' && v.toLowerCase() !== '#fff' ? v : undefined
  emitUpdate(value === undefined ? { pageBackground: undefined } : { pageBackground: value })
}

function onPageBackgroundReset() {
  emitUpdate({ pageBackground: undefined })
}

function onCustomWidthChange(v: number | undefined) {
  if (v === undefined) return
  emitUpdate({ customWidth: v })
}

function onCustomHeightChange(v: number | undefined) {
  if (v === undefined) return
  emitUpdate({ customHeight: v })
}

function onMarginTopChange(v: number | undefined) {
  if (v === undefined) return
  emitUpdate({ margins: { ...props.templateData!.margins, top: v } })
}
function onMarginBottomChange(v: number | undefined) {
  if (v === undefined) return
  emitUpdate({ margins: { ...props.templateData!.margins, bottom: v } })
}
function onMarginLeftChange(v: number | undefined) {
  if (v === undefined) return
  emitUpdate({ margins: { ...props.templateData!.margins, left: v } })
}
function onMarginRightChange(v: number | undefined) {
  if (v === undefined) return
  emitUpdate({ margins: { ...props.templateData!.margins, right: v } })
}

function onHeaderHeightChange(v: number | undefined) {
  if (v === undefined) return
  emitUpdate({ header: { ...props.templateData!.header, height: v } })
}

function onFooterHeightChange(v: number | undefined) {
  if (v === undefined) return
  emitUpdate({ footer: { ...props.templateData!.footer, height: v } })
}

function onOverlayHeightChange(v: number | undefined) {
  if (v === undefined) return
  emitUpdate({
    firstPageOverlay: { ...props.templateData!.firstPageOverlay, height: v },
  })
}

const currentTab = computed(() => props.activeTab || 'page')

function expandTab(tab: 'element' | 'page') {
  emit('update:activeTab', tab)
  emit('toggle-collapse')
}
</script>

<style scoped>
.property-panel {
  width: 280px;
  min-width: 280px;
  background: var(--pd-sidebar, #ffffff);
  border-left: 1px solid var(--pd-border-soft, #e9ecf2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width .18s ease;
}
.property-panel.collapsed {
  width: 36px;
  min-width: 36px;
  border-left: 1px solid var(--pd-border-soft, #e9ecf2);
}
.prop-collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  flex: 1;
}
.pc-btn {
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
.pc-btn:hover {
  color: var(--pd-text, #2a2e37);
  background: var(--pd-sidebar-hover, #f0f3f9);
}
.pc-btn.on {
  color: var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, .09));
}
.prop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--pd-border-soft, #e9ecf2);
}
.prop-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--pd-text, #2a2e37);
  letter-spacing: 1.2px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.prop-title::before {
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
.prop-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.prop-tabs .pd-tab-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}
.property-content {
  padding: 0;
}
.margin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}
.custom-size-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 4px;
  width: 100%;
}
.custom-size-x {
  color: var(--pd-text-muted, #8b909c);
  font-size: 12px;
}
.pd-hint {
  margin: 2px 0 6px;
  color: var(--pd-text-muted, #8b909c);
  font-size: 12px;
  line-height: 1.4;
}
.page-bg-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-bg-picker {
  flex: 1;
  min-width: 0;
}
.pd-reset {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--pd-border, #d9dde6);
  border-radius: 5px;
  background: var(--pd-field-bg, #f4f6fa);
  color: var(--pd-text-muted, #8b909c);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .14s ease;
}
.pd-reset:hover {
  color: var(--pd-accent, #165DFF);
  border-color: var(--pd-accent, #165DFF);
}
</style>
