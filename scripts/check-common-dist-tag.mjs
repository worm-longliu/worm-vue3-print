// common 的 dist-tag 自检：latest 只能是正式版，预发布只能挂 next。
// 背景：npm 首次发布会给预览版自动打 latest；正式版发布后 latest 应指向正式版。
// 用法：
//   node scripts/check-common-dist-tag.mjs            只查（exit 0 健康 / 1 latest 被预发布版占用）
//   node scripts/check-common-dist-tag.mjs --dry-run  查到问题时打印将执行的命令，不执行
//   node scripts/check-common-dist-tag.mjs --fix      查到问题时执行 npm dist-tag rm <pkg> latest 并复查
//   node scripts/check-common-dist-tag.mjs --warn-only  照旧打印红灯但 exit 0（给演练链用：既有红灯不该把演练判失败）
import { execFileSync } from 'node:child_process'

const PKG = '@worm-vue3-print/common'
const REGISTRY = 'https://registry.npmjs.org'
const args = process.argv.slice(2)
const FIX = args.includes('--fix')
const DRY = args.includes('--dry-run')
const WARN_ONLY = args.includes('--warn-only')

function npmViewDistTags() {
  const out = execFileSync('npm', ['view', PKG, 'dist-tags', '--json', `--registry=${REGISTRY}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(out)
}

/** 预发布版判据交给 semver 的号段形态：带 `-` 后缀即 beta/alpha/rc，正式版一律视为可用 */
const isPrerelease = v => typeof v === 'string' && v.includes('-')

let tags
try {
  tags = npmViewDistTags()
} catch (e) {
  console.error(`[${PKG}] 读取 dist-tags 失败（网络或未登录？）：${e.message}`)
  process.exit(WARN_ONLY ? 0 : 2)
}

console.log(`[${PKG}] dist-tags 实况：${JSON.stringify(tags)}`)

if (!tags.latest) {
  console.log('健康：latest 不存在（仅预发布阶段允许；正式版发布后 latest 应指向正式版）。')
  process.exit(0)
}
if (!isPrerelease(tags.latest)) {
  console.log(`健康：latest = ${tags.latest} 是正式版。`)
  process.exit(0)
}

if (WARN_ONLY) {
  console.error('[--warn-only] 只报不改、且不把红灯升级为失败。')
  process.exit(0)
}

const cmd = ['dist-tag', 'rm', PKG, 'latest', `--registry=${REGISTRY}`]
console.error(`红灯：latest 指向预发布版 ${tags.latest}，裸装 npm i ${PKG} 会吃到实验包。`)
if (!FIX) {
  console.error(`修复：npm ${cmd.join(' ')}（或直接跑本脚本加 --fix）`)
  process.exit(1)
}
if (DRY) {
  console.error(`[--dry-run] 将执行：npm ${cmd.join(' ')}`)
  process.exit(1)
}

try {
  execFileSync('npm', cmd, { stdio: 'inherit' })
} catch (e) {
  console.error(`摘除 latest 失败：${e.message}`)
  process.exit(2)
}
try {
  const after = npmViewDistTags()
  console.log(`复查 dist-tags：${JSON.stringify(after)}`)
  process.exit(after.latest ? 1 : 0)
} catch (e) {
  console.error(`复查失败（稍后手动跑 npm view ${PKG} dist-tags --json）：${e.message}`)
  process.exit(2)
}
