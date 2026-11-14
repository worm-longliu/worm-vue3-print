// 架构守卫：各端不得各自实现测量、纸高推导、出图参数、码制渲染与图表渲染；这些必须来自 core 或独立可选包。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// 桌面 MCP 工具同样只能调 core，不许自带测量或码制实现
const TARGETS = ['services/print-render/src', 'clients/print-client/src', 'packages/print-mcp/src']
/** 白名单：允许出现宿主能力的文件（driver 与平台适配层） */
const ALLOW = [
  /client\/src\/main\/driver-electron\.ts$/,
  /render\/src\/driver-playwright\.ts$/,
  /client\/src\/main\/pdf-printer\.ts$/, // 出纸命令：唯一消费者，属平台适配
  /client\/src\/main\/html-printer\.ts$/, // Chromium 原生打印参数：唯一消费者，属平台适配
  /\.test\.ts$/,
]
/**
 * 插件渲染库清单（P5 泛化）：出图端不得直接依赖任何插件的底层渲染库，
 * 能力必须由 `@worm-vue3-print/<plugin>` 插件包 + core 通用执行器协议承载。
 * 新增可选扩展包时只需在此登记裸库名，不用再改正则；官方 scoped 包始终放行。
 */
const PLUGIN_RENDER_LIBS = ['echarts', 'zrender']

/** 抽出静态 from / 副作用 import / 动态 import() / require() 的模块名 */
function importedModule(text) {
  return /(?:from\s*|import\s*\(?\s*|require\(\s*)['"]([^'"]+)['"]/.exec(text)?.[1]
}

/** 插件渲染库是否以裸名被直接依赖（覆盖子路径，如 echarts/core） */
function isPluginRenderLibImport(text) {
  const specifier = importedModule(text)
  if (!specifier || specifier.startsWith('@worm-vue3-print/')) return false
  return PLUGIN_RENDER_LIBS.some(lib => specifier === lib || specifier.startsWith(`${lib}/`))
}

const FORBIDDEN = [
  { pattern: /\boffsetHeight\b|\bgetBoundingClientRect\b/, why: 'DOM 测量必须走 core 的 DOM 执行器' },
  { pattern: /\bcomposeContinuousHeight\b|\bMIN_CONTINUOUS_HEIGHT_MM\b/, why: '连续纸纸高推导必须在 core' },
  { pattern: /from ['"](jsbarcode|qrcode|bwip-js)['"]/, why: '码制渲染必须走 core 执行器' },
  { check: isPluginRenderLibImport, why: '出图端不得直接依赖插件渲染库；请经 @worm-vue3-print/... 插件包与 core 执行器协议接入' },
  { pattern: /\bprintBackground\s*:|\bpreferCSSPageSize\s*:/, why: '出图参数必须来自 core 的 pdf 规格（driver 只透传）' },
  { pattern: /\bprintToPDF\s*\(|\bpage\.pdf\s*\(/, why: '出图调用只允许出现在 driver 内' },
]

/** 规则自检：正负样例随每次 CI 运行，防止泛化后规则静默失效或误伤官方插件包 */
const SELF_CHECK = [
  { text: "import * as echarts from 'echarts'", hit: true },
  { text: "import 'echarts/core'", hit: true },
  { text: "const e = await import('echarts')", hit: true },
  { text: "const e = require('echarts/charts')", hit: true },
  { text: "import { loadChartExecutorBundle } from '@worm-vue3-print/echarts/node'", hit: false },
  { text: "import '@worm-vue3-print/echarts/node'", hit: false },
  { text: "import { createChartRenderer } from '@worm-vue3-print/echarts'", hit: false },
  { text: "const x = require('@worm-vue3-print/echarts/node')", hit: false },
]

const walk = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

for (const sample of SELF_CHECK) {
  if (isPluginRenderLibImport(sample.text) !== sample.hit) {
    console.error(`打印架构守卫规则自检失败（expected hit=${sample.hit}）：${sample.text}`)
    process.exit(1)
  }
}

const violations = []
for (const target of TARGETS) {
  for (const file of walk(target)) {
    if (!/\.(ts|mjs|js)$/.test(file)) continue
    // Windows 下 join 产生反斜杠，白名单正则按 POSIX 分隔符匹配
    const normalized = file.replace(/\\/g, '/')
    if (ALLOW.some(rule => rule.test(normalized))) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    for (const rule of FORBIDDEN) {
      const matches = rule.check ?? (text => rule.pattern.test(text))
      const index = lines.findIndex(matches)
      if (index >= 0) violations.push(`${file}:${index + 1} ${rule.why}`)
    }
  }
}

if (violations.length > 0) {
  console.error('打印架构守卫未通过：\n' + violations.join('\n'))
  process.exit(1)
}
console.log('打印架构守卫通过：各端未出现重复的测量/纸高/出图/码制/插件渲染库实现')
