// @worm-vue3-print/core/designer — 通用元素插件注册表
//
// 主体只提供机制，不内置任何具体元素类型知识：插件包用 defineElementPlugin 声明
// 「元素种类 / 属性元数据 / 数据绑定 / 渲染与执行器 / 设计器组件 / 属性台 tab」，
// 在包入口 import 时调用 registerElementPlugin 即可生效。
//
// 设计约束：
// - 纯 TS，不依赖 Vue / 渲染库 / DOM，可被设计器、Node 服务端、Electron 与 MCP 同时加载。
// - 注册表挂在 globalThis 的固定 Symbol key 上，避免 monorepo / 打包重复导致 core 双实例
//   时「注册在这份、查表在那份」的漂移。
// - 配置是惰性的：configurePlugin 只写配置单例，描述符在调用时通过 getPluginConfig 读取，
//   因此不需要「注销后重注册」，也不存在注册时序竞态。

import type { ElementOptions } from './types.js'
import type { ElementRenderSpec, ElementRenderer } from '../render/types.js'

// 通用渲染契约只有一份定义：designer 子路径与主入口共用 render/types.ts 的形状，
// 避免注册表与打印管线各自声明同名词义而悄悄漂移。
export type { ElementRenderSpec, ElementRenderer } from '../render/types.js'

// ─── 描述符类型 ───

/** 插件专属属性的元数据（与 print-contract 的 OptionMeta 同形，但由插件自带、主体不认识具体键） */
export type PluginOptionKind = 'mm' | 'pt' | 'count' | 'color' | 'bool' | 'text' | 'enum' | 'object'

export interface PluginOptionMeta {
  kind: PluginOptionKind
  label?: string
  default?: unknown
  min?: number
  max?: number
  /** kind='enum' 时的合法取值 */
  enum?: readonly string[]
}

/** 元素种类声明：一个插件可以声明一种元素类型（type），id 为插件唯一标识 */
export interface ElementPluginKind {
  /** 插件 id，写入模板顶层 plugins 清单，如 '@worm-vue3-print/echarts' */
  id: string
  /** 语义化版本，用于幂等注入执行器 bundle 与 strict 校验 */
  version: string
  /** 元素类型，如 'chart' / 'signature' */
  type: string
  label: string
  icon?: string
  /** 分页/测量口径：固定高、禁 autoHeight */
  fixedHeight?: boolean
  /** 是否禁止 AI 生成（MCP 的 blocked 标记） */
  blocked?: boolean
  requiredOptionKeys?: readonly string[]
  /** 插件专属属性的默认值；缺省参数由元素工厂传入 */
  defaultOptions?: (partial?: Partial<ElementOptions>) => Partial<ElementOptions>
  /** 插件专属属性元数据：校验、属性台与 AI 提示词共用 */
  optionMeta?: Readonly<Record<string, PluginOptionMeta>>
  /** 给 print_element_kinds 的说明文字 */
  notes?: string
}

/** 属性台自定义 tab 描述符；component 是 Vue 组件，core 侧只按 unknown 承载 */
export interface ElementPluginPropertyTab {
  id: string
  label: string
  icon?: string
  component: unknown
  /** R3 实例级显示判据：缺省视为 true（注册了 tab 即显示） */
  hasProperties?: (element: unknown) => boolean
}

export interface ElementPluginDesigner {
  canvasComponent?: unknown
  materialCard?: unknown
  propertyTab?: ElementPluginPropertyTab
}

/** 数据绑定：取代 core 里具体元素类型的绑定分支 */
export interface ElementPluginBinding {
  bind(options: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown>
}

/** 插件提供的页面注入 IIFE bundle：按 (name, version) 幂等去重 */
export interface PluginExecutorBundle {
  /** 插件标识（通常为 kind.id），仅用于排查，不参与去重 */
  name: string
  version: string
  /** 可直接注入页面的脚本文本 */
  code: string
}

export interface ElementPluginRender {
  /** 生成该元素的内联 HTML/SVG；由主体统一分派调用 */
  html?: (spec: ElementRenderSpec) => string
  /** 进程内同步出图（浏览器预览） */
  createRenderer?: () => ElementRenderer
  /** 页面 IIFE（服务端 PDF / Electron 静默打印） */
  executorBundle?: () => PluginExecutorBundle
}

/** 惰性配置：任意 JSON 可序列化值，由插件自行解释 */
export type PluginConfig = Record<string, unknown>

export interface PrintElementPlugin {
  kind: ElementPluginKind
  /** 旧 API 兼容别名映射（数据形式，主体源码零具体类型字面量，见设计文档 §3.9） */
  legacyAliases?: Readonly<Record<string, string>>
  designer?: ElementPluginDesigner
  binding?: ElementPluginBinding
  render?: ElementPluginRender
}

// ─── globalThis 单一实例 ───

const REGISTRY_KEY = Symbol.for('worm-vue3-print.element-plugin-registry.v1')

interface RegistryState {
  /** id → 插件描述符 */
  plugins: Map<string, PrintElementPlugin>
  /** type → 插件 id；同一 type 后注册者覆盖 */
  typeIndex: Map<string, string>
  /** id → 惰性配置 */
  configs: Map<string, PluginConfig>
  /** 旧 API 名 → 新通用 API 名 */
  legacyAliases: Map<string, string>
}

type GlobalHost = { [key: symbol]: RegistryState | undefined }
const host = globalThis as unknown as GlobalHost

function state(): RegistryState {
  const existing = host[REGISTRY_KEY]
  if (existing) return existing
  const created: RegistryState = {
    plugins: new Map(),
    typeIndex: new Map(),
    configs: new Map(),
    legacyAliases: new Map(),
  }
  host[REGISTRY_KEY] = created
  return created
}

function assertPlugin(plugin: PrintElementPlugin): void {
  const { id, version, type } = plugin?.kind ?? ({} as ElementPluginKind)
  if (!id || typeof id !== 'string') throw new Error('defineElementPlugin: kind.id 必须是非空字符串')
  if (!version || typeof version !== 'string') throw new Error('defineElementPlugin: kind.version 必须是非空字符串')
  if (!type || typeof type !== 'string') throw new Error('defineElementPlugin: kind.type 必须是非空字符串')
}

// ─── 公开 API ───

/** 描述符恒等函数：给插件作者提供类型检查与可读性，不做任何隐式注册 */
export function defineElementPlugin(plugin: PrintElementPlugin): PrintElementPlugin {
  assertPlugin(plugin)
  return plugin
}

/**
 * 注册插件，返回注销句柄。同 id 重复注册覆盖旧描述符（幂等），
 * 句柄只会注销「自己这一版」，不会误删后来覆盖它的新描述符。
 */
export function registerElementPlugin(plugin: PrintElementPlugin): () => void {
  assertPlugin(plugin)
  const s = state()
  const { id, type } = plugin.kind
  s.plugins.set(id, plugin)
  s.typeIndex.set(type, id)
  for (const [from, to] of Object.entries(plugin.legacyAliases ?? {})) {
    s.legacyAliases.set(from, to)
  }
  return () => {
    if (s.plugins.get(id) !== plugin) return
    s.plugins.delete(id)
    if (s.typeIndex.get(type) === id) s.typeIndex.delete(type)
  }
}

/** 按元素类型取插件描述符 */
export function getElementPlugin(type: string): PrintElementPlugin | undefined {
  const s = state()
  const id = s.typeIndex.get(type)
  return id ? s.plugins.get(id) : undefined
}

/** 按插件 id 取描述符（strict 校验 plugins 清单用） */
export function getElementPluginById(id: string): PrintElementPlugin | undefined {
  return state().plugins.get(id)
}

export function getElementPlugins(): readonly PrintElementPlugin[] {
  return [...state().plugins.values()]
}

/** 已注册的元素类型列表（去重） */
export function getElementPluginTypes(): string[] {
  return [...new Set(getElementPlugins().map(p => p.kind.type))]
}

/** 惰性配置：可早于注册调用，多次调用按浅合并累积 */
export function configurePlugin(id: string, config: PluginConfig): void {
  if (!id) throw new Error('configurePlugin: id 必须是非空字符串')
  const s = state()
  s.configs.set(id, { ...(s.configs.get(id) ?? {}), ...config })
}

/** 供描述符在调用时读取；返回快照，避免插件反向修改配置单例 */
export function getPluginConfig(id: string): Readonly<PluginConfig> {
  return { ...(state().configs.get(id) ?? {}) }
}

export function registerLegacyAlias(from: string, to: string): void {
  state().legacyAliases.set(from, to)
}

export function resolveLegacyAlias(from: string): string {
  return state().legacyAliases.get(from) ?? from
}

export function getLegacyAliases(): Readonly<Record<string, string>> {
  return Object.fromEntries(state().legacyAliases)
}

/**
 * 清空注册态。仅供单测与宿主热重载使用；生产运行时插件靠包入口 import 自注册，
 * 清空后需由调用方重新注册，否则该进程内自定义元素会降级。
 */
export function clearElementPlugins(): void {
  const s = state()
  s.plugins.clear()
  s.typeIndex.clear()
  s.configs.clear()
  s.legacyAliases.clear()
}
