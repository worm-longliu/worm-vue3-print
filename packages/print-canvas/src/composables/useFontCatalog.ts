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
 */
export function useFontCatalog(
  serverFonts: MaybeRefOrGetter<FontSourceReport | undefined>,
  clientFonts: MaybeRefOrGetter<FontSourceReport | undefined>,
): { catalog: ComputedRef<FontCatalog> } {
  const catalog = computed<FontCatalog>(() =>
    mergeFontSources({
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
  if (candidate.sources.length !== 1) return candidate.family
  if (candidate.sources[0] === 'server') return `${candidate.family}（仅服务端）`
  if (candidate.sources[0] === 'client') return `${candidate.family}（仅本机）`
  return candidate.family
}

/** 单个字体在若干出图端缺失的汇总项 */
export interface FontIssueSummary {
  family: string
  /** 缺失的端（只含已成功上报的端） */
  sources: FontSource[]
  /** 引用该字体的元素/单元格位置标识 */
  targets: string[]
}
