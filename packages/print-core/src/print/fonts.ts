// packages/print-core/src/print/fonts.ts
// 字体栈与模板字体声明的唯一真实来源：浏览器设计器、服务端 PDF 渲染、桌面客户端打印共用。
// 本模块为纯逻辑，不做任何 IO、不依赖 DOM。

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
