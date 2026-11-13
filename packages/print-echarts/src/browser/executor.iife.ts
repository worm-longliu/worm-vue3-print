import type { ChartSpec } from '@worm-vue3-print/core'
import { renderChartToSvg } from '../renderer.js'
import { CHART_EXECUTOR_VERSION } from '../version.js'

/**
 * 批量渲染图表规格 → `key → SVG` 映射（core 执行器协议：无首参、同步返回普通对象）。
 * 单个规格失败只跳过该 key，不抛整体错误：core 侧对未命中的 key 降级为文本占位。
 */
export function renderCharts(specs: ChartSpec[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const spec of Array.isArray(specs) ? specs : []) {
    if (!spec || typeof spec.key !== 'string' || spec.key.length === 0) continue
    try {
      map[spec.key] = renderChartToSvg(spec)
    } catch {
      // 单图失败不影响其它图表
    }
  }
  return map
}

type ExecutorHolder = Record<string, unknown>

/**
 * 挂载到 globalThis.__wormDom：core 的 DOM 执行器注入在前，本执行器注入在后，
 * 两者共用同一个全局对象；只新增 renderCharts，不覆盖 core 已有的任何方法。
 */
export function installChartExecutor(target: Record<string, unknown> = globalThis as unknown as ExecutorHolder): ExecutorHolder {
  const existing = target.__wormDom
  const holder: ExecutorHolder =
    existing && typeof existing === 'object' ? (existing as ExecutorHolder) : (target.__wormDom = {})
  holder.renderCharts = renderCharts
  holder.chartExecutorVersion = CHART_EXECUTOR_VERSION
  return holder
}

// IIFE 产物自执行：宿主注入后即可通过 __wormDom.renderCharts 调用
installChartExecutor()

export { CHART_EXECUTOR_VERSION }
