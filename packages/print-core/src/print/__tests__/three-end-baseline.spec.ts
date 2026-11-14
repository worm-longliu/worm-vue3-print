// P0 基线冻结：三个出图端共用同一条 core 管线，差异只在「谁提供 DriverFactory」。
// 本文件用 fake driver 把三端的所有路由形态跑一遍，钉住 P0 冻结的出图行为。
// P4 起图表实现归插件包：core 侧用无渲染库依赖的替身插件走通用通道，
// 真实 HTML 逐字等价由 print-echarts/legacy-baseline.test.ts 与 P0 快照负责：
//   prepareDocument —— 浏览器打印预览 / Electron 静默打印（ACTIVE_PRINT_ROUTE='html'）
//   renderPdf       —— 服务端 PDF / 静默打印「保留验证件 PDF」
//   chartRenderer   —— 浏览器设计器预览的调用方覆盖旁路（§4.3 兼容别名）
//   缺 chartBundle —— 旧三参数装配的降级契约
// P5：两端宿主装配（pdf-render.ts / print-engine.ts）已改为第四参
// collectExecutorBundles() 自动收集；本文件同时钉住「新四参数」与「旧三参数兼容桥」两条路径。
// 行为等价由本基线 + 两端 baseline 冒烟共同覆盖。
// 样本来自 docs/superpowers/specs/baseline/，是真实历史 chart 模板（未迁移、无 plugins 清单）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { prepareDocument, renderPdf } from '../pipeline.js'
import { createDomHostRuntime } from '../dom-host-runtime.js'
import { collectExecutorBundles } from '../assets.js'
import { clearElementPlugins } from '../../designer/element-plugin-registry.js'
import { EXECUTOR, createFakeDriverFactory } from './fake-driver.js'
import { registerChartPluginStub } from './chart-plugin-stub.js'
import type { ExecutorBundle } from '../driver.js'
import type { PrintJob } from '../types.js'
import type { TemplateData } from '../../render/types.js'

const baseline = (name: string): string =>
  fileURLToPath(new URL(`../../../../../docs/superpowers/specs/baseline/${name}`, import.meta.url))

interface LegacySample {
  template: TemplateData
  data: Record<string, unknown>
}

function sample(name: string): LegacySample {
  return JSON.parse(readFileSync(baseline(`${name}.legacy.json`), 'utf8')) as LegacySample
}

const CHART_BUNDLE: ExecutorBundle = { source: '/* fake chart executor */', version: 'chart-baseline' }

const CASES = [
  { name: 'sales-chart', chartCount: 2 },
  { name: 'echarts-test-case', chartCount: 4 },
] as const

function runtimeOf(opts: { withChartBundle?: boolean } = {}) {
  const fake = createFakeDriverFactory()
  const injectedVersions: string[] = []
  const originalInject = fake.driver.injectExecutor
  fake.driver.injectExecutor = async (bundle: ExecutorBundle) => {
    injectedVersions.push(bundle.version)
    await originalInject(bundle)
  }
  const runtime = createDomHostRuntime(
    fake.factory,
    EXECUTOR,
    opts.withChartBundle === false ? undefined : CHART_BUNDLE,
  )
  return { fake, injectedVersions, runtime }
}

const jobOf = (name: string, overrides: Partial<PrintJob> = {}): PrintJob => {
  const s = sample(name)
  return { templateJson: s.template, printData: s.data, ...overrides }
}

const svgCount = (html: string): number => (html.match(/<svg\b/g) ?? []).length

describe('三端图表出纸基线冻结（P0 / R5）', () => {
  // P4：主体已删除全部图表实现；core 侧用无渲染库依赖的替身插件走通用通道，
  // 真实出图等价性由 print-echarts 的 HTML 逐字基线钉住。
  beforeAll(() => { registerChartPluginStub() })
  afterAll(() => { clearElementPlugins() })

  for (const c of CASES) {
    it(`${c.name}：prepareDocument（浏览器预览 / 静默打印 HTML 路由）内联 ${c.chartCount} 个 SVG`, async () => {
      const { fake, injectedVersions, runtime } = runtimeOf()
      const result = await prepareDocument(jobOf(c.name), runtime)

      expect(svgCount(result.html)).toBe(c.chartCount)
      // 最终交给 driver 的文档：真实端即 setContent / webContents.print 吃的那份
      expect(svgCount(fake.documents.at(-1) ?? '')).toBe(c.chartCount)
      // 测量趟渲染一次，最终趟复用 chartBaseMap，不重复渲染
      expect(fake.calls.filter(call => call === 'evaluate:renderCharts')).toHaveLength(1)
      // core 执行器 ×2（文档重建后注入标记重置）+ 图表执行器 ×1，两份 IIFE 按 version 区分
      expect(injectedVersions.filter(v => v === EXECUTOR.version)).toHaveLength(2)
      expect(injectedVersions.filter(v => v === CHART_BUNDLE.version)).toHaveLength(1)
      expect(result.pageCount).toBe(1)
    })

    it(`${c.name}：renderPdf（服务端 PDF / 验证件）PDF 与 HTML 出自同一份含 ${c.chartCount} 图的文档`, async () => {
      const { fake, runtime } = runtimeOf()
      const { pdf, prepared } = await renderPdf(jobOf(c.name), runtime)

      expect(svgCount(prepared.html)).toBe(c.chartCount)
      expect(svgCount(fake.documents.at(-1) ?? '')).toBe(c.chartCount)
      expect(fake.calls).toContain('pdf')
      expect(Array.from(pdf)).toEqual([1, 2, 3])
    })

    it(`${c.name}：R5 零迁移——样本不含 plugins 顶层清单`, () => {
      const raw = JSON.parse(readFileSync(baseline(`${c.name}.legacy.json`), 'utf8')) as Record<string, unknown>
      expect('plugins' in (raw.template as object)).toBe(false)
    })
  }

  it('P4 兼容边界：旧 chartRenderer 入参保留，出图统一由插件描述符负责', async () => {
    const { fake, runtime } = runtimeOf()
    const result = await prepareDocument(jobOf('sales-chart', {
      chartRenderer: { render: () => '<svg data-chart="host"></svg>' },
    }), runtime)
    // HTML 仍与 P0 等价（2 个 SVG），通用通道经别名桥落到旧执行器方法名
    expect(svgCount(result.html)).toBe(2)
    expect(fake.calls.filter(call => call === 'evaluate:renderCharts')).toHaveLength(1)
  })

  it('缺图表执行器时明确报错，不静默出空图（旧三参数装配的降级契约）', async () => {
    await expect(prepareDocument(jobOf('sales-chart'), runtimeOf({ withChartBundle: false }).runtime))
      .rejects.toThrow(/图表执行器/)
    await expect(renderPdf(jobOf('sales-chart'), runtimeOf({ withChartBundle: false }).runtime))
      .rejects.toThrow(/图表执行器/)
  })

  it('P5 注册表自动装配：第四参 bundles 由 collectExecutorBundles() 收集并注入', async () => {
    // stub 只有 executorBundle、没有 createRenderer：这条用例覆盖「页面执行器型插件」路径，
    // 与真图表插件的进程内 SSR 路径互补。
    const bundles = collectExecutorBundles()
    expect(bundles.length).toBeGreaterThan(0)

    const fake = createFakeDriverFactory()
    const injectedVersions: string[] = []
    const originalInject = fake.driver.injectExecutor
    fake.driver.injectExecutor = async (bundle: ExecutorBundle) => {
      injectedVersions.push(bundle.version)
      await originalInject(bundle)
    }
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR, undefined, bundles)
    const result = await prepareDocument(jobOf('sales-chart'), runtime)

    expect(svgCount(result.html)).toBe(2)
    // 通用通道经别名桥落到执行器真实提供的旧方法名
    expect(fake.calls.filter(call => call === 'evaluate:renderCharts')).toHaveLength(1)
    // 注入的是注册表收集的插件产物，旧第三参的 chartBundle 不再被使用
    expect(injectedVersions).toContain(bundles[0].version)
    expect(injectedVersions).not.toContain(CHART_BUNDLE.version)
  })
})
