<template>
  <div class="print-barcode" ref="containerRef">
    <svg ref="svgRef" :preserveAspectRatio="preserveAspectRatio" :style="svgStyle"></svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import JsBarcode from 'jsbarcode'
import { resolveBarcodeDesignValue, resolveTextBinding } from '@worm-vue3-print/core/designer'
import {
  BARCODE_MARGIN_BOTTOM_MODULES,
  BARCODE_TEXT_FONT_SIZE_MODULES,
  barcodeAvailableBoxMm,
  barcodeQuietZoneModules,
  barcodeUnitsPerModule,
  layoutBarcodeSize,
} from '@worm-vue3-print/core/designer'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

const svgRef = ref<SVGSVGElement | null>(null)
/** 结算后的落纸尺寸（mm）：与出图端同源（条宽定首选 → DPI 吸附 → 框不够等比缩小） */
const size = ref<{ width: string; height: string } | null>(null)

/**
 * 缩放模式 → preserveAspectRatio（内联 svg 不支持 object-fit）。
 * 条码尺寸由条宽与打印机分辨率结算，不再被拉伸填满元素框，故这里只作兜底：
 * 结算尺寸缺失（viewBox 解析失败等极端情形）时才让 CSS 接管等比适配。
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
 * 显式给出结算后的 mm 尺寸（与出图端同一份算法），未结算成功时回退等比缩放到元素框内。
 */
const svgStyle = computed(() => {
  if (size.value) {
    return { width: size.value.width, height: size.value.height }
  }
  return { maxWidth: '100%', maxHeight: '100%' }
})

function render() {
  if (!svgRef.value) return
  const svg = svgRef.value
  const o = props.element.options
  // 与二维码、单元格同口径：先按 demo 数据求「内容」，求不到才拿 testData 当示例码值
  const value = (props.designMode
    ? resolveBarcodeDesignValue(o.formatter, props.data, o.testData ?? '')
    : resolveTextBinding(o, props.data)) || '条码'
  const unitPerModule = barcodeUnitsPerModule(o.barWidth)
  const quietModules = barcodeQuietZoneModules(o.barQuietZone)
  /** 生成一趟码面并读回 viewBox，条区模块数交给 core 的条高布局决定（未填条高只走一趟） */
  const measure = (barHeightModules: number) => {
    JsBarcode(svg, value, {
      format: (o.barcodeType || 'CODE128') as any,
      width: unitPerModule,
      height: barHeightModules * unitPerModule,
      displayValue: !o.hideTitle,
      fontSize: (o.fontSize ?? BARCODE_TEXT_FONT_SIZE_MODULES) * unitPerModule,
      // 静区只留左右（与出图端同参）：上下留白会白白吃掉元素高度
      margin: 0,
      marginLeft: quietModules * unitPerModule,
      marginRight: quietModules * unitPerModule,
      marginTop: 0,
      marginBottom: BARCODE_MARGIN_BOTTOM_MODULES * unitPerModule,
    })
    const viewBox = readViewBox(svg)
    return viewBox ? { widthUnits: viewBox.width, heightUnits: viewBox.height } : null
  }

  try {
    // 与出图端共用同一份算法：条宽定首选尺寸、有 dpi 时吸附到整数打印点，条高只在此之上让位不挤窄条宽
    const layout = layoutBarcodeSize({
      barHeightMm: o.barHeight,
      // 最大宽高并入可用框：与出图端一致地作为结算上限，而不是事后用 CSS 再缩一次
      boxWidthMm: barcodeAvailableBoxMm(o.width, o.maxWidth),
      boxHeightMm: barcodeAvailableBoxMm(o.height, o.maxHeight),
      dpi: o.printerDpi,
      barWidth: o.barWidth,
      measure,
    })
    size.value = layout.size
      ? { width: `${layout.size.widthMm}mm`, height: `${layout.size.heightMm}mm` }
      : null
  } catch {
    size.value = null
    return /* 码值不符合码制：保留空白 svg */
  }
  // 抗锯齿会在条边缘生成灰像素，热敏头只有黑白两态 → 与出图端一致地关掉
  svg.setAttribute('shape-rendering', 'crispEdges')
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
    props.element.options.barQuietZone,
    props.element.options.barHeight,
    props.element.options.printerDpi,
    props.element.options.hideTitle,
    props.element.options.fontSize,
    props.element.options.maxWidth,
    props.element.options.maxHeight,
  ],
  render,
)
</script>

<style scoped>
.print-barcode { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
/* 非点对齐模式：SVG 使用固有尺寸（由 barWidth 决定），约束在容器内 */
.print-barcode svg { max-width: 100%; max-height: 100%; }
</style>
