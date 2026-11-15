// core 插件注册表 + plugin-kit UI 注册表 → 本包设计器扩展项。
//
// 元素元数据（label/icon/分组/出厂默认）的唯一真源是 core 的 kind 描述符；
// 画布与属性台的渲染能力来自 plugin-kit 的 ElementUI（框架无关 DOM 契约）。
// 两条注册表都按 type 对齐：只纳入「core 有 kind 且 plugin-kit 注册了 UI」的类型，
// 缺任一侧都不出素材卡（未注册 UI 的插件仍按类型名占位，行为与改造前一致）。
import { getElementPluginKinds } from '@worm-vue3-print/core/designer'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { getElementUI } from '@worm-vue3-print/plugin-kit'
import type { ElementUI } from '@worm-vue3-print/plugin-kit'

/** 属性台「自定义属性」页签的缺省标题（与 canvas 同串） */
export const CUSTOM_PROPERTY_TAB_LABEL = '自定义属性'

export interface PluginElement {
  type: string
  /** 素材卡标签与图层名，取 core kind.label */
  label: string
  /** lucide 图标名，kind.icon → materialCard.icon → Shapes */
  icon: string
  /** 素材卡分组（kind.designer.materialCard.group），未声明时与内置项同组 */
  group?: string
  ui: ElementUI
}

/** 当前已注册插件 UI 的元素清单：顺序与 core 注册态一致 */
export function getPluginElements(): PluginElement[] {
  const out: PluginElement[] = []
  for (const { plugin, kind } of getElementPluginKinds()) {
    const ui = getElementUI(kind.type)
    if (!ui) continue
    const designer = kind.designer ?? plugin.designer
    const card = designer?.materialCard as { icon?: string; group?: string } | undefined
    out.push({
      type: kind.type,
      label: kind.label,
      icon: kind.icon ?? card?.icon ?? 'Shapes',
      // 原生 Vue 组件自带 materialCard.group；纯 plugin-kit UI 用 UI 声明的 group 兜底
      group: card?.group ?? ui.group,
      ui,
    })
  }
  return out
}

/** 按类型取插件扩展项；未注册 UI 返回 undefined */
export function getPluginElement(type?: string | null): PluginElement | undefined {
  if (!type) return undefined
  return getPluginElements().find(item => item.type === type)
}

/** 该类型是否注册了 plugin-kit UI（素材台与画布据此决定是否接管） */
export function hasPluginUI(type?: string | null): boolean {
  return !!getElementUI(type)
}

/** 属性台「自定义属性」页签的解析结果 */
export interface PluginPropertyTab {
  ui: ElementUI
  label: string
  icon: string
  searchKeywords: string[]
}

/**
 * 解析选中元素的「自定义属性」页签：
 * ① 元素类型有 plugin-kit UI 且提供 renderProperty；
 * ② 插件提供的 hasProperties(element) 必须通过（抛错按无属性处理，不打断设计器）。
 * 返回 undefined 时属性台维持既有两页签。
 */
export function getPluginPropertyTab(element?: RuntimeElement | null): PluginPropertyTab | undefined {
  if (!element) return undefined
  const pluginEl = getPluginElement(element.printElementType.type)
  if (!pluginEl || !pluginEl.ui.renderProperty) return undefined
  const ui = pluginEl.ui
  if (ui.hasProperties) {
    try {
      if (!ui.hasProperties(element)) return undefined
    } catch {
      return undefined
    }
  }
  const label = CUSTOM_PROPERTY_TAB_LABEL
  return {
    ui,
    label,
    icon: pluginEl.icon,
    // 缺省关键词与 canvas 同口径：页签标题 + 元素标签 + 类型名
    searchKeywords: ui.searchKeywords ? [...ui.searchKeywords] : [label, pluginEl.label, pluginEl.type],
  }
}
