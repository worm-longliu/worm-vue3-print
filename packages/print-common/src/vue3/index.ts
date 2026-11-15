/**
 * @worm-vue3-print/common/vue3 —— Vue 3 兼容门面。
 *
 * 目的：让原本消费 @worm-vue3-print/canvas 的 Vue 3 宿主只需改依赖与 import，
 * 即可把设计器实现换成零框架的 common（Custom Element），模板 / 事件回调 /
 * ref 方法调用 / 业务逻辑一行不动。主入口仍保持零框架，vue 只是本子路径的可选 peer。
 *
 * 与 canvas 的能力边界见 README「Vue 3 兼容门面」一节：
 * Vue 专属的元素扩展注册表（registerElementExtension 等）不在此提供，
 * 自定义元素请走 @worm-vue3-print/plugin-kit / echarts-common。
 */
export { PrintDesigner } from './PrintDesigner'
export type { PrintDesignerExpose } from './PrintDesigner'
export { PrintHtmlPreview } from './PrintHtmlPreview'
export type { PrintHtmlPreviewExpose } from './PrintHtmlPreview'
export { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'
export { DEFAULT_DEMO_DATA, getDemoData } from '@worm-vue3-print/core/designer'
export { createDefaultTemplate, toRuntimePool } from '@worm-vue3-print/common'

export {
  createToolbarOverflow,
  provideToolbarOverflow,
  useToolbarOverflow,
  emptyToolbarOverflow,
  createOverflowUnitDirective,
  moreSlotId,
  TOOLBAR_OVERFLOW,
} from './toolbarOverflow'
export type { OverflowUnitDef, ToolbarOverflowContext } from './toolbarOverflow'

/** 与 canvas 同源的类型面：宿主 `import type { ... } from '@worm-vue3-print/canvas'` 可直接换包名 */
export type * from '@worm-vue3-print/core/designer'
export type { PrintFontDeclaration } from '@worm-vue3-print/core'
