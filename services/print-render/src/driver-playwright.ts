import type { Page } from 'playwright'
import { EXECUTOR_TARGETS, toPlaywrightPdfOptions } from '@worm-vue3-print/core'
import type {
  DriverFactory,
  ExecutorBundle,
  ExecutorMethod,
  PageDriver,
  PdfTargetSpec,
  ViewportPx,
} from '@worm-vue3-print/core'
import { BrowserPool } from './browser-pool.js'

class PlaywrightDriver implements PageDriver {
  /**
   * 已注入执行器的版本集合：同一文档内幂等，且 core 执行器与图表执行器是两份独立 IIFE，
   * 不能只用一个布尔标记（否则第二份会被跳过）。文档重建后清空。
   */
  private readonly injected = new Set<string>()

  constructor(private readonly page: Page, private readonly pool: BrowserPool) {}

  async open(viewport: ViewportPx): Promise<void> {
    await this.page.setViewportSize(viewport)
  }

  async setContent(html: string): Promise<void> {
    // 就绪等待交给 core 执行器的 waitReady，这里只保证「可执行脚本」
    await this.page.setContent(html, { waitUntil: 'domcontentloaded' })
    this.injected.clear()
  }

  async injectExecutor(bundle: ExecutorBundle): Promise<void> {
    if (this.injected.has(bundle.version)) return
    await this.page.addScriptTag({ content: bundle.source })
    this.injected.add(bundle.version)
  }

  async evaluate<T>(method: ExecutorMethod, args: unknown[] = []): Promise<T> {
    return this.page.evaluate(
      ({ name, payload, target }) => {
        const dom = (globalThis as Record<string, any>).__wormDom
        if (!dom) throw new Error('DOM 执行器未注入')
        const fn = dom[name]
        if (typeof fn !== 'function') throw new Error(`执行器缺少方法：${name}`)
        if (target === 'none') return fn(...payload)
        return fn(target === 'window' ? window : document, ...payload)
      },
      { name: method, payload: args, target: EXECUTOR_TARGETS[method] },
    ) as Promise<T>
  }

  async pdf(_html: string, spec: PdfTargetSpec): Promise<Uint8Array> {
    return new Uint8Array(await this.page.pdf(toPlaywrightPdfOptions(spec)))
  }

  async close(): Promise<void> {
    await this.pool.release(this.page)
  }
}

/** 每任务一个 driver：BrowserPool 的 acquire/release 本身即「请求级绑定」 */
export function createPlaywrightDriverFactory(pool: BrowserPool = BrowserPool.getInstance()): DriverFactory {
  return {
    async createDriver(): Promise<PageDriver> {
      return new PlaywrightDriver(await pool.acquire(), pool)
    },
  }
}
