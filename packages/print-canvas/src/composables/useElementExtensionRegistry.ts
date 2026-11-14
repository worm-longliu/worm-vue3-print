import { shallowReactive } from 'vue'
import type { Component } from 'vue'
import type { ElementOptions, RuntimeElement } from '@worm-vue3-print/core/designer'
import { getElementPlugins } from '@worm-vue3-print/core/designer'

/**
 * 属性台「自定义属性」tab 描述符（P3）：所有扩展元素共用同一个 tab，按选中元素类型
 * 切换内部组件，避免多插件时冒出多个空 tab，也让「默认排第一个」没有排序歧义。
 * 注册描述符只是取得显示资格，是否真的显示由实例级 hasProperties 决定；
 * 省略本描述符时，旧 propertyComponent 自动取得资格（已装包宿主零改动）。
 */
export interface ElementPropertyTab {
  /** tab 标题，缺省「自定义属性」 */
  label?: string
  /** 折叠态图标字符，缺省取扩展 icon 或 '◇' */
  icon?: string
  /** 属性组件；缺省回落 ElementExtension.propertyComponent */
  component?: Component
  /** 实例级判据：返回 false 时该元素不显示 tab；缺省恒 true（有属性组件即视为有属性） */
  hasProperties?: (element: RuntimeElement) => boolean
  /** 属性搜索关键词；缺省使用 tab 标题、扩展名与元素类型 */
  searchKeywords?: string[]
}

/** 属性台页签键值：P3 起三值；缺省仍回落 'page'，兼容既有 activeTab props */
export type PropertyTabKey = 'custom' | 'element' | 'page'

/** 解析后的 tab：属性台直接使用，不必再接触注册表细节 */
export interface ResolvedElementPropertyTab {
  type: string
  label: string
  icon: string
  component: Component
  searchKeywords: string[]
}

/**
 * 设计器扩展元素：内置 13 种之外的元素（如 ECharts 图表）由独立可选包注册。
 * 未注册时素材卡不显示、画布遇到该类型渲染占位，设计器主包不引入任何图表库。
 */
export interface ElementExtension {
  /** 元素类型（与 core ElementType 对齐，如 'chart'） */
  type: string
  /** 素材卡名称 */
  label: string
  /** 素材卡图标字符 */
  icon?: string
  /** 素材卡分组名（可选）；LeftPanel 据此在首个该组扩展项前显示分组标题 */
  group?: string
  /**
   * 画布内渲染组件：props 与内置元素组件一致
   * （element: RuntimeElement、data?: Record<string, any>[]、designMode?: boolean）
   */
  canvasComponent: Component
  /**
   * 属性面板扩展分组组件：props 为 element 与 data（设计态示例数据，同 canvasComponent 的 data 形状），
   * 改动后 emit('change') 即汇入设计器既有历史记录通道。
   * P3 起该组件整体迁入「自定义属性」tab；保留本字段作为兼容别名（不标 deprecated）。
   */
  propertyComponent?: Component
  /** 属性台「自定义属性」tab 描述符；省略时 propertyComponent 自动取得显示资格 */
  propertyTab?: ElementPropertyTab
  /** 新建元素时的默认选项（在 core createDefaultOptions 结果之上覆盖） */
  defaultOptions?: (partial?: Partial<ElementOptions>) => Partial<ElementOptions>
}

/** 注册表：模块级单例，设计器实例共享；注册项可响应式驱动素材卡/组件映射 */
const registry = shallowReactive(new Map<string, ElementExtension>())

/** 注册扩展元素（同类型重复注册以后者覆盖，便于热更新） */
export function registerElementExtension(extension: ElementExtension): void {
  if (!extension?.type) throw new Error('registerElementExtension 需要 type')
  if (!extension.canvasComponent) throw new Error(`元素扩展 ${extension.type} 缺少 canvasComponent`)
  registry.set(extension.type, { ...extension })
}

/** 注销扩展元素（测试与热更新用） */
export function unregisterElementExtension(type: string): void {
  registry.delete(type)
}

/**
 * P4 注册表统一：core 的 `defineElementPlugin` 是唯一描述符来源，本文件只是 Vue 响应式视图层。
 * 把 core 注册态里带设计器能力的插件映射成旧 ElementExtension 形状，使旧 API
 * （LeftPanel / LayerPanel / PropertyPanel）零改动即可看到插件元素。
 * 旧 `registerElementExtension` 仍作为兼容别名保留，同 type 时优先它的值。
 */
function coreExtensions(): ElementExtension[] {
  return getElementPlugins()
    .filter(plugin => !!plugin.designer?.canvasComponent)
    .map((plugin): ElementExtension => {
      const card = plugin.designer?.materialCard as { label?: string; icon?: string; group?: string } | undefined
      const tab = plugin.designer?.propertyTab
      return {
        type: plugin.kind.type,
        label: card?.label ?? plugin.kind.label,
        icon: card?.icon ?? plugin.kind.icon,
        group: card?.group,
        canvasComponent: plugin.designer!.canvasComponent as Component,
        propertyComponent: tab?.component as Component | undefined,
        propertyTab: tab
          ? {
              label: tab.label,
              icon: tab.icon,
              component: tab.component as Component,
              hasProperties: tab.hasProperties as ((element: RuntimeElement) => boolean) | undefined,
            }
          : undefined,
        defaultOptions: plugin.kind.defaultOptions,
      }
    })
}

/** 当前已注册的扩展元素（响应式依赖注册表版本；同 type 以旧注册 API 为准） */
export function getElementExtensions(): ElementExtension[] {
  const byType = new Map<string, ElementExtension>()
  for (const ext of coreExtensions()) byType.set(ext.type, ext)
  for (const ext of registry.values()) byType.set(ext.type, ext)
  return [...byType.values()]
}

/** 按类型取扩展元素；未注册返回 undefined */
export function getElementExtension(type?: string | null): ElementExtension | undefined {
  if (!type) return undefined
  return registry.get(type) ?? coreExtensions().find(ext => ext.type === type)
}

/** 仅用于测试：清空注册表 */
export function clearElementExtensions(): void {
  registry.clear()
}

/** 单一「自定义属性」tab 的默认标题与搜索分组 id（属性台与 core 搜索共用） */
export const CUSTOM_PROPERTY_TAB_LABEL = '自定义属性'
export const CUSTOM_PROPERTY_GROUP = 'custom-properties'
const DEFAULT_CUSTOM_TAB_ICON = '◇'

/**
 * 解析当前选中元素的「自定义属性」tab（P3 实例级判据）：
 * ① 扩展必须登记属性能力（propertyTab 或兼容别名 propertyComponent）；
 * ② 插件提供的 hasProperties(element) 必须通过；
 * ③ 判据抛错时按「无属性」处理，绝不打断设计器。
 * 返回 undefined 时属性台不渲染该 tab：内置元素、未注册扩展、该实例无自定义属性。
 * 读 shallowReactive 注册表，故在 computed 中调用可随注册/注销即时刷新。
 */
export function resolveElementPropertyTab(
  element?: RuntimeElement | null,
): ResolvedElementPropertyTab | undefined {
  if (!element) return undefined
  const type = element.printElementType?.type ?? ''
  const ext = getElementExtension(type)
  if (!ext) return undefined
  const tab = ext.propertyTab
  const component = tab?.component ?? ext.propertyComponent
  if (!component) return undefined
  if (tab?.hasProperties) {
    try {
      if (!tab.hasProperties(element)) return undefined
    } catch {
      return undefined
    }
  }
  const label = tab?.label ?? CUSTOM_PROPERTY_TAB_LABEL
  return {
    type,
    label,
    icon: tab?.icon ?? ext.icon ?? DEFAULT_CUSTOM_TAB_ICON,
    component,
    searchKeywords: tab?.searchKeywords ?? [label, ext.label, type],
  }
}

/** 供属性面板/画布复用的元素 props 形状（与内置元素组件一致） */
export interface ElementComponentProps {
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}
