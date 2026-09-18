// clients/print-client/src/main/font-warning.ts
// 出图前校验：模板所用字体在本机是否可用。只做诊断，不影响出图成败。
import { findMissingFonts, mergeFontSources, UNAVAILABLE } from '@worm-vue3-print/core'
import type { FontSourceReport, MissingFont } from '@worm-vue3-print/core'

/**
 * 收集模板中在本机缺失的字体。
 * 客户端只知道自己这一端，服务端清单传 UNAVAILABLE —— 按 client 校验时该入参不参与判定。
 * 本机清单不可用时返回空数组（未知 ≠ 缺失）。
 */
export function collectMissingFonts(
  templateJson: unknown,
  report: FontSourceReport,
): MissingFont[] {
  if (!report.available || typeof templateJson !== 'object' || templateJson === null) return []
  const catalog = mergeFontSources({ server: UNAVAILABLE, client: report })
  return findMissingFonts(templateJson as any, catalog, 'client')
}
