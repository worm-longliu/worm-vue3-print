// 字体候选目录：移植 print-canvas/src/composables/useFontCatalog.ts 中的纯函数部分
// （Vue 的 inject/computed 包装不在本包语义内，宿主清单由 <print-designer>.fonts 注入）。
// 算法逐字照抄 canvas：族名大小写不敏感去重、保留声明顺序、模糊匹配分档（相等>前缀>子串>子序列）。
// 说明：core 未导出这套工具（print-core 只有 PrintFontDeclaration / buildFontFaceCss 类型与产物），
// 故在本包内保留等价实现，行为以 canvas 为唯一基准，改动需两侧同步。
// PrintFontDeclaration 的 `files` 为必填（出图端要加载字体文件），设计器候选只需要 family/label，
// 因此这里用结构更宽的 FontOption 承接宿主清单。

/** 下拉候选项：family 写入模板，label 仅用于界面展示 */
export interface FontOption {
  family: string
  label?: string
}

/** 宿主清单条目：字符串族名，或带 label 的声明（core 的 PrintFontDeclaration 结构兼容） */
export type FontSource = string | FontOption | null | undefined

/**
 * 把宿主注入的字体清单整理为下拉候选项：去空白、丢空值、族名大小写不敏感去重，
 * 保留声明顺序（顺序即宿主期望的优先级）。
 */
export function buildFontCatalog(sources?: readonly FontSource[] | null): readonly FontOption[] {
  const out: FontOption[] = []
  const seen = new Set<string>()
  for (const item of sources ?? []) {
    const font = typeof item === 'string' ? { family: item } : item
    const family = font?.family?.trim()
    if (!family) continue
    const key = family.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const label = typeof item === 'string' ? undefined : item?.label?.trim()
    out.push(label ? { family, label } : { family })
  }
  return out
}

/** 在目录中按族名查找（大小写不敏感） */
export function findFontOption(
  fonts: readonly FontOption[],
  family?: string,
): FontOption | undefined {
  const key = family?.trim().toLowerCase()
  if (!key) return undefined
  return fonts.find(f => f.family.trim().toLowerCase() === key)
}

/** 下拉选项文案：有展示名时补上真实族名（写入模板的值） */
export function fontOptionLabel(option: FontOption): string {
  return option.label ? `${option.label}（${option.family}）` : option.family
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

/** 族名与展示名取更优的一档；两者都不命中返回 -1 */
function fontMatchRank(font: FontOption, queryKey: string): number {
  const byFamily = matchRank(normalizeFontQuery(font.family), queryKey)
  if (!font.label) return byFamily
  const byLabel = matchRank(normalizeFontQuery(font.label), queryKey)
  if (byFamily < 0) return byLabel
  return byLabel < 0 ? byFamily : Math.min(byFamily, byLabel)
}

/**
 * 模糊过滤字体目录：完全相等 > 前缀 > 子串 > 子序列，同档保持目录原有顺序
 * （目录顺序由宿主声明决定，过滤不应打乱）。
 * 族名与展示名（label）都参与匹配，设计者按业务名搜也能命中。
 */
export function filterFontOptions(
  fonts: readonly FontOption[],
  query: string,
): FontOption[] {
  const queryKey = normalizeFontQuery(query.trim())
  if (!queryKey) return [...fonts]
  return fonts
    .map((font, index) => ({ font, index, rank: fontMatchRank(font, queryKey) }))
    .filter(item => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.font)
}
