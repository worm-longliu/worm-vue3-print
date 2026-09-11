<template>
  <div class="print-shape" :style="shapeStyle" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement
}>()

const isOval = computed(() => props.element.printElementType.type === 'oval')

const shapeStyle = computed(() => {
  const o = props.element.options
  return {
    width: '100%',
    height: '100%',
    borderWidth: (o.borderWidth || 1) + 'pt',
    borderStyle: (o.borderStyle || 'solid') as string,
    borderColor: o.borderColor || '#333',
    backgroundColor: o.backgroundColor || 'transparent',
    borderRadius: isOval.value ? '50%' : '0',
    boxSizing: 'border-box' as const,
  }
})
</script>
