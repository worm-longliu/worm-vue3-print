<template>
  <PropertyGroup title="高级设置" icon="Setting" group-key="advanced">
    <form class="pd-form" @submit.prevent>
      <div class="advanced-row">
        <div class="pd-field" v-show="showItem('ad-locked')"><span class="pd-label"><span class="pd-label-t">锁定</span>
          <ResetButton :target="element.options" :base="factoryOptions" prop-key="locked" />
        </span>
          <input type="checkbox" class="pd-switch" v-model="element.options.locked" />
        </div>
        <div class="pd-field" v-show="showItem('ad-fixed')"><span class="pd-label"><span class="pd-label-t">每页重复</span>
          <ResetButton :target="element.options" :base="factoryOptions" prop-key="repeatOnEveryPage" />
        </span>
          <input type="checkbox" class="pd-switch" v-model="element.options.repeatOnEveryPage" />
        </div>
      </div>
      <div class="pd-field" v-show="showItem('ad-z-index')"><span class="pd-label"><span class="pd-label-t">层级</span>
        <ResetButton :target="element.options" :base="factoryOptions" prop-key="zIndex" />
      </span>
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
import { computed } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { createDefaultOptions } from '@worm-vue3-print/core/designer'
import PropertyGroup from './PropertyGroup.vue'
import StepperInput from './StepperInput.vue'
import ResetButton from './ResetButton.vue'

const props = defineProps<{
  element: RuntimeElement
  matchedKeys?: Set<string>
  searching?: boolean
}>()

/** 该元素类型的出厂 options——「恢复默认值」的落点全部由它派生 */
const factoryOptions = computed(() => createDefaultOptions(props.element.printElementType.type))

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
