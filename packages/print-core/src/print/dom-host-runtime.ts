import { PrintFailure, toPrintFailure, withTimeout } from './errors.js'
import { DEFAULT_READINESS_MS, DEFAULT_TIMEOUT_MS } from './ports.js'
import type { DriverFactory, ExecutorBundle, PageDriver } from './driver.js'
import type { PrintRuntime, PrintSession, SessionBudget, MeasureResult } from './ports.js'
import type {
  CodeSpec,
  PdfTargetSpec,
  RawMeasurement,
  ScreenshotTargetSpec,
  ViewportPx,
} from './types.js'
import type { FitFontSize } from '../render/text-fit.js'

/**
 * 共享 DOM 宿主 runtime：把「载入 → 注入 → 等就绪 → 执行 → 释放」的时序、
 * 超时预算与错误分类集中实现一次。三端只提供 driver。
 */
export function createDomHostRuntime(factory: DriverFactory, bundle?: ExecutorBundle): PrintRuntime {
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
      const load = async (html: string, viewport: ViewportPx): Promise<void> => {
        await driver.open(viewport)
        await driver.setContent(html)
        injected = false
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

        async toScreenshot(
          html: string,
          spec: ScreenshotTargetSpec,
          viewport: ViewportPx,
        ): Promise<Uint8Array> {
          if (!driver.screenshot) throw new PrintFailure('UNSUPPORTED_RUNTIME', '当前宿主不支持截图')
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await load(html, viewport)
                return await driver.screenshot!(html, spec)
              } catch (err) {
                throw fail(err, 'SCREENSHOT_FAILED', '截图失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `截图超过 ${ms}ms`,
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
