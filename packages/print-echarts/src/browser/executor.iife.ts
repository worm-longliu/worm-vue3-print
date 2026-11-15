// 页面执行器：core 注入后在页面上下文批量出图，方法与 core 的 renderAssets 协议一致。
import { renderChartToSvg } from '../renderer.js'
import { CHART_EXECUTOR_VERSION } from '../version.js'

/**
 * 批量渲染规格 → `key → SVG` 映射（core 执行器协议：无首参、同步返回普通对象）。
 * 单个规格失败只跳过该 key：core 侧对未命中的 key 会明确报「缺少扩展元素执行器产物」。
 */
export function renderAssets(specs: Array<Record<string, unknown>>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const spec of Array.isArray(specs) ? specs : []) {
    const key = typeof spec?.key === 'string' ? spec.key : ''
    if (!key) continue
    const option = (spec._chartOption ?? spec.chartOption ?? {}) as Record<string, unknown>
    try {
      map[key] = renderChartToSvg({
        key,
        type: String(spec.type ?? ''),
        option,
        widthMm: Number(spec.widthMm ?? 0),
        heightMm: Number(spec.heightMm ?? 0),
        fontFamily: typeof spec.fontFamily === 'string' ? spec.fontFamily : undefined,
      })
    } catch {
      // 单图失败不影响其它图
    }
  }
  return map
}

type ExecutorHolder = Record<string, unknown>

/**
 * 挂载到 globalThis.__wormDom：core 的 DOM 执行器注入在前、本执行器注入在后，
 * 两者共用同一个全局对象；只新增 renderAssets，不覆盖 core 已有方法。
 */
export function installChartExecutor(target: Record<string, unknown> = globalThis as unknown as ExecutorHolder): ExecutorHolder {
  const existing = target.__wormDom
  const holder: ExecutorHolder =
    existing && typeof existing === 'object' ? (existing as ExecutorHolder) : (target.__wormDom = {})
  holder.renderAssets = renderAssets
  holder.chartExecutorVersion = CHART_EXECUTOR_VERSION
  return holder
}

// IIFE 产物自执行：宿主注入后即可通过 __wormDom.renderAssets 调用
installChartExecutor()

export { CHART_EXECUTOR_VERSION }
