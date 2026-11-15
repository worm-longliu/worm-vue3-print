<!--
  图表属性组：一份共享面板，按 kind 声明的字段清单裁剪控件（只提供图形化配置，不提供 JSON 编辑器）。
  模板 JSON 仍允许开发者/AI 手写 chartOption；面板只改自己掌管的那几项，保留其余自定义字段。

  提交约定与 canvas 属性分组组件一致：直接改响应式 element.options，并 emit
  update:options(partial) / change（记历史）。
-->
<template>
  <div class="echarts-property">
    <form class="pd-form" @submit.prevent>
      <div v-if="has('dataSource')" class="pd-field">
        <span class="pd-label">数据源</span>
        <input class="pd-input" :value="dataSource" list="echarts-ds-candidates" placeholder="数据集路径（留空取顶层第一个数组）" @input="onDataSourceInput">
        <datalist id="echarts-ds-candidates">
          <option v-for="key in dataSourceCandidates" :key="key" :value="key" />
        </datalist>
      </div>
      <div v-if="has('categoryField')" class="pd-field">
        <span class="pd-label">类目字段</span>
        <input class="pd-input" :value="categoryField" placeholder="如 name" @input="onCategoryFieldInput">
      </div>
      <div v-if="has('valueFields')" class="pd-field">
        <span class="pd-label">{{ valueFieldsLabel }}</span>
        <div v-for="(field, index) in valueFields" :key="index" class="echarts-field-row">
          <input class="pd-input" :value="field" placeholder="如 value" @input="onValueFieldInput(index, $event)">
          <button v-if="valueFields.length > 1" type="button" class="pd-button small" title="删除该字段" @click="removeValueField(index)">−</button>
        </div>
        <button v-if="valueFields.length < maxValueFields" type="button" class="pd-button small" @click="addValueField">+ 添加字段</button>
      </div>
      <div v-if="has('seriesField')" class="pd-field">
        <span class="pd-label">系列拆分字段</span>
        <input class="pd-input" :value="seriesField" placeholder="可选，如 region（按值拆成多系列）" @input="onSeriesFieldInput">
      </div>
      <div v-if="has('bubble')" class="pd-field" :style="{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }">
        <span class="pd-label">气泡大小</span>
        <input type="checkbox" class="pd-switch" :checked="bubble" @input="onBubbleChange($event)">
      </div>
      <div v-if="has('title')" class="pd-field">
        <span class="pd-label">图表标题</span>
        <input class="pd-input" :value="title" placeholder="留空不显示标题" @input="onTitleInput">
      </div>
      <div v-if="has('legend')" class="pd-field" :style="{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }">
        <span class="pd-label">显示图例</span>
        <input type="checkbox" class="pd-switch" :checked="legendShow" @input="onLegendChange($event)">
      </div>
      <div v-if="has('palette')" class="pd-field">
        <span class="pd-label">配色</span>
        <select class="pd-select" :value="paletteKey" @change="onPaletteChange">
          <option v-for="palette in chartPalettes" :key="palette.key" :value="palette.key">{{ palette.label }}</option>
        </select>
      </div>
      <div v-if="has('stack')" class="pd-field" :style="{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }">
        <span class="pd-label">堆叠显示</span>
        <input type="checkbox" class="pd-switch" :checked="stacked" @input="onStackChange($event)">
      </div>
      <div v-if="has('innerRadius')" class="pd-field">
        <span class="pd-label">内径（%）</span>
        <input class="pd-input" type="number" min="0" max="90" :value="innerRadius" @input="onInnerRadiusInput($event)">
      </div>
      <div v-if="has('padding')" class="pd-field">
        <span class="pd-label">内边距 上/右/下/左 (%)</span>
        <div class="echarts-field-row">
          <input class="pd-input" type="number" min="0" max="60" title="上边距" :value="funnelPadding.top" @input="onPaddingInput('top', $event)">
          <input class="pd-input" type="number" min="0" max="60" title="右边距（留外置标签）" :value="funnelPadding.right" @input="onPaddingInput('right', $event)">
          <input class="pd-input" type="number" min="0" max="60" title="下边距" :value="funnelPadding.bottom" @input="onPaddingInput('bottom', $event)">
          <input class="pd-input" type="number" min="0" max="60" title="左边距" :value="funnelPadding.left" @input="onPaddingInput('left', $event)">
        </div>
      </div>
      <div v-if="has('radius')" class="pd-field">
        <span class="pd-label">半径（%）</span>
        <input class="pd-input" type="number" min="20" max="100" :value="radarRadius" @input="onRadiusInput($event)">
      </div>
      <div v-if="has('gaugeRange')" class="pd-field">
        <span class="pd-label">最小 / 最大值</span>
        <div class="echarts-field-row">
          <input class="pd-input" type="number" :value="gaugeMin" @input="onGaugeMinInput($event)">
          <input class="pd-input" type="number" :value="gaugeMax" @input="onGaugeMaxInput($event)">
        </div>
      </div>
      <p class="pd-hint">
        数据由模板绑定阶段注入：series/xAxis 的 data 保留 `$data` 占位即可；复杂样式可在模板 JSON 中手写 chartOption。
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { ElementOptions, RuntimeElement } from '@worm-vue3-print/core/designer'
import { computed } from 'vue'
import { FUNNEL_PADDING_DEFAULTS, RADAR_RADIUS_DEFAULT } from '../constants.js'
import type { FunnelPadding } from '../constants.js'
import { getChartPalettes } from '../config.js'
import { createDefaultChartOption } from '../defaults.js'
import { getChartKindDefinition } from '../kinds.js'
import type { ChartFieldKey } from '../kinds.js'
import { normalizeChartOption } from '../normalize.js'
import {
  asObject, cloneChartOption, readFunnelPadding, readPaletteKey, readRadarRadius,
  resolveChartPanelFields, syncSeriesCount, writeFunnelPadding, writeRadarRadius,
} from './option-utils.js'

// 与 canvas ElementComponentProps 同形（内联类型字面量，便于 SFC 编译期提取运行时 props）
const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
}>()

const emit = defineEmits<{
  (e: 'update:options', partial: Partial<ElementOptions>): void
  (e: 'change'): void
}>()

const chartPalettes = getChartPalettes()

const definition = computed(() => getChartKindDefinition(props.element.printElementType?.type ?? ''))
const type = computed(() => definition.value?.type ?? '')
const fields = computed<readonly ChartFieldKey[]>(() => resolveChartPanelFields(type.value))
const has = (field: ChartFieldKey): boolean => fields.value.includes(field)

const options = computed(() => props.element.options)
const option = computed<Record<string, any>>(() => {
  const raw = options.value.chartOption
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return cloneChartOption(raw as Record<string, any>)
  return cloneChartOption(createDefaultChartOption(type.value)) as Record<string, any>
})

const dataSource = computed(() => String(options.value.chartDataSource ?? ''))
const categoryField = computed(() => String(options.value.chartCategoryField ?? ''))
const valueFields = computed(() => (Array.isArray(options.value.chartValueFields) ? options.value.chartValueFields.map(String) : []))
const seriesField = computed(() => String(options.value.chartSeriesField ?? ''))
const bubble = computed(() => options.value.chartBubble === true)
const title = computed(() => String(asObject(option.value.title).text ?? ''))
const legendShow = computed(() => asObject(option.value.legend).show !== false)
const paletteKey = computed(() => readPaletteKey(option.value, chartPalettes))
const stacked = computed(() => {
  const series = (Array.isArray(option.value.series) ? option.value.series : []) as Record<string, any>[]
  return series.some(item => item.stack !== undefined && item.stack !== null && item.stack !== '')
})
const innerRadius = computed(() => {
  const series = (Array.isArray(option.value.series) ? option.value.series : []) as Record<string, any>[]
  const radius = series[0]?.radius
  if (!Array.isArray(radius)) return 40
  const inner = String(radius[0] ?? '40%')
  return Number(inner.replace('%', '')) || 40
})
const gaugeMin = computed(() => {
  const series = (Array.isArray(option.value.series) ? option.value.series : []) as Record<string, any>[]
  return Number(series[0]?.min ?? 0)
})
const gaugeMax = computed(() => {
  const series = (Array.isArray(option.value.series) ? option.value.series : []) as Record<string, any>[]
  return Number(series[0]?.max ?? 100)
})
/** 读「留白」配置需要元素框尺寸：手写 chartOption 的 px 值会按当前框折算成百分比 */
const elementWidthMm = computed(() => Number(options.value.width) || 0)
const elementHeightMm = computed(() => Number(options.value.height) || 0)
const funnelPadding = computed(() => readFunnelPadding(option.value, elementWidthMm.value, elementHeightMm.value))
const radarRadius = computed(() => readRadarRadius(option.value, elementWidthMm.value, elementHeightMm.value))

/** 单值类型（饼/环/漏斗/仪表盘）只保留一个数值字段；散点最多两个（第二个留给气泡） */
const maxValueFields = computed(() => {
  switch (definition.value?.seriesType) {
    case 'pie':
    case 'funnel':
    case 'gauge':
      return 1
    case 'scatter':
      return 2
    default:
      return 8
  }
})
const valueFieldsLabel = computed(() => {
  if (definition.value?.seriesType === 'radar') return '维度字段（每个字段一个维度）'
  return maxValueFields.value === 1 ? '数值字段' : '数值字段（多值多系列）'
})
const dataSourceCandidates = computed<string[]>(() => {
  const first = props.data?.[0]
  if (!first) return []
  return Object.keys(first).filter(key => Array.isArray(first[key]))
})

/** 写回 options：option 按 kind 归一后落盘，patch 合并数据映射字段；只改自己掌管的键 */
function commit(next: Record<string, unknown>, patch: Partial<ElementOptions> = {}): void {
  const normalized = normalizeChartOption(type.value, next)
  options.value.chartOption = normalized
  Object.assign(options.value, patch)
  emit('update:options', { chartOption: normalized, ...patch })
  emit('change')
}

function onDataSourceInput(event: Event): void {
  commit(option.value, { chartDataSource: (event.target as HTMLInputElement).value })
}
function onCategoryFieldInput(event: Event): void {
  commit(option.value, { chartCategoryField: (event.target as HTMLInputElement).value })
}
function onSeriesFieldInput(event: Event): void {
  commit(option.value, { chartSeriesField: (event.target as HTMLInputElement).value })
}
function onValueFieldInput(index: number, event: Event): void {
  const next = [...valueFields.value]
  next[index] = (event.target as HTMLInputElement).value
  syncSeriesAndCommit(next)
}
function addValueField(): void {
  if (valueFields.value.length >= maxValueFields.value) return
  syncSeriesAndCommit([...valueFields.value, ''])
}
function removeValueField(index: number): void {
  const next = valueFields.value.filter((_, i) => i !== index)
  syncSeriesAndCommit(next)
}
function syncSeriesAndCommit(nextFields: string[]): void {
  const next = syncSeriesCount(option.value, nextFields.length, type.value)
  const series = (Array.isArray(next.series) ? next.series : []) as Record<string, any>[]
  series.forEach((item, index) => {
    const name = nextFields[index]?.trim()
    if (name) item.name = name
  })
  commit(next, { chartValueFields: nextFields })
}
function onBubbleChange(event: Event): void {
  commit(option.value, { chartBubble: (event.target as HTMLInputElement).checked })
}
function onTitleInput(event: Event): void {
  const next = option.value
  next.title = { ...asObject(next.title), text: (event.target as HTMLInputElement).value }
  commit(next)
}
function onLegendChange(event: Event): void {
  const next = option.value
  next.legend = { ...asObject(next.legend), show: (event.target as HTMLInputElement).checked }
  commit(next)
}
function onPaletteChange(event: Event): void {
  const palette = chartPalettes.find(item => item.key === (event.target as HTMLSelectElement).value) ?? chartPalettes[0]!
  const next = option.value
  next.color = [...palette.colors]
  commit(next)
}
function onStackChange(event: Event): void {
  const next = option.value
  const series = (Array.isArray(next.series) ? next.series : []) as Record<string, any>[]
  for (const item of series) {
    if ((event.target as HTMLInputElement).checked) item.stack = 'total'
    else delete item.stack
  }
  commit(next)
}
function onInnerRadiusInput(event: Event): void {
  const inner = Math.min(90, Math.max(0, Number((event.target as HTMLInputElement).value) || 0))
  const next = option.value
  const series = (Array.isArray(next.series) ? next.series : []) as Record<string, any>[]
  if (series[0]) series[0].radius = [`${inner}%`, '70%']
  commit(next)
}
function onPaddingInput(side: keyof FunnelPadding, event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  const next = Number.isFinite(raw) ? Math.min(60, Math.max(0, raw)) : FUNNEL_PADDING_DEFAULTS[side]
  commit(writeFunnelPadding(option.value, { ...funnelPadding.value, [side]: next }))
}
function onRadiusInput(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  const next = Number.isFinite(raw) ? Math.min(100, Math.max(20, raw)) : RADAR_RADIUS_DEFAULT
  commit(writeRadarRadius(option.value, next))
}
function onGaugeMinInput(event: Event): void {
  const next = option.value
  const series = (Array.isArray(next.series) ? next.series : []) as Record<string, any>[]
  if (series[0]) series[0].min = Number((event.target as HTMLInputElement).value) || 0
  commit(next)
}
function onGaugeMaxInput(event: Event): void {
  const next = option.value
  const series = (Array.isArray(next.series) ? next.series : []) as Record<string, any>[]
  if (series[0]) series[0].max = Number((event.target as HTMLInputElement).value) || 100
  commit(next)
}
</script>
