// 单个图表 → 内联 SVG。纯函数、无 DOM 依赖：设计器预览、浏览器出图与页面执行器共用。
import type { ElementRenderSpec } from '@worm-vue3-print/core/designer'
import { applyExtraComponents, echarts } from './echarts.js'
import { normalizeChartOption } from './normalize.js'

/** 打印落纸 96dpi 换算：1in = 25.4mm = 96px */
const PX_PER_MM = 96 / 25.4

/** mm → 逻辑像素（至少 1px，避免空尺寸 option 让 echarts 抛错） */
export function mmToChartPx(mm: number): number {
  const value = Number.isFinite(mm) ? mm : 0
  return Math.max(1, Math.round(value * PX_PER_MM))
}

/**
 * SVG 根节点归一：echarts SSR 产出「固定 px 宽高 + viewBox」的独立图片，
 * 内联进 mm 盒子后必须铺满并随盒子矢量缩放。
 */
export function fitSvgRoot(svg: string, widthPx: number, heightPx: number): string {
  const match = /<svg\b[^>]*>/i.exec(svg)
  if (!match) return svg
  const rootTag = match[0]
  const rawAttrs = rootTag.slice('<svg'.length, -1)
  const styleMatch = /\sstyle\s*=\s*"([^"]*)"/i.exec(rawAttrs)
  const keptStyle = (styleMatch?.[1] ?? '')
    .split(';')
    .map(decl => decl.trim())
    .filter(decl => decl && !/^(width|height|display)\s*:/i.test(decl))
    .join(';')
  const attrs = rawAttrs
    .replace(/\s(width|height|style|viewBox)\s*=\s*"[^"]*"/gi, '')
    .trimEnd()
  const style = ['display:block', 'width:100%', 'height:100%', keptStyle].filter(Boolean).join(';')
  const nextTag = `<svg${attrs} width="100%" height="100%" viewBox="0 0 ${widthPx} ${heightPx}" style="${style}">`
  return svg.slice(0, match.index) + nextTag + svg.slice(match.index + rootTag.length)
}

/** 渲染规格（插件自有，仅依赖 core 的通用渲染规格字段） */
export interface ChartRenderSpec {
  key: string
  type: string
  option: Record<string, unknown>
  widthMm: number
  heightMm: number
  fontFamily?: string
}

/** 单个图表 → SVG 字符串（同步，echarts SSR）；失败向上抛，由调用方降级 */
export function renderChartToSvg(spec: ChartRenderSpec): string {
  applyExtraComponents()
  const option = normalizeChartOption(spec.type, spec.option)
  if (!option || typeof option !== 'object' || Array.isArray(option)) {
    throw new Error('图表 option 非法：需要对象')
  }
  const width = mmToChartPx(spec.widthMm)
  const height = mmToChartPx(spec.heightMm)
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height })
  try {
    const userTextStyle =
      option.textStyle && typeof option.textStyle === 'object' && !Array.isArray(option.textStyle)
        ? (option.textStyle as Record<string, unknown>)
        : undefined
    const textStyle = {
      ...(spec.fontFamily ? { fontFamily: spec.fontFamily } : {}),
      ...(userTextStyle ?? {}),
    }
    chart.setOption({
      animation: false,
      ...option,
      ...(Object.keys(textStyle).length > 0 ? { textStyle } : {}),
    })
    return fitSvgRoot(chart.renderToSVGString(), width, height)
  } finally {
    chart.dispose()
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** core 通用渲染分派入口：spec 由 html-generator 以「元素 type + 绑定后 options + mm 尺寸」构造 */
export function renderChartElement(spec: ElementRenderSpec): string {
  const option = ((spec as Record<string, unknown>)._chartOption ?? (spec as Record<string, unknown>).chartOption) as
    | Record<string, unknown>
    | undefined
  const placeholder = `<span>${escapeHtml(String((spec as Record<string, unknown>).title ?? '图表'))}</span>`
  if (!option || typeof option !== 'object' || Array.isArray(option)) return placeholder
  try {
    return renderChartToSvg({
      key: String((spec as Record<string, unknown>).key ?? ''),
      type: String((spec as Record<string, unknown>).type ?? ''),
      option,
      widthMm: Number((spec as Record<string, unknown>).widthMm ?? 0),
      heightMm: Number((spec as Record<string, unknown>).heightMm ?? 0),
      fontFamily: typeof (spec as Record<string, unknown>).fontFamily === 'string'
        ? ((spec as Record<string, unknown>).fontFamily as string)
        : undefined,
    })
  } catch {
    return placeholder
  }
}
