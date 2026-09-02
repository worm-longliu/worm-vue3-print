<template>
  <div class="print-longtext" :style="textStyle">
    {{ displayText }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '../../types'
import { resolveTextBinding } from '../../utils/binding'

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
    lineHeight: o.lineHeight ? o.lineHeight + 'pt' : '1.5',
    letterSpacing: o.letterSpacing ? o.letterSpacing + 'pt' : 'normal',
    textIndent: o.longTextIndent ? o.longTextIndent + 'pt' : '0',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    wordBreak: 'break-all' as const,
    boxSizing: 'border-box' as const,
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
    if (props.element.options.formatter) return props.element.options.formatter
    return '长文本内容'
  }
  return resolveTextBinding(props.element.options, props.data)
})
</script>
