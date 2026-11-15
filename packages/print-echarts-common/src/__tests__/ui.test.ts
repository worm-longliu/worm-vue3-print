import type { ElementOptions, RuntimeElement } from '@worm-vue3-print/core/designer'
import { getElementUI } from '@worm-vue3-print/plugin-kit'
import type { ElementUIRenderResult } from '@worm-vue3-print/plugin-kit'
import {
  CHART_KINDS,
  CHART_KIND_DEFINITIONS,
  createDefaultChartOption,
} from '@worm-vue3-print/echarts/kit'
import { describe, expect, it } from 'vitest'
import { installChartCommonUI, uninstallChartCommonUI } from '../index.js'

function makeElement(type: string, options: Record<string, unknown> = {}): RuntimeElement {
  return {
    id: `el-${type}`,
    printElementType: { type },
    options: { left: 0, top: 0, width: 100, height: 60, ...options },
  } as unknown as RuntimeElement
}

/** 渲染结果可能是字符串、Node 或 { node, dispose }；统一挂到临时容器里查询 */
function mount(result: ElementUIRenderResult): HTMLElement {
  const raw = typeof result === 'object' && result !== null && 'node' in result ? result.node : result
  if (typeof raw === 'string') {
    const host = document.createElement('div')
    host.innerHTML = raw
    return host
  }
  return raw as HTMLElement
}

function labelsOf(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.pd-label')].map(node => node.textContent?.trim() ?? '')
}

function fieldInput(root: HTMLElement, label: string): HTMLInputElement | undefined {
  const wrap = [...root.querySelectorAll('.pd-field')].find(
    item => item.querySelector('.pd-label')?.textContent?.trim() === label,
  )
  return wrap?.querySelector('input') ?? undefined
}

interface PropertyFixture {
  root: HTMLElement
  updates: Partial<ElementOptions>[]
}

function renderProperty(type: string, options: Record<string, unknown> = {}): PropertyFixture {
  const ui = getElementUI(type)
  expect(ui?.renderProperty).toBeTypeOf('function')
  const updates: Partial<ElementOptions>[] = []
  const result = ui!.renderProperty!({
    element: makeElement(type, options),
    data: [{ name: '华东', value: 12, region: 'A' }],
    update: partial => { updates.push(partial) },
    repaint: () => {},
  })
  return { root: mount(result), updates }
}

describe('echarts common ElementUI 注册', () => {
  it('十种图表类型全部注册到 plugin-kit 且共用同一份 UI', () => {
    expect(CHART_KINDS).toHaveLength(10)
    const uis = CHART_KINDS.map(type => getElementUI(type))
    uis.forEach(ui => expect(ui).toBeDefined())
    expect(new Set(uis).size).toBe(1)
  })

  it('install / uninstall 幂等', () => {
    installChartCommonUI()
    installChartCommonUI()
    expect(getElementUI('barChart')).toBeDefined()
    uninstallChartCommonUI()
    uninstallChartCommonUI()
    expect(getElementUI('barChart')).toBeUndefined()
    installChartCommonUI()
    expect(getElementUI('barChart')).toBeDefined()
  })

  it('searchKeywords 与 Vue 面板同口径', () => {
    const keywords = getElementUI('barChart')?.searchKeywords ?? []
    expect(keywords).toContain('图表')
    expect(keywords).toContain('仪表')
    expect(keywords).toContain('echarts')
  })
})

describe('renderCanvas', () => {
  it('十种类型都产出包在 echarts-canvas-element 里的静态 SVG', () => {
    const ui = getElementUI('barChart')!
    for (const def of CHART_KIND_DEFINITIONS) {
      const html = ui.renderCanvas({
        element: makeElement(def.type, { chartOption: createDefaultChartOption(def.type) }),
        data: [{ name: '华东', value: 12 }],
        designMode: true,
      })
      expect(typeof html, def.type).toBe('string')
      expect(html, def.type).toContain('class="echarts-canvas-element"')
      expect(html, def.type).toContain('pointer-events:none')
      expect(html, def.type).toContain('<svg')
    }
  })
})

describe('renderProperty', () => {
  it('柱状图出数据映射 + 样式 + 堆叠字段', () => {
    const { root } = renderProperty('barChart')
    const labels = labelsOf(root)
    expect(labels).toEqual(expect.arrayContaining([
      '数据源', '类目字段', '数值字段（多值多系列）', '系列拆分字段',
      '图表标题', '显示图例', '配色', '堆叠显示',
    ]))
    expect(labels).not.toContain('气泡大小')
    expect(labels).not.toContain('内径（%）')
  })

  it('饼图只留单数值字段、无堆叠', () => {
    const labels = labelsOf(renderProperty('pieChart').root)
    expect(labels).toContain('数值字段')
    expect(labels).not.toContain('堆叠显示')
    expect(labels).not.toContain('内径（%）')
  })

  it('仪表盘出 min/max、无类目字段', () => {
    const labels = labelsOf(renderProperty('gaugeChart').root)
    expect(labels).toContain('最小 / 最大值')
    expect(labels).not.toContain('类目字段')
  })

  it('散点图出气泡开关', () => {
    const { root } = renderProperty('scatterChart')
    expect(labelsOf(root)).toContain('气泡大小')
    const wrap = [...root.querySelectorAll('.pd-field')].find(
      item => item.querySelector('.pd-label')?.textContent?.trim() === '气泡大小',
    )
    expect(wrap?.querySelector('input[type="checkbox"]')).not.toBeNull()
  })
})

describe('renderProperty 写回', () => {
  it('改类目字段写回 normalize 后的 chartOption，并保留未知自定义字段', () => {
    const chartOption = {
      ...createDefaultChartOption('barChart'),
      myCustomMarker: { keep: true },
      dataNote: '手写备注',
      // 与 barChart 语义不符的 series.type，用于验证写回前按 kind 归一
      series: [{ type: 'line', data: ['$data'], name: '旧名' }],
    }
    const { root, updates } = renderProperty('barChart', { chartOption })
    const input = fieldInput(root, '类目字段')!
    input.value = 'region'
    input.dispatchEvent(new Event('change'))

    expect(updates).toHaveLength(1)
    const patch = updates[0]!
    expect(patch.chartCategoryField).toBe('region')
    const written = patch.chartOption as Record<string, unknown>
    expect(written.myCustomMarker).toEqual({ keep: true })
    expect(written.dataNote).toBe('手写备注')
    expect((written.series as Record<string, unknown>[])[0]!.type).toBe('bar')
    expect((written.series as Record<string, unknown>[])[0]!.data).toEqual(['$data'])
  })

  it('气泡开关只写回 chartBubble，不动其它键', () => {
    const { root, updates } = renderProperty('scatterChart', {
      chartOption: createDefaultChartOption('scatterChart'),
    })
    const wrap = [...root.querySelectorAll('.pd-field')].find(
      item => item.querySelector('.pd-label')?.textContent?.trim() === '气泡大小',
    )
    const checkbox = wrap!.querySelector('input[type="checkbox"]') as HTMLInputElement
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))

    expect(updates).toHaveLength(1)
    expect(updates[0]!.chartBubble).toBe(true)
    expect(updates[0]!.chartOption).toBeDefined()
  })

  it('数值字段按 kind 上限增删，series 数量随之对齐', () => {
    const { root, updates } = renderProperty('barChart', {
      chartOption: createDefaultChartOption('barChart'),
      chartValueFields: ['value'],
    })
    const add = [...root.querySelectorAll('button')].find(btn => btn.textContent?.includes('添加字段'))
    expect(add).toBeDefined()
    add!.dispatchEvent(new Event('click'))

    expect(updates).toHaveLength(1)
    expect(updates[0]!.chartValueFields).toEqual(['value', ''])
    expect((updates[0]!.chartOption as Record<string, unknown>).series).toHaveLength(2)
  })
})

describe('hasProperties', () => {
  it('只有带图表专属属性的元素才显示自定义属性页签', () => {
    const ui = getElementUI('barChart')!
    expect(ui.hasProperties!(makeElement('barChart', { chartOption: createDefaultChartOption('barChart') }))).toBe(true)
    expect(ui.hasProperties!(makeElement('barChart', { chartCategoryField: 'name' }))).toBe(true)
    expect(ui.hasProperties!(makeElement('barChart'))).toBe(false)
    expect(ui.hasProperties!({ id: 'empty', printElementType: { type: 'barChart' } } as unknown as RuntimeElement)).toBe(false)
  })
})
