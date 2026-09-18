// 字体目录：消费宿主注入的两端上报，合并为可供 UI 与校验使用的 FontCatalog。
// 合并规则本身在 core（mergeFontSources），此处只做响应式接线。
import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import {
  UNAVAILABLE,
  mergeFontSources,
  type FontCandidate,
  type FontCatalog,
  type FontSource,
  type FontSourceReport,
} from '@worm-vue3-print/core'
import { FONT_CATALOG_KEY } from './useHostAdapter'

/** 空目录：两端均不可用，用于未注入或未上报时的兜底 */
export const EMPTY_FONT_CATALOG: ComputedRef<FontCatalog> = computed(() =>
  mergeFontSources({ server: UNAVAILABLE, client: UNAVAILABLE }),
)

/**
 * 由 PrintDesigner 调用：把两个 props 合并为响应式字体目录。
 * 参数接受 ref / computed / getter 任意形态。
 * `presetFonts` 由宿主声明，按数组顺序置顶（不经出图端确认，`sources` 为空）。
 */
export function useFontCatalog(
  serverFonts: MaybeRefOrGetter<FontSourceReport | undefined>,
  clientFonts: MaybeRefOrGetter<FontSourceReport | undefined>,
  presetFonts?: MaybeRefOrGetter<readonly string[] | undefined>,
): { catalog: ComputedRef<FontCatalog> } {
  const catalog = computed<FontCatalog>(() =>
    mergeFontSources({
      preset: toValue(presetFonts) ?? [],
      server: toValue(serverFonts) ?? UNAVAILABLE,
      client: toValue(clientFonts) ?? UNAVAILABLE,
    }),
  )
  return { catalog }
}

/** 由深层组件调用（属性面板 / 状态栏）：未注入时回退空目录，组件可独立挂载 */
export function useInjectedFontCatalog(): ComputedRef<FontCatalog> {
  return inject(FONT_CATALOG_KEY, EMPTY_FONT_CATALOG)
}

/** 在目录中按族名查找（大小写不敏感） */
export function findFontCandidate(
  catalog: FontCatalog,
  family?: string,
): FontCandidate | undefined {
  const key = family?.trim().toLowerCase()
  if (!key) return undefined
  return catalog.fonts.find(f => f.family.trim().toLowerCase() === key)
}

/** 下拉选项文案：两端都可用不加标注，单端可用标注范围，避免设计者误以为处处可打 */
export function fontOptionLabel(candidate: FontCandidate): string {
  // sources 为空 = 宿主预设字体，未经任一出图端确认，不能让它看起来像「两端都能用」
  if (candidate.sources.length === 0) return `${candidate.family}（预设）`
  if (candidate.sources.length !== 1) return candidate.family
  if (candidate.sources[0] === 'server') return `${candidate.family}（仅服务端）`
  if (candidate.sources[0] === 'client') return `${candidate.family}（仅本机）`
  return candidate.family
}

/** 匹配用键：小写并去掉全部空白，使用户输入 `ya hei` 与 `yahei` 等价 */
export function normalizeFontQuery(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

/**
 * 匹配档位，越小越靠前：
 * 0 完全相等 · 1 前缀 · 2 子串 · 3 子序列（首字母缩写式） · -1 不匹配
 */
function matchRank(nameKey: string, queryKey: string): number {
  if (nameKey === queryKey) return 0
  if (nameKey.startsWith(queryKey)) return 1
  if (nameKey.includes(queryKey)) return 2
  let cursor = 0
  for (const char of nameKey) {
    if (char === queryKey[cursor]) cursor++
    if (cursor === queryKey.length) return 3
  }
  return -1
}

/**
 * 模糊过滤字体目录：完全相等 > 前缀 > 子串 > 子序列，同档保持目录原有顺序
 * （目录本身已按「两端都可用的在前」排好，过滤不应打乱这个安全顺序）。
 */
export function filterFontCandidates(
  fonts: readonly FontCandidate[],
  query: string,
): FontCandidate[] {
  const queryKey = normalizeFontQuery(query.trim())
  if (!queryKey) return [...fonts]
  return fonts
    .map((font, index) => ({ font, index, rank: matchRank(normalizeFontQuery(font.family), queryKey) }))
    .filter(item => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.font)
}

/** 单个字体在若干出图端缺失的汇总项 */
export interface FontIssueSummary {
  family: string
  /** 缺失的端（只含已成功上报的端） */
  sources: FontSource[]
  /** 引用该字体的元素/单元格位置标识 */
  targets: string[]
}
