<template>
  <div class="thumb-stage">
    <div class="thumb-page" :style="pageStyle">
      <div v-for="it in items" :key="it.id" class="thumb-el" :class="`thumb-el--${it.type}`" :style="it.style">
        <span v-if="it.text" class="thumb-text" :style="it.textStyle">{{ it.text }}</span>
        <i v-for="(ln, i) in it.gridLines" :key="i" class="thumb-grid-line" :style="ln"></i>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ElementOptions, TemplateData } from '@worm-vue3-print/canvas'
import { getByPath, getPaperDimensions, isContinuousPaperSize } from '@worm-vue3-print/core'

/**
 * 示例卡片缩略图：按模板元素坐标等比绘制示意图（不渲染真实条码/二维码）。
 * 只做版式示意，不追求像素级还原——出纸效果以「预览」为准。
 */
const props = defineProps<{
  template: TemplateData
  data?: Record<string, any>
}>()

/** 缩略图舞台尺寸（px）：纸张等比缩放后居中放置 */
const STAGE_W = 148
const STAGE_H = 108

/** pt → mm */
const PT_TO_MM = 0.3528

interface ThumbItem {
  id: string
  type: string
  style: Record<string, string>
  text?: string
  textStyle?: Record<string, string>
  gridLines?: Record<string, string>[]
}

/** 把模板表达式里可解析的 {a.b} 换成静态数据的实际值，其余原样保留 */
function resolveText(formatter: string | undefined, data: Record<string, any> | undefined): string {
  if (!formatter) return ''
  return formatter.replace(/\{([^{}]+)\}/g, (raw, expr: string) => {
    const path = expr.trim()
    if (!data || !/^[\w.]+$/.test(path)) return raw
    const v = getByPath(data, path)
    return v == null ? '' : String(v)
  })
}

/** 纸张尺寸（mm）：连续纸按内容底部推算一个可视高度 */
const paperMm = computed(() => {
  const t = props.template
  const dim = getPaperDimensions(t)
  if (!isContinuousPaperSize(t.paperSize)) return dim
  const bottom = (t.elements ?? []).reduce((max, e) => {
    const o = e.options ?? {}
    return Math.max(max, (o.top ?? 0) + (o.height ?? 0))
  }, 0)
  return { width: dim.width, height: Math.max(40, bottom + t.margins.top + t.margins.bottom) }
})

const scale = computed(() =>
  Math.min(STAGE_W / paperMm.value.width, STAGE_H / paperMm.value.height),
)

const pageStyle = computed(() => ({
  width: `${Math.round(paperMm.value.width * scale.value)}px`,
  height: `${Math.round(paperMm.value.height * scale.value)}px`,
}))

/** 表格网格线：按列宽/行高累计位置画细线（百分比定位） */
function tableGridLines(o: ElementOptions): Record<string, string>[] {
  const cols: number[] = (o.tableColWidths as number[] | undefined) ?? []
  const rows: { height?: number }[] = (o.tableRows as any[] | undefined) ?? []
  const totalW = cols.reduce((s, w) => s + w, 0) || 1
  const totalH = rows.reduce((s, r) => s + (r.height ?? 0), 0) || 1
  const lines: Record<string, string>[] = []
  let acc = 0
  cols.slice(0, -1).forEach(w => {
    acc += w
    lines.push({ left: `${(acc / totalW) * 100}%`, top: '0', width: '1px', height: '100%' })
  })
  acc = 0
  rows.slice(0, -1).forEach(r => {
    acc += r.height ?? 0
    lines.push({ top: `${(acc / totalH) * 100}%`, left: '0', height: '1px', width: '100%' })
  })
  return lines
}

const items = computed<ThumbItem[]>(() => {
  const t = props.template
  const k = scale.value
  const ml = t.margins.left
  const mt = t.margins.top
  return (t.elements ?? []).map((e, i) => {
    const o: ElementOptions = e.options ?? ({} as ElementOptions)
    const type = e.printElementType?.type ?? e.type ?? 'text'
    const style: Record<string, string> = {
      left: `${(ml + (o.left ?? 0)) * k}px`,
      top: `${(mt + (o.top ?? 0)) * k}px`,
      width: `${Math.max(1, (o.width ?? 0) * k)}px`,
      height: `${Math.max(1, (o.height ?? 0) * k)}px`,
    }
    const fontSizePx = Math.max(2, Math.round((o.fontSize ?? 10) * PT_TO_MM * k * 10) / 10)
    const textStyle: Record<string, string> = {
      fontSize: `${fontSizePx}px`,
      textAlign: o.textAlign ?? 'left',
      color: o.color ?? '#3a4150',
      fontWeight: o.fontWeight === 'bold' ? '600' : '400',
      textDecoration: o.textDecoration === 'line-through' ? 'line-through' : 'none',
    }
    const text = resolveText(o.formatter, props.data)
    const verticalCenter = o.verticalAlign === 'middle' || type === 'table'
    if (verticalCenter) style.display = 'flex'
    return {
      id: (e as any).id ?? `t-${i}`,
      type,
      style,
      text: type === 'text' || type === 'longText' ? text : '',
      textStyle: verticalCenter ? { ...textStyle, margin: 'auto 0' } : textStyle,
      gridLines: type === 'table' ? tableGridLines(o) : [],
    }
  })
})
</script>

<style scoped>
.thumb-stage {
  width: 148px;
  height: 108px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f2f4f8;
  border-radius: 4px;
  overflow: hidden;
}
.thumb-page {
  position: relative;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(23, 32, 60, 0.18);
  flex-shrink: 0;
}
.thumb-el {
  position: absolute;
  overflow: hidden;
  box-sizing: border-box;
}
.thumb-text {
  display: block;
  width: 100%;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thumb-el--longText .thumb-text {
  white-space: normal;
  word-break: break-all;
}
.thumb-el--table {
  border: 1px solid #c6ccd8;
}
.thumb-grid-line {
  position: absolute;
  background: #d7dce6;
}
.thumb-el--barcode {
  background: repeating-linear-gradient(90deg, #2f3542 0 1px, #ffffff 1px 3px);
}
.thumb-el--qrcode {
  background: repeating-conic-gradient(#2f3542 0% 25%, #ffffff 0% 50%) 0 0 / 4px 4px;
  border: 1px solid #c6ccd8;
}
.thumb-el--image {
  background: #e8ecf3;
  border: 1px dashed #c6ccd8;
}
.thumb-el--hline {
  background: #b6bdc9;
}
.thumb-el--vline {
  background: #b6bdc9;
}
.thumb-el--rect {
  border: 1px solid #b6bdc9;
}
.thumb-el--oval {
  border: 1px solid #b6bdc9;
  border-radius: 50%;
}
</style>
