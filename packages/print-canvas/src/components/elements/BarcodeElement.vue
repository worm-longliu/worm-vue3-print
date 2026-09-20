<template>
  <div class="print-barcode" ref="containerRef">
    <svg ref="svgRef" :preserveAspectRatio="preserveAspectRatio" :style="svgStyle"></svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import JsBarcode from 'jsbarcode'
import { resolveTextBinding } from '@worm-vue3-print/core/designer'
import {
  BARCODE_BAR_HEIGHT_MODULES,
  BARCODE_MARGIN_BOTTOM_MODULES,
  BARCODE_QUIET_ZONE_MODULES,
  BARCODE_TEXT_FONT_SIZE_MODULES,
  resolveBarcodeDotLayout,
} from '@worm-vue3-print/core/designer'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

const svgRef = ref<SVGSVGElement | null>(null)
/** 点对齐后的实际尺寸（mm）；未启用打印机 dpi 时为 null（沿用 100% 填框） */
const dotSize = ref<{ width: string; height: string } | null>(null)

/**
 * 缩放模式 → preserveAspectRatio（内联 svg 不支持 object-fit）：
 * 出图端是 `<img>` 上的 object-fit，这里用等比映射保持一致。
 * `none`（原始尺寸）出图端按 SVG 固有尺寸居中，设计态退化为 meet，仅此一项不严格等价。
 */
const FIT_TO_PAR = {
  contain: 'xMidYMid meet',
  cover: 'xMidYMid slice',
  fill: 'none',
  none: 'xMidYMid meet',
  'scale-down': 'xMidYMid meet',
} as const

const preserveAspectRatio = computed(
  () => FIT_TO_PAR[(props.element.options.fit || 'contain') as keyof typeof FIT_TO_PAR] ?? 'xMidYMid meet',
)

/**
 * 点对齐时按整数打印点的 mm 尺寸落纸（与出图端同源）：尺寸已定死，
 * 不再叠加缩放模式与最大宽高（叠加会把刚对齐好的尺寸重新缩成非整数点）。
 * 未启用点对齐（未设 dpi 或框放不下）时沿用 100% 填框。
 */
const svgStyle = computed(() => {
  const o = props.element.options
  if (dotSize.value) {
    return { width: dotSize.value.width, height: dotSize.value.height, maxWidth: 'none', maxHeight: 'none' }
  }
  return {
    width: '100%',
    height: '100%',
    maxWidth: o.maxWidth ? `${o.maxWidth}mm` : '100%',
    maxHeight: o.maxHeight ? `${o.maxHeight}mm` : '100%',
  }
})

function render() {
  if (!svgRef.value) return
  const o = props.element.options
  const value = (props.designMode ? (o.testData || o.formatter) : resolveTextBinding(o, props.data)) || '条码'
  const unitPerModule = Math.max(1, (o.barWidth ?? 2) / 2)
  try {
    JsBarcode(svgRef.value, value, {
      format: (o.barcodeType || 'CODE128') as any,
      width: unitPerModule,
      height: BARCODE_BAR_HEIGHT_MODULES * unitPerModule,
      displayValue: !o.hideTitle,
      fontSize: (o.fontSize ?? BARCODE_TEXT_FONT_SIZE_MODULES) * unitPerModule,
      // 静区只留左右（与出图端同参）：上下留白会白白吃掉元素高度
      margin: 0,
      marginLeft: BARCODE_QUIET_ZONE_MODULES * unitPerModule,
      marginRight: BARCODE_QUIET_ZONE_MODULES * unitPerModule,
      marginTop: 0,
      marginBottom: BARCODE_MARGIN_BOTTOM_MODULES * unitPerModule,
    })
  } catch {
    dotSize.value = null
    return /* 码值不符合码制：保留空白 svg */
  }

  // 与出图端共用同一份点对齐算法：条宽吸附到整数打印点
  const viewBox = readViewBox(svgRef.value)
  const layout = viewBox
    ? resolveBarcodeDotLayout({
      unitWidth: viewBox.width / unitPerModule,
      unitHeight: viewBox.height / unitPerModule,
      boxWidthMm: o.width || 0,
      boxHeightMm: o.height || 0,
      dpi: o.printerDpi,
    })
    : null
  dotSize.value = layout ? { width: `${layout.widthMm}mm`, height: `${layout.heightMm}mm` } : null
  // 抗锯齿会在条边缘生成灰像素，热敏头只有黑白两态 → 与出图端一致地关掉
  svgRef.value.setAttribute('shape-rendering', 'crispEdges')
}

/** jsbarcode 会把 viewBox 写成 "0 0 W H"；解析失败时返回 null（不启用点对齐） */
function readViewBox(svg: SVGSVGElement): { width: number; height: number } | null {
  const parts = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) return null
  return { width: parts[2]!, height: parts[3]! }
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
    props.element.options.printerDpi,
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
