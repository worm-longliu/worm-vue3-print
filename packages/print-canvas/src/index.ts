// @worm-vue3-print/canvas 入口：Vue 3 可视化打印模板设计器画布
// 开源核心不含 Element Plus 与宿主业务逻辑；保存/字段/截图/上传/业务字典由宿主注入。
// 模板模型、通用工具与设计器内核已下沉至 @worm-vue3-print/core/designer，
// 浏览器渲染适配器位于 @worm-vue3-print/core/browser。

// 主组件
export { default as PrintDesigner } from './components/PrintDesigner.vue'

// 浏览器端 HTML 打印预览（不依赖服务端 PDF）
export { default as PrintHtmlPreview } from './components/PrintHtmlPreview.vue'
export { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'

// 类型与宿主能力契约（TemplateData/RuntimeElement/PrintBusinessField/
// ScreenshotRequest/RequestScreenshotFn/UploadImageFn 等）
export type * from '@worm-vue3-print/core/designer'

// 模板工厂与示例数据
export { createDefaultTemplate, toRuntimePool } from './composables/useDesignerState'
export type { DesignerStateOptions } from './composables/useDesignerState'
export { DEFAULT_DEMO_DATA, getDemoData } from '@worm-vue3-print/core/designer'

// 宿主能力注入键（高级自定义可选；常规接入仅需给 PrintDesigner 传 props）
export { UPLOAD_IMAGE_KEY } from './composables/useHostAdapter'
