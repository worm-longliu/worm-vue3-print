// 架构守卫：三端不得各自实现测量、纸高推导、出图参数与码制渲染；这些必须来自 core。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TARGETS = ['services/print-render/src', 'clients/print-client/src']
/** 白名单：允许出现宿主能力的文件（driver 与平台适配层） */
const ALLOW = [
  /client\/src\/main\/driver-electron\.ts$/,
  /render\/src\/driver-playwright\.ts$/,
  /client\/src\/main\/pdf-printer\.ts$/, // 出纸命令：唯一消费者，属平台适配
  /\.test\.ts$/,
]
const FORBIDDEN = [
  { pattern: /\boffsetHeight\b|\bgetBoundingClientRect\b/, why: 'DOM 测量必须走 core 的 DOM 执行器' },
  { pattern: /\bcomposeContinuousHeight\b|\bMIN_CONTINUOUS_HEIGHT_MM\b/, why: '连续纸纸高推导必须在 core' },
  { pattern: /from ['"](jsbarcode|qrcode|bwip-js)['"]/, why: '码制渲染必须走 core 执行器' },
  { pattern: /\bprintBackground\s*:|\bpreferCSSPageSize\s*:/, why: '出图参数必须来自 core 的 pdf 规格（driver 只透传）' },
  { pattern: /\bprintToPDF\s*\(|\bpage\.pdf\s*\(/, why: '出图调用只允许出现在 driver 内' },
]

const walk = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

const violations = []
for (const target of TARGETS) {
  for (const file of walk(target)) {
    if (!/\.(ts|mjs|js)$/.test(file)) continue
    // Windows 下 join 产生反斜杠，白名单正则按 POSIX 分隔符匹配
    const normalized = file.replace(/\\/g, '/')
    if (ALLOW.some(rule => rule.test(normalized))) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    for (const rule of FORBIDDEN) {
      const index = lines.findIndex(text => rule.pattern.test(text))
      if (index >= 0) violations.push(`${file}:${index + 1} ${rule.why}`)
    }
  }
}

if (violations.length > 0) {
  console.error('打印架构守卫未通过：\n' + violations.join('\n'))
  process.exit(1)
}
console.log('打印架构守卫通过：三端未出现重复的测量/纸高/出图/码制实现')
