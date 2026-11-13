import { shallowReactive } from 'vue'
import type { Component } from 'vue'
import type { ElementOptions, RuntimeElement } from '@worm-vue3-print/core/designer'

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
  /**
   * 画布内渲染组件：props 与内置元素组件一致
   * （element: RuntimeElement、data?: Record<string, any>[]、designMode?: boolean）
   */
  canvasComponent: Component
  /**
   * 属性面板扩展分组组件：props 为 element 与 data（设计态示例数据，同 canvasComponent 的 data 形状），
   * 改动后 emit('change') 即汇入设计器既有历史记录通道。
   */
  propertyComponent?: Component
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

/** 当前已注册的扩展元素（响应式依赖注册表版本） */
export function getElementExtensions(): ElementExtension[] {
  return [...registry.values()]
}

/** 按类型取扩展元素；未注册返回 undefined */
export function getElementExtension(type?: string | null): ElementExtension | undefined {
  return type ? registry.get(type) : undefined
}

/** 仅用于测试：清空注册表 */
export function clearElementExtensions(): void {
  registry.clear()
}

/** 供属性面板/画布复用的元素 props 形状（与内置元素组件一致） */
export interface ElementComponentProps {
  element: RuntimeElement
  data?: Record<string, any>[]
  designMode?: boolean
}
