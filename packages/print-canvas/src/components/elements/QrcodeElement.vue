<template>
  <div class="print-qrcode">
    <img v-if="dataUrl" :src="dataUrl" alt="qrcode" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import QRCode from 'qrcode'
import { resolveTextBinding } from '@worm-vue3-print/core/designer'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

// 改用 toDataURL 渲染为 <img>：纳入统一图片加载屏障，规避 canvas 在 PDF 中偶发空白
const dataUrl = ref('')

async function render() {
  const o = props.element.options
  const value = (props.designMode ? (o.testData || o.formatter) : resolveTextBinding(o, props.data)) || '二维码'
  const size = Math.min(o.width || 80, o.height || 80)
  try {
    dataUrl.value = await QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: (String(o.qrCodeLevel ?? 'M') as 'L' | 'M' | 'Q' | 'H'),
    })
  } catch {
    dataUrl.value = ''
  }
}

onMounted(render)
watch(() => [props.element.options.formatter, props.element.options.testData], render)
</script>

<style scoped>
.print-qrcode { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.print-qrcode img { max-width: 100%; max-height: 100%; }
</style>
