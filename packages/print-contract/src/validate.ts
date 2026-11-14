import { z } from 'zod'
import type { TemplateData, MultiPageTemplateData } from '@worm-vue3-print/core/designer'
import { getElementPlugins, getElementPluginById } from '@worm-vue3-print/core/designer'
import type { OptionIssue } from './units.js'
import { DEPRECATED_OPTION_KEYS } from './option-meta.js'
import {
  elementTypeSchema, createPrintElementDataSchema, KNOWN_OPTION_KEYS,
} from './schema/element.js'
import { createTemplateDataSchema, createMultiPageTemplateDataSchema } from './schema/template.js'

export interface ValidationResult {
  ok: boolean
  issues: OptionIssue[]
  deprecatedHits: string[]
  unknownKeys: string[]
  data?: TemplateData | MultiPageTemplateData
}

/** 校验模式：无 plugins 清单 = 历史模板宽松通道；有清单 = 按注册态强校验（设计文档 §3.4） */
export type ValidationMode = 'legacy' | 'strict'

interface PluginDeclaration { id: string; version?: string }

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

/** 收集模板顶层（含多页 wrapper 与其各页）的 plugins 清单；键存在即进入 strict 模式 */
function collectPluginDeclarations(input: unknown): { declared: boolean; list: PluginDeclaration[] } {
  let declared = false
  const list: PluginDeclaration[] = []
  const read = (raw: unknown) => {
    if (!Array.isArray(raw)) return
    declared = true
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      if (typeof o.id !== 'string' || !o.id) continue
      list.push({ id: o.id, ...(typeof o.version === 'string' ? { version: o.version } : {}) })
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { declared, list }
  const root = input as Record<string, unknown>
  if ('plugins' in root) {
    declared = true
    read(root.plugins)
  }
  if (Array.isArray(root.pages)) {
    for (const page of root.pages) {
      if (page && typeof page === 'object' && 'plugins' in (page as object)) {
        declared = true
        read((page as Record<string, unknown>).plugins)
      }
    }
  }
  return { declared, list }
}

/** 内置类型 ∪ 当前进程已注册的插件类型（与渲染端共用 core 注册表，避免两端判定漂移） */
function allowedElementTypes(): string[] {
  return [...new Set<string>([
    ...(elementTypeSchema.options as readonly string[]),
    ...getElementPlugins().map(p => p.kind.type),
  ])]
}

/** 插件以 optionMeta 声明的专属属性键：legacy 通道不得把它们误报成「契约未知键」 */
function pluginOptionKeys(): Set<string> {
  const keys = new Set<string>()
  for (const plugin of getElementPlugins()) {
    for (const key of Object.keys(plugin.kind.optionMeta ?? {})) keys.add(key)
  }
  return keys
}

/**
 * 递归扫 options 层：废弃键与未知键都只降级为 warning，不能把存量模板判死。
 * knownKeys 允许调用方把注册态的插件属性键并入已知集合（strict 模式下未知键升级为 error）。
 */
function scanKeys(
  node: unknown,
  path: string,
  hits: string[],
  unknown: string[],
  knownKeys: Set<string>,
) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => scanKeys(item, `${path}[${i}]`, hits, unknown, knownKeys))
    return
  }
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const child = path ? `${path}.${key}` : key
    if (path === 'options' || path.endsWith('.options')) {
      if (DEPRECATED_OPTION_KEYS.includes(key)) hits.push(child)
      else if (!knownKeys.has(key)) unknown.push(child)
    }
    scanKeys(value, child, hits, unknown, knownKeys)
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

/** 遍历模板里所有「元素」对象（带 options 的对象），不深入 options 内部 */
function forEachElement(
  node: unknown,
  path: string,
  cb: (element: Record<string, unknown>, path: string) => void,
) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => forEachElement(item, `${path}[${i}]`, cb))
    return
  }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (obj.options && typeof obj.options === 'object'
    && (typeof obj.type === 'string' || obj.printElementType)) {
    cb(obj, path)
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'options') continue
    forEachElement(value, path ? `${path}.${key}` : key, cb)
  }
}

/**
 * 明显拼写错误判定（大小写不敏感）：完全相同 / 一次替换或增删 / 一次相邻转置。
 * 例如 'Text'→'text'、'tabel'→'table' 命中，'signature' 这类全新自定义类型不命中。
 */
function isNearMiss(a: string, b: string): boolean {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (x === y) return true
  if (Math.abs(x.length - y.length) > 1) return false
  if (x.length === y.length) {
    const diff: number[] = []
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff.push(i)
    if (diff.length === 1) return true
    return diff.length === 2 && diff[1] === diff[0] + 1
      && x[diff[0]] === y[diff[1]] && x[diff[1]] === y[diff[0]]
  }
  const short = x.length < y.length ? x : y
  const long = x.length < y.length ? y : x
  let i = 0
  let j = 0
  let skipped = false
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue }
    if (skipped) return false
    skipped = true
    j++
  }
  return true
}

/** legacy 通道的类型判定：拼写错误仍 error，其余未知 type 只 warning（不判死历史模板） */
function scanUnknownTypes(input: unknown, allowed: readonly string[], issues: OptionIssue[]) {
  forEachElement(input, '', (el, path) => {
    const check = (value: unknown, keyPath: string) => {
      if (typeof value !== 'string' || !value) return
      if (allowed.includes(value)) return
      const near = allowed.some(type => isNearMiss(value, type))
      issues.push({
        path: keyPath,
        level: near ? 'error' : 'warning',
        message: near
          ? `元素类型「${value}」与内置/已注册类型仅一步之差，疑似拼写错误（可用类型：${allowed.join('、')}）`
          : `未知元素类型「${value}」：legacy 宽松模式放行；若来自插件请确认已引入对应包，或在模板顶层声明 plugins 清单启用强校验（可用类型：${allowed.join('、')}）`,
      })
    }
    check(el.type, `${path}.type`)
    const meta = el.printElementType as Record<string, unknown> | undefined
    if (meta) check(meta.type, `${path}.printElementType.type`)
  })
}

/** strict 通道：模板声明的插件必须在当前进程已注册，且版本一致；否则明确报错而非静默出空纸 */
function scanPluginDeclarations(list: readonly PluginDeclaration[], issues: OptionIssue[]) {
  for (const decl of list) {
    const plugin = getElementPluginById(decl.id)
    if (!plugin) {
      issues.push({
        path: 'plugins',
        level: 'error',
        message: `MISSING_PLUGIN：模板声明了插件「${decl.id}」，但当前进程未注册该插件；请在宿主引入对应包（服务端按部署白名单装配），不要静默出空纸`,
      })
      continue
    }
    if (decl.version && plugin.kind.version !== decl.version) {
      issues.push({
        path: 'plugins',
        level: 'error',
        message: `PLUGIN_VERSION_MISMATCH：插件「${decl.id}」模板声明 ${decl.version}，当前进程注册的是 ${plugin.kind.version}；请升级宿主依赖或重新导出模板`,
      })
    }
  }
}

export function validateTemplateJson(input: unknown): ValidationResult {
  const isMultiPage = !Array.isArray(input) && !!input
    && Array.isArray((input as MultiPageTemplateData).pages)

  const { declared, list } = collectPluginDeclarations(input)
  const mode: ValidationMode = declared ? 'strict' : 'legacy'
  const allowed = allowedElementTypes()

  // strict 按「内置 ∪ 已注册」构造 enum；legacy 放开为 string，再由 scanUnknownTypes 分级判定
  const typeSchema = mode === 'strict'
    ? z.enum(allowed as [string, ...string[]])
    : z.string()
  const elementSchema = createPrintElementDataSchema(typeSchema)
  const pageSchema = createTemplateDataSchema(elementSchema)
  const multiPageSchema = createMultiPageTemplateDataSchema(pageSchema)

  const issues: OptionIssue[] = []
  const deprecatedHits: string[] = []
  const unknownKeys: string[] = []
  let data: TemplateData | MultiPageTemplateData | undefined

  // 两个 schema 分别 safeParse：联合类型的 narrowing 取不到 error.issues，显式分支更直白
  const parsed = isMultiPage
    ? multiPageSchema.safeParse(input)
    : pageSchema.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ path: joinPath(issue.path), message: issue.message, level: 'error' })
    }
  } else {
    data = parsed.data as TemplateData | MultiPageTemplateData
  }

  const knownKeys = new Set<string>([...KNOWN_OPTION_KEYS, ...pluginOptionKeys()])
  scanKeys(input, '', deprecatedHits, unknownKeys, knownKeys)
  scanTypeMismatch(input, '', issues)
  if (mode === 'legacy') scanUnknownTypes(input, allowed, issues)
  else scanPluginDeclarations(list, issues)

  for (const hit of deprecatedHits) {
    issues.push({ path: hit, message: '该键已废弃，读取兼容但新模板不应写入', level: 'warning' })
  }
  for (const key of unknownKeys) {
    issues.push({
      path: key,
      message: mode === 'strict'
        ? '契约未知键：strict 模式按注册态强校验，请改用插件 optionMeta 声明的属性'
        : '契约未知键：渲染端会忽略，疑似拼写错误或模型臆造',
      level: mode === 'strict' ? 'error' : 'warning',
    })
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
