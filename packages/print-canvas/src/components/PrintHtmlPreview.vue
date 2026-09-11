<!--
  PrintHtmlPreview：浏览器端 HTML 打印预览（不依赖服务端 PDF）。
  内部完成 数据绑定 → 隐藏 iframe 测量 → 分页 → 多页 HTML 渲染；
  父组件通过 ref 调用 print() 触发浏览器原生打印（@page 控制纸张与分页）。
-->
<template>
  <div class="print-html-preview">
    <div v-if="errorMsg" class="print-html-preview-error">
      <span>预览渲染失败：{{ errorMsg }}</span>
    </div>
    <div v-else-if="rendering" class="print-html-preview-loading">预览渲染中…</div>
    <iframe
      v-show="!rendering && !errorMsg"
      ref="iframeRef"
      class="print-html-preview-iframe"
      title="打印预览"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { renderHtmlPages } from '@worm-vue3-print/core/browser'
import { browserCodeRenderer } from '@worm-vue3-print/core/browser'

const props = defineProps<{
  /** 模板 JSON（设计器 TemplateData 结构兼容） */
  templateJson?: Record<string, any> | null
  /** 业务打印数据 */
  printData?: Record<string, any> | Record<string, any>[]
  /** 图片相对路径拼接前缀（与服务端 baseUrl 同源） */
  baseUrl?: string
}>()

const emit = defineEmits<{
  /** 渲染完成，回传总页数 */
  rendered: [pageCount: number]
  /** 渲染失败 */
  error: [message: string]
}>()

const iframeRef = ref<HTMLIFrameElement>()
const rendering = ref(false)
const errorMsg = ref('')
/** 渲染序列：过期的渲染结果丢弃，避免快速重渲染竞态 */
let renderSeq = 0

async function rerender() {
  if (!props.templateJson) {
    errorMsg.value = ''
    rendering.value = false
    return
  }
  const seq = ++renderSeq
  rendering.value = true
  errorMsg.value = ''
  try {
    const { html, pageCount } = await renderHtmlPages(
      props.templateJson as PrintTemplateData,
      props.printData,
      props.baseUrl,
      browserCodeRenderer,
    )
    if (seq !== renderSeq) return
    const doc = iframeRef.value?.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }
    emit('rendered', pageCount)
  } catch (e) {
    if (seq !== renderSeq) return
    errorMsg.value = e instanceof Error ? e.message : '未知错误'
    emit('error', errorMsg.value)
  } finally {
    if (seq === renderSeq) rendering.value = false
  }
}

/** 触发浏览器原生打印（iframe 内 @page 规则控制纸张尺寸与分页） */
function print() {
  const win = iframeRef.value?.contentWindow
  if (!win) return
  win.focus()
  win.print()
}

watch(
  () => [props.templateJson, props.printData, props.baseUrl],
  () => void rerender(),
  { immediate: true, deep: true },
)

onBeforeUnmount(() => {
  renderSeq++
})

defineExpose({ print, rerender })
</script>

<style scoped>
.print-html-preview {
  width: 100%;
  height: 100%;
  position: relative;
  background: #e9ebee;
}
.print-html-preview-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.print-html-preview-loading,
.print-html-preview-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 14px;
}
.print-html-preview-error {
  color: #f56c6c;
}
</style>
