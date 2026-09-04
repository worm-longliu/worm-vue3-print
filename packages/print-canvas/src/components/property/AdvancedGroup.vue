<template>
  <PropertyGroup title="高级设置" icon="Setting" group-key="advanced">
    <form class="pd-form" @submit.prevent>
      <div class="advanced-row">
        <div class="pd-field" v-show="showItem('ad-locked')"><span class="pd-label">锁定</span>
          <input type="checkbox" class="pd-switch" v-model="element.options.locked" />
        </div>
        <div class="pd-field" v-show="showItem('ad-fixed')"><span class="pd-label">每页重复</span>
          <input type="checkbox" class="pd-switch" v-model="element.options.fixed" />
        </div>
      </div>
      <div class="pd-field" v-show="showItem('ad-z-index')"><span class="pd-label">层级</span>
        <StepperInput v-model="element.options.zIndex"
          :min="0"
          :max="999" />
      </div>
      <div class="pd-field" v-show="showItem('ad-delete')">
        <button type="button" class="pd-button danger" @click="$emit('delete-element')">
          删除元素
        </button>
      </div>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import type { RuntimeElement } from '../../types'
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

defineEmits<{
  'delete-element': []
}>()
</script>

<style scoped>
.advanced-row {
  display: flex;
  gap: 16px;
}
</style>
