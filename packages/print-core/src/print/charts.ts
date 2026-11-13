import type { ChartRenderer, ChartSpec } from '../render/types.js'
import { chartSpecKey } from '../render/chart-spec.js'

/** 映射渲染器：未命中抛错，由 html-generator 的既有降级逻辑输出占位 */
export function createMapChartRenderer(map: Map<string, string>): ChartRenderer {
  return {
    render(spec) {
      const svg = map.get(spec.key || chartSpecKey(spec))
      if (!svg) throw new Error('图表未渲染')
      return svg
    },
  }
}

export interface CollectingChartRenderer {
  /** 传入 generateHtml 的渲染器：命中基映射则返回，否则记录规格并抛错 */
  renderer: ChartRenderer
  /** 取走本趟收集到的规格并清空 */
  takeSpecs(): ChartSpec[]
}

export function createCollectingChartRenderer(base?: Map<string, string>): CollectingChartRenderer {
  const collected = new Map<string, ChartSpec>()
  return {
    renderer: {
      render(spec) {
        const key = spec.key || chartSpecKey(spec)
        const hit = base?.get(key)
        if (hit) return hit
        collected.set(key, { ...spec, key })
        throw new Error('collect')
      },
    },
    takeSpecs() {
      const specs = [...collected.values()]
      collected.clear()
      return specs
    },
  }
}

/** 合并多趟图表映射；后者覆盖同键，入参不被修改 */
export function mergeChartMaps(...maps: Array<Map<string, string>>): Map<string, string> {
  const merged = new Map<string, string>()
  for (const map of maps) {
    for (const [key, svg] of map) merged.set(key, svg)
  }
  return merged
}
