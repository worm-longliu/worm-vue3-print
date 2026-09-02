<template>
  <PropertyGroup title="外观" icon="Brush" default-expanded group-key="appearance">
    <form class="pd-form" @submit.prevent>
      <template v-if="isTextType">
        <div class="pd-field" v-show="showItem('ap-font-size')"><span class="pd-label">字体大小</span>
          <input type="number" class="pd-input" v-model.number="element.options.fontSize"
            :min="8"
            :max="72"
            style="width: 100%" />
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
            <input type="color" class="pd-color" v-model="element.options.color" />
          </div>
          <div class="pd-field" v-show="showItem('ap-bg-color')"><span class="pd-label">背景色</span>
            <input type="color" class="pd-color" v-model="element.options.backgroundColor" />
          </div>
        </div>
        <div class="pd-field" v-show="showItem('ap-line-height')"><span class="pd-label">行高</span>
          <input type="number" class="pd-input" v-model.number="element.options.lineHeight"
            :min="0"
            :max="100"
            style="width: 100%" />
        </div>
        <div class="pd-field" v-show="showItem('ap-letter-spacing')"><span class="pd-label">字间距</span>
          <input type="number" class="pd-input" v-model.number="element.options.letterSpacing"
            :min="0"
            :max="20"
            :step="0.5"
            style="width: 100%" />
        </div>
      </template>

      <p class="pd-empty" v-if="!isTextType && !isTableType">当前元素不支持外观设置</p>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '../../types'
import PropertyGroup from './PropertyGroup.vue'

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
</script>

<style scoped>
.color-row {
  display: flex;
  gap: 16px;
}</style>