// 字体目录：消费宿主注入的两端上报，合并为可供 UI 与校验使用的 FontCatalog。
// 合并规则本身在 core（mergeFontSources），此处只做响应式接线。
import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import {
  UNAVAILABLE,
  mergeFontSources,
  type FontCandidate,
  type FontCatalog,
  type FontPin,
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
 * `templateFonts` 由模板声明（宿主经 prop 配置），按数组顺序置顶（不经出图端确认，`sources` 为空）。
 */
export function useFontCatalog(
  serverFonts: MaybeRefOrGetter<FontSourceReport | undefined>,
  clientFonts: MaybeRefOrGetter<FontSourceReport | undefined>,
  templateFonts?: MaybeRefOrGetter<readonly (string | FontPin)[] | undefined>,
): { catalog: ComputedRef<FontCatalog> } {
  const catalog = computed<FontCatalog>(() =>
    mergeFontSources({
      preset: toValue(templateFonts) ?? [],
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

/**
 * 下拉选项文案：模板声明字体优先展示 label（宿主配置的业务名），其余用族名；
 * 并标注可用范围，避免设计者误以为有些字体处处可打。写入模板的始终是族名。
 */
export function fontOptionLabel(candidate: FontCandidate): string {
  // 展示 label（若有），括号里补上真实族名（写入模板的值）与可用范围
  const display = candidate.label ?? candidate.family
  const notes: string[] = []
  if (candidate.label) notes.push(candidate.family)
  if (candidate.sources.length === 0) {
    // sources 为空 = 模板声明字体（自带 webfont，不依赖出图端系统字体）
    notes.push('模板字体')
  } else if (candidate.sources.length === 1) {
    notes.push(candidate.sources[0] === 'server' ? '仅服务端' : '仅本机')
  }
  return notes.length ? `${display}（${notes.join('，')}）` : display
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
 * 族名与展示名（label）都参与匹配，设计者按业务名搜也能命中。
 */
export function filterFontCandidates(
  fonts: readonly FontCandidate[],
  query: string,
): FontCandidate[] {
  const queryKey = normalizeFontQuery(query.trim())
  if (!queryKey) return [...fonts]
  return fonts
    .map((font, index) => ({ font, index, rank: fontMatchRank(font, queryKey) }))
    .filter(item => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.font)
}

/** 族名与展示名取更优的一档；两者都不命中返回 -1 */
function fontMatchRank(font: FontCandidate, queryKey: string): number {
  const byFamily = matchRank(normalizeFontQuery(font.family), queryKey)
  if (!font.label) return byFamily
  const byLabel = matchRank(normalizeFontQuery(font.label), queryKey)
  if (byFamily < 0) return byLabel
  return byLabel < 0 ? byFamily : Math.min(byFamily, byLabel)
}

/** 单个字体在若干出图端缺失的汇总项 */
export interface FontIssueSummary {
  family: string
  /** 缺失的端（只含已成功上报的端） */
  sources: FontSource[]
  /** 引用该字体的元素/单元格位置标识 */
  targets: string[]
}
