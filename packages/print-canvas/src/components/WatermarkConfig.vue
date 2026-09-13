<template>
  <div class="watermark-config">
    <h3 class="pd-divider">水印</h3>
    <form class="pd-form" @submit.prevent>
      <!-- 单一表达式输入：纯文本即静态水印，含 {字段}/函数/字段路径即按表达式解析 -->
      <div class="pd-field"><span class="pd-label">水印表达式</span>
        <input
          class="pd-input"
          v-model="expressionText"
          placeholder="直接输入文字，或用表达式：{order.no}、{printDate}"
          title="双击或点「编辑表达式」打开表达式弹框"
          @input="onTextInput"
          @dblclick="openExpressionEditor"
        />
        <button type="button" class="pd-button small" @click="openExpressionEditor">编辑表达式</button>
      </div>
      <div v-if="isExpression" class="pd-field"><span class="pd-label">测试值</span>
        <input class="pd-input" v-model="testData" placeholder="表达式取不到值时预览显示" @input="onChange" />
      </div>
      <ExpressionEditor
        v-model="exprEditorVisible"
        :fields="fields"
        :expression="expressionText"
        @update:expression="onExpressionChange"
      />

      <!-- 公共设置 -->
      <div class="pd-field"><span class="pd-label">旋转角度</span>
        <input type="range" class="pd-range" v-model.number="localConfig.rotate" :min="-90" :max="90" :step="5" @change="onChange" />
        <span class="pd-hint">{{ localConfig.rotate }}°</span>
      </div>
      <div class="pd-field"><span class="pd-label">颜色</span>
        <PresetColorPicker :model-value="localConfig.color" @update:model-value="onColorChange" />
      </div>
      <div class="pd-field"><span class="pd-label">透明度</span>
        <input type="range" class="pd-range" v-model.number="localConfig.opacity" :min="0.05" :max="0.5" :step="0.05" @change="onChange" />
        <span class="pd-hint">{{ localConfig.opacity.toFixed(2) }}</span>
      </div>
      <div class="pd-field"><span class="pd-label">密度</span>
        <select class="pd-select" v-model="density" style="width: 100%" @change="onChange">
          <option v-for="(p, key) in densityPresets" :key="key" :value="key">{{ p.label }}（{{ p.width }}×{{ p.height }}）</option>
          <option value="custom">自定义</option>
        </select>
      </div>
      <template v-if="density === 'custom'">
        <div class="pd-field"><span class="pd-label">瓦片宽</span>
          <input type="number" class="pd-input" v-model.number="localConfig.tileWidth" :min="minTileWidth" :step="10" @change="onChange" />
        </div>
        <div class="pd-field"><span class="pd-label">瓦片高</span>
          <input type="number" class="pd-input" v-model.number="localConfig.tileHeight" :min="minTileHeight" :step="10" @change="onChange" />
        </div>
      </template>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { WatermarkOptions, PrintBusinessField } from '@worm-vue3-print/core/designer'
import { WATERMARK_DENSITY_PRESETS, WATERMARK_DEFAULTS } from '@worm-vue3-print/core'
import PresetColorPicker from './PresetColorPicker.vue'
import ExpressionEditor from './ExpressionEditor.vue'

const props = defineProps<{
  modelValue?: WatermarkOptions
  fields?: PrintBusinessField[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: WatermarkOptions]
}>()

const densityPresets = WATERMARK_DENSITY_PRESETS
const minTileWidth = WATERMARK_DEFAULTS.minTileWidth
const minTileHeight = WATERMARK_DEFAULTS.minTileHeight

/**
 * 判断输入是「表达式」还是「静态文本」：
 * - 含花括号：{order.no}、{CONCAT(...)}、第{pageIndex}页
 * - 函数调用：CONCAT('单号：', order.no)
 * - 字段路径：order.no（与 core binding 模式的路径解析一致）
 * 其余（含中文标语）按静态水印处理。
 */
function isExpressionText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/[{}]/.test(t)) return true
  if (/^[A-Za-z_$][\w$]*\s*\(/.test(t)) return true
  return /^[A-Za-z_$][\w$]*(\.[\w$]+)+$/.test(t)
}

/** 取模板里的水印文本：binding 模式取 binding，其余取 content */
function readText(v?: WatermarkOptions): string {
  if (!v) return ''
  return v.mode === 'binding' ? (v.binding ?? '') : (v.content ?? '')
}

const expressionText = ref(readText(props.modelValue))
const testData = ref(props.modelValue?.testData || '')
const exprEditorVisible = ref(false)
// 当前按哪种模式落盘；文本被编辑时按内容重新判定
const activeMode = ref<'fixed' | 'binding'>(props.modelValue?.mode === 'binding' ? 'binding' : 'fixed')

const localConfig = reactive({
  rotate: props.modelValue?.rotate ?? WATERMARK_DEFAULTS.rotate,
  color: props.modelValue?.color || WATERMARK_DEFAULTS.color,
  opacity: props.modelValue?.opacity ?? WATERMARK_DEFAULTS.opacity,
  tileWidth: props.modelValue?.tileWidth ?? WATERMARK_DEFAULTS.tileWidth,
  tileHeight: props.modelValue?.tileHeight ?? WATERMARK_DEFAULTS.tileHeight,
})

/** 是否表达式模式（决定是否展示测试值；纯文本水印用不到） */
const isExpression = computed(() => activeMode.value === 'binding')

watch(() => props.modelValue, (val) => {
  if (!val) return
  expressionText.value = readText(val)
  // 模板未改动文本时沿用原模式（兼容 binding 存的是无花括号路径的存量模板）
  activeMode.value = val.mode === 'binding' ? 'binding' : 'fixed'
  testData.value = val.testData || ''
  localConfig.rotate = val.rotate ?? WATERMARK_DEFAULTS.rotate
  localConfig.color = val.color || WATERMARK_DEFAULTS.color
  localConfig.opacity = val.opacity ?? WATERMARK_DEFAULTS.opacity
  localConfig.tileWidth = val.tileWidth ?? WATERMARK_DEFAULTS.tileWidth
  localConfig.tileHeight = val.tileHeight ?? WATERMARK_DEFAULTS.tileHeight
}, { deep: true })

const density = computed({
  get(): string {
    const { tileWidth, tileHeight } = localConfig
    for (const [key, preset] of Object.entries(densityPresets)) {
      if (tileWidth === preset.width && tileHeight === preset.height) return key
    }
    return 'custom'
  },
  set(value: string) {
    const preset = densityPresets[value]
    if (preset) {
      localConfig.tileWidth = preset.width
      localConfig.tileHeight = preset.height
    }
  },
})

/** 文本变化（输入框 / 弹框）：按内容重新判定表达式或静态文本 */
function onTextChanged() {
  activeMode.value = isExpressionText(expressionText.value) ? 'binding' : 'fixed'
  onChange()
}

function onTextInput() {
  onTextChanged()
}

function openExpressionEditor() {
  exprEditorVisible.value = true
}

function onExpressionChange(value: string) {
  expressionText.value = value
  onTextChanged()
}

function onColorChange(value: string) {
  localConfig.color = value
  onChange()
}

/** 统一落盘：表达式写 binding，静态文本写 content（core 两种模式都支持） */
function onChange() {
  const base = {
    testData: testData.value,
    rotate: localConfig.rotate,
    color: localConfig.color,
    opacity: localConfig.opacity,
    tileWidth: localConfig.tileWidth,
    tileHeight: localConfig.tileHeight,
  }
  emit('update:modelValue', activeMode.value === 'binding'
    ? { ...base, mode: 'binding', binding: expressionText.value, content: '' }
    : { ...base, mode: 'fixed', content: expressionText.value, binding: '' })
}
</script>

<style scoped>
.watermark-config {
  padding: 0 4px;
}

.pd-hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
  min-width: 32px;
}
</style>
