// @worm-vue3-print/core/browser
// 渲染管线的浏览器侧适配器：隐藏 iframe 两遍渲染分页 + jsbarcode/qrcode 码制渲染。
// 仅可在浏览器环境使用（依赖 document / DOM 测量）。

export { renderHtmlPages } from './browser-pagination.js'
export type { BrowserRenderResult } from './browser-pagination.js'
export { browserCodeRenderer } from './browser-code-renderer.js'
