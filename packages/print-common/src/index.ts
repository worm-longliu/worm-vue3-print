export { PrintDesignerElement, definePrintDesigner } from './print-designer'
import { definePrintDesigner } from './print-designer'
export { DesignerStore, TILING_SINGLE_PAGE_TIP, toRuntimePool, serializePage } from './core/store'
export type { DesignerOptions } from './core/store'
export { createDefaultTemplate } from './core/default-template'

// ─── 统一元素定义注册表：内置与第三方插件同权，宿主可覆盖素材卡/画布/属性分组 ───
export {
  BUILTIN_ELEMENT_DEFINITIONS,
  getElementDefinition,
  getElementDefinitions,
  getMaterialElementDefinitions,
  getElementPropertyGroup,
  getElementDblEditableField,
  getElementLayerIcon,
  registerElementDefinition,
  registerElementRenderer,
  registerElementRenderers,
  subscribeElementDefinitions,
  resetElementDefinitions,
} from './core/element-definitions'
export type {
  ElementDefinition, ElementContentHost, ElementContentRenderer, ElementPropertyGroup,
} from './core/element-definitions'

// ─── 版本化宿主契约：类型 + 常量 + 运行时自检，宿主不再靠 README 抄接入代码 ───
export {
  PRINT_DESIGNER_CONTRACT_VERSION,
  PRINT_DESIGNER_TAG,
  PRINT_DESIGNER_ATTRIBUTES,
  PRINT_DESIGNER_BOOLEAN_ATTRIBUTES,
  PRINT_DESIGNER_EVENT,
  PRINT_DESIGNER_EVENTS,
  PRINT_DESIGNER_EVENT_OPTIONS,
  PRINT_DESIGNER_PARTS,
  PRINT_DESIGNER_THEME_TOKENS,
  PRINT_DESIGNER_METHODS,
  PRINT_DESIGNER_PROPERTY_NAMES,
  getHostContract,
} from './host-contract'
export type {
  PrintDesignerAttribute, PrintDesignerBooleanAttribute, PrintDesignerDesignData,
  PrintDesignerProperties, PrintDesignerMethods, PrintDesignerEventMap,
  PrintDesignerEventName, PrintDesignerCustomEvent, PrintDesignerPart,
  PrintDesignerThemeToken, PrintDesignerHostContract,
} from './host-contract'

// ─── core 元素能力位：宿主/插件可声明区域、旋转、边框、绑定与出厂默认 ───
export {
  BUILTIN_ELEMENT_CAPABILITIES,
  getElementCapabilities,
  getElementCapabilityTypes,
  registerElementCapabilities,
  resetElementCapabilities,
} from '@worm-vue3-print/core/designer'
export type { ElementCapabilities, ResolvedElementCapabilities } from '@worm-vue3-print/core/designer'

// 类型与宿主契约与 canvas 同源，避免两套定义漂移
export type {
  ElementType, ElementZone, MultiPageTemplateData, PrintBusinessField,
  RuntimeElement, TableSelection, TemplateData,
} from '@worm-vue3-print/core/designer'

/** 一次性注册全部自定义元素；宿主按需调用，避免自动注册污染全局 */
export function registerAll() {
  return definePrintDesigner()
}
