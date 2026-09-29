// scoped 派生泄漏审计：找出「canvas 里只在某组件 scoped 域生效、但 Common 派生 CSS 会跨组件命中」的类名。
//
// 为什么需要：print-common 的样式是从 canvas 构建 CSS 剥离 [data-v-*] 派生的（见
// packages/print-common/PARITY.md §〇）。剥离后规则不再受组件作用域隔离，
// 于是 canvas 里「同名类但拿不到规则」的节点在 Common 里会突然被套上样式 ——
// 例：PropertyPanel 的 `.margin-grid{display:grid;grid-template-columns:1fr 1fr}` 曾把
// 拼版区段的留白也排成两列（canvas 侧是单列堆叠），且 WatermarkConfig 的 `.pd-hint`
// 把拼版错误行的红字盖成灰字。这类差异 DOM 断言全绿，只有实测 computed style 才看得见。
//
// 用法：`node demo-common/scripts/style-scope-audit.mjs`（canvas 改过样式后重跑）。
// 输出两类候选，需人工裁决（脚本只列嫌疑，不判定真差异）：
//   A. 纯泄漏 —— 该类只在 1 个组件的 scoped style 定义，却被别的组件模板使用；
//   B. 定义不一致 —— 多个组件都定义了该类但声明不同，派生后会叠加/覆盖出第三种结果。
// 裁决方式：在两侧页面上取该节点的 computed style 对比；确有差异的写进
// packages/print-common/styles/scope-patches.css（gen-styles 会追加到派生 CSS 末尾）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..', 'packages', 'print-canvas', 'src')

const files = []
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.vue')) files.push(p)
  }
}
walk(ROOT)

const norm = (s) => s.replace(/\s+/g, ' ').trim()
const define = new Map()
const use = new Map()

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const blocks = src.match(/<style scoped[^>]*>([\s\S]*?)<\/style>/g) ?? []
  const css = norm(blocks.map(x => x.replace(/^<style[^>]*>/, '').replace(/<\/style>$/, '')).join(' '))
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const c of (m[1].match(/\.([A-Za-z][\w-]*)/g) ?? [])) {
      const name = c.slice(1)
      if (!define.has(name)) define.set(name, new Map())
      if (!define.get(name).has(f)) define.get(name).set(f, new Set())
      define.get(name).get(f).add(norm(m[2]))
    }
  }
  const tpl = (src.match(/<template>([\s\S]*?)<\/template>/) ?? ['', ''])[1]
  const used = new Set()
  for (const a of tpl.matchAll(/class="([^"]*)"/g)) a[1].split(/\s+/).forEach(c => c && used.add(c))
  for (const a of tpl.matchAll(/:class="([^"]*)"/g)) {
    for (const c of a[1].matchAll(/'([A-Za-z][\w-]*)'/g)) used.add(c[1])
  }
  for (const c of used) {
    if (!use.has(c)) use.set(c, new Set())
    use.get(c).add(f)
  }
}

const short = (f) => f.replace(`${ROOT}/components/`, '').replace(`${ROOT}/`, '')
const pure = []
const differ = []
for (const [cls, defs] of define) {
  const foreign = [...(use.get(cls) ?? [])].filter(u => !defs.has(u))
  if (!foreign.length) continue
  if (defs.size === 1) pure.push({ cls, def: [...defs.keys()][0], foreign })
  else if (new Set([...defs.values()].flatMap(s => [...s])).size > 1) differ.push({ cls, defs, foreign })
}

console.log(`A. 纯泄漏（该类规则只在单个组件定义，却被其它组件用到）${pure.length} 条：`)
for (const p of pure.sort((a, b) => a.cls.localeCompare(b.cls))) {
  console.log(`  .${p.cls}  定义 ${short(p.def)}  →  外部使用 ${p.foreign.map(short).join(', ')}`)
}
console.log(`B. 多组件同名但声明不同 ${differ.length} 条：`)
for (const d of differ.sort((a, b) => a.cls.localeCompare(b.cls))) {
  console.log(`  .${d.cls}  外部使用 ${d.foreign.map(short).join(', ')}`)
  for (const [f, set] of d.defs) console.log(`      ${short(f)}: ${[...set].join(' | ')}`)
}
console.log('提示：以上是嫌疑清单，需按文件头说明用 computed style 实测裁决；已裁决并修正的条目见 packages/print-common/styles/scope-patches.css')
