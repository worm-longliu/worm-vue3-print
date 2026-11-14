// print-core/src/print/__tests__/chart-pipeline.spec.ts
// 图表元素走与码制同构的「收集 → 页面渲染 → 回填」两趟流程
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { prepareDocument } from '../pipeline.js'
import { createDomHostRuntime } from '../dom-host-runtime.js'
import { clearElementPlugins } from '../../designer/element-plugin-registry.js'
import { EXECUTOR, createFakeDriverFactory } from './fake-driver.js'
import { registerChartPluginStub } from './chart-plugin-stub.js'
import type { FakeDriverOptions } from './fake-driver.js'
import type { PrintJob } from '../types.js'
import type { ChartRenderer, TemplateData } from '../../render/types.js'

function chartTemplate(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{
      id: 'chart-1',
      type: 'chart',
      options: {
        left: 0, top: 0, width: 100, height: 60,
        chartOption: { xAxis: { data: ['$data'] }, series: [{ type: 'bar', data: ['$data'] }] },
        chartCategoryField: 'name',
        chartValueFields: ['value'],
      },
    } as any],
  } as TemplateData
}

function runtimeOf(options: FakeDriverOptions = {}, withChartBundle = true) {
  const fake = createFakeDriverFactory(options)
  const chartBundle = { source: '/* fake chart executor */', version: 'chart-test' }
  return {
    fake,
    runtime: createDomHostRuntime(fake.factory, EXECUTOR, withChartBundle ? chartBundle : undefined),
  }
}

const jobOf = (overrides: Partial<PrintJob> = {}): PrintJob => ({
  templateJson: chartTemplate(),
  printData: { rows: [{ name: 'A', value: 12 }, { name: 'B', value: 34 }] },
  ...overrides,
})

describe('图表出纸管线', () => {
  // P4：图表实现已归插件包；core 用替身插件验证通用管线（真实等价性见包内 P0 基线）
  beforeAll(() => { registerChartPluginStub() })
  afterAll(() => { clearElementPlugins() })

  it('含图表模板：测量趟与最终趟各收集一次，最终 HTML 内联图表 SVG', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'chart-1', heightPx: 227 }] })
    const result = await prepareDocument(jobOf(), runtime)
    // 测量趟一次渲染 + 最终趟复用映射不重复渲染（与码制口径一致：只页面渲染一次）
    expect(fake.calls.filter(call => call === 'evaluate:renderCharts')).toHaveLength(1)
    expect(result.html).toContain('<svg data-chart="fake"')
    expect(result.pageCount).toBe(1)
  })

  it('core 执行器与图表执行器各自注入：测量趟 load 注入 core、图表渲染注入图表、最终趟 load 重新注入 core', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'chart-1', heightPx: 227 }] })
    await prepareDocument(jobOf(), runtime)
    // 文档重建（setContent）后注入标记重置，因此 core 执行器被注入两次；图表执行器在渲染档注入一次
    expect(fake.calls.filter(call => call === 'injectExecutor')).toHaveLength(3)
  })

  it('未提供图表执行器 bundle 时抛出明确错误，而不是静默空图', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'chart-1', heightPx: 227 }] }, false)
    await expect(prepareDocument(jobOf(), runtime)).rejects.toThrow(/图表执行器/)
  })

  it('P4 兼容边界：旧 chartRenderer 入参保留，出图由插件描述符统一负责', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'chart-1', heightPx: 227 }] })
    const chartRenderer: ChartRenderer = {
      render: () => '<svg data-chart="host"></svg>',
    }
    const result = await prepareDocument(jobOf({ chartRenderer }), runtime)
    expect(result.html).toContain('<svg data-chart="fake"')
    expect(fake.calls.filter(call => call === 'evaluate:renderCharts')).toHaveLength(1)
  })
})
