// 插件设计器 UI 注册表：挂在 globalThis 固定 Symbol 上，避免 monorepo / 多打包副本
// 导致「注册在这份、查询在那份」的漂移（与 core 元素插件注册表同一条约定）。
import type { ElementUI, ElementUIEntry } from './types.js'

const REGISTRY_KEY = Symbol.for('worm-vue3-print.element-ui-registry.v1')

interface Entry {
  ui: ElementUI
  /** 注册序号：宿主按此决定素材卡顺序与「后注册覆盖」的稳定口径 */
  seq: number
}

interface RegistryState {
  /** 元素类型 → 当前生效 UI */
  entries: Map<string, Entry>
  /** 注册态变化订阅者（canvas 用响应式版本号、common 用重绘） */
  listeners: Set<() => void>
  nextSeq: number
}

type GlobalHost = { [key: symbol]: RegistryState | undefined }
const host = globalThis as unknown as GlobalHost

function state(): RegistryState {
  const existing = host[REGISTRY_KEY]
  if (existing) return existing
  const created: RegistryState = { entries: new Map(), listeners: new Set(), nextSeq: 0 }
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

function assertElementUI(ui: ElementUI): void {
  if (!ui || typeof ui !== 'object') throw new Error('registerElementUI: 需要 ElementUI 对象')
  if (!Array.isArray(ui.types) || ui.types.length === 0) {
    throw new Error('registerElementUI: types 必须是非空数组')
  }
  for (const type of ui.types) {
    if (!type || typeof type !== 'string') {
      throw new Error('registerElementUI: types 内每项必须是非空字符串')
    }
  }
  if (typeof ui.renderCanvas !== 'function') {
    throw new Error(`registerElementUI: ${ui.types.join(',')} 缺少 renderCanvas`)
  }
  if (ui.renderProperty !== undefined && typeof ui.renderProperty !== 'function') {
    throw new Error(`registerElementUI: ${ui.types.join(',')} 的 renderProperty 必须是函数`)
  }
}

/** 描述符恒等函数：给插件作者提供类型检查与可读性，不做隐式注册 */
export function defineElementUI(ui: ElementUI): ElementUI {
  assertElementUI(ui)
  return ui
}

/**
 * 注册一份插件 UI（同 type 后注册者覆盖，便于热更新）。
 * 返回注销句柄：只会注销「自己这一版」占用的类型，不误删后来覆盖它的新 UI。
 */
export function registerElementUI(ui: ElementUI): () => void {
  assertElementUI(ui)
  const s = state()
  const seq = s.nextSeq++
  for (const type of ui.types) s.entries.set(type, { ui, seq })
  notify()
  return () => {
    let removed = false
    for (const type of ui.types) {
      const current = s.entries.get(type)
      if (current?.ui !== ui) continue
      s.entries.delete(type)
      removed = true
    }
    if (removed) notify()
  }
}

/** 按元素类型取插件 UI；未注册返回 undefined */
export function getElementUI(type?: string | null): ElementUI | undefined {
  if (!type) return undefined
  return state().entries.get(type)?.ui
}

/** 当前注册态的类型→UI 条目（后注册覆盖、按注册顺序） */
export function getElementUIEntries(): ElementUIEntry[] {
  const entries = [...state().entries.entries()]
  entries.sort((a, b) => a[1].seq - b[1].seq)
  return entries.map(([type, entry]) => ({ type, ui: entry.ui }))
}

/** 已注册的插件 UI 列表（同一份 UI 覆盖多个 type 时只返回一次，按注册顺序） */
export function getElementUIs(): ElementUI[] {
  const seen = new Set<ElementUI>()
  const out: ElementUI[] = []
  for (const { ui } of getElementUIEntries()) {
    if (seen.has(ui)) continue
    seen.add(ui)
    out.push(ui)
  }
  return out
}

/** 已注册的元素类型列表（按注册顺序去重） */
export function getElementUITypes(): string[] {
  return getElementUIEntries().map(entry => entry.type)
}

/** 订阅注册态变化；返回取消订阅句柄。宿主可在注册后即时刷新素材台/画布。 */
export function subscribeElementUIRegistry(listener: () => void): () => void {
  const s = state()
  s.listeners.add(listener)
  return () => { s.listeners.delete(listener) }
}

/** 清空注册态（仅供单测与宿主热重载使用） */
export function clearElementUIs(): void {
  const s = state()
  if (s.entries.size === 0 && s.listeners.size === 0) return
  s.entries.clear()
  notify()
}
