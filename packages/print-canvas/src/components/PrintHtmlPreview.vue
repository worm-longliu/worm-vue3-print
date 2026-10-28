<!--
  PrintHtmlPreview：浏览器端 HTML 打印预览（不依赖服务端 PDF）。
  内部完成 数据绑定 → 隐藏 iframe 测量 → 分页 → 多页 HTML 渲染；
  父组件通过 ref 调用 print() 触发浏览器原生打印（@page 控制纸张与分页）。
  预览缩放只作用于屏幕查看，出纸时由 @media print 复位，不改动渲染产物本身。
-->
<template>
  <div ref="rootRef" class="print-html-preview">
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
    <div v-if="warnings.length && !rendering && !errorMsg" class="print-html-preview-warn" role="status">
      <span>出纸提示：{{ warnings.join('；') }}</span>
    </div>
    <div v-if="templateJson && !rendering && !errorMsg" class="print-html-preview-zoom">
      <button
        v-for="preset in presets"
        :key="preset.key"
        type="button"
        class="print-html-preview-zoom-btn"
        :class="{ active: preset.key === zoomKey }"
        :title="preset.tip"
        @click="zoomKey = preset.key"
      >{{ preset.label }}</button>
      <span v-if="viewHint" class="print-html-preview-zoom-hint">{{ viewHint }}</span>
      <span class="print-html-preview-zoom-note">仅屏幕缩放，打印不受影响</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { collectLayoutWarnings } from '@worm-vue3-print/core'
import { renderHtmlPages } from '@worm-vue3-print/core/browser'
import { browserCodeRenderer } from '@worm-vue3-print/core/browser'
import {
  applyPreviewViewZoom, defaultZoomKey, paperWidthPx, resolvePrinterDpi,
  resolveZoomKey, viewZoomHint, zoomPresets, zoomValueOf,
} from '@worm-vue3-print/core/designer'

const props = defineProps<{
  /** 模板 JSON（设计器 TemplateData 结构兼容） */
  templateJson?: Record<string, any> | null
  /** 业务打印数据 */
  printData?: Record<string, any> | Record<string, any>[]
  /** 图片相对路径拼接前缀（与服务端 baseUrl 同源） */
  baseUrl?: string
  /**
   * 相对路径字体基址。缺省不拼接：预览 iframe 与设计器同源，
   * 相对字体 URL 由页面 origin 解析，与画布注入 @font-face 的行为一致。
   * 字体与页面不同源时（如字体放 CDN）传绝对基址。
   */
  fontBaseUrl?: string
}>()

const emit = defineEmits<{
  /** 渲染完成，回传总页数与份数（对象数据=1，数组=数组长度） */
  rendered: [pageCount: number, copies: number]
  /** 渲染失败 */
  error: [message: string]
}>()

const iframeRef = ref<HTMLIFrameElement>()
const rootRef = ref<HTMLDivElement>()
const rendering = ref(false)
const errorMsg = ref('')
/** 出纸裁切提示（按真实分页与实测高结算，与保存闸门的预估同源不同口径）：只提示不阻断 */
const warnings = ref<string[]>([])
/** 渲染序列：过期的渲染结果丢弃，避免快速重渲染竞态 */
let renderSeq = 0

/** 档位、纸宽与点阵倍率的结算全在 core 的 preview-zoom（四个宿主复刻预览层共用同一份） */
const printerDpi = computed(() => resolvePrinterDpi(props.templateJson))
/** 容器宽（px）：适配档据此算整数倍，渲染后与窗口变化时重新量 */
const containerPx = ref(0)
const presets = computed(() =>
  zoomPresets(printerDpi.value, containerPx.value, paperWidthPx(props.templateJson)),
)
const zoomKey = ref(defaultZoomKey(printerDpi.value))
const zoomValue = computed(() => zoomValueOf(presets.value, zoomKey.value))
/** 100% 档下细条码仍会糊：带点距的模板给一句切档提示，判据与文案都在 core */
const viewHint = computed(() => viewZoomHint(printerDpi.value, zoomKey.value))

function measureContainer(): void {
  containerPx.value = rootRef.value?.clientWidth ?? 0
}

function syncZoomKey(): void {
  zoomKey.value = resolveZoomKey(presets.value, zoomKey.value, printerDpi.value)
}

/** 缩放只写进预览文档，不改渲染产物：规则自带 `@media print` 复位，打印媒介下打回 1 */
function applyViewZoom(): void {
  applyPreviewViewZoom(iframeRef.value?.contentWindow?.document, zoomValue.value)
}

function onWindowResize(): void {
  measureContainer()
  applyViewZoom()
}

async function rerender() {
  if (!props.templateJson) {
    errorMsg.value = ''
    rendering.value = false
    return
  }
  const seq = ++renderSeq
  rendering.value = true
  errorMsg.value = ''
  warnings.value = []
  try {
    const { html, pageCount, copies, pageLayouts } = await renderHtmlPages(
      props.templateJson as PrintTemplateData,
      props.printData,
      props.baseUrl,
      browserCodeRenderer,
      { fontBaseUrl: props.fontBaseUrl },
    )
    if (seq !== renderSeq) return
    warnings.value = collectLayoutWarnings(pageLayouts ?? [])
    const doc = iframeRef.value?.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }
    // 新文档里没有上次的缩放守卫，量一次容器宽再补写档位与缩放规则
    measureContainer()
    syncZoomKey()
    applyViewZoom()
    emit('rendered', pageCount, copies)
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
  () => [props.templateJson, props.printData, props.baseUrl, props.fontBaseUrl],
  () => void rerender(),
  { immediate: true, deep: true },
)

watch(zoomValue, () => applyViewZoom())

onMounted(() => {
  measureContainer()
  syncZoomKey()
  applyViewZoom()
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  renderSeq++
  window.removeEventListener('resize', onWindowResize)
})

/** 宿主可程序化切档（嵌入端自带缩放控件时用），非法档位名忽略 */
function setViewZoom(key: string): void {
  if (presets.value.some(p => p.key === key)) zoomKey.value = key
}

defineExpose({ print, rerender, setViewZoom, zoomKey, presets, viewHint })
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
/* 出纸裁切提示浮在预览左上：与错误遮层互斥（错误优先），不占布局 */
.print-html-preview-warn {
  position: absolute;
  top: 8px;
  left: 12px;
  z-index: 2;
  max-width: 62%;
  padding: 4px 8px;
  border: 1px solid #e6a23c;
  border-radius: 4px;
  background: rgba(250, 236, 209, 0.94);
  color: #b88230;
  font-size: 12px;
  line-height: 1.5;
}
/* 缩放条浮在预览右上：不占布局，避免各宿主（demo 与设计器弹框）为它改容器结构 */
.print-html-preview-zoom {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px;
  border: 1px solid var(--pd-border-soft, #ebeef5);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.print-html-preview-zoom-btn {
  padding: 2px 7px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--pd-text-muted, #909399);
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
  transition: color .14s ease, background .14s ease;
}
.print-html-preview-zoom-btn:hover {
  background: var(--pd-sidebar-hover, #f0f3f9);
  color: var(--pd-text, #2a2e37);
}
.print-html-preview-zoom-btn.active {
  background: var(--pd-accent, #165DFF);
  color: #fff;
  font-weight: 600;
}
.print-html-preview-zoom-note {
  padding-right: 4px;
  color: var(--pd-text-muted, #909399);
  font-size: 11px;
}
/* 切档提示：与缩放说明同处一条，只在「模板带点距 + 当前不是点阵档」时出现 */
.print-html-preview-zoom-hint {
  color: #b88230;
  font-size: 11px;
}
</style>
