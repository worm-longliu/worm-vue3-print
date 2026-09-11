<template>
  <div class="watermark-config">
    <h3 class="pd-divider">水印</h3>
    <form class="pd-form" @submit.prevent>
      <!-- 模式切换 -->
      <div class="pd-field"><span class="pd-label">水印模式</span>
        <div class="pd-radio-group" role="radiogroup">
          <label class="pd-radio"><input type="radio" v-model="localConfig.mode" value="fixed" @change="onChange"><span>固定文本</span></label>
          <label class="pd-radio"><input type="radio" v-model="localConfig.mode" value="binding" @change="onChange"><span>绑定字段</span></label>
        </div>
      </div>

      <!-- 固定文本模式 -->
      <template v-if="localConfig.mode !== 'binding'">
        <div class="pd-field"><span class="pd-label">水印内容</span>
          <input class="pd-input" v-model="localConfig.content" placeholder="水印文字" @input="onChange" />
        </div>
      </template>

      <!-- 绑定字段模式 -->
      <template v-else>
        <div class="pd-field"><span class="pd-label">绑定字段</span>
          <select class="pd-select" v-model="localConfig.binding" placeholder="选择字段" style="width: 100%" @change="onChange">
            <option v-for="f in fields" :key="f.fieldKey" :value="f.fieldKey">{{ f.fieldLabel }}</option>
          </select>
        </div>
        <div class="pd-field"><span class="pd-label">测试值</span>
          <input class="pd-input" v-model="localConfig.testData" placeholder="预览时显示的测试值" @input="onChange" />
        </div>
      </template>

      <!-- 公共设置 -->
      <div class="pd-field"><span class="pd-label">旋转角度</span>
        <input type="range" class="pd-range" v-model.number="localConfig.rotate" :min="-90" :max="90" :step="5" @change="onChange" />
      </div>
      <div class="pd-field"><span class="pd-label">颜色</span>
        <PresetColorPicker :model-value="localConfig.color" @update:model-value="onColorChange" />
      </div>
      <div class="pd-field"><span class="pd-label">透明度</span>
        <input type="range" class="pd-range" v-model.number="localConfig.opacity" :min="0.05" :max="0.5" :step="0.05" @change="onChange" />
      </div>
      <div class="pd-field"><span class="pd-label">显示时间戳</span>
        <input type="checkbox" class="pd-switch" v-model="localConfig.timestamp" @change="onChange" />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { WatermarkOptions, PrintBusinessField } from '@worm-vue3-print/core/designer'
import PresetColorPicker from './PresetColorPicker.vue'

const props = defineProps<{
  modelValue?: WatermarkOptions
  fields?: PrintBusinessField[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: WatermarkOptions]
}>()

const localConfig = reactive({
  mode: props.modelValue?.mode || 'fixed',
  content: props.modelValue?.content || '',
  binding: props.modelValue?.binding || '',
  testData: props.modelValue?.testData || '',
  rotate: props.modelValue?.rotate ?? -30,
  color: props.modelValue?.color || '#cccccc',
  opacity: props.modelValue?.opacity ?? 0.15,
  timestamp: props.modelValue?.timestamp ?? false,
})

watch(() => props.modelValue, (val) => {
  if (val) {
    Object.assign(localConfig, val)
  }
}, { deep: true })

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
</style>
