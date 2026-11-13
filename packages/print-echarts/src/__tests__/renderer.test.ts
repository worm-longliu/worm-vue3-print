import { describe, expect, it } from 'vitest'
import type { ChartSpec } from '@worm-vue3-print/core'
import { createChartRenderer, mmToChartPx, renderChartToSvg } from '../renderer.js'

const BAR_OPTION: Record<string, unknown> = {
  title: { text: '月度销量' },
  xAxis: { type: 'category', data: ['一月', '二月', '三月'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [12, 20, 15] }],
}

function makeSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return { key: 'bar-1', option: BAR_OPTION, widthMm: 50, heightMm: 30, ...overrides }
}

describe('renderChartToSvg', () => {
  it('输出可内联铺满 mm 盒子的 SVG 根节点', () => {
    const spec = makeSpec()
    const svg = renderChartToSvg(spec)
    const widthPx = mmToChartPx(spec.widthMm)
    const heightPx = mmToChartPx(spec.heightMm)
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain(`viewBox="0 0 ${widthPx} ${heightPx}"`)
    expect(svg).toContain('width="100%"')
    expect(svg).toContain('height="100%"')
    expect(svg).toContain('style="display:block')
    // 矢量缩放：根节点不残留固定 px 宽高（内容里的 rect 仍按出图像素绘制）
    const rootTag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? ''
    expect(rootTag).not.toContain(`width="${widthPx}"`)
    expect(rootTag).not.toContain(`height="${heightPx}"`)
  })

  it('含中文标题不崩溃且文本进入产物', () => {
    const svg = renderChartToSvg(makeSpec({ option: { ...BAR_OPTION, title: { text: '销售趋势（中文标题）' } } }))
    expect(svg).toContain('<svg')
    expect(svg).toContain('销售趋势')
  })

  it('createChartRenderer 实现 ChartRenderer 端口', () => {
    const renderer = createChartRenderer()
    expect(renderer.render(makeSpec())).toContain('<svg')
  })

  it('非法 option 抛错，交给 core 降级占位', () => {
    expect(() => renderChartToSvg(makeSpec({ option: null as unknown as Record<string, unknown> }))).toThrow()
  })
})
