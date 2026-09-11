<template>
  <PropertyGroup title="边框与背景" icon="Picture" default-expanded group-key="border-bg">
    <form class="pd-form" @submit.prevent>
      <div class="border-row">
        <div class="pd-field" v-show="showItem('bb-border-width')"><span class="pd-label">边框宽度</span>
          <StepperInput v-model="element.options.borderWidth"
            :min="0"
            :max="20"
            :step="0.25" />
        </div>
        <div class="pd-field" v-show="showItem('bb-border-color')"><span class="pd-label">边框颜色</span>
          <PresetColorPicker v-model="element.options.borderColor" />
        </div>
      </div>
      <div class="pd-field" v-show="showItem('bb-bg-color')"><span class="pd-label">背景色</span>
        <PresetColorPicker v-model="element.options.backgroundColor" />
      </div>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import PresetColorPicker from '../PresetColorPicker.vue'
import PropertyGroup from './PropertyGroup.vue'
import StepperInput from './StepperInput.vue'

const props = defineProps<{
  element: RuntimeElement
  matchedKeys?: Set<string>
  searching?: boolean
}>()

function showItem(key: string): boolean {
  if (!props.searching) {
    return true
  }
  return props.matchedKeys?.has(key) ?? true
}
</script>

<style scoped>
.border-row {
  display: flex;
  gap: 10px;
}
.border-row .pd-field {
  flex: 1;
  min-width: 0;
}</style>