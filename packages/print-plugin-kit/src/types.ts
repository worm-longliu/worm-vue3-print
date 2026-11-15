// 框架无关的插件设计器 UI 契约：插件只写一份 DOM 渲染能力，宿主负责挂载与事件接线。
//
// 设计边界：
// - 本包不依赖 Vue / React / 任何 UI 组件库，只依赖 core 的类型（RuntimeElement / ElementOptions / PrintBusinessField）。
// - 渲染结果是「HTML 字符串或 DOM 节点」，由宿主决定放进 Shadow DOM（common）还是 Vue 组件容器（canvas）。
// - 宿主通过 update(partial) 写回 element.options，历史记录与画布重绘由宿主负责，插件不直接碰 store。
import type { ElementOptions, PrintBusinessField, RuntimeElement } from '@worm-vue3-print/core/designer'

/** 插件产出的可视内容：HTML 字符串或真实 DOM 节点 */
export type ElementUINode = string | Node

/** 带生命周期的渲染结果：宿主在重绘/卸载时调用 dispose 释放监听、图表实例等资源 */
export interface ElementUIResultObject {
  node: ElementUINode
  dispose?: () => void
}

export type ElementUIRenderResult = ElementUINode | ElementUIResultObject

/** 画布内渲染上下文（与 canvas 扩展组件的 props 同口径） */
export interface ElementUICanvasContext {
  element: RuntimeElement
  /** 设计态示例数据：数组信封，data[0] 即数据根对象（与 canvas 扩展组件一致） */
  data?: readonly Record<string, unknown>[]
  /** 设计态为 true；宿主未来做只读预览时可传 false */
  designMode?: boolean
}

/**
 * 属性台「自定义属性」渲染上下文。
 * 插件只通过 update 写回，宿主负责写入模板、记历史与重绘画布/属性台。
 */
export interface ElementUIPropertyContext {
  element: RuntimeElement
  /** 设计态示例数据：数组信封，data[0] 即数据根对象 */
  data?: readonly Record<string, unknown>[]
  /**
   * 宿主的业务字段清单（fieldKey / fieldLabel / fieldType）。
   * 图表类插件据此生成「数据源 / 类目 / 数值字段」下拉，不必再从 demo 数据的键里猜；
   * 未注入时为 undefined 或空数组，插件应自行回落到 data[0] 的键。
   */
  fields?: readonly PrintBusinessField[]
  /** 把补丁合并进 element.options 并通知宿主（宿主保证同步生效并记一条历史） */
  update(partial: Partial<ElementOptions>): void
  /** 仅请求宿主重绘，不写数据、不记历史（面板内部态变化用） */
  repaint(): void
}

/**
 * 一份插件设计器 UI，可覆盖同一插件的多个元素类型。
 * 同一 type 后注册者覆盖前者；注册与注销都是幂等的。
 */
export interface ElementUI {
  /** 覆盖的元素类型，必须与 core 插件注册表里的 kind.type 对齐 */
  readonly types: readonly string[]
  /** 画布内渲染：返回 HTML 字符串或 DOM 节点 */
  renderCanvas(ctx: ElementUICanvasContext): ElementUIRenderResult
  /** 属性台「自定义属性」内容；不提供则该元素没有自定义属性页签 */
  renderProperty?(ctx: ElementUIPropertyContext): ElementUIRenderResult
  /** 实例级判据：返回 false 时不显示自定义属性页签；缺省视为有 renderProperty 即显示 */
  hasProperties?(element: RuntimeElement): boolean
  /** 素材卡分组（与 core kind.designer.materialCard.group 同义）；宿主优先取 core，缺省回落到这里 */
  readonly group?: string
  /** 属性搜索关键词；缺省由宿主按元素标签/类型名兜底 */
  readonly searchKeywords?: readonly string[]
  /** 宿主注入到自身样式作用域：common 注入 Shadow DOM，canvas 注入 document.head */
  readonly styles?: string
}

/** 类型→UI 的解析视图（供宿主遍历注册态） */
export interface ElementUIEntry {
  type: string
  ui: ElementUI
}
