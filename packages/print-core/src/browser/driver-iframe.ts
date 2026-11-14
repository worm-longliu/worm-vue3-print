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
          // 通用分派：core 自带的执行器方法直调；未内置的（图表 / 扩展元素批量出图等）
          // 由插件注入的全局入口按同名方法提供，主体不认识任何具体方法名。
          const own = (domExecutor as unknown as Record<string, unknown>)[method]
          if (typeof own !== 'function') {
            const holder = ((iframe.contentWindow as unknown as Record<string, any> | null)?.__wormDom
              ?? (globalThis as Record<string, any>).__wormDom) as Record<string, unknown> | undefined
            const fn = holder?.[method]
            if (typeof fn !== 'function') throw new Error(`执行器方法 ${method} 未注入`)
            return (fn as (...fnArgs: unknown[]) => unknown)(...(args ?? [])) as T
          }
          const payload = args ?? []
          const target = EXECUTOR_TARGETS[method]
          const call = own as (...fnArgs: unknown[]) => unknown
          if (target === 'window') return call(iframe.contentWindow as Window, ...payload) as T
          if (target === 'document') return call(doc, ...payload) as T
          return call(...payload) as T
        },
        async close(): Promise<void> {
          iframe.remove()
        },
      }
    },
  }
}
