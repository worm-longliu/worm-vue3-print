<template>
  <div
    ref="rootRef"
    class="print-text"
    :style="textStyle"
    :data-fit="fit === 'shrink' ? 'shrink' : undefined"
    :data-fit-base="String(baseFontSize)"
    :data-fit-min="String(fitMinPt)"
  >
    {{ displayText }}
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { resolveTextBinding } from '@worm-vue3-print/core/designer'
import { resolveElementTextFit, resolveShrinkMinFontSize } from '@worm-vue3-print/core/designer'
import { useShrinkFit } from '../../composables/useShrinkFit'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

const V_ALIGN_FLEX: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
const H_ALIGN_FLEX: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

const rootRef = ref<HTMLElement | null>(null)

/** 溢出显示形式：截断 / 自动缩小 / 自适应行高（未配置时文本元素默认截断） */
const fit = computed(() => resolveElementTextFit('text', props.element.options))
const baseFontSize = computed(() => props.element.options.fontSize || 12)
const fitMinPt = computed(() => resolveShrinkMinFontSize(props.element.options.shrinkMinFontSize))

const textStyle = computed(() => {
  const o = props.element.options
  const autoHeight = fit.value === 'autoHeight'
  return {
    fontSize: baseFontSize.value + 'pt',
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
    // 自适应行高：不锁定高度，内容撑开；其余形式锁高度并裁剪
    height: autoHeight ? 'auto' : '100%',
    boxSizing: 'border-box' as const,
    overflow: autoHeight ? 'visible' : 'hidden',
    ...(o.wordWrap === false ? { whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' as const } : {}),
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

useShrinkFit(rootRef, () => [
  fit.value,
  baseFontSize.value,
  fitMinPt.value,
  props.element.options.width,
  props.element.options.height,
  props.element.options.wordWrap,
  props.element.options.letterSpacing,
  props.element.options.lineHeight,
  displayText.value,
])
</script>
