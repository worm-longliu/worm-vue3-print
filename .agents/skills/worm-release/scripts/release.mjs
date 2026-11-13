#!/usr/bin/env node
// 发版编排：判据先行，对外写动作默认 dry-run，--apply 才落地。
// 用法：node .agents/skills/worm-release/scripts/release.mjs <子命令> [选项]
// 子命令：preflight | tag | release | npm | client | verify
// 判据函数是纯函数，由同目录 release.test.mjs 覆盖：
//   node --test .agents/skills/worm-release/scripts/release.test.mjs

export const GH_REPO = 'worm-longliu/worm-vue3-print'
export const GITEE_REPO = 'liulong_oschina/worm-vue3-print'
export const NPM_PACKAGES = ['core', 'canvas', 'common', 'skills'].map(n => `@worm-vue3-print/${n}`)
export const REMOTES = ['origin', 'github']

const GH_CHANGELOG = `https://github.com/${GH_REPO}/blob/master/docs/中文/CHANGELOG.md`
const GITEE_CHANGELOG = `https://gitee.com/${GITEE_REPO}/blob/master/docs/中文/CHANGELOG.md`
const INSTALLER_EXT = /\.(dmg|exe|deb|rpm|AppImage)$/i
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/

// 客户端运行时依赖闭包：core（根入口 + /client + /node）、mcp → contract、客户端自身。
// skills 不算：客户端只把它拼成 npx 命令字符串，不进产物逻辑。
const CLIENT_RUNTIME = [
  /^packages\/print-core\/src\//,
  /^packages\/print-contract\/src\//,
  /^packages\/print-mcp\/src\//,
  /^clients\/print-client\/src\//,
]
const CLIENT_CONFIG = /^clients\/print-client\/(package\.json|electron-builder\.[^/]+|tsconfig[^/]*)$/

const installerVersion = name => (name.match(/WormPrintClient-([0-9][^-]*)-/) ?? [])[1] ?? ''

/** 由 notes.md 中文半篇派生 Gitee 正文：换更新日志链接 + 把「## 安装包」段换成指向 GitHub 的尾块。 */
export function deriveGiteeBody(notes, { version, installerTag, reuse }) {
  const en = /^#.*—\s*English\s*$/m.exec(notes)
  if (!en) throw new Error('notes.md 里找不到英文半篇标题（— English），无法切出中文半篇')
  const start = notes.slice(0, en.index).indexOf('## 安装包')
  if (start < 0) throw new Error('notes.md 中文半篇里找不到「## 安装包」段，无法派生 Gitee 指向块')

  const head = notes.slice(0, en.index).slice(0, start).replace(GH_CHANGELOG, GITEE_CHANGELOG).replace(/\s+$/, '')
  const link = `[${installerTag} 发行版](https://github.com/${GH_REPO}/releases/tag/${installerTag})`
  const files = '六件安装包（macOS Intel / Apple Silicon、Windows x64、Linux deb / rpm / AppImage）与 `SHA256SUMS.txt`'
  const lead = reuse
    ? `本版 core 出纸层零改动，**不重打安装包**，沿用 \`${installerTag}\` 的${files}`
    : files
  const tail = `Gitee 附件单文件上限 100MB，${reuse ? '这些文件' : ''}发布在 GitHub 的 ${link}，本发行版不挂${reuse ? '' : '这些'}附件。`
  const npm = `npm 四包 \`@worm-vue3-print/core\` / \`canvas\` / \`common\` / \`skills\` 已同时发布 ${version}。`
  return `${head}\n\n---\n\n**桌面客户端安装包**：${lead}。${tail}${npm}\n`
}

/** 升版那笔会同步改号：纯版本号 bump 不构成客户端运行时变化，不该触发重打。 */
export function isVersionOnlyDiff(diffText) {
  const changed = diffText.split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
  const versionLine = /^\s*(?:export const version\b|"version"\s*:|"@worm-vue3-print\/[^"]+"\s*:)/
  return changed.length > 0 && changed.every(l => versionLine.test(l.slice(1)))
}

/** 客户端是否需要重打安装包：按真实依赖闭包判，排除测试文件。 */
export function repackDecision(files) {
  const hits = files.filter(f => f && !TEST_FILE.test(f) && (CLIENT_RUNTIME.some(r => r.test(f)) || CLIENT_CONFIG.test(f)))
  return {
    needsRepack: hits.length > 0,
    hits,
    reason: hits.length > 0
      ? `命中客户端依赖闭包 ${hits.length} 处（${hits[0]} 等）→ 六件安装包必须按本版重打`
      : '变更未触及客户端依赖闭包（core / contract / mcp / clients）→ 可沿用上版安装包',
  }
}

/** 两平台各自缺哪些 tag 的发行版。 */
export function releaseGaps({ localTags, ghReleases, giteeReleases }) {
  const gh = new Set(ghReleases.map(r => r.tag_name))
  const gitee = new Set(giteeReleases.map(r => r.tag_name))
  return {
    ghMissing: localTags.filter(t => !gh.has(t)),
    giteeMissing: localTags.filter(t => !gitee.has(t)),
  }
}

/** 客户端 dist 卫生：安装包只能同属一个版本，否则 pack-client-release.mjs 会把旧版一起收进 SHA256SUMS。 */
export function distHygiene(files, version) {
  const pkgs = files.filter(f => INSTALLER_EXT.test(f))
  return {
    ok: pkgs.every(f => installerVersion(f) === version),
    versions: [...new Set(pkgs.map(installerVersion))],
    foreign: pkgs.filter(f => installerVersion(f) !== version),
  }
}

/** 本地 SHA256SUMS 与 GitHub 资产 digest 逐条对账；远端拿不到 digest 算证据缺失，不算通过。 */
export function digestCompare(sumsText, assets) {
  const remote = new Map(assets.map(a => [a.name, a.digest]))
  const matched = []
  const mismatched = []
  const missing = []
  for (const line of sumsText.split('\n').filter(l => l.trim())) {
    const [sha, name] = line.trim().split(/\s+/)
    const got = remote.get(name)
    if (!got) missing.push(name)
    else if (String(got).replace(/^sha256:/, '') === sha) matched.push(name)
    else mismatched.push(name)
  }
  return { matched, mismatched, missing }
}

/** npm 同号是否已被占用（版本号不可复用，占用即封死同号重发）。 */
export function npmOccupancy(docs, version) {
  return Object.entries(docs).map(([pkg, doc]) => ({
    pkg,
    published: Boolean(doc?.versions?.[version]),
    latest: doc?.['dist-tags']?.latest ?? null,
  }))
}

/** tag 落点：最后一个把自身改动登记进本版 CHANGELOG 段的提交，不是 HEAD。candidates 按旧→新。 */
export function pickTagTarget(candidates) {
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (candidates[i].hasSection) return candidates[i].sha
  }
  return null
}

/** 本地与两远端的 tag 落点必须三方一致。 */
export function verifyTagLanding({ local, origin, github }) {
  const ok = Boolean(local) && local === origin && local === github
  return {
    ok,
    detail: ok ? `三方一致 ${local}` : `落点不一致 local=${local} origin=${origin} github=${github}`,
  }
}

// ── 以下为 IO 与子命令：判据一律先跑，写动作只在 --apply 下落地 ──────────────────
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '../../../..')
const CHANGELOG = 'docs/中文/CHANGELOG.md'
const NOTES = '.github/release/notes.md'
const DIST = 'clients/print-client/dist'

const rows = []
const add = (level, item, how = '') => rows.push({ level, item, how })
const flush = title => {
  console.log(`\n${title}`)
  for (const r of rows) {
    console.log(`${{ PASS: '✅', WARN: '⚠️ ', FAIL: '❌', INFO: 'ℹ️ ', PLAN: '📝' }[r.level]} ${r.item}`)
    if (r.how) console.log(`    → ${r.how}`)
  }
  const fail = rows.filter(r => r.level === 'FAIL').length
  const warn = rows.filter(r => r.level === 'WARN').length
  console.log(`\n${title}：FAIL ${fail} / WARN ${warn} / 共 ${rows.length} 项`)
  return fail > 0 ? 1 : 0
}

const run = (bin, args, opts = {}) => {
  try {
    return { ok: true, out: execFileSync(bin, args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim() }
  } catch (e) {
    return { ok: false, out: (e.stdout ?? '').toString().trim(), err: (e.stderr ?? e.message).toString().trim() }
  }
}
const git = (...args) => run('git', args)
const gh = (...args) => run('gh', args)
const ghJson = (...args) => {
  const r = gh(...args)
  if (!r.ok) return null
  try { return JSON.parse(r.out) } catch { return null }
}
const readJson = rel => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
const fetchJson = async url => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

const rootVersion = () => readJson('package.json').version
const esc = s => s.replace(/\./g, '\\.')
const sectionOf = (text, version) => {
  const m = new RegExp(`## V${esc(version)}\\([^)]*\\)[\\s\\S]*?(?=\\n## |$)`).exec(text)
  return m ? m[0] : null
}
const showFile = (ref, rel) => {
  const r = git('show', `${ref}:${rel}`)
  return r.ok ? r.out : null
}

/** 本版段在哪个提交里最后被改动：逐个比对该段与其父提交的差异，命中即 tag 落点。 */
function tagCandidates(version) {
  const log = git('log', '--format=%H', '-40', '--', CHANGELOG)
  if (!log.ok) return []
  const list = log.out.split('\n').filter(Boolean).map(sha => {
    const cur = sectionOf(showFile(sha, CHANGELOG) ?? '', version)
    const prev = sectionOf(showFile(`${sha}^`, CHANGELOG) ?? '', version)
    return { sha, hasSection: Boolean(cur) && cur !== prev }
  })
  return list.reverse()
}

const localTagSha = tag => {
  const r = git('rev-list', '-n1', tag)
  return r.ok ? r.out : null
}
const remoteTagSha = (remote, tag) => {
  const r = git('ls-remote', '--tags', remote, `refs/tags/${tag}^{}`)
  return r.ok && r.out ? r.out.split(/\s+/)[0] : null
}
const ghReleases = () => ghJson('api', `repos/${GH_REPO}/releases`, '--paginate') ?? []
const giteeReleases = async () => fetchJson(`https://gitee.com/api/v5/repos/${GITEE_REPO}/releases?per_page=100`)
const npmDocs = async (registry = 'https://registry.npmjs.org') => {
  const docs = {}
  for (const pkg of NPM_PACKAGES) {
    docs[pkg] = await fetchJson(`${registry}/${pkg.replace('/', '%2f')}`)
  }
  return docs
}
/** 上一个挂了安装包的 GitHub 发行版 tag：重打判据与 README 直链的基线。 */
const prevInstallerTag = () => {
  const rel = ghReleases().filter(r => !r.draft && (r.assets ?? []).some(a => INSTALLER_EXT.test(a.name)))
  return rel.length ? rel[0].tag_name : null
}
const changedSince = base => {
  const r = git('diff', '--name-only', `${base}..HEAD`)
  return r.ok ? r.out.split('\n').filter(Boolean) : []
}
// 版本号单点文件只改号时剔除：升版那笔本身不是客户端变更。
const VERSION_FILE = /(^|\/)(package\.json|package-lock\.json|version\.ts)$/
const repackFiles = base => changedSince(base).filter(f => {
  if (!VERSION_FILE.test(f)) return true
  const d = git('diff', `${base}..HEAD`, '--', f)
  return !(d.ok && isVersionOnlyDiff(d.out))
})

async function preflight({ version, base }) {
  const carriers = run('node', ['scripts/check-release-carriers.mjs', '--pre', `--base=${base}`])
  console.log(carriers.out || carriers.err)
  add(carriers.ok ? 'PASS' : 'FAIL', `check-release-carriers --pre --base=${base}`, carriers.ok ? '' : '先修掉它报的 FAIL 再往下走')

  const gaps = releaseGaps({ localTags: git('tag', '--list').out.split('\n').filter(Boolean), ghReleases: ghReleases(), giteeReleases: await giteeReleases() })
  add(gaps.ghMissing.length ? 'WARN' : 'PASS', `GitHub 发行版缺口：${gaps.ghMissing.join(', ') || '无'}`)
  add(gaps.giteeMissing.length ? 'WARN' : 'PASS', `Gitee 发行版缺口：${gaps.giteeMissing.join(', ') || '无'}`, '历史缺口只报告，补发要单独授权')

  const occ = npmOccupancy(await npmDocs(), version)
  const taken = occ.filter(o => o.published)
  add(taken.length ? 'FAIL' : 'PASS', taken.length ? `npm 已占用 ${version}：${taken.map(o => o.pkg).join(', ')}` : `npm 四包均未发布 ${version}`,
    taken.length ? '版本号不可复用：要么另切版本，要么确认本次只是补发发行版' : '')
  add('INFO', `线上 latest：${occ.map(o => `${o.pkg.split('/')[1]}=${o.latest}`).join(' ')}`)

  const files = repackFiles(base)
  const repack = repackDecision(files)
  add(repack.needsRepack ? 'WARN' : 'PASS', repack.reason, repack.needsRepack ? '走 client 子命令重打六件' : 'README 直链整条沿用上版，本版 Release 不挂附件')
  return flush(`发版前预检 v${version}`)
}

function tag({ version, date, apply }) {
  const target = pickTagTarget(tagCandidates(version))
  if (!target) {
    add('FAIL', `找不到把改动登记进 V${version} 段的提交`, `先把本版条目写进 ${CHANGELOG} 并提交，再打 tag`)
    return flush(`打 tag v${version}`)
  }
  add('PASS', `tag 落点 = ${target.slice(0, 7)}（最后改动 V${version} 段那笔）`)
  const existing = localTagSha(`v${version}`)
  if (existing) {
    add('FAIL', `本地已存在 v${version}，落点 ${existing.slice(0, 7)}`, '重指 tag 属破坏性动作：先证 npm 未占同号、两远端可 force-push，再单独授权')
    return flush(`打 tag v${version}`)
  }
  const section = sectionOf(readFileSync(join(ROOT, CHANGELOG), 'utf8'), version) ?? ''
  const bullets = [...section.matchAll(/^- \*\*(.+?)\*\*/gm)].map(m => `- ${m[1]}`)
  const message = `Worm Print V${version}（${date}）\n\n${bullets.join('\n')}\n`
  const cmds = [
    ['git', ['tag', '-a', `v${version}`, target, '-m', message]],
    ...REMOTES.map(r => ['git', ['push', r, `refs/tags/v${version}`]]),
  ]
  for (const [bin, args] of cmds) {
    if (!apply) { add('PLAN', `${bin} ${args.map(a => (a.includes('\n') ? '<要点式说明>' : a)).join(' ')}`); continue }
    const r = run(bin, args)
    add(r.ok ? 'PASS' : 'FAIL', `${bin} ${args[0]} ${args[1]}`, r.ok ? '' : r.err)
    if (!r.ok) return flush(`打 tag v${version}`)
  }
  if (apply) {
    const landing = verifyTagLanding({ local: localTagSha(`v${version}`), origin: remoteTagSha('origin', `v${version}`), github: remoteTagSha('github', `v${version}`) })
    add(landing.ok ? 'PASS' : 'FAIL', landing.detail)
  } else {
    add('INFO', `tag 说明由 ${CHANGELOG} 的 V${version} 段派生（${bullets.length} 条要点）`, '加 --apply 才真正打 tag 并双推')
  }
  return flush(`打 tag v${version}`)
}

async function release({ version, installerTag, reuse, apply, platform }) {
  const notes = readFileSync(join(ROOT, NOTES), 'utf8')
  const sha = localTagSha(`v${version}`)
  if (!sha) {
    add('FAIL', `本地没有 v${version} 标签`, '先跑 tag 子命令')
    return flush(`发布发行版 v${version}`)
  }
  const body = deriveGiteeBody(notes, { version, installerTag, reuse })
  const bodyFile = join(tmpdir(), `worm-gitee-${version}.md`)
  writeFileSync(bodyFile, body, 'utf8')

  if (platform !== 'gitee') {
    const has = ghReleases().some(r => r.tag_name === `v${version}`)
    if (has) add('WARN', `GitHub 已有 v${version} 发行版`, '不覆盖；改正文用 gh release edit，属单独授权动作')
    else if (!apply) add('PLAN', `gh workflow run release.yml -f tag=v${version}`, '工作流会构建+测试+校验版本，再用 notes.md 建 Release（不挂附件）')
    else {
      const r = gh('workflow', 'run', 'release.yml', '-f', `tag=v${version}`)
      add(r.ok ? 'PASS' : 'FAIL', `触发 release.yml v${version}`, r.ok ? '用 gh run watch 看结论' : r.err)
    }
  }
  if (platform !== 'gh') {
    const has = (await giteeReleases()).some(r => r.tag_name === `v${version}`)
    if (has) add('WARN', `Gitee 已有 v${version} 发行版`, '不覆盖；改正文走 PATCH，属单独授权动作')
    else if (!apply) add('PLAN', `POST /repos/${GITEE_REPO}/releases（tag_name=v${version} target_commitish=${sha.slice(0, 7)}）`, `正文已派生到 ${bodyFile}（${body.length} 字），加 --apply 才提交`)
    else {
      const token = process.env.GITEE_ACCESS_TOKEN
      if (!token) add('FAIL', '环境里没有 GITEE_ACCESS_TOKEN', '令牌只在 ~/.zshenv，写操作只走表单 access_token')
      else {
        const args = ['-s', '-o', join(tmpdir(), `worm-gitee-resp-${version}.json`), '-w', '%{http_code}', '-X', 'POST',
          `https://gitee.com/api/v5/repos/${GITEE_REPO}/releases`,
          '-d', `access_token=${token}`, '-d', `tag_name=v${version}`, '-d', `name=v${version}`,
          '-d', `target_commitish=${sha}`, '--data-urlencode', `body@${bodyFile}`]
        const r = run('curl', args)
        const code = r.out
        const resp = JSON.parse(readFileSync(join(tmpdir(), `worm-gitee-resp-${version}.json`), 'utf8'))
        add(code === '201' ? 'PASS' : 'FAIL', `Gitee 建发行版 HTTP ${code}`, code === '201' ? `id=${resp.id}` : JSON.stringify(resp).slice(0, 300))
        if (code === '201') {
          const back = (await giteeReleases()).find(x => x.tag_name === `v${version}`)
          add(back && back.body === body ? 'PASS' : 'FAIL', '匿名复核 Gitee 正文与派生稿逐字一致', back ? `${back.body.length} 字` : '列表里找不到')
        }
      }
    }
  }
  return flush(`发布发行版 v${version}`)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const runAsync = (bin, args, opts = {}) => new Promise(resolve => {
  execFile(bin, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
    resolve({ ok: !err, out: (stdout ?? '').trim(), err: (stderr ?? err?.message ?? '').trim() }))
})

async function waitRun(workflow, label) {
  let id = null
  for (let i = 0; i < 10 && !id; i++) {
    const runs = ghJson('run', 'list', '--workflow', workflow, '--limit', '1', '--json', 'databaseId')
    id = runs?.[0]?.databaseId ?? null
    if (!id) await sleep(2000)
  }
  if (!id) { add('WARN', `${label} 已触发但取不到 run id`, `gh run list --workflow=${workflow} 手工核对`); return false }
  for (let i = 0; i < 60; i++) {
    const r = ghJson('run', 'view', String(id), '--json', 'status,conclusion')
    if (r?.status === 'completed') {
      add(r.conclusion === 'success' ? 'PASS' : 'FAIL', `${label} run ${id} = ${r.conclusion}`, r.conclusion === 'success' ? '' : `gh run view ${id} --log-failed`)
      return r.conclusion === 'success'
    }
    await sleep(15000)
  }
  add('FAIL', `${label} run ${id} 等待超时`, '去 Actions 页面看结论')
  return false
}

async function npm({ version, apply, skills }) {
  const occ = npmOccupancy(await npmDocs(), version)
  const pending = occ.filter(o => !o.published)
  add('INFO', `线上 latest：${occ.map(o => `${o.pkg.split('/')[1]}=${o.latest}`).join(' ')}`)
  if (!pending.length) {
    add('PASS', `npm 四包均已发布 ${version}`, '版本号不可复用，无需重发')
    return flush(`npm 发布 ${version}`)
  }
  add('WARN', `待发布：${pending.map(o => o.pkg.split('/')[1]).join(', ')}`)
  const jobs = [
    ['publish-npm.yml', [['tag', `v${version}`], ['publish_skills', String(skills)]], 'core/canvas' + (skills ? '/skills' : '')],
    ['publish-common.yml', [['version', version]], 'common'],
  ]
  for (const [file, fields, label] of jobs) {
    for (const dry of [true, false]) {
      const args = [...fields, ['dry_run', String(dry)]].flatMap(([k, v]) => ['-f', `${k}=${v}`])
      if (!apply) { add('PLAN', `gh workflow run ${file} ${args.join(' ')}`, dry ? '先干跑' : '干跑绿后才正式上传'); continue }
      const r = gh('workflow', 'run', file, ...args)
      if (!r.ok) { add('FAIL', `触发 ${file} dry_run=${dry}`, r.err); return flush(`npm 发布 ${version}`) }
      if (!await waitRun(file, `${label} dry_run=${dry}`)) return flush(`npm 发布 ${version}`)
    }
  }
  if (apply) {
    for (const registry of ['https://registry.npmjs.org', 'https://registry.npmmirror.com']) {
      const after = npmOccupancy(await npmDocs(registry), version)
      const bad = after.filter(o => !o.published || o.latest !== version)
      add(bad.length ? 'FAIL' : 'PASS', `${registry} 四包 ${version} 且 latest 同号`, bad.map(o => `${o.pkg}=${o.latest}`).join(', '))
    }
  } else add('INFO', '加 --apply 才触发工作流（先 dry_run=true 再 false）', '发布后以官方源直查为准，本机 npm view 有缓存')
  return flush(`npm 发布 ${version}`)
}

const MIRRORS = {
  ELECTRON_MIRROR: 'https://cdn.npmmirror.com/binaries/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://cdn.npmmirror.com/binaries/electron-builder-binaries/',
  APT_MIRROR: 'https://mirrors.aliyun.com',
}

async function client({ version, base, apply }) {
  const decision = repackDecision(repackFiles(base))
  add(decision.needsRepack ? 'WARN' : 'PASS', decision.reason)
  const distDir = join(ROOT, DIST)
  if (!decision.needsRepack) {
    const tags = [...new Set([...readFileSync(join(ROOT, 'README.md'), 'utf8').matchAll(/releases\/download\/(v[^/]+)\//g)].map(m => m[1]))]
    add(tags.length === 1 && tags[0] === base ? 'PASS' : 'FAIL', `README 直链整条沿用 ${base}`, tags.join('/'))
    add('INFO', `本版 Release 不挂附件，安装包继续从 ${base} 下载`)
    return flush(`客户端安装包 ${version}`)
  }

  const before = existsSync(distDir) ? readdirSync(distDir) : []
  const hy = distHygiene(before, version)
  if (!hy.ok) {
    const dest = join(homedir(), 'print-client-dist')
    for (const f of hy.foreign) {
      const ver = installerVersion(f)
      if (!apply) { add('PLAN', `mv ${DIST}/${f} ~/print-client-dist/${ver}/`, '旧版整批移出仓库，可回移，不删'); continue }
      mkdirSync(join(dest, ver), { recursive: true })
      renameSync(join(distDir, f), join(dest, ver, f))
      add('PASS', `移出旧版 ${f} → ~/print-client-dist/${ver}/`)
    }
  }

  const steps = [
    ['npm', ['run', 'pack:client'], 'mac/win 安装包'],
    ['npm', ['run', 'pack:client:linux'], 'Linux 三包（Docker）'],
    ['node', ['scripts/pack-client-release.mjs', `v${version}`], 'SHA256SUMS 与上传命令'],
  ]
  for (const [bin, args, label] of steps) {
    if (!apply) { add('PLAN', `${bin} ${args.join(' ')}`, `${label}；需带 ELECTRON_MIRROR / APT_MIRROR`); continue }
    const r = await runAsync(bin, args, { env: { ...process.env, ...MIRRORS } })
    add(r.ok ? 'PASS' : 'FAIL', label, r.ok ? '' : r.err.slice(-400))
    if (!r.ok) return flush(`客户端安装包 ${version}`)
  }

  if (!apply) {
    add('INFO', '加 --apply 才真正构建、上传并对账', '上传前本版 GitHub Release 必须已存在；构建后会再查一次 dist 卫生（命名卷会带回旧包）')
    return flush(`客户端安装包 ${version}`)
  }
  const after = existsSync(distDir) ? readdirSync(distDir) : []
  const hy2 = distHygiene(after, version)
  add(hy2.ok ? 'PASS' : 'FAIL', `构建后 dist 卫生：${hy2.versions.join(', ') || '空'}`, hy2.ok ? '' : `命名卷带回旧包：${hy2.foreign.join(', ')}，移出后重算 SHA256SUMS`)
  if (!hy2.ok) return flush(`客户端安装包 ${version}`)

  const rel = ghReleases().find(r => r.tag_name === `v${version}`)
  if (!rel) { add('FAIL', `GitHub 还没有 v${version} 发行版`, '先跑 release 子命令'); return flush(`客户端安装包 ${version}`) }
  const files = after.filter(f => INSTALLER_EXT.test(f) || f === 'SHA256SUMS.txt').map(f => join(distDir, f))
  const ups = await Promise.all(files.map(f => runAsync('gh', ['release', 'upload', `v${version}`, f, '--clobber'])))
  const upFail = ups.filter(u => !u.ok).length
  add(upFail ? 'FAIL' : 'PASS', `并行上传 ${files.length} 件（失败 ${upFail}）`, upFail ? 'connection reset 重试即可' : '')

  const sums = readFileSync(join(distDir, 'SHA256SUMS.txt'), 'utf8')
  const assets = ghJson('api', `repos/${GH_REPO}/releases/${rel.id}/assets`) ?? []
  const cmp = digestCompare(sums, assets)
  add(cmp.mismatched.length || cmp.missing.length ? 'FAIL' : 'PASS',
    `digest 对账 一致 ${cmp.matched.length} / 不符 ${cmp.mismatched.length} / 缺证据 ${cmp.missing.length}`,
    [...cmp.mismatched, ...cmp.missing].join(', '))
  return flush(`客户端安装包 ${version}`)
}

async function verify({ version, base }) {
  const landing = verifyTagLanding({ local: localTagSha(`v${version}`), origin: remoteTagSha('origin', `v${version}`), github: remoteTagSha('github', `v${version}`) })
  add(landing.ok ? 'PASS' : 'FAIL', `tag ${landing.detail}`)

  const ghRel = ghReleases().find(r => r.tag_name === `v${version}`)
  add(ghRel && !ghRel.draft ? 'PASS' : 'FAIL', `GitHub 发行版${ghRel ? ` id=${ghRel.id} 附件 ${ghRel.assets.length} 件` : '缺失'}`)
  const gtRel = (await giteeReleases()).find(r => r.tag_name === `v${version}`)
  add(gtRel ? 'PASS' : 'FAIL', `Gitee 发行版${gtRel ? ` id=${gtRel.id} 正文 ${gtRel.body.length} 字` : '缺失'}`)
  if (ghRel && gtRel) {
    const notes = readFileSync(join(ROOT, NOTES), 'utf8')
    add(ghRel.body.trim() === notes.trim() ? 'PASS' : 'WARN', 'GitHub 正文与 notes.md 逐字一致')
    const derived = deriveGiteeBody(notes, { version, installerTag: base, reuse: !repackDecision(repackFiles(base)).needsRepack })
    add(gtRel.body === derived ? 'PASS' : 'WARN', 'Gitee 正文与派生稿逐字一致', '不一致时人工核对是否手改过')
  }

  for (const registry of ['https://registry.npmjs.org', 'https://registry.npmmirror.com']) {
    const occ = npmOccupancy(await npmDocs(registry), version)
    const bad = occ.filter(o => !o.published || o.latest !== version)
    add(bad.length ? 'FAIL' : 'PASS', `${registry} 四包 ${version} + latest 同号`, bad.map(o => `${o.pkg}=${o.latest}`).join(', '))
  }

  const decision = repackDecision(repackFiles(base))
  const tags = [...new Set([...readFileSync(join(ROOT, 'README.md'), 'utf8').matchAll(/releases\/download\/(v[^/]+)\//g)].map(m => m[1]))]
  const want = decision.needsRepack ? `v${version}` : base
  add(tags.length === 1 && tags[0] === want ? 'PASS' : 'FAIL', `README 直链应指 ${want}`, tags.join('/'))

  if (ghRel?.assets?.length) {
    const sumsFile = join(ROOT, DIST, 'SHA256SUMS.txt')
    if (!existsSync(sumsFile)) add('WARN', '本地没有 SHA256SUMS.txt，无法做 digest 对账')
    else {
      const cmp = digestCompare(readFileSync(sumsFile, 'utf8'), ghRel.assets)
      add(cmp.mismatched.length || cmp.missing.length ? 'FAIL' : 'PASS', `附件 digest 一致 ${cmp.matched.length} / 不符 ${cmp.mismatched.length} / 缺证据 ${cmp.missing.length}`)
    }
  } else add('INFO', '本版 GitHub 发行版 0 附件（沿用上版安装包形态）')

  const carriers = run('node', ['scripts/check-release-carriers.mjs', '--post', `--base=${base}`])
  console.log(carriers.out || carriers.err)
  add(carriers.ok ? 'PASS' : 'FAIL', `check-release-carriers --post --base=${base}`)
  return flush(`发版后核对 v${version}`)
}

const USAGE = `用法：node .agents/skills/worm-release/scripts/release.mjs <子命令> [选项]
  preflight  发版前预检（载体自检 + 两平台缺口 + npm 同号占用 + 重打判据）
  tag        打附注 tag 并双推 origin/github       --apply 才落地
  release    建 GitHub / Gitee 发行版              --apply 才落地
  npm        gh 触发 publish-npm / publish-common  --apply 才落地（先 dry_run）
  client     判客户端变更 → 重打六件 → 上传对账     --apply 才落地
  verify     发版后全链核对（只读）
选项：--version=X --base=<上个有资产的 tag> --date=YYYY-MM-DD --installer-tag=vX
      --reuse / --no-reuse --platform=gh|gitee|both --skills=false --apply
不带 --apply 一律只打印判据与将执行的命令。--apply 不等于用户授权：四个渠道逐个要明示。`

const argv = process.argv.slice(2)
const [cmd, ...rest] = argv[0]?.startsWith('--') ? [null, ...argv] : argv
const opt = (n, d = null) => { const h = rest.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const flag = n => rest.includes(`--${n}`)
let baseCache
const resolveBase = () => (baseCache ??= opt('base') ?? prevInstallerTag() ?? 'HEAD')

const main = async () => {
  if (!cmd || flag('help')) { console.log(USAGE); return 0 }
  const version = opt('version', rootVersion())
  const base = resolveBase()
  const apply = flag('apply')
  const date = opt('date', new Date().toLocaleDateString('sv-SE'))
  console.log(`v${version}｜基线 ${base}｜${apply ? 'APPLY（写动作落地）' : 'dry-run（只打印）'}`)
  if (apply) console.log('⚠️  --apply 只是脚本开关；GitHub / Gitee / npm / 安装包四个渠道仍需用户逐个明示授权')
  switch (cmd) {
    case 'preflight': return preflight({ version, base })
    case 'tag': return tag({ version, date, apply })
    case 'release': {
      const reuse = flag('reuse') || (!flag('no-reuse') && !repackDecision(repackFiles(base)).needsRepack)
      return release({ version, installerTag: opt('installer-tag', reuse ? base : `v${version}`), reuse, apply, platform: opt('platform', 'both') })
    }
    case 'npm': return npm({ version, apply, skills: opt('skills', 'true') !== 'false' })
    case 'client': return client({ version, base, apply })
    case 'verify': return verify({ version, base })
    default: console.error(`未知子命令：${cmd}\n\n${USAGE}`); return 2
  }
}

// 只在作为入口执行时跑 CLI；被测试 import 时不触发任何子命令与网络请求。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}