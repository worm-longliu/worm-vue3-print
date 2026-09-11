<template>
  <div class="print-html" v-html="htmlContent" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { evaluateTemplate } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

const htmlContent = computed(() => {
  if (props.element.options.formatter) {
    const row = props.data && props.data.length > 0 ? props.data[0] : {}
    const result = evaluateTemplate(props.element.options.formatter, row ?? {})
    return result ? DOMPurify.sanitize(result) : ''
  }
  return '<div style="background:#e0e0e0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:10pt;color:#999">HTML</div>'
})
</script>

<style scoped>
.print-html { width: 100%; height: 100%; overflow: hidden; }
</style>
