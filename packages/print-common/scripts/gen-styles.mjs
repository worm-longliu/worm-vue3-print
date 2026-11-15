import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * 从 print-core 的共享样式源派生 common 的 Shadow DOM 样式表。
 *
 * 共享源 packages/print-core/src/styles/designer.css 是样式与图标的唯一权威：
 * canvas（全局 CSS）与 common（Shadow DOM）都从它取值，common 不再依赖 canvas 的构建产物。
 * 本脚本只负责补两层 Shadow DOM 特有的东西：:host 块级基线、:host 主题令牌副本。
 */
const SHARED_CSS = fileURLToPath(new URL('../../../packages/print-core/src/styles/designer.css', import.meta.url))
const CANVAS_CSS = fileURLToPath(new URL('../../../packages/print-canvas/dist/canvas.css', import.meta.url))
const OUT_DIR = fileURLToPath(new URL('../src/styles/', import.meta.url))
const OUT = `${OUT_DIR}designer.css`

let shared
try {
  shared = readFileSync(SHARED_CSS, 'utf8')
} catch {
  console.error('[gen-styles] 缺少共享样式源 packages/print-core/src/styles/designer.css')
  process.exit(1)
}

/**
 * 自定义元素默认 display:inline，宿主不给块级+高度的话设计器 flex 布局整体塌陷。
 * 只补块级基线：排版（字体/字号/行高/颜色）与 box-sizing 一概不声明，
 * 否则会穿透到 .print-element 改变行高度量、或让 padding+border 少算一圈。
 */
const hostBaseline = `/* 由 scripts/gen-styles.mjs 从 print-core 共享样式源派生，请勿手改；改样式请改 core/src/styles/designer.css */
/* 只补自定义元素必需的块级基线，其余一概不加：
   · 排版（字体/字号/行高/颜色）不声明——canvas 侧同样从宿主页继承，写在这里会穿透到 .print-element 改变行高度量；
   · box-sizing 不 blanket 继承——canvas 各控件按需自带 box-sizing，全局 border-box 会让 padding/border 少算一圈（右键菜单曾差 12px）。 */
:host {
  display: block;
  width: 100%;
  height: 100%;
}
`

/**
 * 浮层令牌对齐：canvas 的表达式/帮助弹窗在 .designer-container 子树内，能继承其 --pd-* 变量；
 * 本包浮层挂 shadow root（.designer-container 的兄弟节点），var() 解析不到 → 整卡观感塌陷。
 * 把共享源的同一 token 块在 :host 上再声明一次，值与 canvas 逐字同源。
 */
const tokenBlock = shared.match(/\.designer-container\s*\{[^}]*--pd-bg[^}]*\}/)
if (!tokenBlock) console.warn('[gen-styles] 共享源中未找到 .designer-container 令牌块，跳过 :host 变量注入（浮层样式将回落 fallback）')
const hostTokens = tokenBlock ? `\n:host${tokenBlock[0].slice('.designer-container'.length)}\n` : ''

/** 漂移检测：canvas 已构建时，检查其规则选择器是否仍被共享源覆盖（只报告，不阻断） */
if (process.argv.includes('--check')) {
  if (!existsSync(CANVAS_CSS)) {
    console.log('[gen-styles] 漂移检测：canvas 未构建，跳过（共享源不依赖它）')
  } else {
    const unscoped = readFileSync(CANVAS_CSS, 'utf8').replace(/\[data-v-[0-9a-f]{6,10}\]/g, '')
    const keys = [...unscoped.matchAll(/(?:^|\})\s*([^{}]+)\{/g)]
      .map(m => m[1].trim().split(',')[0].trim())
      .filter(s => s && !s.startsWith('@') && !s.startsWith(':root'))
    const missed = [...new Set(keys)].filter(s => !shared.includes(s))
    console.log(`[gen-styles] 漂移检测：canvas ${keys.length} 个选择器，共享源未覆盖 ${missed.length} 个`)
    if (missed.length) console.warn('[gen-styles] 可能漂移的选择器：', missed.slice(0, 12).join(' | '))
  }
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, `${hostBaseline}${hostTokens}${shared}`, 'utf8')

const bytes = Buffer.byteLength(`${hostBaseline}${hostTokens}${shared}`, 'utf8')
const rules = (shared.match(/\{/g) || []).length
console.log(`[gen-styles] 已从共享源派生 src/styles/designer.css：${rules} 条规则 / ${(bytes / 1024).toFixed(1)} kB（不再依赖 canvas/dist）`)
