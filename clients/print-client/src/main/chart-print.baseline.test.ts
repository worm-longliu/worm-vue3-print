// P0 基线冻结：Electron 静默打印端宿主链路
// （PrintEngine.submit → parsePrintSubmit → core 管线 → printHtmlDocument 出纸 HTML）。
//
// 与 print-engine.test.ts 的区别：那里用 submitHtml（不跑 core 管线），这里用 submit(templateJson)
// 真实走一遍图表收集/渲染/回填，并把 driver 换成 fake，因此能冻结「静默打印端图表出图」。
// 装配复刻 print-engine.ts 的 createPrintRuntime 四参数（P5 注册表自动收集，
// 仅 DriverFactory 替换）；另保留一条旧三参数装配的 §4.3 兼容用例。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectExecutorBundles, createDomHostRuntime } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { loadChartExecutorBundle } from '@worm-vue3-print/echarts/node'
import type { DriverFactory, ExecutorBundle, PageDriver } from '@worm-vue3-print/core'
import type { JobRecord } from './job-history.js'

// 系统命令出纸已断开；桩掉它是为了让「误接线」当场变红，且不开真实窗口
vi.mock('./pdf-printer.js', () => ({ printPdfFile: vi.fn(async () => undefined) }))
vi.mock('./html-printer.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./html-printer.js')>()
  return { ...actual, printHtmlDocument: vi.fn(async () => undefined) }
})

const { PrintEngine } = await import('./print-engine.js')
const { JobHistoryStore } = await import('./job-history.js')
const { printPdfFile } = await import('./pdf-printer.js')
const { printHtmlDocument } = await import('./html-printer.js')

const baseline = (name: string): string =>
  fileURLToPath(new URL(`../../../../docs/superpowers/specs/baseline/${name}`, import.meta.url))

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

function sample(name: string): { templateJson: Record<string, unknown>; printData: Record<string, unknown> } {
  const s = JSON.parse(readFileSync(baseline(`${name}.legacy.json`), 'utf8')) as {
    template: Record<string, unknown>
    data: Record<string, unknown>
  }
  return { templateJson: s.template, printData: s.data }
}

const svgCount = (html: string): number => (html.match(/<svg\b/g) ?? []).length

let workDir: string
beforeEach(() => { workDir = mkdtempSync(join(tmpdir(), 'wpc-chart-baseline-')) })
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

function engineWith(fake: FakeHarness, opts: { mode?: 'registry' | 'legacy'; keep?: boolean } = {}) {
  const { mode = 'registry', keep = false } = opts
  const runtime = mode === 'legacy'
    ? createDomHostRuntime(fake.factory, loadExecutorBundle(), loadChartExecutorBundle())
    : createDomHostRuntime(fake.factory, loadExecutorBundle(), undefined, collectExecutorBundles())
  const records: JobRecord[] = []
  const engine = new PrintEngine({
    printerService: {
      resolve: async (name?: string) => ({ name: name ?? '测试打印机', isDefault: true }),
    } as any,
    runtime,
    history: new JobHistoryStore(join(workDir, 'jobs.jsonl'), 100),
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    pdfOutput: () => ({ keep, dir: join(workDir, 'pdf') }),
  })
  engine.onSettled(r => records.push(r))
  return { engine, records }
}

describe('静默打印端图表基线冻结（P0 / 宿主装配冒烟）', () => {
  it('HTML 路由：出纸 HTML 内联 2 个 SVG，系统命令不出纸', async () => {
    // P5：注册表自动装配确实收集到了插件声明的页面执行器产物（不是空转）
    expect(collectExecutorBundles().length).toBeGreaterThan(0)
    const fake = createFakeHarness()
    const { engine, records } = engineWith(fake)
    await engine.submit({ ...sample('sales-chart'), print: { printerName: '测试打印机' } })

    const [html] = (printHtmlDocument as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(svgCount(html)).toBe(2)
    expect(svgCount(fake.documents.at(-1) ?? '')).toBe(2)
    // P4/P5：插件自注册后进程内 SSR 出图，宿主不再需要注入图表执行器 / 走页面 renderCharts
    expect(fake.chartSpecs).toHaveLength(0)
    expect(fake.injectedVersions).not.toContain(loadChartExecutorBundle().version)
    expect(fake.calls.filter(call => call === 'evaluate:renderCharts')).toHaveLength(0)
    expect(fake.calls).not.toContain('pdf')
    expect(printPdfFile).not.toHaveBeenCalled()
    expect(records[0]?.printRoute).toBe('html')
    expect(records[0]?.outcome).toBe('success')
  })

  it('保留验证件 PDF：同一 runtime 额外产出 PDF，出纸仍走 HTML 且含 4 个 SVG', async () => {
    const fake = createFakeHarness()
    const { engine } = engineWith(fake, { keep: true })
    await engine.submit({ ...sample('echarts-test-case'), print: { printerName: '测试打印机' } })

    expect(fake.calls).toContain('pdf')
    expect(svgCount(fake.documents.at(-1) ?? '')).toBe(4)
    expect((printHtmlDocument as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('§4.3 兼容：旧三参数装配仍可出图（已装包宿主不改装配代码）', async () => {
    const fake = createFakeHarness()
    const { engine, records } = engineWith(fake, { mode: 'legacy' })
    await engine.submit({ ...sample('sales-chart'), print: { printerName: '测试打印机' } })
    expect(records[0]?.outcome).toBe('success')
    const [html] = (printHtmlDocument as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(svgCount(html)).toBe(2)
  })
})
