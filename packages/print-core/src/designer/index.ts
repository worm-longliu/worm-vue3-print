// @worm-vue3-print/core/designer
// 可视化设计器的框架无关内核：模板模型类型、通用工具、纯交互算法。
// 不依赖 Vue / React / Lit，宿主 UI 包在此之上实现各自的响应式适配层。
// 注意：本子路径的 TemplateData/PaperSize 等是「设计器完整模型」，
// 与主入口 render 管线的简化同名类型有意分离，故不从主入口转出。

// ─── 模板模型与宿主能力契约类型 ───
export * from './types.js'

// ─── 通用工具 ───
export * from './utils/units.js'
export * from './utils/scale.js'
export * from './utils/migrate.js'
export * from './utils/default-config.js'
export * from './utils/table-matrix.js'
export * from './utils/element-factory.js'
export * from './utils/zone-layout.js'
export * from './utils/ruler.js'
export * from './utils/preset-colors.js'
export * from './utils/property-search.js'
export * from './utils/field-groups.js'
export * from './utils/binding-registry.js'
export * from './utils/demo-data.js'
export * from './utils/engine.js'
export * from './utils/expression-eval.js'
export * from './utils/binding.js'

// ─── 纯交互逻辑（无框架依赖；DOM 事件绑定仅限浏览器环境） ───
export * from './interactions/adsorb.js'
export * from './interactions/useAlign.js'
export * from './interactions/useGroup.js'
export * from './interactions/useKeyboard.js'
export * from './interactions/useResize.js'
export * from './interactions/useBindingDisplay.js'
