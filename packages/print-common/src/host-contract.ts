// @worm-vue3-print/common — <print-designer> 宿主契约（机器可读的版本化单一真源）
//
// 过去 attributes / properties / methods / 事件 detail 只散落在 README 的散文里，
// 宿主靠抄代码接入，契约漂移无法被自动发现。本文件把它们收敛成类型 + 常量：
// - 契约测试逐项对照运行时实现，缺一个方法/事件即红；
// - 宿主用 PrintDesignerEventMap 给 addEventListener 标注 detail 类型；
// - 运行时可查 PRINT_DESIGNER_CONTRACT_VERSION / getHostContract() 做兼容判断。
//
// 版本规则（语义化）：
//   MAJOR：移除/改名 attribute、property、方法或事件，或改变 detail 形状；
//   MINOR：新增可选项（新事件、新方法、新 part、新 CSS 变量），老宿主不需改；
//   PATCH：文档/注释、不改变可观察行为。
import type { MultiPageTemplateData, PrintBusinessField, TemplateData } from '@worm-vue3-print/core/designer'
import type { PrintFontDeclaration } from '@worm-vue3-print/core'

/** 宿主契约版本；每次改动可观察面必须同步升号 */
export const PRINT_DESIGNER_CONTRACT_VERSION = '1.0.0'

/** 自定义元素标签名 */
export const PRINT_DESIGNER_TAG = 'print-designer' as const

/** 会触发 attributeChangedCallback 的声明式 attribute（字符串形态） */
export const PRINT_DESIGNER_ATTRIBUTES = [
  'template', 'fields', 'name', 'fonts', 'design-data',
] as const
export type PrintDesignerAttribute = typeof PRINT_DESIGNER_ATTRIBUTES[number]

/** 只走 property 的开关（不进 observedAttributes，写 setAttribute 只影响样式/语义） */
export const PRINT_DESIGNER_BOOLEAN_ATTRIBUTES = ['is-edit', 'show-help'] as const
export type PrintDesignerBooleanAttribute = typeof PRINT_DESIGNER_BOOLEAN_ATTRIBUTES[number]

/** 设计态示例数据的数组信封（data[0] 为数据根对象） */
export type PrintDesignerDesignData = readonly Record<string, unknown>[]

/** 元素支持的 property：对象/函数只能走 property，字符串可走 attribute */
export interface PrintDesignerProperties {
  /** 写入模板（对象或 JSON 串）；读回为当前画布的 JSON 字符串 */
  template: TemplateData | MultiPageTemplateData | string
  /** 业务字段清单（对象数组或 JSON 串） */
  fields: readonly PrintBusinessField[] | string
  /** 模板级字体声明；注入 @font-face 并随保存写回模板 */
  fonts: readonly PrintFontDeclaration[] | undefined
  /** 设计态示例数据；单个对象、对象数组或 JSON 串都可 */
  designData: PrintDesignerDesignData | Record<string, unknown> | string | undefined
  /** 是否处于编辑模式（同时写 is-edit attribute） */
  isEdit: boolean
  /** 是否显示帮助入口（同时写 show-help attribute） */
  showHelp: boolean
  /** 宿主提供的图片上传回调；未注入时素材台的图片入口回落到内置行为 */
  uploadImage?: (file: File) => Promise<string> | string
  /** 宿主提供的设计背景上传回调 */
  uploadDesignBackground?: (file: File) => Promise<string> | string
}

/** 方法的返回类型契约 */
export interface PrintDesignerMethods {
  /** 取当前模板 JSON 字符串（旁路，不触发拼版校验） */
  getTemplateJson(): string
  /** 载入模板（对象或 JSON 串） */
  loadTemplate(input: unknown): void
  /** 触发保存：先校验拼版、再派发 save 事件 */
  save(): void
  /** 拼版/多页配置校验；宿主旁路导出前应自行调用 */
  validateTemplate(): Array<{ message: string }>
  /** 出纸裁切预估提示（不阻断保存） */
  getGeometryWarnings(): string[]
}

/** 事件 detail 联合：宿主按事件名即可推出载荷类型，不必再猜 */
export interface PrintDesignerEventMap {
  /** 模板 JSON 字符串 */
  save: string
  /** 模板 JSON 字符串（与 canvas 的无载荷 @preview 不同，这里是刻意扩展） */
  preview: string
  /** 帮助入口被点击；无载荷 */
  help: undefined
  /** 元素双击；detail 就是元素 id 字符串，不要 JSON.parse */
  'dblclick-element': string
  /** 表格单元格双击 */
  'dblclick-cell': {
    elementId: string
    r: number
    c: number
    cellId?: string
  }
}

export type PrintDesignerEventName = keyof PrintDesignerEventMap

/** 带类型的 CustomEvent；宿主 addEventListener 的 e 可用它标注 */
export type PrintDesignerCustomEvent<K extends PrintDesignerEventName> =
  CustomEvent<PrintDesignerEventMap[K]>

/** 所有事件均为 bubbles + composed（可穿透 Shadow DOM 宿主边界） */
export const PRINT_DESIGNER_EVENT_OPTIONS: Readonly<{ bubbles: true; composed: true }> =
  Object.freeze({ bubbles: true, composed: true })

/**
 * Shadow DOM 里的 `::part` 挂钩：宿主可有限定制外壳，不必覆盖私有 DOM。
 * 只允许改这里列出的容器级外观；元素级样式请用 core 的主题令牌。
 */
export const PRINT_DESIGNER_PARTS = [
  'container',        // 根容器 .designer-container
  'toolbar',          // 顶栏
  'format-bar',       // 格式栏
  'left-panel',       // 素材台/字段/图层
  'canvas-area',      // 画布区
  'property-panel',   // 属性台
  'status-bar',       // 状态栏
  'page-tabs',        // 页签栏
] as const
export type PrintDesignerPart = typeof PRINT_DESIGNER_PARTS[number]

/**
 * 共享主题令牌（宿主最常覆盖的一组）：权威且完整的清单在
 * `@worm-vue3-print/core/styles/theme.css` 的 `:root`（共 52 个 --pd-* 变量）。
 * 宿主在自己的 CSS 里覆盖同名变量即可换肤；不要写死颜色到 Shadow DOM 内部选择器。
 */
export const PRINT_DESIGNER_THEME_TOKENS = [
  '--pd-bg', '--pd-surface', '--pd-sidebar', '--pd-canvas-bg', '--pd-paper',
  '--pd-text', '--pd-text-muted', '--pd-text-faint', '--pd-border', '--pd-border-soft',
  '--pd-accent', '--pd-accent-soft', '--pd-hover-tint', '--pd-danger', '--pd-radius',
] as const
export type PrintDesignerThemeToken = typeof PRINT_DESIGNER_THEME_TOKENS[number]

/** 完整契约描述（供文档生成、宿主自检与契约测试共用） */
export interface PrintDesignerHostContract {
  version: typeof PRINT_DESIGNER_CONTRACT_VERSION
  tag: typeof PRINT_DESIGNER_TAG
  attributes: readonly PrintDesignerAttribute[]
  booleanAttributes: readonly PrintDesignerBooleanAttribute[]
  events: readonly PrintDesignerEventName[]
  parts: readonly PrintDesignerPart[]
  themeTokens: readonly PrintDesignerThemeToken[]
  /** 方法名清单（类型面见 PrintDesignerMethods） */
  methods: readonly (keyof PrintDesignerMethods)[]
  /** property 名清单（类型面见 PrintDesignerProperties） */
  properties: readonly (keyof PrintDesignerProperties)[]
}

export const PRINT_DESIGNER_METHODS: readonly (keyof PrintDesignerMethods)[] = [
  'getTemplateJson', 'loadTemplate', 'save', 'validateTemplate', 'getGeometryWarnings',
]

export const PRINT_DESIGNER_PROPERTY_NAMES: readonly (keyof PrintDesignerProperties)[] = [
  'template', 'fields', 'fonts', 'designData', 'isEdit', 'showHelp',
  'uploadImage', 'uploadDesignBackground',
]

/** 事件名的具名常量：实现侧派发事件时引用这里，避免契约表与运行时字符串漂移 */
export const PRINT_DESIGNER_EVENT = Object.freeze({
  save: 'save',
  preview: 'preview',
  help: 'help',
  dblclickElement: 'dblclick-element',
  dblclickCell: 'dblclick-cell',
} as const satisfies Record<string, PrintDesignerEventName>)

export const PRINT_DESIGNER_EVENTS: readonly PrintDesignerEventName[] = [
  PRINT_DESIGNER_EVENT.save, PRINT_DESIGNER_EVENT.preview, PRINT_DESIGNER_EVENT.help,
  PRINT_DESIGNER_EVENT.dblclickElement, PRINT_DESIGNER_EVENT.dblclickCell,
]

/** 返回机器可读的契约快照；宿主可在挂载前判断版本是否兼容 */
export function getHostContract(): PrintDesignerHostContract {
  return {
    version: PRINT_DESIGNER_CONTRACT_VERSION,
    tag: PRINT_DESIGNER_TAG,
    attributes: PRINT_DESIGNER_ATTRIBUTES,
    booleanAttributes: PRINT_DESIGNER_BOOLEAN_ATTRIBUTES,
    events: PRINT_DESIGNER_EVENTS,
    parts: PRINT_DESIGNER_PARTS,
    themeTokens: PRINT_DESIGNER_THEME_TOKENS,
    methods: PRINT_DESIGNER_METHODS,
    properties: PRINT_DESIGNER_PROPERTY_NAMES,
  }
}
