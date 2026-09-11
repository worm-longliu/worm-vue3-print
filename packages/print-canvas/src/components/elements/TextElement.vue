<template>
  <div class="print-text" :style="textStyle">
    {{ displayText }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { resolveTextBinding } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

const V_ALIGN_FLEX: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
const H_ALIGN_FLEX: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

const textStyle = computed(() => {
  const o = props.element.options
  return {
    fontSize: (o.fontSize || 12) + 'pt',
    fontWeight: o.fontWeight || 'normal',
    fontFamily: o.fontFamily || 'inherit',
    color: o.color || '#333',
    backgroundColor: o.backgroundColor || 'transparent',
    textAlign: o.textAlign || 'left',
    lineHeight: o.lineHeight ? o.lineHeight + 'pt' : 'normal',
    letterSpacing: o.letterSpacing ? o.letterSpacing + 'pt' : 'normal',
    textDecoration: o.textDecoration || 'none',
    padding: `${o.contentPaddingTop || 0}pt ${o.contentPaddingRight || 0}pt ${o.contentPaddingBottom || 0}pt ${o.contentPaddingLeft || 0}pt`,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box' as const,
    overflow: 'hidden',
    ...(o.verticalAlign
      ? {
          display: 'flex',
          alignItems: V_ALIGN_FLEX[o.verticalAlign] ?? 'flex-start',
          justifyContent: H_ALIGN_FLEX[o.textAlign || 'left'] ?? 'flex-start',
        }
      : {}),
  }
})

const displayText = computed(() => {
  if (props.designMode) {
    if (props.element.options.testData) {
      return props.element.options.testData
    }
    return props.element.options.formatter || '文本'
  }
  return resolveTextBinding(props.element.options, props.data)
})
</script>
