<!-- 表格单元格内图片渲染：设计态与预览态共用 -->
<template>
  <div class="cell-image">
    <img v-if="imageSrc && !hasError" :src="imageSrc" :style="imgStyle" @error="onError" />
    <div v-else class="image-placeholder">图片</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { evaluateTemplate } from '../../utils/expression-eval'
import { DEFAULT_DEMO_DATA } from '../../utils/demo-data'

const props = defineProps<{
  value: string
  fit?: string
  maxWidth?: number
  maxHeight?: number
  designMode?: boolean
  data?: Record<string, any>[]
}>()

const imageSrc = computed(() => {
  const raw = props.value || ''
  if (!raw) return ''
  
  // {字段} 表达式：设计态用 demo 数据求值，运行态用打印数据求值
  if (raw.includes('{')) {
    if (props.designMode) {
      return evaluateTemplate(raw, DEFAULT_DEMO_DATA)
    }
    return evaluateTemplate(raw, props.data?.[0] || {})
  }
  
  return raw
})

// 加载失败兜底
const hasError = ref(false)
function onError() {
  hasError.value = true
}

// src 变化时重置错误态
watch(imageSrc, () => {
  hasError.value = false
})

const imgStyle = computed(() => ({
  objectFit: (props.fit || 'contain') as any,
  maxWidth: props.maxWidth ? `${props.maxWidth}mm` : '100%',
  maxHeight: props.maxHeight ? `${props.maxHeight}mm` : '100%',
}))
</script>

<style scoped>
.cell-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.cell-image img {
  max-width: 100%;
  max-height: 100%;
  display: block;
}
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