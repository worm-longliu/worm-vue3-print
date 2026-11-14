// P5 包能力回归：插件配置面（惰性生效）、自定义配色/示例类目、追加组件、
// 以及「包入口自注册 → 完整卸载 → 重新注册」的 core/canvas 双侧对称性。
import { afterEach, describe, expect, it } from 'vitest'
import { getElementPlugin } from '@worm-vue3-print/core/designer'
import { getElementExtension } from '@worm-vue3-print/canvas'
import { GraphicComponent } from 'echarts/components'
import {
  configureChartPlugin,
  getChartPalettes,
  getSampleCategories,
  chartFactoryDefaults,
  installEchartsDesignerExtension,
  uninstallEchartsDesignerExtension,
} from '../index.js'
import { previewChartOption } from '../designer/option-utils.js'
import { applyExtraComponents } from '../echarts.js'
import { renderChartToSvg } from '../renderer.js'

/** configurePlugin 按键合并；写回 undefined 即可让所有读取点回落到出厂默认 */
const RESET_ALL = {
  defaultWidth: undefined,
  defaultHeight: undefined,
  defaultChartType: undefined,
  defaultChartOption: undefined,
  components: undefined,
  palettes: undefined,
  sampleCategories: undefined,
}

afterEach(() => {
  configureChartPlugin(RESET_ALL)
  // 恢复包入口的自注册态，保证用例之间互不污染
  if (!getElementPlugin('chart')) installEchartsDesignerExtension()
})

describe('configureChartPlugin 配置面（P5）', () => {
  it('未配置时出厂默认与 P0 逐字一致', () => {
    const defaults = chartFactoryDefaults()
    expect(defaults.width).toBe(100)
    expect(defaults.height).toBe(60)
    expect((defaults.chartOption as { title: { text: string } }).title.text).toBe('销售趋势')
    expect(getSampleCategories()).toEqual(['示例一', '示例二', '示例三'])
    expect(getChartPalettes().map(p => p.key)).toEqual(['default', 'fresh', 'warm', 'purple'])
  })

  it('配置惰性生效：描述符无需注销重注册，出厂默认值即时跟随', () => {
    configureChartPlugin({ defaultWidth: 180, defaultHeight: 90, defaultChartType: 'pie' })
    expect(chartFactoryDefaults().width).toBe(180)
    expect(chartFactoryDefaults().height).toBe(90)
    // core 注册表里仍是同一个描述符对象，靠惰性读配置而非重新注册
    const plugin = getElementPlugin('chart')
    expect(plugin).toBeDefined()
    expect(plugin?.kind.defaultOptions?.().width).toBe(180)
    const option = plugin?.kind.defaultOptions?.().chartOption as { series: { type: string }[] }
    expect(option.series[0].type).toBe('pie')
  })

  it('defaultChartOption 优先于 defaultChartType', () => {
    configureChartPlugin({
      defaultChartType: 'scatter',
      defaultChartOption: { title: { text: '自定义' }, series: [{ type: 'bar', data: ['$data'] }] },
    })
    expect((chartFactoryDefaults().chartOption as { title: { text: string } }).title.text).toBe('自定义')
  })

  it('palettes 可覆盖同名预设并追加新配色', () => {
    configureChartPlugin({
      palettes: {
        default: { label: '企业蓝', colors: ['#123456'] },
        brand: { label: '品牌色', colors: ['#ff0000', '#00ff00'] },
      },
    })
    const palettes = getChartPalettes()
    expect(palettes[0]).toEqual({ key: 'default', label: '企业蓝', colors: ['#123456'] })
    expect(palettes.at(-1)).toEqual({ key: 'brand', label: '品牌色', colors: ['#ff0000', '#00ff00'] })
  })

  it('sampleCategories 影响设计态预览的占位替换', () => {
    const option = { xAxis: { data: ['$data'] }, series: [{ type: 'bar', data: ['$data'] }] }
    configureChartPlugin({ sampleCategories: ['甲', '乙'] })
    expect(getSampleCategories()).toEqual(['甲', '乙'])
    const preview = previewChartOption(option)
    expect((preview.xAxis as { data: string[] }).data).toEqual(['甲', '乙'])
  })

  it('components 追加幂等，且不破坏默认 SVG 出图', () => {
    configureChartPlugin({ components: [GraphicComponent] })
    expect(() => applyExtraComponents()).not.toThrow()
    expect(() => applyExtraComponents()).not.toThrow()
    const svg = renderChartToSvg({
      option: {
        xAxis: { type: 'category', data: ['a', 'b'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [1, 2] }],
      },
      widthMm: 100,
      heightMm: 60,
    } as never)
    expect(svg).toContain('<svg')
  })
})

describe('插件生命周期与两套注册表（P5）', () => {
  it('包入口 import 即自注册，core 描述符与 canvas 视图层都带设计器组件', () => {
    const plugin = getElementPlugin('chart')
    const ext = getElementExtension('chart')
    expect(plugin?.designer?.canvasComponent).toBeTruthy()
    expect(ext?.canvasComponent).toBeTruthy()
    expect(ext?.propertyComponent).toBeTruthy()
    expect(ext?.icon).toBe('▤')
  })

  it('完整卸载同时清除 core 描述符与 canvas 素材卡，重新注册可恢复', () => {
    expect(getElementPlugin('chart')).toBeDefined()
    expect(getElementExtension('chart')).toBeDefined()

    uninstallEchartsDesignerExtension()
    expect(getElementPlugin('chart')).toBeUndefined()
    expect(getElementExtension('chart')).toBeUndefined()

    installEchartsDesignerExtension()
    expect(getElementPlugin('chart')).toBeDefined()
    expect(getElementExtension('chart')).toBeDefined()
  })
})
