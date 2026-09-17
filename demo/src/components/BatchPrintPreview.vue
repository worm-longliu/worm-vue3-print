<!--
  BatchPrintPreview：demo 批量打印预览。
 同一模板对多条数据分别走 core 浏览器管线，拼接为单文档写入 iframe，
 父组件通过 ref 调 print() 一次触发浏览器原生打印（每份之间强制分页）。
-->
<template>
  <div class="batch-print-preview">
    <div v-if="errorMsg" class="batch-print-preview-error">
      <span>批量预览渲染失败：{{ errorMsg }}</span>
    </div>
    <div v-else-if="rendering" class="batch-print-preview-loading">批量预览渲染中…</div>
    <iframe
      v-show="!rendering && !errorMsg"
      ref="iframeRef"
      class="batch-print-preview-iframe"
      title="批量打印预览"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { renderBatchInBrowser } from '../batch-render'

const props = defineProps<{
  /** 模板 JSON（当前画布） */
  templateJson?: Record<string, any> | null
  /** 批量打印数据（多条） */
  printDataList: Record<string, any>[]
  /** 图片相对路径拼接前缀 */
  baseUrl?: string
}>()

const emit = defineEmits<{
  /** 渲染完成，回传总页数与份数 */
  rendered: [pageCount: number, copies: number]
  /** 渲染失败 */
  error: [message: string]
}>()

const iframeRef = ref<HTMLIFrameElement>()
const rendering = ref(false)
const errorMsg = ref('')
/** 渲染序列：过期结果丢弃，避免快速重渲染竞态 */
let renderSeq = 0

async function rerender() {
  if (!props.templateJson || props.printDataList.length === 0) {
    errorMsg.value = ''
    rendering.value = false
    return
  }
  const seq = ++renderSeq
  rendering.value = true
  errorMsg.value = ''
  try {
    const { html, pageCount, copies } = await renderBatchInBrowser(
      props.templateJson,
      props.printDataList,
      props.baseUrl,
    )
    if (seq !== renderSeq) return
    const doc = iframeRef.value?.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }
    emit('rendered', pageCount, copies)
  } catch (e) {
    if (seq !== renderSeq) return
    errorMsg.value = e instanceof Error ? e.message : '未知错误'
    emit('error', errorMsg.value)
  } finally {
    if (seq === renderSeq) rendering.value = false
  }
}

/** 触发浏览器原生打印：一个 iframe、一个对话框输出全部份 */
function print() {
  const win = iframeRef.value?.contentWindow
  if (!win) return
  win.focus()
  win.print()
}

watch(
  () => [props.templateJson, props.printDataList, props.baseUrl],
  () => void rerender(),
  { immediate: true, deep: true },
)

onBeforeUnmount(() => {
  renderSeq++
})

defineExpose({ print, rerender })
</script>

<style scoped>
.batch-print-preview {
  width: 100%;
  height: 100%;
  position: relative;
  background: #e9ebee;
}
.batch-print-preview-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.batch-print-preview-loading,
.batch-print-preview-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 14px;
}
.batch-print-preview-error {
  color: #f56c6c;
}
</style>
