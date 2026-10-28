// 发版载体自检：版本号、内置更新记录、Release 正文、README 直链表、客户端 dist 卫生、安装包重打判据。
// 起因是两次真实事故：1.3.8 功能在包里但内置「更新记录」缺那条文案（被迫补发 1.3.9）；README 直链表忘改会指向上一版资产。
// 用法：node scripts/check-release-carriers.mjs          自动判态（未发布段非空=发版前预检，为空=发版后核对）
//      node scripts/check-release-carriers.mjs --pre|--post [--base=<ref>]
// 退出码：0 通过（允许 WARN）/ 1 有 FAIL / 2 读不到文件
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const args = process.argv.slice(2)
const FORCE_PRE = args.includes('--pre')
const FORCE_POST = args.includes('--post')
const baseIdx = args.findIndex(a => a.startsWith('--base='))
const BASE = baseIdx >= 0 ? args[baseIdx].split('=')[1] : 'HEAD'

const read = rel => {
  const p = join(ROOT, rel)
  if (!existsSync(p)) {
    console.error(`读不到文件：${rel}`)
    process.exit(2)
  }
  return readFileSync(p, 'utf8')
}

const results = []
const add = (level, item, how) => results.push({ level, item, how })

const changelog = read('docs/中文/CHANGELOG.md')
const un = /## 未发布(.*?)\n## V/s.exec(changelog)?.[1] ?? ''
const unBullets = (un.match(/^\- \*\*/gm) ?? []).length + (un.match(/^\n- /gm) ?? []).length
const latestSection = /## (V[\d.]+)\((\d{4}-\d{2}-\d{2})\)/.exec(changelog)?.[1] ?? ''
const mode = FORCE_PRE ? 'pre' : FORCE_POST ? 'post' : unBullets > 0 ? 'pre' : 'post'

const pkgVer = JSON.parse(read('package.json')).version
const coreVer = JSON.parse(read('packages/print-core/package.json')).version
const canvasVer = JSON.parse(read('packages/print-canvas/package.json')).version
const clientVer = JSON.parse(read('clients/print-client/package.json')).version
const commonVer = JSON.parse(read('packages/print-common/package.json')).version

const HELP = [
  'packages/print-canvas/src/help-content/changelog.ts',
  'packages/print-common/src/shell/help-content/changelog.ts',
]

// 1) 版本号一致性：主线五包同号（common 已转正式版，随主线同号）
const mainLine = [pkgVer, coreVer, canvasVer, clientVer, commonVer]
if (new Set(mainLine).size !== 1) {
  add('FAIL', `主线版本号不同号：root=${pkgVer} core=${coreVer} canvas=${canvasVer} client=${clientVer} common=${commonVer}`, '按升版文件集把五包同号后再发')
} else add('PASS', `主线版本号一致 = ${coreVer}（含 common）`, '')

// 2) CHANGELOG 与版本号的关系
if (mode === 'pre') {
  add('WARN', `「未发布」段有 ${unBullets} 条待折叠，最新已发布段是 ${latestSection}`, '发版时折进新版本段并同步两份内置更新记录')
  if (coreVer === latestSection.replace('V', '')) {
    add('WARN', `core 仍是已发布的 ${coreVer}，未发布段那 ${unBullets} 条尚未带出`, '发版要先升号（版本号由维护者定）；升号后这条自动转绿')
  }
} else if (unBullets > 0) {
  add('FAIL', `--post 态下「未发布」段仍残留 ${unBullets} 条`, '把条目折进版本段或明确保留为下一版内容')
} else add('PASS', '「未发布」段已清空（条目应已折进版本段）', '')

// 3) 内置更新记录：最新已发布段必须在两份里都有
for (const f of HELP) {
  const body = read(f)
  if (!latestSection) { add('FAIL', `${f}：CHANGELOG 找不到版本段`, '先核对 CHANGELOG'); continue }
  const tag = latestSection.replace('V', '')
  const has = new RegExp(`V${tag.replace(/\./g, '\\.')}<`).test(body) || body.includes(`V${tag}`)
  if (!has) add('FAIL', `${f} 里没有 ${latestSection} 这一版`, '发版必改：两份 help-content/changelog.ts 各加该版条目（1.3.8 就是漏这步补发了 1.3.9）')
  else add('PASS', `${f} 已含 ${latestSection}`, '')
}

// 4) Release 正文底稿
const notes = read('.github/release/notes.md')
add(notes.includes(latestSection.replace('V', '')) || notes.includes(latestSection)
  ? 'PASS' : 'WARN', `.github/release/notes.md 是否指向 ${latestSection || '（无版本段）'}`,
  '该文件是下一次发版的正文底稿，发版前要整篇换成新版本')

// 5) README 安装包直链表：tag 版本必须与 core 同号；文件名版本可比 core 旧（沿用上版安装包时）
const readme = read('README.md')
const rows0 = [...readme.matchAll(/releases\/download\/v([^/]+)\/WormPrintClient-([0-9][^-]*)-/g)].map(m => ({ tag: m[1], file: m[2] }))
const uniqTag = [...new Set(rows0.map(r => r.tag))]
const uniqFile = [...new Set(rows0.map(r => r.file))]
if (rows0.length === 0) add('WARN', 'README 里没匹配到 `releases/download/v<版本>/WormPrintClient-<版本>-` 直链', '核对「下载客户端安装包」一节是否被改写')
else if (!uniqTag.every(v => v === coreVer)) add('FAIL', `README 直链 tag 版本 ${uniqTag.join('/')} 与 core ${coreVer} 不一致`, '每次发版必须同步这张表的 tag 部分，否则指向上一版资产')
else if (uniqFile.every(v => v === coreVer)) add('PASS', `README 直链表 tag 与文件名版本 = ${coreVer}`, '')
else add('WARN', `README 直链 tag = ${coreVer}，安装包文件名版本 = ${uniqFile.join('/')}（沿用上版产物，README 已注明）`, '确认发行版确实重传了同名文件后再置笃')

// 6) 客户端 dist 卫生：目录里的安装包只能同属一个打包版本（本版重打 = 与 core 同号；沿用上版 = 与上版同号）
const distDir = join(ROOT, 'clients/print-client/dist')
if (existsSync(distDir)) {
  const pkgs = readdirSync(distDir).filter(f => /\.(dmg|exe|deb|rpm|AppImage)$/i.test(f))
  const pkgVers = [...new Set(pkgs.map(f => (f.match(/WormPrintClient-([0-9][^-]*)-/) ?? [])[1]).filter(Boolean))]
  if (pkgs.length === 0) add('PASS', '客户端 dist 无安装包（发版前正常）', '')
  else if (pkgVers.length > 1) add('FAIL', `dist 里混有多个版本的安装包：${pkgVers.join(', ')}`, `pack-client-release.mjs 会把 dist 全部收进 SHA256SUMS → 把多余版本整批移到 ~/print-client-dist/<旧版>/`)
  else if (pkgVers[0] === coreVer) add('PASS', `dist 内 ${pkgs.length} 个安装包均属 ${coreVer}`, '')
  else add('PASS', `dist 内 ${pkgs.length} 个安装包同属沿用版 ${pkgVers[0]}（本版未重打客户端）`, '上传 v' + coreVer + ' 前重算 SHA256SUMS.txt')
}

// 7) 安装包重打判据：core 的 render/* 与 functions/format.ts 命中就必须重打七件
let changed = ''
try {
  changed = execFileSync('git', ['diff', '--name-only', `${BASE}..`], { cwd: ROOT, encoding: 'utf8' })
} catch (e) {
  add('WARN', `git diff ${BASE}.. 取变更失败：${e.message}`, '用 --base=<上个有资产的 tag> 指定基线')
}
if (changed) {
  const hit = changed.split('\n').filter(f => /packages\/print-core\/src\/(render\/|functions\/format\.ts)/.test(f))
  if (hit.length > 0) add('WARN', `变更命中渲染管线 ${hit.length} 处（${hit[0]} 等）`, '客户端只依赖 core → 七件安装包需按本版重打，别复用上一版资产')
  else add('PASS', '变更未触及 core 渲染管线', '安装包可沿用上版产物（仍建议核对 app.asar 尺寸）')
}

for (const r of results) {
  const mark = r.level === 'PASS' ? '✅' : r.level === 'WARN' ? '⚠️' : '❌'
  console.log(`${mark} ${r.item}${r.how ? `\n    → ${r.how}` : ''}`)
}
const fails = results.filter(r => r.level === 'FAIL').length
const warns = results.filter(r => r.level === 'WARN').length
console.log(`\n发版载体自检（${mode === 'pre' ? '发版前预检' : '发版后核对'}）：FAIL ${fails} / WARN ${warns} / 共 ${results.length} 项`)
process.exit(fails > 0 ? 1 : 0)
