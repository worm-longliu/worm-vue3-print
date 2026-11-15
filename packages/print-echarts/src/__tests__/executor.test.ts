import { describe, it, expect } from 'vitest'
import { createDefaultChartOption } from '../defaults.js'
import { CHART_EXECUTOR_VERSION } from '../version.js'
import { installChartExecutor, renderAssets } from '../browser/executor.iife.js'

const spec = (type: string) => ({
  key: `${type}-1`,
  type,
  _chartOption: createDefaultChartOption(type),
  widthMm: 100,
  heightMm: 60,
})

describe('页面执行器 renderAssets', () => {
  it('批量渲染返回 key → SVG 映射', () => {
    const map = renderAssets([spec('barChart'), spec('pieChart')])
    expect(Object.keys(map).sort()).toEqual(['barChart-1', 'pieChart-1'])
    expect(map['barChart-1']).toContain('<svg')
  })

  it('单个规格失败只跳过该 key，不中断其它图', () => {
    const map = renderAssets([{ key: 'bad', type: 'barChart', _chartOption: [] }, spec('lineChart')])
    expect(map.bad).toBeUndefined()
    expect(map['lineChart-1']).toContain('<svg')
  })

  it('挂载到 __wormDom 时保留 core 已有方法，只新增 renderAssets', () => {
    const target = { __wormDom: { renderCodes: () => ({}) } }
    installChartExecutor(target)
    expect(typeof (target.__wormDom as any).renderAssets).toBe('function')
    expect(typeof (target.__wormDom as any).renderCodes).toBe('function')
    expect((target.__wormDom as any).chartExecutorVersion).toBe(CHART_EXECUTOR_VERSION)
  })
})
