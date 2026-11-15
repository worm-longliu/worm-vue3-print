/**
 * 浏览器端 HTML 打印预览，移植自 canvas 的 PrintHtmlPreview.vue（纯 TS 渲染函数版）。
 * 只依赖 vue + core，不依赖 canvas；DOM 类名、props、emits、expose 与原组件逐项一致，
 * 使 Vue 3 宿主换 import 后无需改动预览层。
 */
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { collectLayoutWarnings } from '@worm-vue3-print/core'
import type { ElementRenderers, PrintTemplateData } from '@worm-vue3-print/core'
import { browserCodeRenderer, renderHtmlPages } from '@worm-vue3-print/core/browser'
import {
  applyPreviewViewZoom, defaultZoomKey, paperWidthPx, resolvePrinterDpi,
  resolveZoomKey, viewZoomHint, zoomPresets, zoomValueOf,
} from '@worm-vue3-print/core/designer'
import { ensurePreviewStyle } from './previewStyle'

/** 与 canvas 的 defineExpose 推断结果同形（ref 已解包成值） */
export interface PrintHtmlPreviewExpose {
  print(): void
  rerender(): Promise<void>
  setViewZoom(key: string): void
  zoomKey: string
  presets: ReturnType<typeof zoomPresets>
  viewHint: string
}

const component = defineComponent({
  name: 'PrintHtmlPreview',
  props: {
    /** 模板 JSON（设计器 TemplateData 结构兼容） */
    templateJson: {
      type: Object as PropType<Record<string, any> | null>,
      default: undefined,
    },
    /** 业务打印数据；数组即批量（每份一页组） */
    printData: {
      type: [Object, Array] as PropType<Record<string, any> | Record<string, any>[]>,
      default: undefined,
    },
    /** 图片相对路径拼接前缀 */
    baseUrl: { type: String, default: undefined },
    /** 相对路径字体基址；缺省由页面 origin 解析 */
    fontBaseUrl: { type: String, default: undefined },
    /** 扩展元素渲染器；缺省由打印管线按插件注册表自动收集 */
    renderers: {
      type: Object as PropType<ElementRenderers>,
      default: undefined,
    },
  },
  emits: {
    rendered: (pageCount: number, copies: number) =>
      typeof pageCount === 'number' && typeof copies === 'number',
    error: (message: string) => typeof message === 'string',
  },
  setup(props, { emit, expose }) {
    const iframeRef = ref<HTMLIFrameElement>()
    const rootRef = ref<HTMLDivElement>()
    const rendering = ref(false)
    const errorMsg = ref('')
    const warnings = ref<string[]>([])
    /** 渲染序列：过期结果直接丢弃，避免快速重渲染竞态 */
    let renderSeq = 0

    const printerDpi = computed(() => resolvePrinterDpi(props.templateJson))
    const containerPx = ref(0)
    const presets = computed(() =>
      zoomPresets(printerDpi.value, containerPx.value, paperWidthPx(props.templateJson)),
    )
    const zoomKey = ref(defaultZoomKey(printerDpi.value))
    const zoomValue = computed(() => zoomValueOf(presets.value, zoomKey.value))
    const viewHint = computed(() => viewZoomHint(printerDpi.value, zoomKey.value))

    function measureContainer(): void {
      containerPx.value = rootRef.value?.clientWidth ?? 0
    }

    function syncZoomKey(): void {
      zoomKey.value = resolveZoomKey(presets.value, zoomKey.value, printerDpi.value)
    }

    /** 缩放只写进预览文档；规则自带 @media print 复位，打印媒介打回 1 */
    function applyViewZoom(): void {
      applyPreviewViewZoom(iframeRef.value?.contentWindow?.document, zoomValue.value)
    }

    function onWindowResize(): void {
      measureContainer()
      applyViewZoom()
    }

    async function rerender(): Promise<void> {
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
          { fontBaseUrl: props.fontBaseUrl, renderers: props.renderers },
        )
        if (seq !== renderSeq) return
        warnings.value = collectLayoutWarnings(pageLayouts ?? [])
        const doc = iframeRef.value?.contentWindow?.document
        if (doc) {
          doc.open()
          doc.write(html)
          doc.close()
        }
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

    /** 触发浏览器原生打印（iframe 内 @page 规则控制纸张与分页） */
    function print(): void {
      const win = iframeRef.value?.contentWindow
      if (!win) return
      win.focus()
      win.print()
    }

    /** 宿主可程序化切档，非法档位名忽略 */
    function setViewZoom(key: string): void {
      if (presets.value.some(p => p.key === key)) zoomKey.value = key
    }

    // 首次渲染必须等 iframe 挂载：immediate 会在 setup 阶段执行，此时 iframeRef 尚未赋值，
    // doc.write 被跳过且 props 不再变化时预览层永久空白（Vue 3 兼容门面独有的问题）。
    watch(
      () => [props.templateJson, props.printData, props.baseUrl, props.fontBaseUrl, props.renderers],
      () => void rerender(),
      { deep: true },
    )
    watch(zoomValue, () => applyViewZoom())

    onMounted(() => {
      ensurePreviewStyle()
      measureContainer()
      syncZoomKey()
      window.addEventListener('resize', onWindowResize)
      void rerender()
    })

    onBeforeUnmount(() => {
      renderSeq++
      window.removeEventListener('resize', onWindowResize)
    })

    expose({ print, rerender, setViewZoom, zoomKey, presets, viewHint })

    return () => {
      const busy = rendering.value || !!errorMsg.value
      // 子节点必须带稳定 key：loading/error 的插入与消失会改变 children 顺序，
      // 无 key 时 Vue 按索引 diff 会重建 iframe，刚 doc.write 进去的纸面随旧节点一起丢失。
      const children: unknown[] = []

      if (errorMsg.value) {
        children.push(h('div', { key: 'error', class: 'print-html-preview-error' }, [
          h('span', null, `预览渲染失败：${errorMsg.value}`),
        ]))
      } else if (rendering.value) {
        children.push(h('div', { key: 'loading', class: 'print-html-preview-loading' }, '预览渲染中…'))
      }

      children.push(h('iframe', {
        key: 'iframe',
        ref: iframeRef,
        class: 'print-html-preview-iframe',
        title: '打印预览',
        style: { display: busy ? 'none' : '' },
      }))

      if (warnings.value.length && !busy) {
        children.push(h('div', { key: 'warn', class: 'print-html-preview-warn', role: 'status' }, [
          h('span', null, `出纸提示：${warnings.value.join('；')}`),
        ]))
      }

      if (props.templateJson && !busy) {
        const bars = presets.value.map(preset => h('button', {
          key: preset.key,
          type: 'button',
          class: {
            'print-html-preview-zoom-btn': true,
            active: preset.key === zoomKey.value,
          },
          title: preset.tip,
          onClick: () => { zoomKey.value = preset.key },
        }, preset.label))
        if (viewHint.value) {
          bars.push(h('span', { class: 'print-html-preview-zoom-hint' }, viewHint.value))
        }
        bars.push(h('span', { class: 'print-html-preview-zoom-note' }, '仅屏幕缩放，打印不受影响'))
        children.push(h('div', { key: 'zoom', class: 'print-html-preview-zoom' }, bars))
      }

      return h('div', {
        ref: rootRef,
        class: 'print-html-preview pcv3-preview',
      }, children as never[])
    }
  },
})

/** 见 PrintDesigner.ts 同款说明：补齐纯 TS expose() 缺失的实例类型推断 */
type WithExposed<T> = T extends new (...args: infer A) => infer R
  ? new (...args: A) => R & PrintHtmlPreviewExpose
  : never

export const PrintHtmlPreview = component as unknown as WithExposed<typeof component>
