import type { ChartSpec } from './types.js'

/** 图表规格稳定键：option + 尺寸 + 字体（顺序固定，跨进程可比对） */
export function chartSpecKey(spec: Omit<ChartSpec, 'key'>): string {
  return JSON.stringify([
    spec.option,
    Math.round(spec.widthMm * 1000) / 1000,
    Math.round(spec.heightMm * 1000) / 1000,
    spec.fontFamily ?? null,
  ])
}
