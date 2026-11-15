// @worm-vue3-print/common — 统一元素定义注册表
//
// 把「内置元素」和「插件元素」放进同一张表：素材卡、图层图标、属性台分组、
// 双击编辑字段、画布内容渲染全部由 ElementDefinition 驱动，不再有 11 个 case 的
// 硬编码 switch 与散落各处的静态常量。第三方可以用 registerElementDefinition
// 覆盖内置类型（后注册优先、注销句柄只撤销自己那一版），与内置完全同权。
//
// 分层约定：
// - 本文件只持有「元数据 + 函数引用」，不依赖 DOM / Vue / 具体渲染实现，避免与 shell 循环依赖。
// - 画布渲染函数由 shell/elements.ts 在模块加载时通过 registerElementRenderers 注入。
// - core 的 capabilities 负责渲染/校验语义（区域、旋转、边框、绑定、出厂默认），
//   本表负责设计器 UI 语义（素材卡、图层、属性台分组、双击字段）。
// - 注册表挂 globalThis 固定 Symbol，与 core / plugin-kit 两张注册表同一条约定。

import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import type { DesignerStore } from './store'
import type { TableFire } from '../shell/table'
import { getPluginElement, getPluginElements } from './plugin'

/** 内容渲染的宿主上下文（与 shell/elements.ts 的 ContentHost 同一形状） */
export interface ElementContentHost {
  store: DesignerStore
  fire: TableFire
  /** 宿主注入的设计态示例数据；缺省回落内置 demo 数据 */
  designData?: readonly Record<string, unknown>[]
}

export type ElementContentRenderer = (
  el: RuntimeElement,
  designMode: boolean,
  host?: ElementContentHost,
) => unknown

/** 属性台分组：取代 property-panel.ts 的 isText/isCode/isTable 三个布尔量 */
export type ElementPropertyGroup = 'text' | 'code' | 'table' | 'general'

export interface ElementDefinition {
  type: string
  /** 素材卡与图层名 */
  label: string
  /** lucide 图标名 */
  icon: string
  /** 素材卡分组标题（缺省不渲染分组） */
  group?: string
  /** 是否出现在素材台；html / pageNumber 等只在图层出现 */
  material: boolean
  /** 属性台分组 */
  propertyGroup: ElementPropertyGroup
  /** 画布双击直接编辑的 options 字段 */
  dblEditableField?: string
  /** 内容渲染器；未注入时由调用方回落到插件 UI 或类型名占位 */
  renderContent?: ElementContentRenderer
  /** 来源，便于宿主区分内置 / 显式注册 / core 插件 */
  origin: 'builtin' | 'custom' | 'plugin'
}

/**
 * 内置基线：顺序、标签、图标、分组、双击字段与改造前
 * ELEMENT_TYPES / LAYER_ICON / DBL_EDITABLE_FIELD / property-panel 逐项一致。
 * 新增内置元素只需在此登记 + 在 shell/elements.ts 注入渲染器。
 */
export const BUILTIN_ELEMENT_DEFINITIONS: readonly ElementDefinition[] = Object.freeze([
  { type: 'text', label: '文本', icon: 'Type', material: true, propertyGroup: 'text', dblEditableField: 'formatter', origin: 'builtin' },
  { type: 'barcode', label: '条形码', icon: 'Barcode', material: true, propertyGroup: 'code', dblEditableField: 'formatter', origin: 'builtin' },
  { type: 'qrcode', label: '二维码', icon: 'QrCode', material: true, propertyGroup: 'code', dblEditableField: 'formatter', origin: 'builtin' },
  { type: 'image', label: '图片', icon: 'Image', material: true, propertyGroup: 'general', dblEditableField: 'src', origin: 'builtin' },
  { type: 'table', label: '表格', icon: 'Table', material: true, propertyGroup: 'table', origin: 'builtin' },
  { type: 'longText', label: '长文', icon: 'TextAlignStart', material: true, propertyGroup: 'text', dblEditableField: 'formatter', origin: 'builtin' },
  { type: 'flowList', label: '流式列表', icon: 'List', material: true, propertyGroup: 'general', dblEditableField: 'formatter', origin: 'builtin' },
  { type: 'hline', label: '横线', icon: 'Minus', material: true, propertyGroup: 'general', origin: 'builtin' },
  { type: 'vline', label: '竖线', icon: 'SeparatorVertical', material: true, propertyGroup: 'general', origin: 'builtin' },
  { type: 'rect', label: '矩形', icon: 'Square', material: true, propertyGroup: 'general', origin: 'builtin' },
  { type: 'oval', label: '椭圆', icon: 'Circle', material: true, propertyGroup: 'general', origin: 'builtin' },
  // 无素材入口但可加载：html 属 core 屏蔽类型，pageNumber 由页眉/页脚自动放置
  { type: 'html', label: 'HTML', icon: 'Code', material: false, propertyGroup: 'general', origin: 'builtin' },
  // 图标用 Shapes 以对齐历史口径（旧静态表未收录 pageNumber → 回落 Shapes）
  { type: 'pageNumber', label: '页码', icon: 'Shapes', material: false, propertyGroup: 'general', origin: 'builtin' },
])

const REGISTRY_KEY = Symbol.for('worm-vue3-print.element-definitions.v1')

interface RegistryState {
  /** type → 当前生效的自定义定义（覆盖内置） */
  overrides: Map<string, ElementDefinition>
  /** type → 外壳模块加载时注入的内置渲染器基线 */
  builtinRenderers: Map<string, ElementContentRenderer>
  /** type → 自定义渲染器覆盖（优先于内置基线） */
  rendererOverrides: Map<string, ElementContentRenderer>
  /** 注册态变化订阅者（设计器用它即时重绘素材台/画布/属性台） */
  listeners: Set<() => void>
  nextSeq: number
  seq: Map<string, number>
}

type GlobalHost = { [key: symbol]: RegistryState | undefined }
const host = globalThis as unknown as GlobalHost

function state(): RegistryState {
  const existing = host[REGISTRY_KEY]
  if (existing) return existing
  const created: RegistryState = {
    overrides: new Map(), builtinRenderers: new Map(), rendererOverrides: new Map(),
    listeners: new Set(), nextSeq: 0, seq: new Map(),
  }
  host[REGISTRY_KEY] = created
  return created
}

function notify(): void {
  for (const listener of [...state().listeners]) {
    try {
      listener()
    } catch {
      // 单个宿主的刷新失败不应打断其它宿主或注册动作本身
    }
  }
}

/** 订阅元素定义注册态变化；返回取消订阅句柄 */
export function subscribeElementDefinitions(listener: () => void): () => void {
  const s = state()
  s.listeners.add(listener)
  return () => { s.listeners.delete(listener) }
}

function builtinMap(): Map<string, ElementDefinition> {
  return new Map(BUILTIN_ELEMENT_DEFINITIONS.map(def => [def.type, def]))
}

/**
 * 注册（或覆盖）一份元素定义。同 type 后注册者覆盖，注销句柄只撤销自己那一版；
 * 撤销内置类型的覆盖会自动回落到基线定义。
 */
export function registerElementDefinition(def: Omit<ElementDefinition, 'origin'> & { origin?: ElementDefinition['origin'] }): () => void {
  if (!def?.type || typeof def.type !== 'string') throw new Error('registerElementDefinition: type 必须是非空字符串')
  if (!def.label || typeof def.label !== 'string') throw new Error('registerElementDefinition: label 必须是非空字符串')
  const s = state()
  const own: ElementDefinition = { ...def, origin: def.origin ?? 'custom' }
  s.overrides.set(own.type, own)
  s.seq.set(own.type, s.nextSeq++)
  notify()
  return () => {
    const cur = state()
    if (cur.overrides.get(own.type) !== own) return
    cur.overrides.delete(own.type)
    notify()
  }
}

/** 覆盖某类型的内容渲染器（内置与插件同通路）；注销后自动回落内置基线 */
export function registerElementRenderer(type: string, renderer: ElementContentRenderer): () => void {
  if (!type || typeof renderer !== 'function') throw new Error('registerElementRenderer: 需要 type 与渲染函数')
  const s = state()
  s.rendererOverrides.set(type, renderer)
  notify()
  return () => {
    const cur = state()
    if (cur.rendererOverrides.get(type) !== renderer) return
    cur.rendererOverrides.delete(type)
    notify()
  }
}

/** 批量注入内置渲染器基线（供 shell/elements.ts 模块初始化使用）；返回一次性注销句柄 */
export function registerElementRenderers(renderers: Readonly<Record<string, ElementContentRenderer>>): () => void {
  const s = state()
  for (const [type, fn] of Object.entries(renderers)) s.builtinRenderers.set(type, fn)
  return () => {
    const cur = state()
    for (const [type, fn] of Object.entries(renderers)) {
      if (cur.builtinRenderers.get(type) === fn) cur.builtinRenderers.delete(type)
    }
  }
}

/** 插件定义（core kind + plugin-kit UI）与内置走同一解析视图 */
function pluginDefinition(type: string): ElementDefinition | undefined {
  const item = getPluginElement(type)
  if (!item) return undefined
  return {
    type: item.type,
    label: item.label,
    icon: item.icon,
    group: item.group,
    material: true,
    propertyGroup: 'general',
    origin: 'plugin',
  }
}

/** 按类型解析定义：自定义覆盖 → 内置基线 → core 插件动态项；始终附带当前渲染器 */
export function getElementDefinition(type?: string | null): ElementDefinition | undefined {
  if (!type) return undefined
  const s = state()
  const base = s.overrides.get(type) ?? builtinMap().get(type) ?? pluginDefinition(type)
  if (!base) return undefined
  const renderer = s.rendererOverrides.get(type) ?? s.builtinRenderers.get(type)
  return renderer ? { ...base, renderContent: renderer } : base
}

/** 全部已注册定义（内置顺序在前，自定义新增按注册顺序追加，插件动态项最后） */
export function getElementDefinitions(): ElementDefinition[] {
  const s = state()
  const out: ElementDefinition[] = []
  const seen = new Set<string>()
  for (const def of BUILTIN_ELEMENT_DEFINITIONS) {
    out.push(getElementDefinition(def.type) ?? def)
    seen.add(def.type)
  }
  const extra = [...s.overrides.entries()]
    .filter(([type]) => !seen.has(type))
    .sort((a, b) => (s.seq.get(a[0]) ?? 0) - (s.seq.get(b[0]) ?? 0))
  for (const [type] of extra) {
    const def = getElementDefinition(type)
    if (def) out.push(def)
    seen.add(type)
  }
  for (const item of getPluginElements()) {
    if (seen.has(item.type)) continue
    const def = getElementDefinition(item.type)
    if (def) out.push(def)
    seen.add(item.type)
  }
  return out
}

/** 素材卡清单（filter(material)），供左栏实时渲染 */
export function getMaterialElementDefinitions(): ElementDefinition[] {
  return getElementDefinitions().filter(def => def.material)
}

/** 属性台分组；未注册类型回落 general */
export function getElementPropertyGroup(type?: string | null): ElementPropertyGroup {
  return getElementDefinition(type)?.propertyGroup ?? 'general'
}

/** 双击直接编辑字段；未声明返回 undefined */
export function getElementDblEditableField(type?: string | null): string | undefined {
  return getElementDefinition(type)?.dblEditableField
}

/** 图层图标；未注册回落 Shapes（与 canvas 同口径） */
export function getElementLayerIcon(type?: string | null): string {
  return getElementDefinition(type)?.icon ?? 'Shapes'
}

/**
 * 回到内置基线：只清自定义定义覆盖，渲染器由 shell 模块加载时注入，保持不变。
 * 单测需要隔离渲染器时请自行保存 registerElementRenderer 返回的注销句柄。
 */
export function resetElementDefinitions(): void {
  const s = state()
  s.overrides.clear()
  s.rendererOverrides.clear()
  s.seq.clear()
  s.nextSeq = 0
  notify()
}
