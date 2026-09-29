// 浏览器直挂入口（UMD）：无构建器的宿主（jQuery / 原生页面）用 <script src> 引入。
// 与 index.ts 的差别：① core 与码制库全部内联（不走 bare import）；
// ② 样式由组件 Shadow DOM 内联注入，dist/common.css 只是 light DOM 形态的可选兜底，故此处不引 CSS；
// ③ 额外把出纸要用的 core 能力一并挂上全局——直挂宿主拿不到 `@worm-vue3-print/core` 的裸包名，
//   没有这两组入口就无法在同一个 <script> 里完成「浏览器渲染 → 打印 / 静默打印」；
//   纸张几何工具同理由本包代供，宿主自绘模板缩略图时不必再引 core。
import * as CommonIndex from './index'
import { getPaperDimensions, isContinuousPaperSize, getByPath } from '@worm-vue3-print/core'
import { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'
import { PrintClient, WormPrintError } from '@worm-vue3-print/core/client'

/**
 * 全局句柄必须自己拼：UMD 的 global 分支在部分打包配置下不稳定，
 * 只靠 `export *` 时直挂宿主拿不到 core 的那几组入口。
 */
const WormPrintCommon = {
  ...CommonIndex,
  renderHtmlPages,
  browserCodeRenderer,
  PrintClient,
  WormPrintError,
  getPaperDimensions,
  isContinuousPaperSize,
  getByPath,
}
;(globalThis as Record<string, unknown>).WormPrintCommon ??= WormPrintCommon

export * from './index'
export { renderHtmlPages, browserCodeRenderer, PrintClient, WormPrintError }
export { getPaperDimensions, isContinuousPaperSize, getByPath }
