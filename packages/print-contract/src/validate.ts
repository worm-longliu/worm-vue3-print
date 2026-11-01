import type { TemplateData, MultiPageTemplateData } from '@worm-vue3-print/core/designer'
import type { OptionIssue } from './units.js'
import { DEPRECATED_OPTION_KEYS } from './option-meta.js'
import { KNOWN_OPTION_KEYS } from './schema/element.js'
import { templateDataSchema, multiPageTemplateDataSchema } from './schema/template.js'

export interface ValidationResult {
  ok: boolean
  issues: OptionIssue[]
  deprecatedHits: string[]
  unknownKeys: string[]
  data?: TemplateData | MultiPageTemplateData
}

/** zod 路径 → 可读路径：['elements',0,'options','width'] → elements[0].options.width
 *  zod 4 的 issue.path 是 PropertyKey[]（symbol 也可能出现），统一按字符串渲染 */
function joinPath(path: readonly PropertyKey[]): string {
  let out = ''
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`
    else out += out ? `.${String(seg)}` : String(seg)
  }
  return out
}

/** 递归扫 options 层：废弃键与未知键都只降级为 warning，不能把存量模板判死 */
function scanKeys(node: unknown, path: string, hits: string[], unknown: string[]) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => scanKeys(item, `${path}[${i}]`, hits, unknown))
    return
  }
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const child = path ? `${path}.${key}` : key
    if (path === 'options' || path.endsWith('.options')) {
      if (DEPRECATED_OPTION_KEYS.includes(key)) hits.push(child)
      else if (!KNOWN_OPTION_KEYS.has(key)) unknown.push(child)
    }
    scanKeys(value, child, hits, unknown)
  }
}

/**
 * type 与 printElementType.type 不一致只给 warning：渲染端按 `el.type || printElementType.type || 'text'`
 * 分派（html-generator.ts:437），两者都写但写错一个仍会按前者出图，属可运行但易困惑的状态。
 */
function scanTypeMismatch(node: unknown, path: string, issues: OptionIssue[]) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => scanTypeMismatch(item, `${path}[${i}]`, issues))
    return
  }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  const meta = obj.printElementType as { type?: string } | undefined
  if (typeof obj.type === 'string' && typeof meta?.type === 'string' && obj.type !== meta.type) {
    issues.push({
      path,
      level: 'warning',
      message: `type='${obj.type}' 与 printElementType.type='${meta.type}' 不一致；渲染按 type 分派，printElementType.type 只是兜底`,
    })
  }
  for (const [key, value] of Object.entries(obj)) {
    scanTypeMismatch(value, path ? `${path}.${key}` : key, issues)
  }
}

export function validateTemplateJson(input: unknown): ValidationResult {
  const isMultiPage = !Array.isArray(input) && !!input
    && Array.isArray((input as MultiPageTemplateData).pages)

  const issues: OptionIssue[] = []
  const deprecatedHits: string[] = []
  const unknownKeys: string[] = []
  let data: TemplateData | MultiPageTemplateData | undefined

  // 两个 schema 分别 safeParse：联合类型的 narrowing 取不到 error.issues，显式分支更直白
  if (isMultiPage) {
    const parsed = multiPageTemplateDataSchema.safeParse(input)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ path: joinPath(issue.path), message: issue.message, level: 'error' })
      }
    } else {
      data = parsed.data as MultiPageTemplateData
    }
  } else {
    const parsed = templateDataSchema.safeParse(input)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ path: joinPath(issue.path), message: issue.message, level: 'error' })
      }
    } else {
      data = parsed.data as TemplateData
    }
  }

  scanKeys(input, '', deprecatedHits, unknownKeys)
  scanTypeMismatch(input, '', issues)
  for (const hit of deprecatedHits) {
    issues.push({ path: hit, message: '该键已废弃，读取兼容但新模板不应写入', level: 'warning' })
  }
  for (const key of unknownKeys) {
    issues.push({ path: key, message: '契约未知键：渲染端会忽略，疑似拼写错误或模型臆造', level: 'warning' })
  }

  if (data) {
    const pages = 'pages' in data ? data.pages : [data]
    for (const page of pages) {
      if (!(page as { unit?: string }).unit) {
        issues.push({
          path: 'unit',
          message: '模板缺 unit，读取时按 pt 迁移（见 core designer/utils/migrate.ts）',
          level: 'warning',
        })
      }
    }
  }

  return { ok: issues.every(i => i.level !== 'error'), issues, deprecatedHits, unknownKeys, data }
}
