import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// demo-common 示例库单一来源：把 Vue3 demo 的 src/samples 打包求值后，展开成一份自包含的
// templates.js 落到四个宿主工程。宿主必须与 ./demo 用同一批示例，因此这里只做「求值 + 展开」，
// 不手写第二份模板数据；demo 的示例改了之后重跑本脚本即可（禁止手改产物 templates.js，会被下次同步覆盖）。
// 用法：node demo-common/scripts/sync-demo-samples.mjs
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'))
// esbuild 由 workspace 里的 vite 提供（根 node_modules 提升）；没装依赖时给出可执行提示而不是裸报错
let esbuild
try {
  esbuild = require('esbuild')
} catch {
  console.error('[sync] 解析不到 esbuild：先在仓库根 npm install（demo / canvas 的 vite 会带出该包）')
  process.exit(1)
}

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const APPS = ['vue3', 'vue2', 'react', 'jquery']

/** demo 的示例入口：虚拟文件，避免往 demo 里落临时入口 */
const ENTRY = `export { SAMPLE_TEMPLATES } from './samples/index'
export { deriveBatchData } from './batch-data'
`

/**
 * demo 侧示例相对宿主可能多出的两类依赖，在生成期一次消解：
 * - `@worm-vue3-print/canvas` 的运行时导出（DEFAULT_DEMO_DATA）本就转发自 core/designer，别名到真源；
 * - `import.meta.env.BASE_URL` 是 Vite 注入的部署根路径，宿主与 demo 一样挂在站点根下，取 '/'。
 */
async function loadSamples() {
  if (!existsSync(join(REPO, 'packages', 'print-core', 'dist', 'designer', 'index.js'))) {
    console.error('[sync] 缺少 @worm-vue3-print/core 的 dist/designer：先 npm run build -w @worm-vue3-print/core')
    process.exit(1)
  }
  const result = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: join(REPO, 'demo', 'src'), sourcefile: 'samples-entry.ts', loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    write: false,
    alias: { '@worm-vue3-print/canvas': '@worm-vue3-print/core/designer' },
    define: { 'import.meta.env.BASE_URL': '"/"' },
    logLevel: 'silent',
  })
  const mod = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  return mod
}

const IDENT_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const INLINE_MAX = 120

/** 字面量按仓库风格用单引号，其余走 JSON 转义 */
function lit(value) {
  if (typeof value !== 'string') return JSON.stringify(value)
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `'${escaped}'`
}

/** 键名能裸写就裸写，产物读起来贴近手写口径 */
function keyOf(k) {
  return IDENT_KEY.test(k) ? k : lit(k)
}

/**
 * 值 → JS 字面量。对象/数组不超行宽且内部不再嵌套时压成一行，
 * 其余按缩进展开；undefined 属性丢弃（与 JSON 序列化一致，宿主拿到的仍是纯数据）。
 */
function stringify(value, depth) {
  const pad = '  '.repeat(depth)
  const inner = '  '.repeat(depth + 1)
  if (value === null || typeof value !== 'object') return lit(value)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const flat = value.map(v => stringify(v, 0))
    if (!flat.some(s => s.includes('\n'))) {
      const one = `[${flat.join(', ')}]`
      if (one.length <= INLINE_MAX) return one
    }
    return `[\n${value.map(v => `${inner}${stringify(v, depth + 1)},`).join('\n')}\n${pad}]`
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  if (!entries.length) return '{}'
  const parts = entries.map(([k, v]) => `${keyOf(k)}: ${stringify(v, 0)}`)
  const one = `{ ${parts.join(', ')} }`
  if (!one.includes('\n') && one.length <= INLINE_MAX) return one
  return `{\n${entries.map(([k, v]) => `${inner}${keyOf(k)}: ${stringify(v, depth + 1)},`).join('\n')}\n${pad}}`
}

const { SAMPLE_TEMPLATES, deriveBatchData } = await loadSamples()

/** 标签类示例自带 batchData，其余按 demo 宿主的同款规则派生成字面量，产物保持自包含 */
const SAMPLES = SAMPLE_TEMPLATES.map(sample => ({
  ...sample,
  batchData: sample.batchData?.length ? sample.batchData : deriveBatchData(sample.data),
}))

const body = SAMPLES.map((sample, i) => {
  const title = `  // ───────────────────────── 示例${i + 1}：${sample.name}（${sample.paper}） ─────────────────────────`
  return `${title}\n  ${stringify(sample, 1)},`
}).join('\n')

const banner = `// 宿主示例库：与 ./demo（Vue 3 打印设计器示例）同源，整份文件可以直接抄进业务项目改造成你自己的数据源。
// 由 demo-common/scripts/sync-demo-samples.mjs 从 demo/src/samples 自动生成，请勿手改；
// 示例的增删改只在 demo 侧做，重跑脚本即可同步到四个宿主。
// 纸面口径与 core 渲染管线一致：单位 mm，tableColWidths 之和 = 表格元素宽度，
// tableRows 行高之和 = 表格元素高度，明细行用 rowType 'data' + '{goods.xxx}' 表达式绑定列表。

/** 全部示例：单据 / 标签 / 小票（group/paper/desc 供示例库卡片展示，口径同 demo） */
export const SAMPLES = [`

const output = `${banner}\n${body}\n]\n`

for (const app of APPS) {
  const file = join(REPO, 'demo-common', 'apps', app, 'src', 'templates.js')
  writeFileSync(file, output, 'utf8')
}

// 示例引用的静态资源：demo 用 public 下的占位图与字体，宿主各自带一份才能整包照抄。
// 字体单个 1.5~8MB，四份共 60MB 不进仓库（.gitignore 已排除 apps/*/public/fonts/），
// 但脚本照拷：新克隆的宿主重跑一次即可与 demo 的字面字体一致。
const ASSET_RE = /\/(images|fonts)\/[\w@%.-]+\.(?:png|jpe?g|svg|ttf|woff2?)\b/g
const assetRefs = [...new Set(output.match(ASSET_RE) ?? [])]
const [copied, missing] = [[], []]
for (const ref of assetRefs) {
  const src = join(REPO, 'demo', 'public', ref)
  if (!existsSync(src)) {
    missing.push(ref)
    continue
  }
  for (const app of APPS) {
    const outDir = join(REPO, 'demo-common', 'apps', app, 'public', dirname(ref).replace('/', ''))
    mkdirSync(outDir, { recursive: true })
    copyFileSync(src, join(outDir, basename(ref)))
  }
  copied.push(basename(ref))
}

const bytes = Buffer.byteLength(output, 'utf8')
console.log(
  `已同步 ${APPS.length} 份 templates.js：${SAMPLES.length} 个示例、${output.split('\n').length} 行、${(bytes / 1024).toFixed(0)} KB/份；` +
    `附带静态资源 ${copied.length ? copied.join(', ') : '无'}`,
)
if (missing.length) console.warn(`[warn] 示例引用但 demo/public 下不存在：${missing.join(', ')}`)
