// web/src/components/print/utils/element-factory.ts
import type { RuntimeElement, ElementType, ElementOptions } from '../types.js'
import {
  BUILTIN_ELEMENT_CAPABILITIES, getElementBaseBox, getElementCapabilities,
  getElementCapabilityTypes,
} from '../element-capabilities.js'
import { getElementPlugin } from '../element-plugin-registry.js'

/**
 * 已屏蔽的元素类型：由能力位注册表派生（内置基线 + 插件声明）。
 * 占位实现（设计态能画、出纸永远空盒），不允许从素材台新建，导入模板时一律剥离。
 * 恢复只需把该类型的 `blocked` 能力位撤掉并放回素材台。
 */
export function getBlockedElementTypes(): string[] {
  return getElementCapabilityTypes().filter(type => getElementCapabilities(type).blocked === true)
}

export const BLOCKED_ELEMENT_TYPES: readonly ElementType[] = getBlockedElementTypes() as ElementType[]

export function isBlockedElementType(type?: string | null): boolean {
  if (!type) return false
  const declared = getElementCapabilities(type).blocked
  return declared === undefined
    ? (BUILTIN_ELEMENT_CAPABILITIES[type]?.blocked === true)
    : declared
}

/**
 * 找出模板里出现封禁元素类型的位置：覆盖多页 wrapper 与单页
 * elements / header.elements / footer.elements 三个区，路径可直接给 AI 定位。
 * AI 写回（print_apply_open_template 与宿主 demo）的共用门禁，不属于渲染端兜底。
 */
export function findBlockedElementPaths(template: unknown): string[] {
  const paths: string[] = []
  const scanElements = (elements: unknown, prefix: string) => {
    if (!Array.isArray(elements)) return
    elements.forEach((el, i) => {
      const holder = (el ?? {}) as { type?: unknown; printElementType?: { type?: unknown } }
      const typeStr = typeof holder.type === 'string'
        ? holder.type
        : typeof holder.printElementType?.type === 'string' ? holder.printElementType.type : undefined
      if (isBlockedElementType(typeStr)) paths.push(`${prefix}[${i}].type`)
    })
  }
  const scanPage = (page: unknown, prefix: string) => {
    if (!page || typeof page !== 'object') return
    // 单页时 prefix 为空字符串：段名直接作路径根，避免 .elements[0] 这类前导点
    const root = (sec: string): string => (prefix ? `${prefix}.${sec}` : sec)
    const p = page as { elements?: unknown; header?: { elements?: unknown }; footer?: { elements?: unknown } }
    scanElements(p.elements, root('elements'))
    scanElements(p.header?.elements, root('header.elements'))
    scanElements(p.footer?.elements, root('footer.elements'))
  }
  const isMultiPage = !!template && typeof template === 'object' && Array.isArray((template as { pages?: unknown }).pages)
  if (isMultiPage) {
    const pages = (template as { pages: unknown[] }).pages
    pages.forEach((page, i) => scanPage(page, `pages[${i}]`))
  } else {
    scanPage(template, '')
  }
  return paths
}

export function generateId(): string {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultOptions(type: ElementType): ElementOptions {
  // pt → mm：20/50/120/20 → 7/17.6/42.3/7.1
  // 不预置 fontFamily：未手工配置字体时交还 CSS 继承，由渲染端系统默认字体承接
  const base = getElementBaseBox() as ElementOptions
  // 内置与插件共用同一条路径：能力位声明 defaultOptions 即生效，后注册者可覆盖内置。
  const own = getElementCapabilities(type).defaultOptions?.()
  if (own) return { ...base, ...own }
  // 兼容旧插件：kind.defaultOptions 未提供 capabilities 时仍按描述符出默认选项
  const pluginDefaults = getElementPlugin(type)?.kind.defaultOptions?.()
  return pluginDefaults ? { ...base, ...pluginDefaults } : base
}

export function createRuntimeElement(type: ElementType, options?: Partial<ElementOptions>): RuntimeElement {
  return {
    id: generateId(),
    options: { ...createDefaultOptions(type), ...options },
    printElementType: {
      type,
      // 标题同样来自能力位注册表；插件 kind.label 回落，保证 AI 草稿与素材卡一致
      title: getElementCapabilities(type).title || getElementPlugin(type)?.kind.label || String(type),
    },
  }
}
