<template>
  <div class="watermark-config">
    <h3 class="pd-divider">水印</h3>
    <form class="pd-form" @submit.prevent>
      <!-- 模式切换 -->
      <div class="pd-field"><span class="pd-label">水印模式</span>
        <div class="pd-radio-group" role="radiogroup">
          <label class="pd-radio"><input type="radio" v-model="localConfig.mode" value="fixed" @change="onChange"><span>固定文本</span></label>
          <label class="pd-radio"><input type="radio" v-model="localConfig.mode" value="binding" @change="onChange"><span>字段表达式</span></label>
        </div>
      </div>

      <!-- 固定文本模式 -->
      <template v-if="localConfig.mode !== 'binding'">
        <div class="pd-field"><span class="pd-label">水印内容</span>
          <input class="pd-input" v-model="localConfig.content" placeholder="水印文字" @input="onChange" />
        </div>
      </template>

      <!-- 字段表达式模式：表达式经弹框编辑（弹框内可选字段与打印日期/时间等变量） -->
      <template v-else>
        <div class="pd-field"><span class="pd-label">字段表达式</span>
          <input
            class="pd-input"
            v-model="bindingInput"
            placeholder="如 {order.no}、{printDate}、CONCAT('单号：', order.no)"
            title="双击或点「编辑表达式」打开表达式弹框"
            @input="onBindingInput"
            @dblclick="openExpressionEditor"
          />
          <button type="button" class="pd-button small" @click="openExpressionEditor">编辑表达式</button>
        </div>
        <div class="pd-field"><span class="pd-label">测试值</span>
          <input class="pd-input" v-model="localConfig.testData" placeholder="表达式的测试值" @input="onChange" />
        </div>
        <ExpressionEditor
          v-model="exprEditorVisible"
          :fields="fields"
          :expression="bindingInput"
          @update:expression="onExpressionChange"
        />
      </template>

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

const localConfig = reactive({
  mode: props.modelValue?.mode || 'fixed',
  content: props.modelValue?.content || '',
  binding: props.modelValue?.binding || '',
  testData: props.modelValue?.testData || '',
  rotate: props.modelValue?.rotate ?? WATERMARK_DEFAULTS.rotate,
  color: props.modelValue?.color || WATERMARK_DEFAULTS.color,
  opacity: props.modelValue?.opacity ?? WATERMARK_DEFAULTS.opacity,
  tileWidth: props.modelValue?.tileWidth ?? WATERMARK_DEFAULTS.tileWidth,
  tileHeight: props.modelValue?.tileHeight ?? WATERMARK_DEFAULTS.tileHeight,
})

// 字段表达式输入框（直接写入 WatermarkOptions.binding）
const bindingInput = ref(props.modelValue?.binding || '')
const exprEditorVisible = ref(false)

watch(() => props.modelValue, (val) => {
  if (!val) return
  localConfig.mode = val.mode || 'fixed'
  localConfig.content = val.content || ''
  localConfig.binding = val.binding || ''
  localConfig.testData = val.testData || ''
  localConfig.rotate = val.rotate ?? WATERMARK_DEFAULTS.rotate
  localConfig.color = val.color || WATERMARK_DEFAULTS.color
  localConfig.opacity = val.opacity ?? WATERMARK_DEFAULTS.opacity
  localConfig.tileWidth = val.tileWidth ?? WATERMARK_DEFAULTS.tileWidth
  localConfig.tileHeight = val.tileHeight ?? WATERMARK_DEFAULTS.tileHeight
  bindingInput.value = val.binding || ''
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

function onBindingInput() {
  localConfig.binding = bindingInput.value
  onChange()
}

function openExpressionEditor() {
  exprEditorVisible.value = true
}

/** 表达式弹框确定：同步输入框与配置 */
function onExpressionChange(value: string) {
  bindingInput.value = value
  localConfig.binding = value
  onChange()
}

function onColorChange(value: string) {
  localConfig.color = value
  onChange()
}

function onChange() {
  emit('update:modelValue', { ...localConfig })
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
