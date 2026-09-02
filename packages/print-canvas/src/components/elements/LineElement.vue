<template>
  <div class="print-line" :style="lineStyle" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '../../types'

const props = defineProps<{
  element: RuntimeElement
}>()

const isHline = computed(() => props.element.printElementType.type === 'hline')

const lineStyle = computed(() => {
  const o = props.element.options
  const bw = (o.borderWidth || 0.75) + 'pt'
  const bs = o.borderStyle || 'solid'
  const bc = o.borderColor || '#333'
  if (isHline.value) {
    return { width: '100%', height: '0', borderTop: `${bw} ${bs} ${bc}`, boxSizing: 'border-box' as const }
  }
  return { width: '0', height: '100%', borderLeft: `${bw} ${bs} ${bc}`, boxSizing: 'border-box' as const }
})
</script>