import { domExecutor } from './dom-executor.js'
import { EXECUTOR_TARGETS } from '../print/driver.js'
import type { DriverFactory, ExecutorBundle, ExecutorMethod, PageDriver } from '../print/driver.js'
import type { ViewportPx } from '../print/types.js'

/** 浏览器 iframe driver：进程内直调执行器，无需注入脚本；不提供出图能力 */
export function createIframeDriverFactory(): DriverFactory {
  return {
    async createDriver(): Promise<PageDriver> {
      const iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.style.cssText =
        'position:fixed;left:-10000px;top:0;border:0;visibility:hidden;pointer-events:none;'
      document.body.appendChild(iframe)
      let doc: Document = iframe.contentDocument ?? document

      return {
        requiresExecutor: false,
        async open(viewport: ViewportPx): Promise<void> {
          iframe.style.width = `${viewport.width}px`
          iframe.style.height = `${viewport.height}px`
          doc = iframe.contentDocument ?? document
        },
        async setContent(html: string): Promise<void> {
          doc = iframe.contentDocument ?? document
          doc.open()
          doc.write(html)
          doc.close()
        },
        async injectExecutor(_bundle: ExecutorBundle): Promise<void> {
          // 进程内直调 domExecutor，无需注入
        },
        async evaluate<T>(method: ExecutorMethod, args?: unknown[]): Promise<T> {
          const fn = domExecutor[method] as (...fnArgs: unknown[]) => unknown
          const payload = args ?? []
          const target = EXECUTOR_TARGETS[method]
          if (target === 'window') return fn(iframe.contentWindow as Window, ...payload) as T
          if (target === 'document') return fn(doc, ...payload) as T
          return fn(...payload) as T
        },
        async close(): Promise<void> {
          iframe.remove()
        },
      }
    },
  }
}
