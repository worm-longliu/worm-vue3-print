export { PrintDesignerElement, definePrintDesigner } from './print-designer'
import { definePrintDesigner } from './print-designer'
export { DesignerStore, TILING_SINGLE_PAGE_TIP, toRuntimePool, serializePage } from './core/store'
export type { DesignerOptions } from './core/store'
export { createDefaultTemplate } from './core/default-template'

// 类型与宿主契约与 canvas 同源，避免两套定义漂移
export type {
  ElementType, ElementZone, MultiPageTemplateData, PrintBusinessField,
  RuntimeElement, TableSelection, TemplateData,
} from '@worm-vue3-print/core/designer'

/** 一次性注册全部自定义元素；宿主按需调用，避免自动注册污染全局 */
export function registerAll() {
  return definePrintDesigner()
}
