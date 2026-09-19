<template>
  <div class="tiling-config">
    <h3 class="pd-divider">拼版打印</h3>
    <p class="pd-hint">把标签按「列 × 行」铺到一张大纸上批量打印</p>

    <div class="pd-field">
      <label class="tiling-switch">
        <input
          type="checkbox"
          :checked="cfg.enabled"
          :disabled="labelContinuous"
          @change="onEnabledChange(($event.target as HTMLInputElement).checked)"
        >
        <span>启用拼版</span>
      </label>
      <p v-if="labelContinuous" class="pd-hint tiling-error">连续纸不支持拼版</p>
    </div>

    <template v-if="cfg.enabled && !labelContinuous">
      <div class="pd-field">
        <span class="pd-label">目标纸张</span>
        <select
          class="pd-select"
          style="width: 100%"
          :value="cfg.sheetPaperSize ?? 'A4'"
          @change="onSheetPaperChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="key in sheetPresetKeys" :key="key" :value="key">{{ key }}</option>
          <option value="CUSTOM">自定义</option>
        </select>
      </div>

      <div v-if="cfg.sheetPaperSize === 'CUSTOM'" class="pd-field">
        <span class="pd-label">目标纸宽高 (mm)</span>
        <div class="custom-size-grid">
          <StepperInput
            :model-value="cfg.sheetCustomWidth"
            :min="25"
            :max="2000"
            @update:model-value="patch({ sheetCustomWidth: $event })"
          />
          <span class="custom-size-x">×</span>
          <StepperInput
            :model-value="cfg.sheetCustomHeight"
            :min="25"
            :max="2000"
            @update:model-value="patch({ sheetCustomHeight: $event })"
          />
        </div>
      </div>

      <div v-else class="pd-field">
        <span class="pd-label">目标纸方向</span>
        <div class="pd-radio-group" role="radiogroup">
          <label class="pd-radio">
            <input
              type="radio"
              value="portrait"
              :checked="(cfg.sheetOrientation ?? 'portrait') === 'portrait'"
              @change="patch({ sheetOrientation: 'portrait' })"
            ><span>纵向</span>
          </label>
          <label class="pd-radio">
            <input
              type="radio"
              value="landscape"
              :checked="cfg.sheetOrientation === 'landscape'"
              @change="patch({ sheetOrientation: 'landscape' })"
            ><span>横向</span>
          </label>
        </div>
      </div>

      <h3 class="pd-divider">拼版留白 (mm)</h3>
      <div class="margin-grid">
        <div class="pd-field"><span class="pd-label">上</span>
          <StepperInput
            :model-value="cfg.sheetMargin.top" :min="0" :max="100"
            @update:model-value="patchMargin('top', $event)"
          />
        </div>
        <div class="pd-field"><span class="pd-label">下</span>
          <StepperInput
            :model-value="cfg.sheetMargin.bottom" :min="0" :max="100"
            @update:model-value="patchMargin('bottom', $event)"
          />
        </div>
        <div class="pd-field"><span class="pd-label">左</span>
          <StepperInput
            :model-value="cfg.sheetMargin.left" :min="0" :max="100"
            @update:model-value="patchMargin('left', $event)"
          />
        </div>
        <div class="pd-field"><span class="pd-label">右</span>
          <StepperInput
            :model-value="cfg.sheetMargin.right" :min="0" :max="100"
            @update:model-value="patchMargin('right', $event)"
          />
        </div>
      </div>

      <h3 class="pd-divider">格间距与列数</h3>
      <div class="pd-field"><span class="pd-label">横向间距</span>
        <StepperInput
          :model-value="cfg.gapX" :min="0" :max="50"
          @update:model-value="patch({ gapX: $event ?? 0 })"
        />
      </div>
      <div class="pd-field"><span class="pd-label">纵向间距</span>
        <StepperInput
          :model-value="cfg.gapY" :min="0" :max="50"
          @update:model-value="patch({ gapY: $event ?? 0 })"
        />
      </div>
      <div class="pd-field"><span class="pd-label">列数</span>
        <StepperInput
          :model-value="cfg.columns" :min="1" :max="columnMax"
          @update:model-value="patch({ columns: $event ?? 1 })"
        />
      </div>

      <p
        v-for="issue in issues"
        :key="issue.code"
        class="pd-hint tiling-error"
      >{{ issue.message }}</p>
      <p v-if="!issues.length && summary" class="pd-hint tiling-summary">{{ summary }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'
import { PAPER_PRESETS } from '@worm-vue3-print/core/designer'
import {
  TILE_DEFAULTS,
  computeMaxColumns,
  computeTileLayout,
  resolveSheetMm,
  validateTiling,
} from '@worm-vue3-print/core'
import type { TilingOptions } from '@worm-vue3-print/core'
import StepperInput from './StepperInput.vue'

const props = defineProps<{
  modelValue?: TilingOptions
  /** 完整模板：校验与摘要都需要标签纸尺寸/朝向，必须传 */
  templateData?: TemplateData
}>()

const emit = defineEmits<{ 'update:modelValue': [value: TilingOptions] }>()

/** 目标纸张可选预设：排除连续纸与 CUSTOM（后者由下拉的「自定义」项承担） */
const sheetPresetKeys = Object.keys(PAPER_PRESETS).filter(k => k !== 'CONTINUOUS' && k !== 'CUSTOM')

const labelContinuous = computed(() => props.templateData?.paperSize === 'CONTINUOUS')

/**
 * 展示态配置：缺省字段补 TILE_DEFAULTS；未配置过拼版的模板 enabled 视为 false
 * （否则开关会显示成「已开启」）。
 */
const cfg = computed<TilingOptions>(() => ({
  ...TILE_DEFAULTS,
  ...(props.modelValue ?? {}),
  enabled: props.modelValue?.enabled ?? false,
  sheetMargin: { ...TILE_DEFAULTS.sheetMargin, ...(props.modelValue?.sheetMargin ?? {}) },
}))

/** 以当前配置构造的完整模板，供 core 的校验与布局纯函数使用（单一真实来源） */
const tilingTemplate = computed<TemplateData | undefined>(() =>
  props.templateData ? { ...props.templateData, tiling: cfg.value } : undefined)

const issues = computed(() =>
  tilingTemplate.value ? validateTiling(tilingTemplate.value) : [])

/** 本纸最多可放列数；纯几何、不抛错，超宽时也能给出上限用于约束输入 */
const columnMax = computed(() => {
  const t = tilingTemplate.value
  if (!t) return 1
  return Math.max(computeMaxColumns(t), 1)
})

const layout = computed(() => {
  const t = tilingTemplate.value
  if (!t || issues.value.length) return undefined
  try {
    return computeTileLayout(t)
  } catch {
    return undefined
  }
})

const summary = computed(() => {
  const l = layout.value
  const t = tilingTemplate.value
  if (!l || !t) return ''
  const s = resolveSheetMm(t)
  const name = cfg.value.sheetPaperSize === 'CUSTOM' ? '自定义' : (cfg.value.sheetPaperSize ?? 'A4')
  const dir = cfg.value.sheetPaperSize === 'CUSTOM'
    ? ''
    : (cfg.value.sheetOrientation === 'landscape' ? ' 横向' : ' 纵向')
  return `目标纸 ${name}${dir} ${s.width}×${s.height}mm · ${l.columns} 列 × ${l.rows} 行 = 每张 ${l.perSheet} 格`
})

function patch(partial: Partial<TilingOptions>) {
  emit('update:modelValue', { ...cfg.value, ...partial })
}

function patchMargin(side: 'top' | 'right' | 'bottom' | 'left', value: number | undefined) {
  patch({ sheetMargin: { ...cfg.value.sheetMargin, [side]: value ?? 0 } })
}

/** 切换目标纸张：切到 CUSTOM 时补上当前解析尺寸，避免出现空宽高 */
function onSheetPaperChange(value: string) {
  if (value !== 'CUSTOM') {
    patch({ sheetPaperSize: value as TilingOptions['sheetPaperSize'] })
    return
  }
  const t = tilingTemplate.value
  const current = t ? resolveSheetMm(t) : { width: 210, height: 297 }
  patch({
    sheetPaperSize: 'CUSTOM',
    sheetCustomWidth: cfg.value.sheetCustomWidth ?? current.width,
    sheetCustomHeight: cfg.value.sheetCustomHeight ?? current.height,
  })
}

/**
 * 打开开关时写入 TILE_DEFAULTS 并按纸面收敛列数：
 * 目标纸很小时默认 2 列可能直接非法到连保存都被拦，这里收敛为能放下的列数。
 * 关闭时保留其余字段（再次打开不丢配置）。
 */
function onEnabledChange(next: boolean) {
  if (!next) {
    patch({ enabled: false })
    return
  }
  const max = columnMax.value
  const columns = max >= 1 ? Math.min(TILE_DEFAULTS.columns, max) : 1
  patch({ ...TILE_DEFAULTS, columns })
}
</script>

<style scoped>
.tiling-config {
  padding: 0 4px;
}
.tiling-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
}
.tiling-error {
  color: #f56c6c;
}
.tiling-summary {
  color: var(--pd-text-regular, #606266);
}
</style>
