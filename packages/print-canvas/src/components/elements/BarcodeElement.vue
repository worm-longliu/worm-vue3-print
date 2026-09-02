<template>
  <div class="print-barcode" ref="containerRef">
    <svg ref="svgRef" preserveAspectRatio="xMidYMid meet"></svg>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import JsBarcode from 'jsbarcode'
import { resolveTextBinding } from '../../utils/binding'
import type { RuntimeElement } from '../../types'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

const svgRef = ref<SVGSVGElement | null>(null)

// 画布元素尺寸单位为 mm，浏览器 96dpi 下 1mm = 96/25.4 px
const MM_TO_PX = 96 / 25.4

function render() {
  if (!svgRef.value) return
  const o = props.element.options
  const value = (props.designMode ? (o.testData || o.formatter) : resolveTextBinding(o, props.data)) || '条码'
  const showText = !o.hideTitle
  const fontSizePx = (o.fontSize || 12) * (96 / 72) // pt → px
  const totalPx = (o.height || 40) * MM_TO_PX       // 元素高度 mm → px
  const textH = showText ? fontSizePx + 4 : 0       // 文本区预留
  const barH = Math.max(8, totalPx - textH)         // 条码图形高度
  try {
    JsBarcode(svgRef.value, value, {
      format: (o.barcodeType || 'CODE128') as any,
      width: o.barWidth ? o.barWidth / 2 : 1,
      height: barH,
      displayValue: showText,
      fontSize: fontSizePx,
      margin: 2,
    })
  } catch { /* ignore render errors */ }
}

onMounted(render)
watch(
  () => [
    props.element.options.formatter,
    props.element.options.testData,
    props.element.options.barcodeType,
    props.element.options.width,
    props.element.options.height,
    props.element.options.barWidth,
    props.element.options.hideTitle,
    props.element.options.fontSize,
  ],
  render,
)
</script>

<style scoped>
.print-barcode { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
/* JsBarcode 生成的 svg 自带 viewBox，width/height 100% 时等比缩放填满容器，随元素宽高变化 */
.print-barcode svg { width: 100%; height: 100%; }
</style>
