// 字体目录：消费宿主注入的两端上报，合并为可供 UI 与校验使用的 FontCatalog。
// 合并规则本身在 core（mergeFontSources），此处只做响应式接线。
import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import {
  UNAVAILABLE,
  mergeFontSources,
  type FontCatalog,
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
