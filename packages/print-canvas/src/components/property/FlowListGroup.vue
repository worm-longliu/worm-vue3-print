<template>
  <PropertyGroup title="流式列表" icon="Grid3x3" group-key="flowList">
    <form class="pd-form" @submit.prevent>
      <div class="pd-field" v-show="showItem('fl-layout-mode')">
        <span class="pd-label"><span class="pd-label-t">布局模式<button type="button" class="pd-help" :data-tip="layoutModeTip" aria-label="字段说明" /></span></span>
        <select
          class="pd-select"
          data-test="flow-layout-mode"
          style="width: 100%"
          :value="layoutMode"
          @change="onLayoutModeChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="fixed">固定高度</option>
          <option value="dynamic">动态分页</option>
        </select>
      </div>
      <div class="pd-field" v-show="isDynamic && showItem('fl-padding-top')">
        <span class="pd-label"><span class="pd-label-t">上内边距 (mm)<button type="button" class="pd-help" :data-tip="paddingTopTip" aria-label="字段说明" /></span></span>
        <StepperInput
          :model-value="padding.top"
          :min="0"
          :max="100"
          :step="0.5"
          @update:model-value="onPaddingChange('flowPaddingTop', $event)"
        />
      </div>
      <div class="pd-field" v-show="isDynamic && showItem('fl-padding-right')">
        <span class="pd-label"><span class="pd-label-t">右内边距 (mm)<button type="button" class="pd-help" :data-tip="paddingRightTip" aria-label="字段说明" /></span></span>
        <StepperInput
          :model-value="padding.right"
          :min="0"
          :max="100"
          :step="0.5"
          @update:model-value="onPaddingChange('flowPaddingRight', $event)"
        />
      </div>
      <div class="pd-field" v-show="isDynamic && showItem('fl-padding-bottom')">
        <span class="pd-label"><span class="pd-label-t">下内边距 (mm)<button type="button" class="pd-help" :data-tip="paddingBottomTip" aria-label="字段说明" /></span></span>
        <StepperInput
          :model-value="padding.bottom"
          :min="0"
          :max="100"
          :step="0.5"
          @update:model-value="onPaddingChange('flowPaddingBottom', $event)"
        />
      </div>
      <div class="pd-field" v-show="isDynamic && showItem('fl-padding-left')">
        <span class="pd-label"><span class="pd-label-t">左内边距 (mm)<button type="button" class="pd-help" :data-tip="paddingLeftTip" aria-label="字段说明" /></span></span>
        <StepperInput
          :model-value="padding.left"
          :min="0"
          :max="100"
          :step="0.5"
          @update:model-value="onPaddingChange('flowPaddingLeft', $event)"
        />
      </div>
      <div class="pd-field" v-show="showItem('fl-columns')">
        <span class="pd-label"><span class="pd-label-t">每行列数<button type="button" class="pd-help" :data-tip="columnsTip" aria-label="字段说明" /></span></span>
        <StepperInput
          :model-value="columns"
          :min="1"
          :max="12"
          @update:model-value="onColumnsChange"
        />
      </div>
      <div class="pd-field" v-show="showItem('fl-row-height')">
        <span class="pd-label"><span class="pd-label-t">行高 (mm)<button type="button" class="pd-help" :data-tip="rowHeightTip" aria-label="字段说明" /></span></span>
        <StepperInput
          :model-value="rowHeight"
          :min="3"
          :max="100"
          :step="0.5"
          @update:model-value="onRowHeightChange"
        />
      </div>
      <div class="pd-field" v-show="showItem('fl-gap-x')">
        <span class="pd-label"><span class="pd-label-t">单元横向间距 (mm)<button type="button" class="pd-help" :data-tip="gapXTip" aria-label="字段说明" /></span></span>
        <StepperInput
          :model-value="gapX"
          :min="0"
          :max="50"
          :step="0.5"
          @update:model-value="onGapXChange"
        />
      </div>
      <div class="pd-field" v-show="showItem('fl-auto-span')">
        <span class="pd-label">内容过长时跨列</span>
        <input
          type="checkbox"
          class="pd-switch"
          :checked="autoSpan"
          @change="onAutoSpanChange(($event.target as HTMLInputElement).checked)"
        />
      </div>
      <div class="pd-field" v-show="autoSpan && showItem('fl-max-span')">
        <span class="pd-label"><span class="pd-label-t">最多跨几列<button type="button" class="pd-help" :data-tip="maxSpanTip" aria-label="字段说明" /></span></span>
        <StepperInput
          :model-value="maxSpan"
          :min="1"
          :max="columns"
          @update:model-value="onMaxSpanChange"
        />
      </div>

      <div class="pd-hint" v-if="overflowHint">{{ overflowHint }}</div>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import {
  propertyTip,
  resolveFlowColumns,
  resolveFlowGapX,
  resolveFlowLayoutMode,
  resolveFlowMaxSpan,
  resolveFlowPadding,
  resolveFlowRowHeight,
  suggestFlowColumns,
} from '@worm-vue3-print/core/designer'
import PropertyGroup from './PropertyGroup.vue'
import StepperInput from './StepperInput.vue'

/** 字段说明的唯一来源是 core 的属性注册表，与 print-common 外壳同一份文案 */
const columnsTip = propertyTip('fl-columns')
const rowHeightTip = propertyTip('fl-row-height')
const gapXTip = propertyTip('fl-gap-x')
const maxSpanTip = propertyTip('fl-max-span')
const layoutModeTip = propertyTip('fl-layout-mode')
const paddingTopTip = propertyTip('fl-padding-top')
const paddingRightTip = propertyTip('fl-padding-right')
const paddingBottomTip = propertyTip('fl-padding-bottom')
const paddingLeftTip = propertyTip('fl-padding-left')

const props = defineProps<{
  element: RuntimeElement
  matchedKeys?: Set<string>
  searching?: boolean
}>()

/** 属性台搜索过滤：与其它分组同一套 item key 判据 */
function showItem(key: string): boolean {
  if (!props.searching || !props.matchedKeys) return true
  return props.matchedKeys.has(key)
}

const columns = computed(() => resolveFlowColumns(props.element.options.flowColumns))
const rowHeight = computed(() => resolveFlowRowHeight(props.element.options.flowRowHeight))
const gapX = computed(() => resolveFlowGapX(props.element.options.flowGapX))
const autoSpan = computed(() => props.element.options.flowAutoSpan === true)
const maxSpan = computed(() => resolveFlowMaxSpan(props.element.options.flowMaxSpan, columns.value))

const layoutMode = computed(() => resolveFlowLayoutMode(props.element.options.flowLayoutMode))
const isDynamic = computed(() => layoutMode.value === 'dynamic')
const padding = computed(() => resolveFlowPadding(props.element.options as unknown as Record<string, unknown>))

function onLayoutModeChange(value: string) {
  props.element.options.flowLayoutMode = value === 'dynamic' ? 'dynamic' : 'fixed'
}

function onPaddingChange(
  key: 'flowPaddingTop' | 'flowPaddingRight' | 'flowPaddingBottom' | 'flowPaddingLeft',
  next: number | undefined,
) {
  props.element.options[key] = typeof next === 'number' && Number.isFinite(next) && next > 0 ? next : 0
}

function onColumnsChange(next: number | undefined) {
  const cols = resolveFlowColumns(next)
  props.element.options.flowColumns = cols
  // 第 9 项：跨列上限钳到列数，是全案唯一会改用户填值的行为
  props.element.options.flowMaxSpan = resolveFlowMaxSpan(props.element.options.flowMaxSpan, cols)
}

function onRowHeightChange(next: number | undefined) {
  props.element.options.flowRowHeight = resolveFlowRowHeight(next)
}

function onGapXChange(next: number | undefined) {
  props.element.options.flowGapX = resolveFlowGapX(next)
}

function onAutoSpanChange(checked: boolean) {
  props.element.options.flowAutoSpan = checked
  if (checked) {
    props.element.options.flowMaxSpan = resolveFlowMaxSpan(props.element.options.flowMaxSpan, columns.value)
  }
}

function onMaxSpanChange(next: number | undefined) {
  props.element.options.flowMaxSpan = resolveFlowMaxSpan(next, columns.value)
}

/**
 * 只提示不写值（第 3 项）：按当前字号与间距给出可放列数建议，
 * 绝不回写用户填的列数——与条码「推荐条宽倍率」同一口径。
 * 单元模板与列表源不在本分组：模板写在「内容」分组的一条完整表达式里
 * （如 {drugs.name} {drugs.spec}），列表源由表达式里出现的数组字段检出。
 */
const overflowHint = computed(() => {
  const o = props.element.options
  const suggest = suggestFlowColumns(o.width ?? 0, gapX.value, o.fontSize ?? 12)
  if (columns.value <= suggest) return ''
  return `按当前字号与框宽，${columns.value} 列偏挤（可放约 ${suggest} 列）。数值保持不变，出纸按 ${columns.value} 列排。`
})
</script>
