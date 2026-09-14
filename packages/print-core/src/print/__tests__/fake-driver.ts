import type { DriverFactory, ExecutorBundle, PageDriver } from '../driver.js'
import type { RawMeasurement } from '../types.js'

export interface FakeDriverOptions {
  measurements?: RawMeasurement[]
  contentBottomPx?: number
  /** 指定键的 SVG；未指定的规格返回通用假 SVG */
  codeMap?: Record<string, string>
  pdfBytes?: Uint8Array
  screenshotBytes?: Uint8Array
  /** 该原语调用前抛错，用于验证错误归一化（如 'evaluate:readMeasurements'） */
  failAt?: string
  /** 该原语调用前延迟，用于验证超时 */
  delayMs?: number
  supportsPdf?: boolean
  supportsScreenshot?: boolean
}

export function createFakeDriverFactory(options: FakeDriverOptions = {}) {
  const calls: string[] = []
  const documents: string[] = []
  const slow = async (name: string): Promise<void> => {
    calls.push(name)
    if (options.failAt === name) throw new Error(`fake failure at ${name}`)
    if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs))
  }
  const driver: PageDriver = {
    async open() { await slow('open') },
    async setContent(html) { await slow('setContent'); documents.push(html) },
    async injectExecutor() { await slow('injectExecutor') },
    async evaluate<T>(method: string, args?: unknown[]): Promise<T> {
      await slow(`evaluate:${method}`)
      if (method === 'readMeasurements') return (options.measurements ?? []) as T
      if (method === 'readContentBottom') return (options.contentBottomPx ?? 0) as T
      if (method === 'renderCodes') {
        const specs = (args?.[0] ?? []) as Array<{ key: string }>
        const map: Record<string, string> = {}
        for (const spec of specs) map[spec.key] = options.codeMap?.[spec.key] ?? '<svg id="fake"/>'
        return map as T
      }
      return undefined as T
    },
    ...(options.supportsPdf === false
      ? {}
      : { async pdf() { await slow('pdf'); return options.pdfBytes ?? new Uint8Array([1, 2, 3]) } }),
    ...(options.supportsScreenshot === false
      ? {}
      : { async screenshot() { await slow('screenshot'); return options.screenshotBytes ?? new Uint8Array([9]) } }),
    async close() { calls.push('close') },
  }
  const factory: DriverFactory = {
    async createDriver() { calls.push('createDriver'); return driver },
  }
  return { factory, calls, documents, driver }
}

export const EXECUTOR: ExecutorBundle = { source: '/* fake executor */', version: 'test' }
