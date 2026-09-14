import type { CodeRenderer, CodeRenderOptions } from '../render/types.js'
import type { CodeSpec } from './types.js'

/** 码值 + 码制 + 影响产物几何的选项 → 稳定键（顺序固定，跨进程可比对） */
export function codeSpecKey(
  value: string,
  cellType: 'barcode' | 'qrcode',
  opts: CodeRenderOptions = {},
): string {
  return JSON.stringify([
    value,
    cellType,
    opts.barcodeType ?? null,
    opts.qrCodeLevel ?? null,
    opts.showText ?? null,
    opts.barWidth ?? null,
    opts.fontSize ?? null,
  ])
}

/** 映射渲染器：未命中抛错，由 html-generator 的既有降级逻辑输出文本占位 */
export function createMapCodeRenderer(map: Map<string, string>): CodeRenderer {
  return {
    render(value, cellType, opts) {
      const svg = map.get(codeSpecKey(value, cellType, opts))
      if (!svg) throw new Error(`码值未渲染：${value}`)
      return svg
    },
  }
}

export interface CollectingCodeRenderer {
  /** 传入 generateHtml 的渲染器：命中基映射则返回，否则记录规格并抛错 */
  renderer: CodeRenderer
  /** 取走本趟收集到的规格并清空 */
  takeSpecs(): CodeSpec[]
}

export function createCollectingCodeRenderer(base?: Map<string, string>): CollectingCodeRenderer {
  const collected = new Map<string, CodeSpec>()
  return {
    renderer: {
      render(value, cellType, opts = {}) {
        const key = codeSpecKey(value, cellType, opts)
        const hit = base?.get(key)
        if (hit) return hit
        collected.set(key, { key, value, cellType, opts })
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

/** 合并多趟码值映射；后者覆盖同键，入参不被修改 */
export function mergeCodeMaps(...maps: Array<Map<string, string>>): Map<string, string> {
  const merged = new Map<string, string>()
  for (const map of maps) {
    for (const [key, svg] of map) merged.set(key, svg)
  }
  return merged
}
