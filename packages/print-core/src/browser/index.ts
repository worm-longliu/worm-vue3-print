// @worm-vue3-print/core/browser
// 渲染管线的浏览器侧适配器：隐藏 iframe 两遍渲染分页 + jsbarcode/qrcode 码制渲染。
// 仅可在浏览器环境使用（依赖 document / DOM 测量）。

export { renderHtmlPages } from './browser-pagination.js'
export type { BrowserRenderResult, BrowserRenderOptions } from './browser-pagination.js'
export { browserCodeRenderer } from './browser-code-renderer.js'
export { createBrowserPrintRuntime } from './browser-runtime.js'
export { createIframeDriverFactory } from './driver-iframe.js'
export {
  domExecutor,
  EXECUTOR_VERSION,
  waitReady,
  readMeasurements,
  readContentBottom,
  renderCodes,
} from './dom-executor.js'
/** 自动缩小：applyTextFit 处理整个文档；fitTextNode 处理单个节点（设计器画布复用） */
export { applyTextFit, fitTextNode } from './text-fit-dom.js'
