// @worm-vue3-print/canvas 入口：Vue 3 可视化打印模板设计器画布
// 开源核心不含 Element Plus 与宿主业务逻辑；保存/字段/上传/业务字典由宿主注入。
// 模板模型、通用工具与设计器内核已下沉至 @worm-vue3-print/core/designer，
// 浏览器渲染适配器位于 @worm-vue3-print/core/browser。

// 主组件
export { default as PrintDesigner } from './components/PrintDesigner.vue'

// 浏览器端 HTML 打印预览（不依赖服务端 PDF）
export { default as PrintHtmlPreview } from './components/PrintHtmlPreview.vue'
export { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'

// 类型与宿主能力契约（TemplateData/RuntimeElement/PrintBusinessField/
// UploadImageFn 等）
export type * from '@worm-vue3-print/core/designer'

// 模板工厂与示例数据
export { createDefaultTemplate, toRuntimePool } from './composables/useDesignerState'
export type { DesignerStateOptions } from './composables/useDesignerState'
export { DEFAULT_DEMO_DATA, getDemoData } from '@worm-vue3-print/core/designer'

// 宿主能力注入键（高级自定义可选；常规接入仅需给 PrintDesigner 传 props）
export { UPLOAD_IMAGE_KEY, UPLOAD_DESIGN_BACKGROUND_KEY, FONT_CATALOG_KEY } from './composables/useHostAdapter'
export type { FontOption } from './composables/useFontCatalog'

// 元素扩展注册表：内置 13 种之外的元素（如图表）由独立可选包注册，
// 未安装可选包时素材卡不显示、画布渲染占位，canvas 主包不引入任何图表库。
export {
  registerElementExtension,
  unregisterElementExtension,
  getElementExtensions,
  getElementExtension,
  clearElementExtensions,
  resolveElementPropertyTab,
  CUSTOM_PROPERTY_TAB_LABEL,
  CUSTOM_PROPERTY_GROUP,
} from './composables/useElementExtensionRegistry'
export type {
  ElementExtension,
  ElementComponentProps,
  ElementPropertyTab,
  ResolvedElementPropertyTab,
  PropertyTabKey,
} from './composables/useElementExtensionRegistry'

// 顶部条自适应收纳机制（宿主自己的工具栏/操作条可复用同一链序与判定）：
// 宿主用 provideToolbarOverflow 创建上下文、v-overflow-unit 注册单元、
// 单元元素必须由宿主模板内联渲染并包 <Teleport>（包一层组件会丢 scoped 属性，退化成 block）。
// 收纳判定的纯函数在 @worm-vue3-print/core/designer（resolveToolbarOverflow）。
export {
  provideToolbarOverflow,
  useToolbarOverflow,
  emptyToolbarOverflow,
  createOverflowUnitDirective,
  TOOLBAR_OVERFLOW,
} from './composables/useToolbarOverflow'
export type { ToolbarOverflowContext, OverflowUnitDef } from './composables/useToolbarOverflow'
