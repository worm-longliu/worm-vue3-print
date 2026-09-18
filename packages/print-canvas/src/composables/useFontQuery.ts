// 手动字体查询的状态机：PrintDesigner 装配，FontSelect 经注入读取。
// 只有用户点击「查询字体」才会调用宿主提供的 loadFonts；未点击不发任何请求。
import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { FontSourceReport } from '@worm-vue3-print/core'

export type FontQueryStatus = 'idle' | 'loading' | 'done' | 'failed'

/**
 * 宿主实现的手动查询结果：某一端取不到时 resolve `available: false`（离线是可预期状态），
 * 仅在查询流程本身失败（网络异常、接口报错）时 reject。
 */
export interface FontQueryResult {
  server: FontSourceReport
  client: FontSourceReport
}

export type LoadFontsFn = () => Promise<FontQueryResult>

export interface FontQueryHandle {
  /** 宿主是否提供 loadFonts；false 时 UI 不渲染查询按钮 */
  canQuery: boolean
  status: FontQueryStatus
  /** 是否已拿到过任一来源的清单（props 注入或手动查询），决定未查询时是否提示「尚未获取」 */
  hasReport: boolean
  /** status === 'failed' 时的原始错误信息 */
  error?: string
  run: () => void
}

/**
 * 未注入查询句柄时的默认值：等价于「宿主不使用本机制」，
 * status 取 done，使 FontSelect 的提示行为与接入手动查询前一致。
 */
export const DEFAULT_FONT_QUERY: ComputedRef<FontQueryHandle> = computed(() => ({
  canQuery: false,
  status: 'done',
  hasReport: true,
  run: () => {},
}))

/**
 * 查询状态机。`hasInjectedReport` 由 PrintDesigner 传入（props 是否已提供任一端口清单）——
 * 宿主既传 props 又提供 loadFonts 时，props 已给出结果，不应提示「尚未获取」。
 */
export function useFontQuery(
  loadFonts: MaybeRefOrGetter<LoadFontsFn | undefined>,
  hasInjectedReport: MaybeRefOrGetter<boolean>,
): { handle: ComputedRef<FontQueryHandle>; fetched: ComputedRef<FontQueryResult | undefined> } {
  const status = ref<FontQueryStatus>('idle')
  const error = ref<string | undefined>(undefined)
  const fetched = ref<FontQueryResult | undefined>(undefined)

  async function run(): Promise<void> {
    const load = toValue(loadFonts)
    // 重复点击不并发；上次结果保留到新结果返回
    if (!load || status.value === 'loading') return
    status.value = 'loading'
    error.value = undefined
    try {
      fetched.value = await load()
      status.value = 'done'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      status.value = 'failed'
    }
  }

  const handle = computed<FontQueryHandle>(() => ({
    canQuery: typeof toValue(loadFonts) === 'function',
    status: status.value,
    hasReport: toValue(hasInjectedReport) || fetched.value !== undefined,
    error: error.value,
    run: () => { void run() },
  }))

  return { handle, fetched: computed(() => fetched.value) }
}
