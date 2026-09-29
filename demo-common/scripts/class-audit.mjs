// 类名覆盖率审计：canvas 模板里出现的类名，Common 源码是否也有对应挂点。
// 用法：`node demo-common/scripts/class-audit.mjs`，canvas 侧新增带样式的类名后重跑。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = (dir, re) => walk(dir).filter(p => re.test(p))
const canvas = files('packages/print-canvas/src', /\.vue$/)
const common = files('packages/print-common/src', /\.ts$/)
  .filter(p => !p.includes('__tests__') && !p.endsWith('designer.css'))

// 抽类名：class="a b" / :class="'a'" / classList.add('a') / 模板串里的字面量
const CLASS_PATTERNS = [
  /class="([^"]+)"/g,
  /:class="\{([^}]+)\}"/g,
  /class="([^"]*)\s*\$/g,
  /classList\.(?:add|toggle|contains)\(\s*'([^']+)'/g,
  /'(?:[a-z][a-z0-9-]*(?:\s[a-z0-9-]+)+)'/g,
]

function extract(text, patterns) {
  const set = new Set()
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const raw = (m[1] ?? m[0]).replace(/['"]/g, ' ')
      for (const tok of raw.split(/[\s,]+/)) {
        if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(tok) && tok.length > 2) set.add(tok)
      }
    }
  }
  return set
}

const canvasClasses = new Set()
for (const f of canvas) for (const c of extract(readFileSync(f, 'utf8'), CLASS_PATTERNS)) canvasClasses.add(c)

const commonText = common.map(f => readFileSync(f, 'utf8')).join('\n')
const commonClasses = extract(commonText, CLASS_PATTERNS)
// 只要类名子串出现在 Common 源码任意位置即算命中（拼类名、模板串、选择器都算）
const hit = c => commonClasses.has(c) || commonText.includes(c)

const missing = [...canvasClasses].filter(c => !hit(c)).sort()
// 过滤明显与 DOM 类无关的噪声（Vue 过渡名、伪元素前后缀）
const NOISE = /(-enter|-leave|-active$|^fade$|^collapse$|^help-modal$)/
const real = missing.filter(c => !NOISE.test(c))
console.log(`canvas 类名 ${canvasClasses.size} 个，Common 未命中 ${real.length} 个：`)
for (const c of real) console.log('  ' + c)
