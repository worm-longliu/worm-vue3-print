<template>
  <div ref="rootRef" class="print-flowlist" :style="gridStyle">
    <div
      v-for="(cell, i) in cells"
      :key="i"
      class="print-flow-cell"
    >{{ cell }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import {
  DEFAULT_DEMO_DATA,
  detectFlowListKey,
  engine,
  resolveFlowColumns,
  resolveFlowGapX,
  resolveFlowLayoutMode,
  resolveFlowPadding,
  resolveFlowRowHeight,
} from '@worm-vue3-print/core/designer'

const props = defineProps<{
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}>()

/** 96dpi 下 1mm ≈ 3.78px（与表格及出纸测量遍同一常量） */
const PX_PER_MM = 3.7795275591
/** 实测高度与模型高度差小于该值（mm）时不回写，避免无意义抖动 */
const HEIGHT_EPSILON_MM = 0.1

const rootRef = ref<HTMLElement | null>(null)
const isDynamic = computed(() => resolveFlowLayoutMode(props.element.options.flowLayoutMode) === 'dynamic')

/**
 * 设计台按「一列一格」铺，不预演跨列（specs 第八节第 7 项）：
 * 跨列档位要按单元实测宽度决定，而画布不运行出纸的跨列测量与分页，
 * 预演只能靠估算，画布与出纸就会出现两套栏数。栏数、间距、行高与出纸同源。
 * 动态模式容器高度由内容撑开，固定模式维持设计高度裁切。
 */
const gridStyle = computed(() => {
  const o = props.element.options
  const padding = resolveFlowPadding(o as unknown as Record<string, unknown>)
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${resolveFlowColumns(o.flowColumns)},minmax(0,1fr))`,
    columnGap: `${resolveFlowGapX(o.flowGapX)}mm`,
    gridAutoRows: `minmax(${resolveFlowRowHeight(o.flowRowHeight)}mm,auto)`,
    width: '100%',
    ...(isDynamic.value
      ? {
          padding: `${padding.top}mm ${padding.right}mm ${padding.bottom}mm ${padding.left}mm`,
          height: 'auto',
          overflow: 'visible',
        }
      : {
          height: '100%',
          overflow: 'hidden',
        }),
    fontSize: `${o.fontSize || 12}pt`,
    fontFamily: o.fontFamily || undefined,
    fontWeight: o.fontWeight || undefined,
    color: o.color || '#333',
    backgroundColor: o.backgroundColor || 'transparent',
    boxSizing: 'border-box' as const,
  }
})

/** 父级元素边框不在内容根节点上，实测容器高度时需补齐上下边框像素 */
function parentBorderPx(root: HTMLElement): number {
  const parent = root.parentElement
  if (!parent?.classList.contains('print-element')) return 0
  const style = getComputedStyle(parent)
  return (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0)
}

/**
 * 动态模式高度自愈：内容行实际撑开的高度回写模型，选中框、位置标签与跟随区
 * 设计底部才会使用同一尺寸。固定模式与非设计态不参与测量。
 */
function measureFlowList() {
  if (!props.designMode || !isDynamic.value) return
  const root = rootRef.value
  if (!root) return
  const heightPx = root.offsetHeight + parentBorderPx(root)
  if (heightPx <= 0) return
  const heightMm = heightPx / PX_PER_MM
  const o = props.element.options
  if (Math.abs(heightMm - (o.height ?? 0)) > HEIGHT_EPSILON_MM) {
    o.height = Math.round(heightMm * 100) / 100
  }
}

watch(
  () => [props.element.options, props.designMode, props.data],
  () => measureFlowList(),
  { deep: true, flush: 'post' },
)

onMounted(() => {
  // 等首帧布局完成再测；与 watch 的 post 钩子互补，覆盖挂载即渲染的场景
  nextTick(() => measureFlowList())
  // Web 字体加载完成后字宽可能变化导致换行变化，补测一次
  document.fonts?.ready.then(() => measureFlowList())
})

/** 设计态缺样：新拖入的元素也要看得见内容形状（运行态绝不凭空造数据） */
const DESIGN_FALLBACK_ITEMS = [
  '黄芪 20g', '当归尾 15g', '赤芍 10g', '川芎 10g',
  '地龙 10g', '桃仁 10g', '红花 10g',
]

function asList(source: unknown): Record<string, any>[] {
  return Array.isArray(source) && source.length > 0 ? source as Record<string, any>[] : []
}

/**
 * 列表源解析，与出纸侧同一序：模板里出现的数组字段（{drugs.name}）→ 记录里第一个数组 → demo 数据。
 * 设计器按「每行一份数据」传 data，明细数组挂在记录自己的字段上，所以先看 data[0]。
 */
function resolveItems(formatter: string, record?: Record<string, any>): Record<string, any>[] {
  const key = detectFlowListKey(formatter, record)
    ?? (record ? Object.keys(record).find(k => Array.isArray(record[k])) : undefined)
  if (key) return asList(record?.[key])
  const demoKey = detectFlowListKey(formatter, DEFAULT_DEMO_DATA)
  return demoKey ? asList(DEFAULT_DEMO_DATA[demoKey]) : []
}

const cells = computed(() => {
  const o = props.element.options
  const template = typeof o.formatter === 'string' ? o.formatter : ''
  const list = resolveItems(template, asList(props.data)[0])

  if (!list.length) return props.designMode ? [...DESIGN_FALLBACK_ITEMS] : []
  if (!template) return list.map(item => String(item?.name ?? JSON.stringify(item)))
  const record = asList(props.data)[0] ?? {}
  const key = detectFlowListKey(template, record) ?? Object.keys(record).find(k => Array.isArray(record[k]))
  return list.map(item => {
    try {
      // 行上下文同时暴露列表前缀与行内字段：{drugs.name} 与 {name} 都求得出值（与出纸 itemCtx 同形，
      // 前缀必须指向这一项而不是整个数组，否则 {drugs.name} 会对数组取路径得到空串）
      return engine.render(template, { ...record, ...item, ...(key ? { [key]: item } : {}) })
    } catch {
      return template
    }
  })
})
</script>
