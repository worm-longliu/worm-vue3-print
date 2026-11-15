// @worm-vue3-print/plugin-kit —— 框架无关的插件设计器 UI 契约与注册表。
//
// 插件作者：用 defineElementUI 声明一份 DOM 渲染能力，在包入口调用 registerElementUI 即生效。
// 宿主：canvas（Vue 3）自动生成桥接组件，common（零框架）直接挂载 DOM 节点。
export { defineElementUI, registerElementUI, getElementUI, getElementUIEntries, getElementUIs, getElementUITypes, subscribeElementUIRegistry, clearElementUIs } from './registry.js'
export { TOOLBAR_OVERFLOW_KEY } from './toolbar-overflow-key.js'
export type {
  ElementUI,
  ElementUIEntry,
  ElementUICanvasContext,
  ElementUIPropertyContext,
  ElementUINode,
  ElementUIResultObject,
  ElementUIRenderResult,
} from './types.js'
