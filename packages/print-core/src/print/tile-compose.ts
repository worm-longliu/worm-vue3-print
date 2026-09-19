// print-core/src/print/tile-compose.ts
// 拼版合并：多份单份渲染产物 → 按「列×行」铺进目标纸（纯字符串，不依赖 DOM）
import { renderFinalPages, wrapHtmlDocument } from '../render/html-generator.js'
import { buildPageCss, buildSheetPageCss } from '../render/css-builder.js'
import { buildFontFaceCss } from './fonts.js'
import { tilePosition } from './tiling.js'
import type { TileLayout } from './tiling.js'
import type { CodeRenderer, PageLayout, TemplateData } from '../render/types.js'

export interface TileInput {
  /** 该份数据绑定后的模板 */
  bound: TemplateData
  /** 该份的分页结果；拼版要求恰好 1 页（由管线在调用前校验） */
  pageLayouts: PageLayout[]
  /** 该份原始数据（水印层使用） */
  data: Record<string, any>
  codeRenderer?: CodeRenderer
}

/**
 * 把各份标签页按行优先铺进目标纸。
 * 每张固定容纳 layout.perSheet 格；放不满的最后一张留白（空位不输出任何内容）。
 */
export function composeTiledHtml(input: {
  copies: TileInput[]
  layout: TileLayout
}): { html: string; sheetCount: number; perSheet: number } {
  const { copies, layout } = input
  const bound = copies[0].bound

  const sheets: string[] = []
  for (let start = 0; start < copies.length; start += layout.perSheet) {
    const tiles = copies
      .slice(start, start + layout.perSheet)
      .map((copy, i) => {
        const pos = tilePosition(layout, i)
        // 格内直接复用单份渲染产物：水印层、三区、绝对定位元素、页码变量全部照旧
        const page = renderFinalPages(copy.bound, copy.pageLayouts, copy.data, {
          codeRenderer: copy.codeRenderer,
        })
        return `<div class="print-tile" style="left:${pos.left}mm;top:${pos.top}mm">\n${page}\n</div>`
      })
      .join('\n')
    sheets.push(`<section class="print-sheet">\n${tiles}\n</section>`)
  }

  // 顺序关键：标签页 CSS 在前、拼版纸张 CSS 在后 —— 同优先级下后出现的 @page 生效，
  // 浏览器 window.print() 才按目标纸分页（服务端/客户端不看 @page，靠 paperMm）
  const css = buildFontFaceCss(bound.fonts)
    + buildPageCss(bound)
    + '\n'
    + buildSheetPageCss(layout)

  return {
    html: wrapHtmlDocument(css, sheets.join('\n')),
    sheetCount: sheets.length,
    perSheet: layout.perSheet,
  }
}
