<!--
  图表属性组：图形化面板 + JSON 编辑器双模式。

  提交约定（与 canvas 现有属性分组组件一致：直接改响应式 element.options，再 emit change）：
  - 直接写入 `props.element.options.chartOption / chartDataSource / chartCategoryField /
    chartValueFields / chartSeriesField`（canvas PropertyPanel 的 element 是响应式对象）；
  - 额外 emit `update:options(partial)`，供 canvas 属性面板按受控方式合并/记历史；
  - emit `change`（无参）与 CodeGroup 等同口径，canvas 可接 `@change="recordHistory()"`。

  设计文件只存 option 模板（series/xAxis 的 data 写 `$data` 占位），真实数据由 core
  绑定阶段按 chartValueFields 等字段注入，避免设计文件膨胀。
-->
<template>
  <div class="echarts-property">
    <div class="echarts-property-head" :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }">
      <span class="echarts-property-title" :style="{ fontSize: '12px', fontWeight: 600, color: 'var(--pd-text, #2a2e37)' }">图表设置</span>
      <div class="pd-button-group">
        <button type="button" class="pd-button small" :class="{ primary: mode === 'graphic' }" @click="switchMode('graphic')">图形化</button>
        <button type="button" class="pd-button small" :class="{ primary: mode === 'json' }" @click="switchMode('json')">JSON</button>
      </div>
    </div>

    <form v-if="mode === 'graphic'" class="pd-form" @submit.prevent>
      <div class="pd-field">
        <span class="pd-label">图表类型</span>
        <select class="pd-select" :value="chartType" @change="onChartTypeChange">
          <option v-for="type in CHART_TYPES" :key="type" :value="type">{{ CHART_TYPE_LABELS[type] }}</option>
        </select>
      </div>
      <div class="pd-field">
        <span class="pd-label">图表标题</span>
        <input class="pd-input" :value="title" placeholder="留空不显示标题" @input="onTitleInput">
      </div>
      <p class="pd-divider">数据</p>
      <div class="pd-field">
        <span class="pd-label">数据源</span>
        <input class="pd-input" :value="dataSource" list="echarts-ds-candidates" placeholder="数据集路径（留空取顶层第一个数组）" @input="onDataSourceInput">
        <datalist id="echarts-ds-candidates">
          <option v-for="key in dataSourceCandidates" :key="key" :value="key" />
        </datalist>
      </div>
      <div class="pd-field">
        <span class="pd-label">类目字段</span>
        <input class="pd-input" :value="categoryField" placeholder="如 name" @input="onCategoryFieldInput">
      </div>
      <div class="pd-field">
        <span class="pd-label">数值字段（多值多系列）</span>
        <div v-for="(field, index) in valueFields" :key="index" class="echarts-field-row" :style="{ display: 'flex', alignItems: 'center', gap: '6px' }">
          <input class="pd-input" :style="{ flex: '1', minWidth: 0 }" :value="field" placeholder="如 value" @input="onValueFieldInput(index, $event)">
          <button type="button" class="pd-button small" title="删除该数值字段" @click="removeValueField(index)">−</button>
        </div>
        <button type="button" class="pd-button small" @click="addValueField">+ 添加数值字段</button>
      </div>
      <div class="pd-field">
        <span class="pd-label">系列拆分字段</span>
        <input class="pd-input" :value="seriesField" placeholder="可选，如 region（按值拆成多系列）" @input="onSeriesFieldInput">
      </div>
      <p class="pd-divider">样式</p>
      <div class="pd-field">
        <span class="pd-label">配色</span>
        <select class="pd-select" :value="paletteKey" @change="onPaletteChange">
          <option v-for="palette in chartPalettes" :key="palette.key" :value="palette.key">{{ palette.label }}</option>
        </select>
      </div>
      <div class="pd-field echarts-switch-row" :style="{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }">
        <span class="pd-label">显示图例</span>
        <input type="checkbox" class="pd-switch" :checked="legendShow" @input="onLegendChange($event)">
      </div>
      <div class="pd-field echarts-switch-row" :style="{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }">
        <span class="pd-label">堆叠显示</span>
        <input type="checkbox" class="pd-switch" :checked="stacked" @input="onStackChange($event)">
      </div>
      <p class="pd-hint">
        数据由模板绑定阶段注入：series/xAxis 的 data 保留 `$data` 占位即可，无需在设计器里填真实数据。
      </p>
    </form>

    <form v-else class="pd-form" @submit.prevent>
      <p class="pd-hint">直接编辑 ECharts option JSON；非法 JSON 会提示错误且不写回画布。保留 `$data` 占位的数据由 core 绑定阶段填充。</p>
      <textarea
        class="pd-input"
        :style="{ minHeight: '180px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '11px', lineHeight: 1.5, whiteSpace: 'pre' }"
        :value="jsonText"
        spellcheck="false"
        @input="onJsonInput"
      />
      <p v-if="jsonError" :style="{ margin: 0, color: '#f56c6c', fontSize: '11px', lineHeight: 1.4, overflowWrap: 'anywhere' }">{{ jsonError }}</p>
      <div class="echarts-field-row" :style="{ display: 'flex', alignItems: 'center', gap: '6px' }">
        <button type="button" class="pd-button small" @click="fillJsonFromElement">按当前配置重置</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { ElementOptions, RuntimeElement } from '@worm-vue3-print/core/designer'
import { computed, ref, watch } from 'vue'
import {
  CHART_TYPE_LABELS,
  CHART_TYPES,
  createDefaultChartOption,
  type ChartType,
} from '../constants.js'
import { getChartPalettes } from '../config.js'
import {
  asObject,
  cloneChartOption,
  readChartType,
  readPaletteKey,
  syncSeriesCount,
  withChartType,
} from './option-utils.js'

// 与 canvas ElementComponentProps 同形（内联类型字面量，便于 SFC 编译期提取运行时 props）
const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
}>()

const emit = defineEmits<{
  /** 受控提交：canvas 可据此合并 options 并记历史 */
  (e: 'update:options', partial: Partial<ElementOptions>): void
  /** 与 canvas 现有属性分组组件同口径：改完通知属性面板（如记历史） */
  (e: 'change'): void
}>()

/** P5：预设 ∪ configureChartPlugin({ palettes }) 自定义配色（组件创建时读取一次） */
const chartPalettes = getChartPalettes()
const mode = ref<'graphic' | 'json'>('graphic')
const chartType = ref<ChartType>('bar')
const title = ref('')
const dataSource = ref('')
const categoryField = ref('')
const valueFields = ref<string[]>([])
const seriesField = ref('')
const paletteKey = ref<string>('default')
const legendShow = ref(true)
const stacked = ref(false)
const jsonText = ref('')
const jsonError = ref('')

/** 数据源候选：数据里第一个对象上的数组字段（与 core resolveListSource 口径接近） */
const dataSourceCandidates = computed<string[]>(() => {
  const first = props.data?.[0]
  if (!first) return []
  return Object.keys(first).filter((key) => Array.isArray(first[key]))
})

function currentOption(): Record<string, unknown> {
  const raw = props.element.options.chartOption
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? cloneChartOption(raw as Record<string, unknown>)
    : createDefaultChartOption(chartType.value)
}

function syncFromElement(): void {
  const options = props.element.options
  const option = currentOption()
  chartType.value = readChartType(option)
  title.value = String(asObject(option.title).text ?? '')
  dataSource.value = String(options.chartDataSource ?? '')
  categoryField.value = String(options.chartCategoryField ?? '')
  valueFields.value = Array.isArray(options.chartValueFields)
    ? options.chartValueFields.map((field) => String(field))
    : []
  seriesField.value = String(options.chartSeriesField ?? '')
  paletteKey.value = readPaletteKey(option, chartPalettes)
  legendShow.value = asObject(option.legend).show !== false
  const series = (Array.isArray(option.series) ? option.series : []) as Record<string, unknown>[]
  stacked.value = series.some((item) => item.stack !== undefined && item.stack !== null && item.stack !== '')
}

watch(
  () => props.element.id,
  () => {
    syncFromElement()
    if (mode.value === 'json') fillJsonFromElement()
  },
  { immediate: true },
)

/** 写回 element.options（响应式）并同时走 emit 通道 */
function commit(option: Record<string, unknown>, patch: Partial<ElementOptions> = {}): void {
  const options = props.element.options
  options.chartOption = option
  Object.assign(options, patch)
  emit('update:options', { chartOption: option, ...patch })
  emit('change')
}

function switchMode(next: 'graphic' | 'json'): void {
  mode.value = next
  if (next === 'json') fillJsonFromElement()
}

function onChartTypeChange(event: Event): void {
  chartType.value = (event.target as HTMLSelectElement).value as ChartType
  commit(withChartType(currentOption(), chartType.value))
  syncFromElement()
}

function onTitleInput(event: Event): void {
  title.value = (event.target as HTMLInputElement).value
  const option = currentOption()
  option.title = { ...asObject(option.title), text: title.value }
  commit(option)
}

function onDataSourceInput(event: Event): void {
  dataSource.value = (event.target as HTMLInputElement).value
  commit(currentOption(), { chartDataSource: dataSource.value })
}

function onCategoryFieldInput(event: Event): void {
  categoryField.value = (event.target as HTMLInputElement).value
  commit(currentOption(), { chartCategoryField: categoryField.value })
}

function onValueFieldInput(index: number, event: Event): void {
  valueFields.value[index] = (event.target as HTMLInputElement).value
  syncSeriesAndCommit()
}

function addValueField(): void {
  valueFields.value.push('')
  syncSeriesAndCommit()
}

function removeValueField(index: number): void {
  valueFields.value.splice(index, 1)
  syncSeriesAndCommit()
}

function syncSeriesAndCommit(): void {
  const option = syncSeriesCount(currentOption(), valueFields.value.length)
  const series = (Array.isArray(option.series) ? option.series : []) as Record<string, unknown>[]
  series.forEach((item, index) => {
    const name = valueFields.value[index]?.trim()
    if (name) item.name = name
  })
  commit(option, { chartValueFields: [...valueFields.value] })
  syncFromElement()
}

function onSeriesFieldInput(event: Event): void {
  seriesField.value = (event.target as HTMLInputElement).value
  commit(currentOption(), { chartSeriesField: seriesField.value })
}

function onPaletteChange(event: Event): void {
  paletteKey.value = (event.target as HTMLSelectElement).value
  const palette = chartPalettes.find((item) => item.key === paletteKey.value) ?? chartPalettes[0]
  const option = currentOption()
  option.color = [...palette.colors]
  commit(option)
}

function onLegendChange(event: Event): void {
  legendShow.value = (event.target as HTMLInputElement).checked
  const option = currentOption()
  option.legend = { ...asObject(option.legend), show: legendShow.value }
  commit(option)
}

function onStackChange(event: Event): void {
  stacked.value = (event.target as HTMLInputElement).checked
  const option = currentOption()
  const series = (Array.isArray(option.series) ? option.series : []) as Record<string, unknown>[]
  for (const item of series) {
    if (stacked.value) item.stack = 'total'
    else delete item.stack
  }
  commit(option)
}

function fillJsonFromElement(): void {
  jsonText.value = JSON.stringify(currentOption(), null, 2)
  jsonError.value = ''
}

function onJsonInput(event: Event): void {
  jsonText.value = (event.target as HTMLTextAreaElement).value
  try {
    const parsed: unknown = JSON.parse(jsonText.value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('chartOption 必须是 JSON 对象')
    }
    jsonError.value = ''
    commit(parsed as Record<string, unknown>)
    syncFromElement()
  } catch (err) {
    // 非法 JSON 只提示，不写回画布
    jsonError.value = err instanceof Error ? err.message : '非法 JSON'
  }
}
</script>

