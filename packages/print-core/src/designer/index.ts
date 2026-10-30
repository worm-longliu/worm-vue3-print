// @worm-vue3-print/core/designer
// 可视化设计器的框架无关内核：模板模型类型、通用工具、纯交互算法。
// 不依赖 Vue / React / Lit，宿主 UI 包在此之上实现各自的响应式适配层。
// 注意：本子路径的 TemplateData/PaperSize 等是「设计器完整模型」，
// 与主入口 render 管线的简化同名类型有意分离，故不从主入口转出。

// ─── 模板模型与宿主能力契约类型 ───
export * from './types.js'

// ─── 文字溢出显示形式的判定（与渲染端共用同一份，避免设计态/出纸两套规则） ───
export * from '../render/text-fit.js'
// 流式列表的排布纯逻辑：三端出纸与两套设计器外壳共用同一份列数/跨列/估算口径
export * from '../render/flow-list.js'

// ─── 条码打印点对齐（与渲染端共用同一份，设计态条宽必须等于出纸条宽） ───
export * from '../render/barcode-dot.js'

// ─── 元素级边框判定（与渲染端共用同一份，画布边框必须等于出纸边框） ───
export * from '../render/element-border.js'

// ─── 剪裁取位与放大的声明单点（与渲染端共用同一份，画布取位必须等于出纸取位） ───
export * from '../render/crop-style.js'

// ─── 元素级旋转的口径单点（与渲染端共用同一份，画布所见必须等于出纸角度） ───
export * from '../render/rotation.js'

// ─── 表格跟随区归属单点（与分页同源）：成员元素 v1 不出旋转输入框、渲染不转 ───
export { collectFollowMemberIds } from '../render/pagination-engine.js'
export type { FollowJudgementInput } from '../render/pagination-engine.js'

// ─── 通用工具 ───
export * from './utils/units.js'
export * from './utils/scale.js'
export * from './utils/toolbar-overflow.js'
export * from './utils/overlay-placement.js'
export * from './utils/migrate.js'
export * from './utils/default-config.js'
export * from './utils/table-matrix.js'
export * from './utils/element-border-edit.js'
// 预览查看缩放的纯逻辑：canvas 的预览组件、无框架外壳的 UMD 命名空间与四个宿主复刻预览层同源
export * from './utils/preview-zoom.js'
export * from './utils/element-factory.js'
export * from './utils/zone-layout.js'
export * from './utils/ruler.js'
export * from './utils/preset-colors.js'
export * from './utils/property-search.js'
export * from './utils/crop-anchor.js'
export * from './utils/field-groups.js'
// 复制文本到系统剪贴板：素材台字段单击复制、表达式弹窗字段复制按钮共用（浏览器环境专用）
export * from './utils/clipboard.js'
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
