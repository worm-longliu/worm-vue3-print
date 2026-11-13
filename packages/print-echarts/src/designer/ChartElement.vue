<!-- 图表元素画布预览：浏览器态 echarts.init 实例渲染（非 SSR），设计态禁用动画 -->
<template>
  <div
    ref="containerRef"
    class="echarts-canvas-element"
    :style="{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, pointerEvents: 'none' }"
  />
</template>

<script setup lang="ts">
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { echarts, type EChartsType } from '../echarts.js'
import { previewChartOption } from './option-utils.js'

// 与 canvas ElementComponentProps 同形（内联类型字面量，便于 SFC 编译期提取运行时 props）
const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

const containerRef = ref<HTMLDivElement>()
let chart: EChartsType | null = null
let observer: ResizeObserver | null = null

function draw(): void {
  if (!chart) return
  try {
    chart.setOption(
      {
        // 设计态禁用动画；非设计态交给默认动画（打印端固定 animation:false）
        animation: props.designMode !== true,
        ...previewChartOption(props.element.options.chartOption),
      },
      true,
    )
  } catch {
    // 设计态 option 暂不合法时保持上一帧，不打断画布交互
  }
}

function resize(): void {
  chart?.resize()
}

onMounted(async () => {
  await nextTick()
  if (!containerRef.value) return
  chart = echarts.init(containerRef.value)
  draw()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    observer.observe(containerRef.value)
  }
})

// 图形化面板 / JSON 编辑器都会改写 element.options.chartOption（响应式对象），深度监听重绘
watch(
  () => [
    props.element.options.chartOption,
    props.element.options.chartDataSource,
    props.element.options.chartCategoryField,
    props.element.options.chartValueFields,
    props.element.options.chartSeriesField,
  ],
  draw,
  { deep: true },
)

// 元素框尺寸变化后 echarts 需要重新测量容器，否则图形不随缩放铺满
watch(
  () => [props.element.options.width, props.element.options.height],
  async () => {
    await nextTick()
    resize()
  },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  chart?.dispose()
  chart = null
})
</script>
