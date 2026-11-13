import { describe, expect, it } from 'vitest'
import type { ChartSpec } from '@worm-vue3-print/core'
import { installChartExecutor, renderCharts } from '../browser/executor.iife.js'

const OPTION: Record<string, unknown> = {
  xAxis: { type: 'category', data: ['A', 'B'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [1, 2] }],
}

function makeSpec(key: string): ChartSpec {
  return { key, option: OPTION, widthMm: 40, heightMm: 30 }
}

describe('图表执行器', () => {
  it('renderCharts 返回 key → SVG 映射', () => {
    const map = renderCharts([makeSpec('a'), makeSpec('b')])
    expect(Object.keys(map)).toEqual(['a', 'b'])
    expect(map.a).toContain('<svg')
    expect(map.b).toContain('width="100%"')
  })

  it('单个规格失败跳过该 key，不抛整体错误', () => {
    const map = renderCharts([makeSpec('ok'), { key: 'bad', option: null as unknown as Record<string, unknown>, widthMm: 10, heightMm: 10 }])
    expect(map.ok).toContain('<svg')
    expect(map).not.toHaveProperty('bad')
  })

  it('注入到已存在的 __wormDom 时不覆盖 core 已有方法', () => {
    const coreMethods = {
      waitReady: (): string => 'ready',
      readMeasurements: (): number[] => [1, 2],
    }
    const target: Record<string, unknown> = { __wormDom: coreMethods }
    const holder = installChartExecutor(target)
    expect(holder).toBe(coreMethods)
    expect(target.__wormDom).toBe(coreMethods)
    expect(holder.waitReady).toBe(coreMethods.waitReady)
    expect(typeof holder.renderCharts).toBe('function')
  })

  it('IIFE 自执行后可通过 globalThis.__wormDom.renderCharts 调用', () => {
    const globalHolder = (globalThis as unknown as Record<string, unknown>).__wormDom as
      | Record<string, unknown>
      | undefined
    expect(globalHolder).toBeTruthy()
    const render = globalHolder?.renderCharts as (specs: ChartSpec[]) => Record<string, string>
    expect(typeof render).toBe('function')
    const result = render([makeSpec('global')])
    expect(result.global).toContain('<svg')
  })
})
