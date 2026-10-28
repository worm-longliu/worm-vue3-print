<template>
  <div class="print-qrcode">
    <img v-if="dataUrl" :src="dataUrl" alt="qrcode" :style="imgStyle" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { browserCodeRenderer } from '@worm-vue3-print/core/browser'
import { resolveBarcodeDesignValue, resolveTextBinding } from '@worm-vue3-print/core/designer'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

// 与出纸同源（core/browser 的 browserCodeRenderer）：同一份 SVG、同一静区，
// 矢量图形不受元素盒大小影响，缩放盒子无需重新出图
const dataUrl = ref('')

/** 铺满元素盒（width/height 显式给出）+ 最大宽高（mm）上限，与出图端 codeImgHtml 同口径 */
const imgStyle = computed(() => {
  const o = props.element.options
  return {
    width: '100%',
    height: '100%',
    objectFit: (o.fit || 'contain') as any,
    maxWidth: o.maxWidth ? `${o.maxWidth}mm` : '100%',
    maxHeight: o.maxHeight ? `${o.maxHeight}mm` : '100%',
  }
})

function render() {
  const o = props.element.options
  // 与单元格同源：先按 demo 数据求「内容」，求不到才拿 testData 当示例码值。
  // testData 是工厂预置的占位码值，摆在前头会永久遮住作者后来填的内容。
  const value = (props.designMode
    ? resolveBarcodeDesignValue(o.formatter, props.data, o.testData ?? '')
    : resolveTextBinding(o, props.data)) || '二维码'
  try {
    const svg = browserCodeRenderer.render(value, 'qrcode', {
      qrCodeLevel: String(o.qrCodeLevel ?? 'M'),
      qrQuietZone: typeof o.qrQuietZone === 'number' ? o.qrQuietZone : undefined,
    })
    dataUrl.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    dataUrl.value = ''
  }
}

onMounted(render)
watch(
  () => [
    props.element.options.formatter, props.element.options.testData,
    props.element.options.qrCodeLevel, props.element.options.qrQuietZone,
  ],
  render,
)
</script>

<style scoped>
.print-qrcode { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.print-qrcode img { max-width: 100%; max-height: 100%; }
</style>
