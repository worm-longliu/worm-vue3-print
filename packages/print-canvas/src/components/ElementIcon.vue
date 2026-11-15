<template>
  <component :is="resolved" v-if="resolved" :size="size" :data-icon="name" />
  <span v-else class="element-icon-fallback" :data-icon="name">{{ name }}</span>
</template>

<script setup lang="ts">
// 元素/页签图标的唯一渲染点：插件描述符与内置表的 icon 都是「lucide 图标名」。
// 必须静态具名 import（print-common 的 gen-icons.mjs 只扫描这种写法，用于零框架外壳同构）。
import { computed } from 'vue'
import {
  Type, Barcode, QrCode, Image, Table, Table2, List, ListTree, TextAlignStart, Minus, SeparatorVertical,
  Square, Circle, Code, Shapes, Layers, ChevronsLeft, ChevronsRight, FileText,
  ChartColumn, ChartBar, ChartLine, ChartArea, ChartPie, Donut, ChartScatter, Radar, Funnel, Gauge,
} from 'lucide-vue-next'

const ICONS = {
  Type, Barcode, QrCode, Image, Table, Table2, List, ListTree, TextAlignStart, Minus, SeparatorVertical,
  Square, Circle, Code, Shapes, Layers, ChevronsLeft, ChevronsRight, FileText,
  ChartColumn, ChartBar, ChartLine, ChartArea, ChartPie, Donut, ChartScatter, Radar, Funnel, Gauge,
} as const

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 14 })
const resolved = computed(() => ICONS[props.name as keyof typeof ICONS])
</script>
