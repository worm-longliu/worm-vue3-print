<template>
  <PropertyGroup title="位置与尺寸" icon="Location" default-expanded group-key="position-size">
    <form class="pd-form" @submit.prevent>
      <div class="position-grid">
        <div class="pd-field" v-show="showItem('ps-left')"><span class="pd-label">X</span>
          <StepperInput v-model="element.options.left"
            :min="0" />
        </div>
        <div class="pd-field" v-show="showItem('ps-top')"><span class="pd-label">Y</span>
          <StepperInput v-model="element.options.top"
            :min="0" />
        </div>
        <div class="pd-field" v-show="showItem('ps-width')"><span class="pd-label">W</span>
          <StepperInput v-model="element.options.width"
            :min="4" />
        </div>
        <div class="pd-field" v-show="showItem('ps-height')"><span class="pd-label">H</span>
          <StepperInput v-model="element.options.height"
            :min="4" />
        </div>
      </div>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
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
.position-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
