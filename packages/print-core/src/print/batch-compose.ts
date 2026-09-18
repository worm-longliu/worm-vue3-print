// 批量合并：多份单份渲染产物 → 单个 HTML 文档（纯字符串，不依赖 DOM）。
import { renderFinalPages, wrapHtmlDocument } from '../render/html-generator.js'
import { buildBatchPageCss, buildPageCss } from '../render/css-builder.js'
import { buildFontFaceCss } from './fonts.js'
import type { CodeRenderer, PageLayout, TemplateData } from '../render/types.js'
import type { HeightSource, PaperMm } from './types.js'

export interface BatchCopyInput {
  /** 该份数据绑定后的模板 */
  bound: TemplateData
  pageLayouts: PageLayout[]
  /** 该份原始数据（水印层使用） */
  data: Record<string, any>
  codeRenderer?: CodeRenderer
  /** 连续纸探针推导出的纸高（mm）；固定纸为 undefined */
  derivedHeightMm?: number
  paperMm: PaperMm
  /** 纸高来源（透传，合并器不使用） */
  heightSource: HeightSource
}

/**
 * 将多份单份产物合并为一个 HTML 文档；份间强制分页。
 * 同模板各份纸张宽度/边距一致，固定纸共用单一 @page；连续纸走命名页。
 */
export function composeBatchHtml(copies: BatchCopyInput[]): {
  html: string
  pageCount: number
  copyPaperMm: PaperMm[]
} {
  const bound = copies[0].bound
  const continuous = bound.paperSize === 'CONTINUOUS'

  const bodyInner = copies
    .map((copy, i) => {
      const cls = continuous ? `print-copy print-copy-${i}` : 'print-copy'
      const pages = renderFinalPages(copy.bound, copy.pageLayouts, copy.data, {
        codeRenderer: copy.codeRenderer,
        pageHeightMm: copy.derivedHeightMm,
      })
      return `<section class="${cls}">\n${pages}\n</section>`
    })
    .join('\n')

  const pageCss = continuous
    ? buildBatchPageCss(bound, copies.map(c => ({ heightMm: c.derivedHeightMm })))
    : `${buildPageCss(bound)}\n.print-copy:not(:last-child){break-after:page;page-break-after:always;}`
  // 模板声明的字体必须与页面 CSS 一起进文档外壳，批量合并（含服务端出图）才有一致字体
  const css = buildFontFaceCss(bound.fonts) + pageCss

  return {
    html: wrapHtmlDocument(
      css,
      bodyInner,
      continuous ? 'continuous' : undefined,
    ),
    pageCount: copies.reduce((sum, c) => sum + c.pageLayouts.length, 0),
    copyPaperMm: copies.map(c => c.paperMm),
  }
}
