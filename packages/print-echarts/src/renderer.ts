import type { ChartRenderer, ChartSpec } from '@worm-vue3-print/core'
import { applyExtraComponents, echarts } from './echarts.js'

/** 打印落纸 96dpi 换算：1in = 25.4mm = 96px */
const PX_PER_MM = 96 / 25.4

/** mm → 逻辑像素（至少 1px，避免空尺寸 option 让 echarts 抛错） */
export function mmToChartPx(mm: number): number {
  const value = Number.isFinite(mm) ? mm : 0
  return Math.max(1, Math.round(value * PX_PER_MM))
}

/**
 * SVG 根节点归一：echarts SSR 产出的是「固定 px 宽高 + viewBox」的独立图片，
 * 内联进 mm 盒子后必须铺满并随盒子矢量缩放，因此：
 * - viewBox 固定为出图时像素尺寸（不变形，按比例铺满）；
 * - width/height 改为 100%，style 补 display:block;width/height:100%。
 * 保留 xmlns/xmlns:xlink 等其余属性，丢弃原有的 width/height/style（尺寸以本函数为准）。
 */
export function fitSvgRoot(svg: string, widthPx: number, heightPx: number): string {
  const match = /<svg\b[^>]*>/i.exec(svg)
  if (!match) return svg
  const rootTag = match[0]
  const rawAttrs = rootTag.slice('<svg'.length, -1)
  // 抽出 style：保留其中的非尺寸声明，避免丢掉 echarts 可能写入的根样式
  const styleMatch = /\sstyle\s*=\s*"([^"]*)"/i.exec(rawAttrs)
  const keptStyle = (styleMatch?.[1] ?? '')
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => decl && !/^(width|height|display)\s*:/i.test(decl))
    .join(';')
  const attrs = rawAttrs
    .replace(/\s(width|height|style|viewBox)\s*=\s*"[^"]*"/gi, '')
    .trimEnd()
  const style = ['display:block', 'width:100%', 'height:100%', keptStyle].filter(Boolean).join(';')
  const nextTag = `<svg${attrs} width="100%" height="100%" viewBox="0 0 ${widthPx} ${heightPx}" style="${style}">`
  return svg.slice(0, match.index) + nextTag + svg.slice(match.index + rootTag.length)
}

/**
 * 单个 ChartSpec → SVG 字符串（同步，echarts SSR 渲染）。
 * 渲染失败向上抛错，由 core 的 html-generator 降级为文本占位。
 */
export function renderChartToSvg(spec: ChartSpec): string {
  // P5：宿主经 configureChartPlugin({ components }) 追加的图表/组件在此生效（幂等）
  applyExtraComponents()
  const option = spec?.option
  if (!option || typeof option !== 'object' || Array.isArray(option)) {
    throw new Error('图表 option 非法：需要对象')
  }
  const width = mmToChartPx(spec.widthMm)
  const height = mmToChartPx(spec.heightMm)
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height })
  try {
    // 打印态禁用动画；字体族与模板同口径（option.textStyle 已有声明时逐键合并，不整块覆盖）
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

/** ChartRenderer 端口实现：core 渲染管线在两趟回填阶段使用 */
export function createChartRenderer(): ChartRenderer {
  return {
    render: (spec) => renderChartToSvg(spec),
  }
}
