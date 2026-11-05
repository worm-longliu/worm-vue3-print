export type TemplateOperation =
  | { op: 'updateElement'; elementId: string; changes: Record<string, unknown> }
  | { op: 'moveElement'; elementId: string; x: number; y: number }

export interface TemplatePatchResult {
  templateJson: unknown
  changedPaths: string[]
}

export interface TemplateSummaryOptions {
  elementIds?: string[]
  includeFields?: string[]
}

interface ElementEntry {
  element: Record<string, unknown>
  path: string
  pageIndex: number
  region: 'content' | 'header' | 'footer'
}

const DEFAULT_SUMMARY_FIELDS = ['left', 'top', 'width', 'height']
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function objectOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function collectElements(template: unknown): ElementEntry[] {
  const root = objectOf(template)
  if (!root) return []
  const pages = Array.isArray(root.pages) ? root.pages : [root]
  const wrapped = Array.isArray(root.pages)
  const result: ElementEntry[] = []
  pages.forEach((pageValue, pageIndex) => {
    const page = objectOf(pageValue)
    if (!page) return
    const pagePath = wrapped ? `pages[${pageIndex}]` : ''
    const regions: Array<[ElementEntry['region'], unknown]> = [
      ['content', page.elements],
      ['header', objectOf(page.header)?.elements],
      ['footer', objectOf(page.footer)?.elements],
    ]
    for (const [region, elements] of regions) {
      if (!Array.isArray(elements)) continue
      elements.forEach((value, index) => {
        const element = objectOf(value)
        if (!element) return
        const regionPath = region === 'content' ? '' : `${region}.`
        const prefix = pagePath ? `${pagePath}.` : ''
        result.push({ element, path: `${prefix}${regionPath}elements[${index}]`, pageIndex, region })
      })
    }
  })
  return result
}

function findUnique(entries: ElementEntry[], elementId: string): ElementEntry {
  const matches = entries.filter(entry => entry.element.id === elementId)
  if (matches.length === 0) throw new Error(`元素 ${elementId} 不存在，整批 Patch 已取消`)
  if (matches.length > 1) throw new Error(`元素 ${elementId} 重复，无法安全定位，整批 Patch 已取消`)
  return matches[0]!
}

function assertSafeChanges(changes: Record<string, unknown>): void {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('updateElement.changes 必须是对象')
  }
  const keys = Object.keys(changes)
  if (keys.length === 0) throw new Error('updateElement.changes 不能为空')
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`不允许修改字段 ${key}`)
  }
}

export function applyTemplateOperations(template: unknown, operations: TemplateOperation[]): TemplatePatchResult {
  if (!Array.isArray(operations) || operations.length === 0) throw new Error('operations 至少包含一个操作')
  const cloned = structuredClone(template)
  const entries = collectElements(cloned)
  const changedPaths: string[] = []
  for (const operation of operations) {
    const entry = findUnique(entries, operation.elementId)
    const options = objectOf(entry.element.options)
    if (!options) throw new Error(`元素 ${operation.elementId} 缺少 options，整批 Patch 已取消`)
    if (operation.op === 'updateElement') {
      assertSafeChanges(operation.changes)
      for (const [key, value] of Object.entries(operation.changes)) {
        options[key] = structuredClone(value)
        changedPaths.push(`${entry.path}.options.${key}`)
      }
    } else if (operation.op === 'moveElement') {
      if (!Number.isFinite(operation.x) || !Number.isFinite(operation.y)) {
        throw new Error(`元素 ${operation.elementId} 的 x/y 必须是有限数字`)
      }
      options.left = operation.x
      options.top = operation.y
      changedPaths.push(`${entry.path}.options.left`, `${entry.path}.options.top`)
    } else {
      throw new Error(`不支持的 Patch 操作：${String((operation as { op?: unknown }).op)}`)
    }
  }
  return { templateJson: cloned, changedPaths }
}

function stringList(values: string[] | undefined, label: string): string[] | undefined {
  if (values === undefined) return undefined
  if (values.some(value => !value.trim())) throw new Error(`${label} 不能包含空白字符串`)
  if (new Set(values).size !== values.length) throw new Error(`${label} 不能包含重复项`)
  return values
}

export function projectTemplateSummary(template: unknown, options: TemplateSummaryOptions): Record<string, unknown> {
  const elementIds = stringList(options.elementIds, 'elementIds')
  const includeFields = stringList(options.includeFields, 'includeFields') ?? DEFAULT_SUMMARY_FIELDS
  const root = objectOf(template) ?? {}
  const pages = Array.isArray(root.pages) ? root.pages : [root]
  const firstPage = objectOf(pages[0]) ?? {}
  const selected = elementIds ? new Set(elementIds) : null
  const elements = collectElements(template)
    .filter(entry => !selected || selected.has(String(entry.element.id)))
    .map(entry => {
      const source = objectOf(entry.element.options) ?? {}
      const projected: Record<string, unknown> = {}
      for (const field of includeFields) {
        if (Object.prototype.hasOwnProperty.call(source, field)) projected[field] = source[field]
      }
      return {
        id: entry.element.id,
        type: entry.element.type,
        path: entry.path,
        pageIndex: entry.pageIndex,
        region: entry.region,
        options: projected,
      }
    })
  return {
    paperSize: firstPage.paperSize,
    orientation: firstPage.orientation,
    unit: firstPage.unit,
    pageCount: pages.length,
    elements,
  }
}
