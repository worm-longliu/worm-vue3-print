<template>
  <PropertyGroup title="外观" icon="Brush" default-expanded group-key="appearance">
    <form class="pd-form" @submit.prevent>
      <template v-if="isTextType">
        <div class="pd-field" v-show="showItem('ap-font-family')"><span class="pd-label">字体</span>
          <FontSelect v-model="element.options.fontFamily" />
        </div>
        <div class="pd-field" v-show="showItem('ap-font-size')"><span class="pd-label">字体大小</span>
          <StepperInput v-model="element.options.fontSize"
            :min="8"
            :max="72" />
        </div>
        <div class="pd-field" v-show="showItem('ap-font-weight')"><span class="pd-label">字体粗细</span>
          <select class="pd-select" v-model="element.options.fontWeight" style="width: 100%">
            <option value="normal">正常</option>
            <option value="bold">粗体</option>
            <option value="bolder">更粗</option>
            <option value="lighter">细体</option>
          </select>
        </div>
        <div class="pd-field" v-show="showItem('ap-align')"><span class="pd-label">对齐</span>
          <div class="pd-radio-group" role="radiogroup">
            <label class="pd-radio"><input type="radio" v-model="element.options.textAlign" value="left"><span>左</span></label>
            <label class="pd-radio"><input type="radio" v-model="element.options.textAlign" value="center"><span>中</span></label>
            <label class="pd-radio"><input type="radio" v-model="element.options.textAlign" value="right"><span>右</span></label>
          </div>
        </div>
        <div class="pd-field" v-show="showItem('ap-vertical-align')"><span class="pd-label">垂直对齐</span>
          <div class="pd-radio-group" role="radiogroup">
            <label class="pd-radio"><input type="radio" v-model="element.options.verticalAlign" value="top"><span>顶</span></label>
            <label class="pd-radio"><input type="radio" v-model="element.options.verticalAlign" value="middle"><span>中</span></label>
            <label class="pd-radio"><input type="radio" v-model="element.options.verticalAlign" value="bottom"><span>底</span></label>
          </div>
        </div>
        <div class="color-row">
          <div class="pd-field" v-show="showItem('ap-color')"><span class="pd-label">颜色</span>
            <PresetColorPicker v-model="element.options.color" />
          </div>
          <div class="pd-field" v-show="showItem('ap-bg-color')"><span class="pd-label">背景色</span>
            <PresetColorPicker v-model="element.options.backgroundColor" />
          </div>
        </div>
        <div class="pd-field" v-show="showItem('ap-line-height')"><span class="pd-label">行高</span>
          <StepperInput v-model="element.options.lineHeight"
            :min="0"
            :max="100" />
        </div>
        <div class="pd-field" v-show="showItem('ap-letter-spacing')"><span class="pd-label">字间距</span>
          <StepperInput v-model="element.options.letterSpacing"
            :min="0"
            :max="20"
            :step="0.5" />
        </div>
        <div class="pd-field" v-show="showItem('ap-text-fit')"><span class="pd-label">文字溢出</span>
          <select class="pd-select" :value="textFit" style="width: 100%" @change="onTextFitChange">
            <option value="clip">截断</option>
            <option value="shrink">自动缩小</option>
            <option value="autoHeight">自适应行高</option>
          </select>
        </div>
        <div class="pd-field" v-if="textFit === 'shrink'" v-show="showItem('ap-shrink-min')"><span class="pd-label">最小字号 (pt)</span>
          <StepperInput :model-value="element.options.shrinkMinFontSize"
            :min="1"
            :max="72"
            :step="0.5"
            placeholder="默认 6"
            @update:model-value="element.options.shrinkMinFontSize = $event ?? undefined" />
        </div>
        <div class="pd-field" v-show="showItem('ap-word-wrap')"><span class="pd-label">自动换行</span>
          <input :checked="element.options.wordWrap !== false" type="checkbox" class="pd-switch"
            @input="element.options.wordWrap = ($event.target as HTMLInputElement).checked ? undefined : false" />
        </div>
      </template>

      <p class="pd-empty" v-if="!isTextType && !isTableType">当前元素不支持外观设置</p>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { resolveElementTextFit, type TextFit } from '@worm-vue3-print/core/designer'
import PresetColorPicker from '../PresetColorPicker.vue'
import PropertyGroup from './PropertyGroup.vue'
import StepperInput from './StepperInput.vue'
import FontSelect from './FontSelect.vue'

const props = defineProps<{
  element: RuntimeElement
  isTextType: boolean
  matchedKeys?: Set<string>
  searching?: boolean
}>()

function showItem(key: string): boolean {
  if (!props.searching) {
    return true
  }
  return props.matchedKeys?.has(key) ?? true
}

const isTableType = computed(() => {
  return props.element.printElementType.type === 'table'
})

/** 溢出形式：未配置时按元素类型取默认（文本=截断、长文本=自适应行高） */
const textFit = computed<TextFit>(() =>
  resolveElementTextFit(props.element.printElementType.type || 'text', props.element.options),
)

function onTextFitChange(e: Event) {
  props.element.options.textFit = (e.target as HTMLSelectElement).value as TextFit
}
</script>

<style scoped>
.color-row {
  display: flex;
  gap: 12px;
}
.color-row > .pd-field {
  flex: 1 1 0;
  min-width: 0;
}</style>