// print-core/src/print/multi-template.ts
// 多页面模板（固定顺序版式组合）：归一化校验 + 字体合并 + 整份文档组合
// 核心业务逻辑，纯字符串/纯类型，不依赖 DOM——可脱离浏览器单测

import type {
  TemplateData,
  PageLayout,
  CodeRenderer,
  MultiPageTemplateData,
} from '../render/types.js'
import { getPaperDimensions, isContinuousPaper } from '../render/types.js'
import { renderFinalPages, wrapHtmlDocument } from '../render/html-generator.js'
import {
  buildBasePageCss,
  buildPageGeometryCss,
  buildPageRuleCss,
} from '../render/css-builder.js'
import { buildFontFaceCss } from './fonts.js'
import type { PrintFontDeclaration } from './fonts.js'

/** 页面名用于错误上下文：`第 N 页「封面」` */
function pageLabel(p: TemplateData, index: number): string {
  return p.name ? `第 ${index + 1} 页「${p.name}」` : `第 ${index + 1} 页`
}

/**
 * 归一化模板为页面模板数组：
 * - 单模板（TemplateData）→ `[t]`，路径不变；
 * - 多页面模板（{ pages }）→ 展开 pages，执行多模板校验；
 * - `pages` 恰好 1 页时按单模板语义返回（保持一致性）。
 *
 * 校验在 pipeline 入口统一抛出，render 服务与设计器预览共用。
 */
export function normalizeTemplate(
  templateJson: TemplateData | MultiPageTemplateData,
): TemplateData[] {
  const pages = isMultiPageTemplateData(templateJson)
    ? templateJson.pages
    : [templateJson]

  if (pages.length === 0) {
    throw new Error('多页面模板至少需要一页')
  }
  if (pages.length === 1) return pages

  const firstPaper = getPaperDimensions(pages[0]!)
  pages.forEach((p, i) => {
    if (isContinuousPaper(p)) {
      throw new Error(`多页面模板不支持连续纸（${pageLabel(p, i)}）`)
    }
    if (p.tiling?.enabled === true) {
      throw new Error(`多页面模板不支持标签拼版（${pageLabel(p, i)}）`)
    }
    const d = getPaperDimensions(p)
    if (d.width !== firstPaper.width || d.height !== firstPaper.height) {
      throw new Error(
        `多页面模板各页纸张尺寸必须一致（${pageLabel(p, i)} ${d.width}×${d.height}mm 与首页 ${firstPaper.width}×${firstPaper.height}mm 不同）`,
      )
    }
  })
  return pages
}

function isMultiPageTemplateData(x: TemplateData | MultiPageTemplateData): x is MultiPageTemplateData {
  return Array.isArray((x as MultiPageTemplateData).pages)
}

/**
 * 合并各页模板的字体声明：按 font-family 名去重，保留首个。
 * 三端据此生成同一份 @font-face，不依赖各端系统字体。
 */
export function mergeFontDeclarations(pages: TemplateData[]): PrintFontDeclaration[] {
  const seen = new Set<string>()
  const merged: PrintFontDeclaration[] = []
  for (const p of pages) {
    for (const f of p.fonts ?? []) {
      const key = f.family
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(f)
    }
  }
  return merged
}

/** 多页面模板单份产物（对应一份业务数据） */
export interface MultiPageCopyInput {
  /** 该份数据绑定后的页面模板（顺序与模板一致；formatter 已求值） */
  boundPages: TemplateData[]
  /** 各页面模板的分页结果（顺序与模板一致） */
  layoutsPerPage: PageLayout[][]
  /** 该份原始数据（水印层使用） */
  data: Record<string, any>
  /** 各页面模板的码值渲染器（顺序与模板一致）；缺省降级文本占位 */
  codeRenderers?: Array<CodeRenderer | undefined>
}

export interface MultiPageDocument {
  html: string
  pageCount: number
  /** 展平的全局页码 PageLayout（调试用；pageIndex 份内全局连续） */
  pageLayouts: PageLayout[]
}

/**
 * 组合多页面模板整份文档（单份或多份批量）。
 *
 * 语义：
 * - 每份数据 = 一份完整多页文档（封面+内容+条款），页码份内全局连续；
 * - 每个页面模板产出整页 .print-page 序列，模板间即整页边界（下一模板必然新开一页）；
 * - 各页模板的字体声明合并、几何 CSS 按 .mt-N 作用域化；
 * - CSS 按模板集合计算一次（各份模板结构相同），份间仅拼接片段。
 */
export function composeMultiPageDocument(
  copies: MultiPageCopyInput[],
): MultiPageDocument {
  if (copies.length === 0) {
    throw new Error('多页面模板至少需要一份数据')
  }
  const templates = copies[0]!.boundPages

  // CSS：@page（首模板）+ 模板无关基础 + 各页作用域几何
  const css =
    buildFontFaceCss(mergeFontDeclarations(templates)) +
    [
      buildPageRuleCss(templates[0]!),
      buildBasePageCss(),
      ...templates.map((t, i) => buildPageGeometryCss(t, `.mt-${i}`)),
    ].join('\n\n')

  // 份内全局页码：每份从 0 基页号重新累计，{pageIndex}/{totalPages} 份内生效
  const bodyInner = copies
    .map((copy) => {
      const totalPages = copy.layoutsPerPage.reduce((s, ls) => s + ls.length, 0)
      let offset = 0
      const fragments = copy.layoutsPerPage.map((layouts, i) => {
        const html = renderFinalPages(
          copy.boundPages[i]!,
          layouts,
          copy.data,
          { codeRenderer: copy.codeRenderers?.[i] },
          {
            pageOffset: offset,
            totalPages,
            pageClass: `mt-${i}`,
          },
        )
        offset += layouts.length
        return html
      })
      const pages = fragments.join('\n')
      // 批量时份间包 .print-copy 隔离；单份直接作为文档主体
      return copies.length > 1 ? `<section class="print-copy">\n${pages}\n</section>` : pages
    })
    .join('\n')

  const pageCount = copies.reduce(
    (sum, c) => sum + c.layoutsPerPage.reduce((s, ls) => s + ls.length, 0),
    0,
  )

  // 展平（调试用）：份内全局 pageIndex
  const pageLayouts: PageLayout[] = []
  let g = 0
  for (const c of copies) {
    for (const ls of c.layoutsPerPage) {
      for (const p of ls) pageLayouts.push({ ...p, pageIndex: g++ })
    }
  }

  return {
    html: wrapHtmlDocument(css, bodyInner),
    pageCount,
    pageLayouts,
  }
}
