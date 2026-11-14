// P0 基线冻结：服务端 PDF 端的宿主装配冒烟。
//
// 复刻 pdf-render.ts 的 P5 四参数装配
// （Playwright DriverFactory + core 执行器 + 旧兼容位 undefined + collectExecutorBundles()），
// 只把 DriverFactory 换成 fake，因此不依赖真实 Chromium。pdf-render.ts 自身不可注入
// （cachedRuntime 是模块级单例），但出图行为 100% 由 core 管线决定，
// 这份基线钉的就是「改造前后装配 + 出图等价」；另保留一条旧三参数装配的兼容用例。
//
// 用独立 vitest.baseline.config.ts 运行，刻意不加载 vitest.setup.ts 的浏览器预热；
// 默认 vitest.config.ts 已 exclude 本文件，npm test -w @worm-vue3-print/render 不受影响。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  collectExecutorBundles,
  createDomHostRuntime,
  prepareDocument,
  renderPdf as coreRenderPdf,
} from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
// 部署白名单：import 即注册，故 collectExecutorBundles() 能收集到图表插件产物
import { loadChartExecutorBundle } from '@worm-vue3-print/echarts/node'
import type { DriverFactory, ExecutorBundle, PageDriver, PrintJob } from '@worm-vue3-print/core'

const baseline = (name: string): string =>
  fileURLToPath(new URL(`../../../docs/superpowers/specs/baseline/${name}`, import.meta.url))

interface FakeHarness {
  factory: DriverFactory
  calls: string[]
  documents: string[]
  injectedVersions: string[]
  chartSpecs: unknown[]
}

function createFakeHarness(): FakeHarness {
  const calls: string[] = []
  const documents: string[] = []
  const injectedVersions: string[] = []
  const chartSpecs: unknown[] = []
  const driver: PageDriver = {
    async open() { calls.push('open') },
    async setContent(html) { calls.push('setContent'); documents.push(html) },
    async injectExecutor(bundle: ExecutorBundle) {
      calls.push('injectExecutor')
      injectedVersions.push(bundle.version)
    },
    async evaluate<T>(method: string, args?: unknown[]): Promise<T> {
      calls.push(`evaluate:${method}`)
      if (method === 'readMeasurements') return [] as T
      if (method === 'applyTextFit') return [] as T
      if (method === 'readContentBottom') return 0 as T
      if (method === 'renderCodes') return {} as T
      if (method === 'renderCharts') {
        const specs = (args?.[0] ?? []) as Array<{ key: string }>
        chartSpecs.push(...specs)
        const map: Record<string, string> = {}
        for (const spec of specs) {
          map[spec.key] = '<svg data-chart="fake" viewBox="0 0 100 60"></svg>'
        }
        return map as T
      }
      return undefined as T
    },
    async pdf() { calls.push('pdf'); return new Uint8Array([0x25, 0x50, 0x44, 0x46]) },
    async close() { calls.push('close') },
  }
  const factory: DriverFactory = {
    async createDriver() { calls.push('createDriver'); return driver },
  }
  return { factory, calls, documents, injectedVersions, chartSpecs }
}

/**
 * P5 默认走注册表自动装配（第四参）；`legacy` / `legacy-without-bundle` 用来钉住
 * §4.3 旧三参数入口仍可出图，保证已装包宿主不改装配代码也不会退化。
 */
type RuntimeMode = 'registry' | 'legacy' | 'legacy-without-bundle'

function runtimeOf(harness: FakeHarness, mode: RuntimeMode = 'registry') {
  if (mode === 'legacy') {
    return createDomHostRuntime(harness.factory, loadExecutorBundle(), loadChartExecutorBundle())
  }
  if (mode === 'legacy-without-bundle') {
    return createDomHostRuntime(harness.factory, loadExecutorBundle())
  }
  return createDomHostRuntime(
    harness.factory,
    loadExecutorBundle(),
    undefined,
    collectExecutorBundles(),
  )
}

function jobOf(name: string): PrintJob {
  const s = JSON.parse(readFileSync(baseline(`${name}.legacy.json`), 'utf8')) as {
    template: PrintJob['templateJson']
    data: Record<string, unknown>
  }
  return { templateJson: s.template, printData: s.data }
}

const svgCount = (html: string): number => (html.match(/<svg\b/g) ?? []).length

const CASES = [
  { name: 'sales-chart', chartCount: 2 },
  { name: 'echarts-test-case', chartCount: 4 },
] as const

describe('PDF 端图表基线冻结（P0 / 宿主装配冒烟）', () => {
  for (const c of CASES) {
    it(`${c.name}：renderPdf 的最终 HTML 与交给 driver 的文档各内联 ${c.chartCount} 个 SVG`, async () => {
      const fake = createFakeHarness()
      const { pdf, prepared } = await coreRenderPdf(jobOf(c.name), runtimeOf(fake))

      expect(svgCount(prepared.html)).toBe(c.chartCount)
      expect(svgCount(fake.documents.at(-1) ?? '')).toBe(c.chartCount)
      // P4：图表能力由插件描述符提供，进程内 SSR 直接出图，不再走页面 renderCharts 通道
      expect(fake.chartSpecs).toHaveLength(0)
      expect(fake.calls.filter(call => call === 'evaluate:renderCharts')).toHaveLength(0)
      expect(fake.calls).toContain('pdf')
      expect(new TextDecoder().decode(pdf)).toBe('%PDF')
    })
  }

  it('P5 注册表自动装配：已收集插件产物，进程内出图只注入 core 执行器一次', async () => {
    const chartVersion = loadChartExecutorBundle().version
    // 自动装配不是「空转」：注册表确实收集到了插件声明的页面执行器产物
    expect(collectExecutorBundles().some(b => b.version === chartVersion)).toBe(true)

    const fake = createFakeHarness()
    const prepared = await prepareDocument(jobOf('sales-chart'), runtimeOf(fake))

    const coreVersion = loadExecutorBundle().version
    expect(svgCount(prepared.html)).toBe(2)
    expect(fake.injectedVersions.filter(v => v === chartVersion)).toHaveLength(0)
    // P0 时图表走「页面 renderCharts 两趟」，core 执行器会随每次 load 注入 2 次；
    // P4 后插件 createRenderer 在进程内 SSR 出图，页面不再有第二趟渲染，
    // 因此只有一次 load → 只注入 core 执行器一次，插件 bundle 无需注入即可出图。
    expect(fake.injectedVersions.filter(v => v === coreVersion)).toHaveLength(1)
    expect(fake.injectedVersions).toEqual([coreVersion])
    expect(fake.calls.filter(call => call === 'evaluate:renderCharts')).toHaveLength(0)
  })

  it('§4.3 兼容：旧三参数装配（含或不含 chartBundle）仍可出图', async () => {
    for (const mode of ['legacy', 'legacy-without-bundle'] as const) {
      const fake = createFakeHarness()
      const prepared = await prepareDocument(jobOf('sales-chart'), runtimeOf(fake, mode))
      expect(svgCount(prepared.html)).toBe(2)
    }
  })
})
