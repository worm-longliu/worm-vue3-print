// print-core/src/print/apply-text-fit.ts
// 自动缩小结果回写：测量趟的缩写在页面内完成（改的是 DOM 字号），无法自己带出文档，
// 因此把 DOM 执行器返回的字号清单写回绑定后的模板，最终趟才能产出与测量同口径的 HTML。
// 回写的都是绑定产物上的内部字段（元素 _fitFontSize、单元格 fittedFontSize），不污染设计态数据。

import {
  parseCellFitKey,
  roundFontSize,
  type CellFitRowKind,
  type FitFontSize,
} from '../render/text-fit.js'
import type { TemplateData, TemplateElement } from '../render/types.js'

/** 单元格行类别 → 绑定后模板上的渲染行集合（由 data-binder 写入） */
const CELL_ROW_SOURCES: Record<CellFitRowKind, string> = {
  b: '_renderRows',
  st: '_subtotalTemplates',
  sm: '_summaryRows',
}

/**
 * 把自动缩小结果写回模板（原地修改）。
 * 元素级 key 命中元素 options._fitFontSize；单元格 key 命中渲染行单元格 fittedFontSize。
 * 未命中的 key 静默跳过：元素可能属于未参与测量的区域，不影响其余结果。
 */
export function applyTextFitSizes(template: TemplateData, fits: FitFontSize[] | undefined): void {
  if (!fits || fits.length === 0) return
  const index = new Map<string, TemplateElement>()
  const collect = (elements?: TemplateElement[]): void => {
    for (const el of elements ?? []) index.set(el.id, el)
  }
  collect(template.elements)
  collect(template.header?.elements)
  collect(template.footer?.elements)
  collect(template.firstPageOverlay?.elements)

  for (const fit of fits) {
    const parsed = parseCellFitKey(fit.key)
    if (!parsed) {
      const el = index.get(fit.key)
      if (el) el.options._fitFontSize = roundFontSize(fit.fontSizePt)
      continue
    }
    const el = index.get(parsed.elementId)
    const rows = el?.options?.[CELL_ROW_SOURCES[parsed.kind]] as
      | Array<{ cells?: Array<Record<string, any>> }>
      | undefined
    const cell = rows?.[parsed.rowIndex]?.cells?.[parsed.colIndex]
    if (cell) cell.fittedFontSize = roundFontSize(fit.fontSizePt)
  }
}
