import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * 从 Vue3 设计器的构建产物派生 Web Component 样式表。
 *
 * 为什么这样做：canvas 的 scoped 样式编译后带 `[data-v-xxxxxxxx]` 属性选择器，
 * 而 Common 侧是手写 DOM、没有这些属性。剥掉作用域属性即可得到同一份规则；
 * 前提是 Common 的 DOM 类名结构必须与 canvas 一致 —— 这正是「样式完全一致」的机械约束：
 * 类名对不上，样式就会掉，比对截图时立刻暴露。
 *
 * 依赖 canvas 已构建（npm run build -w @worm-vue3-print/canvas）。
 */
const CANVAS_CSS = fileURLToPath(new URL('../../../packages/print-canvas/dist/canvas.css', import.meta.url))
const NATIVE_CSS = fileURLToPath(new URL('../../../packages/print-canvas/src/styles/native-controls.css', import.meta.url))
const OUT_DIR = fileURLToPath(new URL('../src/styles/', import.meta.url))
const OUT = `${OUT_DIR}designer.css`

let canvasCss
try {
  canvasCss = readFileSync(CANVAS_CSS, 'utf8')
} catch {
  console.error('[gen-styles] 缺少 packages/print-canvas/dist/canvas.css，先执行 npm run build -w @worm-vue3-print/canvas')
  process.exit(1)
}

const nativeCss = readFileSync(NATIVE_CSS, 'utf8')

// 剥掉 Vue scoped 作用域属性；同时清掉编译残留的 [data-v-*] 后代组合
const unscoped = canvasCss.replace(/\[data-v-[0-9a-f]{6,10}\]/g, '')

/**
 * 自定义元素默认 display:inline，宿主不给块级+高度的话设计器 flex 布局整体塌陷
 * （早期 spike 实测根节点高 29 万 px，验证件已删除）。:host 基线必须由本样式表自带。
 */
const hostBaseline = `/* 由 scripts/gen-styles.mjs 从 print-canvas 派生，请勿手改；改样式请改 canvas 后重新构建 */
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
 * 浮层令牌对齐：canvas 的表达式/帮助弹窗渲染在 .designer-container 子树内，能继承其
 * scoped 样式里声明的 --pd-* 变量；本包浮层挂 shadow root（.designer-container 的兄弟
 * 节点），var() 全部解析不到 → 回落 fallback，整卡观感塌陷（实测弹窗底色透明、文字纯黑、
 * 页签无选中态）。把同一 token 块在 :host 上再声明一次：自定义属性沿继承同时流进容器与
 * 浮层，值与 canvas 逐字同源，无第二份维护。
 */
const tokenBlock = unscoped.match(/\.designer-container\s*\{[^}]*--pd-bg[^}]*\}/)
if (!tokenBlock) console.warn('[gen-styles] 未找到 .designer-container 的 --pd-* 令牌块，跳过 :host 变量注入（浮层样式将回落 fallback）')
const hostTokens = tokenBlock ? `\n:host${tokenBlock[0].slice('.designer-container'.length)}\n` : ''

mkdirSync(OUT_DIR, { recursive: true })
/** 派生泄漏修正层（手写）：剥 [data-v-*] 会让 scoped 规则跨组件命中，这里按 canvas 实测值还原 */
const patches = readFileSync(fileURLToPath(new URL('../styles/scope-patches.css', import.meta.url)), 'utf8')
writeFileSync(OUT, `${hostBaseline}${hostTokens}${nativeCss}${unscoped}${patches}\n`, 'utf8')

const bytes = Buffer.byteLength(`${hostBaseline}${hostTokens}${nativeCss}${unscoped}${patches}`, 'utf8')
const rules = (unscoped.match(/\{/g) || []).length
console.log(`[gen-styles] 已派生 src/styles/designer.css：${rules} 条规则 + 泄漏修正层 ${(patches.length / 1024).toFixed(1)} kB / ${(bytes / 1024).toFixed(1)} kB（canvas ${(unscoped.length / 1024).toFixed(1)} kB + native-controls ${(nativeCss.length / 1024).toFixed(1)} kB）`)
