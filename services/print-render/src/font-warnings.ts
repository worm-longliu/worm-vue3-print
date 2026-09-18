// services/print-render/src/font-warnings.ts
// 出图前的字体可用性告警：以响应头承载（PDF/PNG 响应体放不下 JSON）。
import { findMissingFonts, mergeFontSources, UNAVAILABLE } from '@worm-vue3-print/core'
import type { FontSourceReport, MissingFont } from '@worm-vue3-print/core'

/** 响应头名；新增头对既有消费者惰性 */
export const FONT_WARNINGS_HEADER = 'X-Font-Warnings'

/** 族名条数上限：避免大模板把头撑到 Node 的响应头上限 */
const MAX_FAMILIES = 32
/** 每族引用位置上限：定位问题够用即可 */
const MAX_TARGETS = 5

function cap(missing: MissingFont[]): MissingFont[] {
  return missing.slice(0, MAX_FAMILIES).map(m => ({
    ...m,
    targets: m.targets.slice(0, MAX_TARGETS),
  }))
}

/**
 * 生成字体缺失告警响应头；无缺失或本端清单不可用时返回 null（调用方不设置该头）。
 * 取值为 encodeURIComponent 后的 JSON —— 头值必须是 ASCII，中文族名不能直接放。
 */
export function buildFontWarningsHeader(
  templateJson: unknown,
  report: FontSourceReport,
): string | null {
  // 清单不可用 = 未知，跳过校验；否则会把每个模板都判成缺字体
  if (!report.available) return null
  const catalog = mergeFontSources({ server: report, client: UNAVAILABLE })
  const missing = findMissingFonts(templateJson as any, catalog, 'server')
  if (!missing.length) return null
  const warnings = cap(missing).map(m => ({
    code: 'FONT_MISSING' as const,
    family: m.family,
    targets: m.targets,
  }))
  return encodeURIComponent(JSON.stringify(warnings))
}
