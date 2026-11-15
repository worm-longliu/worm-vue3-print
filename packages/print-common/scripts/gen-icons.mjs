// 图标派生脚本：从 print-core 的共享图标清单派生 common 的内置图标表。
// 清单（packages/print-core/src/styles/icon-manifest.json）是图标名的单一权威来源；
// common 不引入 lucide 运行时依赖，canvas 直接 import lucide-vue-next 的同名图标。
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const PKG = join(fileURLToPath(import.meta.url), '../..')
const MANIFEST = fileURLToPath(new URL('../../../packages/print-core/src/styles/icon-manifest.json', import.meta.url))
const OUT = join(PKG, 'src/core/icons.ts')

/** PascalCase → kebab-case（lucide 文件名口径；数字前补连字符） */
function kebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])(\d)/g, '$1-$2')
    .toLowerCase()
}

/** 解析 lucide ESM 图标模块，返回内部 SVG 标记 */
function parseLucideModule(source) {
  const body = source.slice(source.indexOf('[', source.indexOf('createLucideIcon')))
  const end = body.lastIndexOf(']')
  const inner = body.slice(1, end)
  const tags = []
  const re = /\[\s*"(\w+)"\s*,\s*\{([^}]*)\}\s*\]/g
  let m
  while ((m = re.exec(inner))) {
    const [, tag, attrsRaw] = m
    const attrs = []
    const attrRe = /(\w+):\s*"([^"]*)"/g
    let a
    while ((a = attrRe.exec(attrsRaw))) {
      if (a[1] === 'key') continue
      attrs.push(`${a[1]}="${a[2]}"`)
    }
    tags.push(`<${tag} ${attrs.join(' ')} />`)
  }
  return tags.join('')
}

let names
try {
  names = JSON.parse(readFileSync(MANIFEST, 'utf8')).icons
} catch {
  console.error('[gen-icons] 缺少共享图标清单 packages/print-core/src/styles/icon-manifest.json')
  process.exit(1)
}
if (!Array.isArray(names) || !names.length) {
  console.error('[gen-icons] 共享图标清单为空')
  process.exit(1)
}

const LUCIDE_ICONS = (() => {
  const candidates = [
    join(PKG, '../../node_modules/lucide-vue-next/dist/esm/icons'),
    join(PKG, '../../demo/node_modules/lucide-vue-next/dist/esm/icons'),
  ]
  return candidates.find(existsSync)
})()

if (!LUCIDE_ICONS) {
  console.error('[gen-icons] 未找到 lucide-vue-next 图标目录，请先在仓库根 npm install')
  process.exit(1)
}

// 文件名兜底索引：lucide 对含数字的图标命名不统一（grid-3x3 vs 直觉的 grid-3-x3），
// 去掉连字符后比对，避免为个别图标硬编码别名表。
const ICON_INDEX = new Map(readdirSync(LUCIDE_ICONS)
  .filter(f => f.endsWith('.js'))
  .map(f => [f.slice(0, -3).replace(/-/g, ''), f]))

const icons = {}
const missing = []
for (const name of names) {
  const guess = kebab(name)
  const base = existsSync(join(LUCIDE_ICONS, `${guess}.js`))
    ? guess
    : ICON_INDEX.get(guess.replace(/-/g, ''))
  if (!base) { missing.push(name); continue }
  const svg = parseLucideModule(readFileSync(join(LUCIDE_ICONS, base.endsWith('.js') ? base : `${base}.js`), 'utf8'))
  if (!svg) { missing.push(name); continue }
  icons[name] = svg
}

const decl = Object.entries(icons)
  .map(([name, svg]) => `  ${name}: '${svg.replace(/'/g, "\\'")}',`)
  .join('\n')

writeFileSync(OUT, `// 自动生成，请勿手改：由 scripts/gen-icons.mjs 从 print-core 共享图标清单派生。
// 图标名与 canvas 一一对应，工具栏/格式栏按同名取用，保证两处视觉一致。

/** lucide 图标内部 SVG 片段（viewBox 固定 0 0 24 24，stroke 走 currentColor） */
export const ICONS: Record<string, string> = {
${decl}
}

/** 生成图标 SVG 字符串；未知图标名返回空串（调用方按文本兜底）。cls 对应 canvas 里挂在 lucide 组件上的 class */
export function iconSvg(name: string, size = 15, cls?: string): string {
  const body = ICONS[name]
  if (!body) return ''
  return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${size}" height="\${size}"\${cls ? \` class="\${cls}"\` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\${body}</svg>\`
}
`)

const rel = relative(PKG, OUT)
console.log(`[gen-icons] 共享清单 ${names.length} 个图标，成功派生 ${Object.keys(icons).length} 个 → ${rel}`)
if (missing.length) console.warn('[gen-icons] 以下图标未能派生（按名字核对 lucide 文件名）：', missing.join(', '))
