import { createDomHostRuntime } from '../print/dom-host-runtime.js'
import { createIframeDriverFactory } from './driver-iframe.js'
import type { PrintRuntime } from '../print/ports.js'

/** 浏览器端 runtime：iframe driver + 进程内执行器；不提供 PDF/截图 */
export function createBrowserPrintRuntime(): PrintRuntime {
  return createDomHostRuntime(createIframeDriverFactory())
}
