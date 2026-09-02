<template>
  <PropertyGroup title="位置与尺寸" icon="Location" default-expanded group-key="position-size">
    <form class="pd-form" @submit.prevent>
      <div class="position-grid">
        <div class="pd-field" v-show="showItem('ps-left')"><span class="pd-label">X</span>
          <input type="number" class="pd-input" v-model.number="element.options.left"
            :min="0"
            :step="0.01" />
        </div>
        <div class="pd-field" v-show="showItem('ps-top')"><span class="pd-label">Y</span>
          <input type="number" class="pd-input" v-model.number="element.options.top"
            :min="0"
            :step="0.01" />
        </div>
        <div class="pd-field" v-show="showItem('ps-width')"><span class="pd-label">W</span>
          <input type="number" class="pd-input" v-model.number="element.options.width"
            :min="3.5"
            :step="0.01" />
        </div>
        <div class="pd-field" v-show="showItem('ps-height')"><span class="pd-label">H</span>
          <input type="number" class="pd-input" v-model.number="element.options.height"
            :min="3.5"
            :step="0.01" />
        </div>
      </div>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import type { RuntimeElement } from '../../types'
import PropertyGroup from './PropertyGroup.vue'

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
