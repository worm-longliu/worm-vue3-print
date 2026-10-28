// 编辑期出纸裁切提示（不依赖 DOM 的预估口径）。
// 判据与出纸同源：直接复用分页结算产出的 PageLayout.warnings，不另写一套几何公式。
import { paginate } from '../render/pagination-engine.js'
import type { PageLayout, PaperSize, TemplateData } from '../render/types.js'

/**
 * 出纸几何提示所需的最小模板信息（同 `TilingTemplateInput` 的思路）：
 * 只取纸张、朝向、边距、三区高度与元素列表，设计器侧 TemplateData（元素 id/type 可选）
 * 与出纸侧 TemplateData 都能直接传入，宿主不必做断言。
 */
export interface GeometryTemplateInput {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  margins: { top: number; right: number; bottom: number; left: number }
  customWidth?: number
  customHeight?: number
  header?: { height?: number }
  footer?: { height?: number }
  elements?: readonly unknown[]
}

/** 多页面模板：按页汇总（每页都是完整的单页模板） */
export interface GeometryMultiPageInput {
  pages: readonly GeometryTemplateInput[]
}

/** 去重汇总各页的出纸裁切提示（预览/保存闸门共用同一份口径） */
export function collectLayoutWarnings(pageLayouts: readonly PageLayout[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const layout of pageLayouts) {
    for (const warning of layout.warnings ?? []) {
      if (seen.has(warning)) continue
      seen.add(warning)
      out.push(warning)
    }
  }
  return out
}

/**
 * 汇总「出纸会被裁切」类提示：旋转后外接盒顶越页首、元素超出纸面左右缘。
 *
 * 口径是**预估**：编辑期没有浏览器实测高，自适应行高/长文本按设计盒估算，
 * 因此结果用于提示而非阻断（真正的分页以出纸趟实测高为准，两处文案同源）。
 * 多页模板按页汇总并去重（同一元素在每页都报一次没有意义）。
 */
export function collectPrintWarnings(
  template: GeometryTemplateInput | GeometryMultiPageInput,
): string[] {
  const pages = Array.isArray((template as GeometryMultiPageInput).pages)
    ? (template as GeometryMultiPageInput).pages
    : [template as GeometryTemplateInput]
  const layouts: PageLayout[] = []
  for (const page of pages) {
    try {
      layouts.push(...paginate(page as unknown as TemplateData, new Map()))
    } catch {
      // 版面本身不成立（可用高度不足等）由出纸链路如实报错，编辑期不重复报
    }
  }
  return collectLayoutWarnings(layouts)
}
