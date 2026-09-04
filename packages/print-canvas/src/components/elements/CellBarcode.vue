<!-- 表格单元格内条形码/二维码渲染：设计态与预览态共用，按值生成图形 -->
<template>
  <div class="cell-barcode">
    <svg v-show="cellType === 'barcode' && svgOk" ref="barcodeSvg" preserveAspectRatio="xMidYMid meet" :style="svgStyle"></svg>
    <img v-if="cellType === 'qrcode' && dataUrl" :src="dataUrl" alt="qrcode" :style="imgStyle" />
    <span v-if="!svgOk && cellType === 'barcode'" class="cell-barcode-fallback">{{ value || '条码' }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

const props = defineProps<{
  cellType: 'barcode' | 'qrcode'
  value: string
  barcodeType?: string
  qrCodeLevel?: string
  showText?: boolean
  fit?: string
  maxWidth?: number
  maxHeight?: number
}>()

const barcodeSvg = ref<SVGSVGElement | null>(null)
const svgOk = ref(false)
const dataUrl = ref('')

const svgStyle = computed(() => ({
  objectFit: (props.fit || 'contain') as any,
  maxWidth: props.maxWidth ? `${props.maxWidth}mm` : '100%',
  maxHeight: props.maxHeight ? `${props.maxHeight}mm` : '100%',
}))

const imgStyle = computed(() => ({
  objectFit: (props.fit || 'contain') as any,
  maxWidth: props.maxWidth ? `${props.maxWidth}mm` : '100%',
  maxHeight: props.maxHeight ? `${props.maxHeight}mm` : '100%',
}))

function renderBarcode() {
  svgOk.value = false
  if (!barcodeSvg.value) return
  try {
    JsBarcode(barcodeSvg.value, props.value, {
      format: (props.barcodeType || 'CODE128') as any,
      width: 1,
      height: 28,
      displayValue: props.showText !== false,
      fontSize: 9,
      margin: 0,
    })
    svgOk.value = true
  } catch { /* 码值不符合码制时回退文本占位 */ }
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
watch(() => [props.cellType, props.value, props.barcodeType, props.qrCodeLevel, props.showText], render)
</script>

<style scoped>
.cell-barcode { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
/* JsBarcode svg 自带 viewBox，100% + preserveAspectRatio 使条码按单元格等比缩放填满 */
.cell-barcode svg { width: 100%; height: 100%; }
.cell-barcode img { max-width: 100%; max-height: 100%; }
.cell-barcode-fallback { font-style: italic; opacity: 0.6; }
</style>
