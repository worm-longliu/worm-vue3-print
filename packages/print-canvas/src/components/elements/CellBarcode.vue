<!-- 表格单元格内条形码/二维码渲染：设计态与预览态共用，按值生成图形 -->
<template>
  <div class="cell-barcode">
    <svg v-show="cellType === 'barcode' && svgOk" ref="barcodeSvg" :preserveAspectRatio="par" :style="svgStyle"></svg>
    <img v-if="cellType === 'qrcode' && dataUrl" :src="dataUrl" alt="qrcode" :style="imgStyle" />
    <span v-if="!svgOk && cellType === 'barcode'" class="cell-barcode-fallback">{{ value || '条码' }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import {
  BARCODE_BAR_HEIGHT_MODULES,
  BARCODE_MARGIN_BOTTOM_MODULES,
  BARCODE_QUIET_ZONE_MODULES,
  BARCODE_TEXT_FONT_SIZE_MODULES,
  resolveBarcodeDotLayout,
} from '@worm-vue3-print/core/designer'

const props = defineProps<{
  cellType: 'barcode' | 'qrcode'
  value: string
  barcodeType?: string
  qrCodeLevel?: string
  /**
   * 条形码下方是否显示文本，缺省视为「显示」（与出图端 `showBarcodeText` 同口径）。
   * 注意：Vue 会把缺省的布尔 prop 转成 false，调用方必须显式传 `cell.showBarcodeText !== false`。
   */
  showText?: boolean
  fit?: string
  maxWidth?: number
  maxHeight?: number
  /** 打印机分辨率（点/英寸）：给出后条形码尺寸吸附到整数打印点 */
  printerDpi?: number
  /** 单元格可用宽度（mm），点对齐用 */
  targetWidthMm?: number
  /** 单元格可用高度（mm），点对齐用 */
  targetHeightMm?: number
  /** 条码模块宽度倍率（2-4），缺省 2（与独立条码元素同口径） */
  barWidth?: number
  /** 条码下方文本字号（相对条高，条高为 30），缺省 BARCODE_TEXT_FONT_SIZE_MODULES */
  barFontSize?: number
}>()

const barcodeSvg = ref<SVGSVGElement | null>(null)
const svgOk = ref(false)
const dataUrl = ref('')
/** 点对齐后的实际尺寸（mm）；未启用或框放不下时为 null（沿用 100% 填格） */
const dotSize = ref<{ width: string; height: string } | null>(null)

/** 缩放模式 → preserveAspectRatio（内联 svg 不支持 object-fit），与出图端 object-fit 等价映射 */
const FIT_TO_PAR = {
  contain: 'xMidYMid meet',
  cover: 'xMidYMid slice',
  fill: 'none',
  none: 'xMidYMid meet',
  'scale-down': 'xMidYMid meet',
} as const

const par = computed(
  () => FIT_TO_PAR[(props.fit || 'contain') as keyof typeof FIT_TO_PAR] ?? 'xMidYMid meet',
)

const svgStyle = computed(() => {
  // 点对齐：尺寸已定死，不再叠加缩放与最大宽高（叠加会把对齐好的尺寸重新缩成非整数点）
  if (dotSize.value) {
    return { width: dotSize.value.width, height: dotSize.value.height, maxWidth: 'none', maxHeight: 'none' }
  }
  return {
    maxWidth: props.maxWidth ? `${props.maxWidth}mm` : '100%',
    maxHeight: props.maxHeight ? `${props.maxHeight}mm` : '100%',
  }
})

const imgStyle = computed(() => ({
  objectFit: (props.fit || 'contain') as any,
  maxWidth: props.maxWidth ? `${props.maxWidth}mm` : '100%',
  maxHeight: props.maxHeight ? `${props.maxHeight}mm` : '100%',
}))

/**
 * 与出图端（browser-code-renderer）共用同一份 jsbarcode 参数：
 * 单元格现在支持 barWidth 倍率，unitPerModule = barWidth / 2（与独立条码元素同口径）。
 */
function renderBarcode() {
  svgOk.value = false
  dotSize.value = null
  if (!barcodeSvg.value) return
  const unitPerModule = Math.max(1, (props.barWidth ?? 2) / 2)
  try {
    JsBarcode(barcodeSvg.value, props.value, {
      format: (props.barcodeType || 'CODE128') as any,
      width: unitPerModule,
      height: BARCODE_BAR_HEIGHT_MODULES * unitPerModule,
      displayValue: props.showText !== false,
      fontSize: (props.barFontSize ?? BARCODE_TEXT_FONT_SIZE_MODULES) * unitPerModule,
      // 静区只留左右（与出图端同参）：上下留白会白白吃掉单元格高度
      margin: 0,
      marginLeft: BARCODE_QUIET_ZONE_MODULES * unitPerModule,
      marginRight: BARCODE_QUIET_ZONE_MODULES * unitPerModule,
      marginTop: 0,
      marginBottom: BARCODE_MARGIN_BOTTOM_MODULES * unitPerModule,
    })
  } catch {
    return /* 码值不符合码制：回退文本占位 */
  }
  svgOk.value = true

  // 与出图端共用同一份点对齐算法：条宽吸附到整数打印点
  const viewBox = readViewBox(barcodeSvg.value)
  const layout = viewBox
    ? resolveBarcodeDotLayout({
      unitWidth: viewBox.width / unitPerModule,
      unitHeight: viewBox.height / unitPerModule,
      boxWidthMm: props.targetWidthMm ?? 0,
      boxHeightMm: props.targetHeightMm ?? 0,
      dpi: props.printerDpi,
    })
    : null
  dotSize.value = layout ? { width: `${layout.widthMm}mm`, height: `${layout.heightMm}mm` } : null
  // 抗锯齿会在条边缘生成灰像素，热敏头只有黑白两态 → 与出图端一致地关掉
  barcodeSvg.value.setAttribute('shape-rendering', 'crispEdges')
}

/** jsbarcode 会把 viewBox 写成 "0 0 W H"；解析失败时返回 null（不启用点对齐） */
function readViewBox(svg: SVGSVGElement): { width: number; height: number } | null {
  const parts = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) return null
  return { width: parts[2]!, height: parts[3]! }
}

async function renderQrcode() {
  if (!props.value) {
    dataUrl.value = ''
    return
  }
  try {
    dataUrl.value = await QRCode.toDataURL(props.value, {
      width: 96,
      margin: 1,
      errorCorrectionLevel: ((props.qrCodeLevel || 'M') as 'L' | 'M' | 'Q' | 'H'),
    })
  } catch {
    dataUrl.value = ''
  }
}

function render() {
  if (props.cellType === 'barcode') renderBarcode()
  else renderQrcode()
}

onMounted(render)
watch(
  () => [
    props.cellType, props.value, props.barcodeType, props.qrCodeLevel, props.showText,
    props.printerDpi, props.targetWidthMm, props.targetHeightMm,
    props.barWidth, props.barFontSize,
  ],
  render,
)
</script>

<style scoped>
.cell-barcode { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
/* JsBarcode svg 自带 viewBox，100% + preserveAspectRatio 使条码按单元格等比缩放填满 */
.cell-barcode svg { width: 100%; height: 100%; }
.cell-barcode img { max-width: 100%; max-height: 100%; }
.cell-barcode-fallback { font-style: italic; opacity: 0.6; }
</style>
