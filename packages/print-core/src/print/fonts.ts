// packages/print-core/src/print/fonts.ts
// 字体清单与字体栈的唯一真实来源：浏览器设计器、服务端 PDF 渲染、桌面客户端打印共用。
// 本模块为纯逻辑，不做任何 IO、不依赖 DOM。

export type FontSource = 'server' | 'client'

/** 单个出图端的字体上报结果。available=false 表示未连接/不可达，与「已连接但清单为空」语义不同 */
export interface FontSourceReport {
  available: boolean
  fonts: readonly string[]
}

/** 该端未上报时的标准值 */
export const UNAVAILABLE: FontSourceReport = { available: false, fonts: [] }

export interface FontCandidate {
  family: string
  /** 模板声明字体可带的展示名；下拉列表优先展示它，写入模板的始终是 family */
  label?: string
  /**
   * 只含真实上报成功且包含该字体的端。
   * 空数组表示「模板声明字体」——自带 webfont 文件，不依赖出图端系统字体，
   * 但也不参与 findMissingFonts 的判定（判定只回答「系统里有没有」）。
   */
  sources: FontSource[]
}

/** 置顶字体声明：可只给族名，也可带上展示名 */
export interface FontPin {
  family: string
  /** 下拉列表里展示的名字；缺省用族名 */
  label?: string
}

/** 合并后的字体目录，供设计器展示与校验使用 */
export interface FontCatalog {
  fonts: FontCandidate[]
  available: Record<FontSource, boolean>
}

/** 模板声明的字体文件：`url` 以 '/' 开头时按渲染端 baseUrl 解析，绝对 URL 原样使用 */
export interface PrintFontFile {
  url: string
  /** CSS 字重；缺省 400。必须与模板里元素实际使用的字重一致，否则 Chromium 会合成粗体（度量不同） */
  weight?: number
  /** CSS 字型；缺省 normal */
  style?: 'normal' | 'italic'
}

/**
 * 模板级字体声明：随模板保存，服务端/客户端/浏览器据此生成同一份 @font-face，
 * 从而不依赖各端系统里装了什么字体。
 */
export interface PrintFontDeclaration {
  /** CSS 族名，必须与元素 options.fontFamily 的写法一致 */
  family: string
  /** 设计器下拉里的显示名；缺省用 family */
  label?: string
  files: readonly PrintFontFile[]
}

/**
 * 生成模板声明字体的 @font-face CSS。
 *
 * - `font-display: block`：测量与出图期间绝不能用兜底字体顶上，否则分页按兜底度量算。
 * - 无声明或声明不合法（无族名/无可用 url）时返回空串，调用方可直接拼接。
 */
export function buildFontFaceCss(fonts?: readonly PrintFontDeclaration[]): string {
  const blocks: string[] = []
  for (const font of fonts ?? []) {
    const family = font?.family?.trim()
    if (!family) continue
    const quoted = `"${family.replace(/"/g, '')}"`
    for (const file of font.files ?? []) {
      const url = file?.url?.trim()
      if (!url) continue
      const weight = Number.isFinite(file.weight) ? Number(file.weight) : 400
      const style = file.style === 'italic' ? 'italic' : 'normal'
      blocks.push(
        `@font-face{font-family:${quoted};src:url("${url}")${fontFormatHint(url)};` +
        `font-weight:${weight};font-style:${style};font-display:block;}`,
      )
    }
  }
  return blocks.length ? `${blocks.join('')}\n` : ''
}

/** 按扩展名给出 format 提示；无法判断时不写（让浏览器自行嗅探，避免提示错误导致整条 src 被拒） */
function fontFormatHint(url: string): string {
  const path = url.split(/[?#]/)[0]!.toLowerCase()
  if (path.endsWith('.woff2')) return ' format("woff2")'
  if (path.endsWith('.woff')) return ' format("woff")'
  if (path.endsWith('.ttf')) return ' format("truetype")'
  if (path.endsWith('.otf')) return ' format("opentype")'
  return ''
}

export interface MissingFont {
  family: string
  /** 引用该字体的元素/单元格位置标识 */
  targets: string[]
}

/**
 * 结构性最小接口：同时兼容 render 侧与 designer 侧两个 TemplateData，避免跨模块类型耦合。
 * `id` 必须可选——render 侧 `TemplateData` 为 `id: string`，designer 侧 `PrintElementData` 为 `id?: string`，
 * 写成必填会让设计器调用方被迫 cast，反而掩盖真实字段不匹配。
 */
export interface FontScannableElement {
  id?: string
  options?: Record<string, any>
}

export interface FontScannableTemplate {
  elements?: readonly FontScannableElement[]
  header?: { elements?: readonly FontScannableElement[] }
  footer?: { elements?: readonly FontScannableElement[] }
  firstPageOverlay?: { elements?: readonly FontScannableElement[] }
}

/**
 * 全局兜底字体栈，逐字对齐原 css-builder 中 body 的 font-family 输出。
 * 元素是可直接拼接的合法 CSS 片段：需要引号的族名自带引号，
 * 通用族名（sans-serif）绝不能加引号——加了会被解析为字面字体名而失效。
 */
export const FALLBACK_FONT_STACK: readonly string[] = [
  '"Microsoft YaHei"',
  '"PingFang SC"',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
]

/** 比较用键：去空白 + 小写。不复用展示值，避免大小写与空格造成重复项 */
function compareKey(name: string): string {
  return name.trim().toLowerCase()
}

/** 稳定、与 locale/ICU 无关的族名比较 */
function compareFamily(a: string, b: string): number {
  const ka = compareKey(a)
  const kb = compareKey(b)
  if (ka < kb) return -1
  if (ka > kb) return 1
  return 0
}

/**
 * 规范化字体名列表并保持输入顺序：
 * 去空白、丢空值与非法类型、去重（大小写不敏感，保留首次出现写法）、
 * 剔除 '.' 开头的系统隐藏字体。
 */
function normalizeFontNames(raw: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw ?? []) {
    if (typeof item !== 'string') continue
    const name = item.trim()
    if (!name) continue
    if (name.startsWith('.')) continue
    const key = compareKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/**
 * 规范化一个端上报的原始字体名列表：在 {@link normalizeFontNames} 的基础上按族名稳定升序
 * （上报顺序无意义，升序才能让同一份清单在不同机器上产出相同目录）。
 */
export function normalizeFontList(raw: readonly string[]): string[] {
  return normalizeFontNames(raw).sort(compareFamily)
}

/** 规范化置顶字体声明：兼容纯族名写法，去空、去重（族名大小写不敏感，保留首次出现） */
function normalizePinnedFonts(raw: readonly (string | FontPin)[]): FontPin[] {
  const seen = new Set<string>()
  const out: FontPin[] = []
  for (const item of raw ?? []) {
    if (typeof item !== 'string' && typeof item !== 'object') continue
    const family = normalizeFontNames([typeof item === 'string' ? item : item?.family ?? ''])[0]
    if (!family) continue
    const key = compareKey(family)
    if (seen.has(key)) continue
    seen.add(key)
    const label = typeof item === 'object' ? item?.label?.trim() : ''
    out.push(label ? { family, label } : { family })
  }
  return out
}

/**
 * 合并预设字体与两端上报。
 *
 * - `preset` 为模板声明字体（宿主经设计器 prop 写入模板），按传入顺序**置顶**
 *   （顺序即优先级，故不做排序），`sources` 为空。
 * - 远端清单里的同名字体只补 `sources`，不新增行、不移动位置，族名写法保留先入者（声明优先）。
 * - 远端独有字体排在声明字体之后，排序为「来源数降序 → 族名升序」，
 *   使两端都可用的字体排在最前（最安全的选择最先出现）。
 */
export function mergeFontSources(input: {
  /** 模板声明的字体（族名或带展示名的对象）；不传时行为与仅合并两端上报完全一致 */
  preset?: readonly (string | FontPin)[]
  server: FontSourceReport
  client: FontSourceReport
}): FontCatalog {
  const byKey = new Map<string, FontCandidate>()
  const pinned: FontCandidate[] = []

  for (const pin of normalizePinnedFonts(input.preset ?? [])) {
    const candidate: FontCandidate = { family: pin.family, sources: [] }
    if (pin.label) candidate.label = pin.label
    pinned.push(candidate)
    byKey.set(compareKey(pin.family), candidate)
  }

  const ingest = (report: FontSourceReport | undefined, source: FontSource): void => {
    if (!report?.available) return
    for (const family of normalizeFontList(report.fonts)) {
      const key = compareKey(family)
      const found = byKey.get(key)
      if (found) {
        if (!found.sources.includes(source)) found.sources.push(source)
      } else {
        byKey.set(key, { family, sources: [source] })
      }
    }
  }

  ingest(input.server, 'server')
  ingest(input.client, 'client')

  const pinnedKeys = new Set(pinned.map(c => compareKey(c.family)))
  const rest = [...byKey.values()]
    .filter(candidate => !pinnedKeys.has(compareKey(candidate.family)))
    .sort((a, b) => b.sources.length - a.sources.length || compareFamily(a.family, b.family))

  return {
    fonts: [...pinned, ...rest],
    available: {
      server: input.server?.available === true,
      client: input.client?.available === true,
    },
  }
}

/**
 * 把 CSS 值转义为可安全放入双引号包裹的内联样式属性（style="..."）的形式。
 * 属性值中直接出现 `"` 会提前闭合属性，导致其后的声明整条丢失
 * （实测：`style="font-family:"SimSun", Arial"` 解析后 fontFamily 为空串）。
 */
export function escapeInlineStyleValue(cssValue: string): string {
  return cssValue.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * 生成 CSS font-family 值：显式族名 + 全局兜底栈。
 * - 未设置/空白 → 纯兜底栈
 * - 值已含逗号 → 视为调用方给出的完整栈，原样前置（不整体加引号，否则整串会变成一个字体名）
 * - 其余 → 作为单个族名加引号后前置
 */
export function toFontFamilyStack(family?: string): string {
  const name = family?.trim()
  if (!name) return FALLBACK_FONT_STACK.join(', ')
  const head = name.includes(',') ? name : `"${name.replace(/"/g, '')}"`
  return [head, ...FALLBACK_FONT_STACK].join(', ')
}

/**
 * 找出模板中引用、但指定端没有的字体。
 *
 * 该端未成功上报时**直接返回空数组**——拿不到清单不等于字体缺失，
 * 这是「校验不阻断」策略成立的前提，故在函数内保证而非依赖调用方。
 */
export function findMissingFonts(
  template: FontScannableTemplate,
  catalog: FontCatalog,
  source: FontSource,
): MissingFont[] {
  if (!catalog?.available?.[source]) return []

  const known = new Set<string>()
  for (const candidate of catalog.fonts ?? []) {
    if (candidate.sources.includes(source)) known.add(compareKey(candidate.family))
  }

  const missing = new Map<string, MissingFont>()
  const record = (family: unknown, target: string): void => {
    if (typeof family !== 'string') return
    const name = family.trim()
    if (!name) return
    const key = compareKey(name)
    if (known.has(key)) return
    const found = missing.get(key)
    if (found) {
      if (!found.targets.includes(target)) found.targets.push(target)
      return
    }
    missing.set(key, { family: name, targets: [target] })
  }

  const scanElement = (el: FontScannableElement | undefined): void => {
    if (!el?.id) return
    const opts = el.options ?? {}
    record(opts.fontFamily, el.id)
    const rows = opts.tableRows
    if (!Array.isArray(rows)) return
    rows.forEach((row: any, rowIndex: number) => {
      if (!Array.isArray(row?.cells)) return
      row.cells.forEach((cell: any, colIndex: number) => {
        record(cell?.fontFamily, `${el.id}#r${rowIndex}c${colIndex}`)
      })
    })
  }

  const groups = [
    template?.elements,
    template?.header?.elements,
    template?.footer?.elements,
    template?.firstPageOverlay?.elements,
  ]
  for (const group of groups) {
    if (Array.isArray(group)) group.forEach(scanElement)
  }

  return [...missing.values()]
}
