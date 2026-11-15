// @worm-vue3-print/core/designer — 通用元素插件注册表
//
// 主体只提供机制，不内置任何具体元素类型知识：插件包用 defineElementPlugin 声明
// 「一组元素种类 / 属性元数据 / 数据绑定 / 渲染与执行器 / 设计器组件 / 属性台 tab」，
// 在包入口 import 时调用 registerElementPlugin 即可生效。
//
// 一个插件 = 一个 id/version + kinds[]（一个插件可注册多个元素类型）；插件级
// binding/render/designer 为默认值，kind 级可逐项覆盖。消费方按元素 type 查到
// 「命中 kind + 合并覆盖」的解析视图，因此沿用 plugin.kind.* 与 plugin.render 等写法。
//
// 设计约束：
// - 纯 TS，不依赖 Vue / 渲染库 / DOM，可被设计器、Node 服务端、Electron 与 MCP 同时加载。
// - 注册表挂在 globalThis 的固定 Symbol key 上，避免 monorepo / 打包重复导致 core 双实例
//   时「注册在这份、查表在那份」的漂移。
// - 配置是惰性的：configurePlugin 只写配置单例，描述符在调用时通过 getPluginConfig 读取，
//   因此不需要「注销后重注册」，也不存在注册时序竞态。

import type { ElementOptions } from './types.js'
import type { ElementRenderSpec, ElementRenderer } from '../render/types.js'
import type { ElementCapabilities } from './element-capabilities.js'
import { registerElementCapabilities } from './element-capabilities.js'

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

/** 元素种类声明：一个插件用 kinds[] 声明自己提供的每个元素类型 */
export interface ElementPluginKind {
  /** 元素类型，如 'barChart' / 'signature' */
  type: string
  label: string
  /** lucide 图标名或等宽字形；由设计器外壳解释 */
  icon?: string
  /** 分页/测量口径：固定高、禁 autoHeight */
  fixedHeight?: boolean
  /** 是否禁止 AI 生成（MCP 的 blocked 标记） */
  blocked?: boolean
  /**
   * 元素能力位声明（区域放行 / 旋转 / textFit / 边框 / 绑定 / 出厂默认 / 屏蔽）。
   * 注册插件时自动并入统一能力表，与内置类型走同一条查询路径；同 type 可覆盖内置声明。
   * 未声明时该类型仍可按历史默认行为工作（getElementCapabilities 返回空视图）。
   */
  capabilities?: ElementCapabilities
  requiredOptionKeys?: readonly string[]
  /** 该元素类型的出厂默认选项；缺省参数由元素工厂传入 */
  defaultOptions?: (partial?: Partial<ElementOptions>) => Partial<ElementOptions>
  /** 该元素类型的专属属性元数据：校验、属性台与 AI 提示词共用 */
  optionMeta?: Readonly<Record<string, PluginOptionMeta>>
  /** 给 print_element_kinds 的说明文字 */
  notes?: string
  /** kind 级覆盖：缺省回落插件级 */
  binding?: ElementPluginBinding
  render?: ElementPluginRender
  designer?: ElementPluginDesigner
}

/** 属性台自定义 tab 描述符；component 是 Vue 组件，core 侧只按 unknown 承载 */
export interface ElementPluginPropertyTab {
  id: string
  label: string
  icon?: string
  component: unknown
  /** 实例级显示判据：缺省视为 true（注册了 tab 即显示） */
  hasProperties?: (element: unknown) => boolean
  /** 属性搜索关键词；缺省由属性台按 tab 标题 / 元素标签 / 类型名兜底 */
  searchKeywords?: readonly string[]
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
  /** 插件标识（通常为插件 id），仅用于排查，不参与去重 */
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
  /** 插件唯一标识，写入模板顶层 plugins 清单，也是 configurePlugin 的键 */
  id: string
  /** 语义化版本，用于幂等注入执行器 bundle 与 strict 校验 */
  version: string
  /** 该插件提供的全部元素类型 */
  kinds: readonly ElementPluginKind[]
  /** 旧 API 兼容别名映射（数据形式，主体源码零具体类型字面量，见设计文档 §3.9） */
  legacyAliases?: Readonly<Record<string, string>>
  /** 插件级默认设计器能力；kind 可覆盖 */
  designer?: ElementPluginDesigner
  /** 插件级默认绑定；kind 可覆盖 */
  binding?: ElementPluginBinding
  /** 插件级默认渲染；kind 可覆盖 */
  render?: ElementPluginRender
}

/** 按 type 解析后的视图：kind 为命中项，binding/render/designer 已按 kind 覆盖合并 */
export interface ResolvedElementPlugin extends PrintElementPlugin {
  kind: ElementPluginKind
}

/** 注册态里的一条 kind 索引项（供 contract / canvas / 打印管线遍历） */
export interface ElementPluginKindEntry {
  plugin: PrintElementPlugin
  kind: ElementPluginKind
}

// ─── globalThis 单一实例 ───

const REGISTRY_KEY = Symbol.for('worm-vue3-print.element-plugin-registry.v1')

interface RegistryState {
  /** id → 插件描述符 */
  plugins: Map<string, PrintElementPlugin>
  /** type → 命中项；同一 type 后注册者覆盖 */
  typeIndex: Map<string, ElementPluginKindEntry>
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
  if (!plugin?.id || typeof plugin.id !== 'string') {
    throw new Error('defineElementPlugin: id 必须是非空字符串')
  }
  if (!plugin.version || typeof plugin.version !== 'string') {
    throw new Error('defineElementPlugin: version 必须是非空字符串')
  }
  if (!Array.isArray(plugin.kinds) || plugin.kinds.length === 0) {
    throw new Error('defineElementPlugin: kinds 必须是非空数组')
  }
  const seen = new Set<string>()
  for (const kind of plugin.kinds) {
    if (!kind?.type || typeof kind.type !== 'string') {
      throw new Error('defineElementPlugin: kinds[].type 必须是非空字符串')
    }
    if (seen.has(kind.type)) {
      throw new Error(`defineElementPlugin: kinds 内 type 重复「${kind.type}」`)
    }
    seen.add(kind.type)
  }
}

/** 把插件解析成「带命中 kind 与合并覆盖」的视图，消费方写法保持不变。
 *  binding 是单函数整体覆盖；render/designer 逐字段合并（kind 只补自己那几项时
 *  仍保留插件级的 executorBundle / propertyTab 等能力）。 */
function resolve(plugin: PrintElementPlugin, kind: ElementPluginKind): ResolvedElementPlugin {
  const render = plugin.render || kind.render ? { ...plugin.render, ...kind.render } : undefined
  const designer = plugin.designer || kind.designer ? { ...plugin.designer, ...kind.designer } : undefined
  return {
    ...plugin,
    kind,
    binding: kind.binding ?? plugin.binding,
    render,
    designer,
  }
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
  // 同 id 重注册：先摘掉旧描述符占用的 type 索引，避免新旧 kind 并存
  for (const [type, entry] of [...s.typeIndex]) {
    if (entry.plugin.id === plugin.id && entry.plugin !== plugin) s.typeIndex.delete(type)
  }
  s.plugins.set(plugin.id, plugin)
  for (const kind of plugin.kinds) s.typeIndex.set(kind.type, { plugin, kind })
  // 能力位随插件一起登记：kind.capabilities 优先，fixedHeight / blocked 作为缺省补位，
  // 让「只声明 fixedHeight 的旧插件」也能自动进入统一能力表。
  const releaseCaps: Array<() => void> = []
  for (const kind of plugin.kinds) {
    const caps: ElementCapabilities = {
      ...(kind.fixedHeight === true ? { fixedHeight: true } : {}),
      ...(kind.blocked === true ? { blocked: true } : {}),
      ...(kind.capabilities ?? {}),
    }
    if (Object.keys(caps).length === 0) continue
    releaseCaps.push(registerElementCapabilities(kind.type, caps))
  }
  for (const [from, to] of Object.entries(plugin.legacyAliases ?? {})) {
    s.legacyAliases.set(from, to)
  }
  return () => {
    if (s.plugins.get(plugin.id) !== plugin) return
    s.plugins.delete(plugin.id)
    for (const [type, entry] of [...s.typeIndex]) {
      if (entry.plugin === plugin) s.typeIndex.delete(type)
    }
    for (const release of releaseCaps) release()
  }
}

/** 按元素类型取「命中 kind + 合并覆盖」的插件视图 */
export function getElementPlugin(type: string): ResolvedElementPlugin | undefined {
  const entry = state().typeIndex.get(type)
  return entry ? resolve(entry.plugin, entry.kind) : undefined
}

/** 按插件 id 取描述符（strict 校验 plugins 清单用） */
export function getElementPluginById(id: string): PrintElementPlugin | undefined {
  return state().plugins.get(id)
}

export function getElementPlugins(): readonly PrintElementPlugin[] {
  return [...state().plugins.values()]
}

/** 当前生效的 kind 清单（contract / canvas / 打印管线统一入口）：
 *  以 typeIndex 为唯一真源，同一 type 只保留后注册者，与 getElementPlugin 的分派口径一致。 */
export function getElementPluginKinds(): readonly ElementPluginKindEntry[] {
  return [...state().typeIndex.values()]
}

/** 已注册的元素类型列表（去重、按注册顺序） */
export function getElementPluginTypes(): string[] {
  return [...new Set(getElementPluginKinds().map(({ kind }) => kind.type))]
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
