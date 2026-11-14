import { PrintFailure, toPrintFailure, withTimeout } from './errors.js'
import { DEFAULT_READINESS_MS, DEFAULT_TIMEOUT_MS } from './ports.js'
import type { DriverFactory, ExecutorBundle, ExecutorMethod } from './driver.js'
import { resolveExecutorMethod } from './assets.js'
import type { PrintRuntime, PrintSession, SessionBudget, MeasureResult } from './ports.js'
import type {
  CodeSpec,
  PdfTargetSpec,
  RawMeasurement,
  ViewportPx,
} from './types.js'
import type { ChartSpec, ElementRenderSpec } from '../render/types.js'
import type { FitFontSize } from '../render/text-fit.js'

/**
 * 共享 DOM 宿主 runtime：把「载入 → 注入 → 等就绪 → 执行 → 释放」的时序、
 * 超时预算与错误分类集中实现一次。三端只提供 driver。
 *
 * @param bundle       core 自带 DOM 执行器（必需，driver.requiresExecutor=false 时可省）
 * @param chartBundle  图表执行器（旧 API，P4 起由通用 bundles 取代，行为保持不变）
 * @param bundles      通用扩展元素执行器列表，由 collectExecutorBundles() 从注册表收集；
 *                     按 version 幂等注入，文档重建后重新注入
 */
export function createDomHostRuntime(
  factory: DriverFactory,
  bundle?: ExecutorBundle,
  chartBundle?: ExecutorBundle,
  bundles: readonly ExecutorBundle[] = [],
): PrintRuntime {
  return {
    async withSession<T>(options: SessionBudget, fn: (session: PrintSession) => Promise<T>): Promise<T> {
      const driver = await factory.createDriver()
      const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      const readinessMs = options.readinessMs ?? DEFAULT_READINESS_MS
      const budget = (): number => Math.max(1, deadline - Date.now())

      const fail = (
        err: unknown,
        code: Parameters<typeof toPrintFailure>[1],
        context: string,
      ): PrintFailure => toPrintFailure(err, code, context)

      let injected = false
      let chartInjected = false
      let pluginInjected = false
      const ensureExecutor = async (): Promise<void> => {
        if (injected) return
        if (driver.requiresExecutor === false) {
          injected = true
          return
        }
        if (!bundle) throw new PrintFailure('INTERNAL', '缺少 core DOM 执行器产物')
        await driver.injectExecutor(bundle)
        injected = true
      }
      // 图表执行器为可选产物：浏览器进程内直调时由 job.chartRenderer 覆盖，不需要注入
      const ensureChartExecutor = async (): Promise<void> => {
        if (chartInjected) return
        if (driver.requiresExecutor === false) {
          chartInjected = true
          return
        }
        if (!chartBundle) {
          throw new PrintFailure('UNSUPPORTED_RUNTIME', '缺少图表执行器产物（请安装 @worm-vue3-print/echarts 并传入 chartBundle）')
        }
        await driver.injectExecutor(chartBundle)
        chartInjected = true
      }
      // 通用扩展元素执行器：按 version 幂等，文档重建后重新注入（三端零改动自动装配，P4 启用）
      const ensurePluginBundles = async (): Promise<void> => {
        if (pluginInjected) return
        if (driver.requiresExecutor === false) {
          pluginInjected = true
          return
        }
        const seen = new Set<string>()
        for (const extra of bundles) {
          if (seen.has(extra.version)) continue
          seen.add(extra.version)
          await driver.injectExecutor(extra)
        }
        pluginInjected = true
      }
      const load = async (html: string, viewport: ViewportPx): Promise<void> => {
        await driver.open(viewport)
        await driver.setContent(html)
        injected = false
        chartInjected = false
        pluginInjected = false
        await ensureExecutor()
        await driver.evaluate<void>('waitReady', [readinessMs])
      }

      const session: PrintSession = {
        async renderCodes(specs: CodeSpec[]): Promise<Map<string, string>> {
          if (specs.length === 0) return new Map()
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await ensureExecutor()
                const map = await driver.evaluate<Record<string, string>>('renderCodes', [specs])
                return new Map(Object.entries(map))
              } catch (err) {
                throw fail(err, 'INTERNAL', '码值渲染失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `码值渲染超过 ${ms}ms`,
          )
        },

        async renderCharts(specs: ChartSpec[]): Promise<Map<string, string>> {
          if (specs.length === 0) return new Map()
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await ensureExecutor()
                await ensureChartExecutor()
                const map = await driver.evaluate<Record<string, string>>('renderCharts', [specs])
                return new Map(Object.entries(map))
              } catch (err) {
                throw fail(err, 'INTERNAL', '图表渲染失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `图表渲染超过 ${ms}ms`,
          )
        },

        async renderAssets(specs: ElementRenderSpec[]): Promise<Map<string, string>> {
          if (specs.length === 0) return new Map()
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await ensureExecutor()
                await ensurePluginBundles()
                // 兼容桥（P4）：宿主仍按旧三参数装配、未传通用 bundles 时，第三参数的
                // 执行器产物继续承担扩展元素出图，保证已装包宿主零改动。P5 收尾后本分支自然空转。
                if (bundles.length === 0) await ensureChartExecutor()
                // 别名桥反查：插件登记旧名 → 通用名后，主体调用通用名会落到执行器真实提供的旧名，
                // 主体源码因此不含任何具体元素类型名（§3.9）
                const method = resolveExecutorMethod('renderAssets') as ExecutorMethod
                const map = await driver.evaluate<Record<string, string>>(method, [specs])
                return new Map(Object.entries(map ?? {}))
              } catch (err) {
                throw fail(err, 'INTERNAL', '扩展元素渲染失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `扩展元素渲染超过 ${ms}ms`,
          )
        },

        async measure(html: string, viewport: ViewportPx): Promise<MeasureResult> {
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await load(html, viewport)
                // 自动缩小必须先于读测量：字号变化会改变元素高度与行高，
                // 顺序颠倒会得到与最终渲染不一致的分页输入
                const fits = (await driver.evaluate<FitFontSize[] | undefined>('applyTextFit')) ?? []
                const measurements = await driver.evaluate<RawMeasurement[]>('readMeasurements')
                return { measurements, fits }
              } catch (err) {
                throw fail(err, 'MEASURE_FAILED', '测量失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `测量超过 ${ms}ms`,
          )
        },

        async probeContentBottom(html: string, viewport: ViewportPx): Promise<number> {
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await load(html, viewport)
                return await driver.evaluate<number>('readContentBottom')
              } catch (err) {
                throw fail(err, 'MEASURE_FAILED', '连续纸探针失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `连续纸探针超过 ${ms}ms`,
          )
        },

        async toPdf(html: string, spec: PdfTargetSpec, viewport: ViewportPx): Promise<Uint8Array> {
          if (!driver.pdf) throw new PrintFailure('UNSUPPORTED_RUNTIME', '当前宿主不支持生成 PDF')
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await load(html, viewport)
                return await driver.pdf!(html, spec)
              } catch (err) {
                throw fail(err, 'PDF_FAILED', 'PDF 生成失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `PDF 生成超过 ${ms}ms`,
          )
        },
      }

      try {
        return await fn(session)
      } finally {
        try {
          await driver.close()
        } catch {
          // 释放失败不影响任务结果
        }
      }
    },
  }
}
