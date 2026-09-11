<template>
  <div class="print-image">
    <img v-if="imageSrc && !hasError" :src="imageSrc" :style="imgStyle" @error="onError" />
    <div v-else class="image-placeholder">图片</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { evaluateTemplate } from '@worm-vue3-print/core/designer'
import { DEFAULT_DEMO_DATA } from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

const imageSrc = computed(() => {
  const raw = props.element.options.src || ''
  if (!raw) return ''
  // {字段} 表达式：设计态用 demo 数据求值，运行态用打印数据求值
  if (raw.includes('{')) {
    if (props.designMode) {
      return evaluateTemplate(raw, DEFAULT_DEMO_DATA)
    }
    return evaluateTemplate(raw, props.data?.[0] || {})
  }
  // 相对路径（如 /docfiles/...）经站点同源 + dev/prod 代理可直接访问；绝对 URL 原样使用
  return raw
})

// 加载失败兜底：显示占位，避免破图阻塞 PDF 就绪判定
const hasError = ref(false)
function onError() {
  hasError.value = true
}
// src 变化时重置错误态
watch(imageSrc, () => {
  hasError.value = false
})

const imgStyle = computed(() => ({
  objectFit: (props.element.options.fit || 'contain') as any,
}))
</script>

<style scoped>
.print-image { width: 100%; height: 100%; overflow: hidden; }
.print-image img { width: 100%; height: 100%; display: block; }
.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 12px;
  border: 1px dashed #ddd;
  box-sizing: border-box;
}
</style>
