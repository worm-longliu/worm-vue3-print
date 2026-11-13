import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  deriveGiteeBody,
  digestCompare,
  distHygiene,
  isVersionOnlyDiff,
  npmOccupancy,
  pickTagTarget,
  releaseGaps,
  repackDecision,
  verifyTagLanding,
} from './release.mjs'

const ROOT = join(import.meta.dirname, '../../../..')

const NOTES = `# Worm Print V9.9.9 (2026-11-12)

> **修复版**：四包同号发布到 npm \`9.9.9\`。

\`\`\`bash
npm install @worm-vue3-print/core@9.9.9
\`\`\`

## 本版内容

### 修复

- **表格单元格右键菜单难以唤醒**（issue #6）。改为 mousedown 外点关闭口径。

真实分页与最终出纸效果仍需通过设计器或打印预览确认。明细见 [更新日志](https://github.com/worm-longliu/worm-vue3-print/blob/master/docs/中文/CHANGELOG.md)。

## 安装包

从本 Release 的 Assets 下载：

- \`WormPrintClient-9.9.9-mac-x64.dmg\`
- \`SHA256SUMS.txt\`

---

# Worm Print V9.9.9 (2026-11-12) — English

> **Patch release**: four packages ship to npm.

## What's in this release

### Fixed

- **Table cell context menu hard to open on macOS/Safari** (issue #6).

## Installers

Download from this Release's Assets.
`

test('deriveGiteeBody 只取中文半篇，不带英文标题与英文正文', () => {
  const body = deriveGiteeBody(NOTES, { version: '9.9.9', installerTag: 'v9.9.9', reuse: false })
  assert.ok(!body.includes('English'))
  assert.ok(!body.includes("What's in this release"))
  assert.ok(!body.includes('Patch release'))
  assert.ok(body.startsWith('# Worm Print V9.9.9 (2026-11-12)'))
})

test('deriveGiteeBody 把更新日志链接换成 Gitee 域', () => {
  const body = deriveGiteeBody(NOTES, { version: '9.9.9', installerTag: 'v9.9.9', reuse: false })
  assert.ok(body.includes('https://gitee.com/liulong_oschina/worm-vue3-print/blob/master/docs/中文/CHANGELOG.md'))
  assert.ok(!body.includes('github.com/worm-longliu/worm-vue3-print/blob'))
})

test('deriveGiteeBody 去掉「## 安装包」段，换成指向 GitHub 的尾块', () => {
  const body = deriveGiteeBody(NOTES, { version: '9.9.9', installerTag: 'v9.9.9', reuse: false })
  assert.ok(!body.includes('## 安装包'))
  assert.ok(!body.includes('WormPrintClient-9.9.9-mac-x64.dmg'))
  assert.ok(body.includes('https://github.com/worm-longliu/worm-vue3-print/releases/tag/v9.9.9'))
  assert.ok(body.includes('100MB'))
  assert.ok(body.trimEnd().endsWith('已同时发布 9.9.9。'))
})

test('deriveGiteeBody 沿用上版安装包时指向上一版 tag 并写明不重打', () => {
  const body = deriveGiteeBody(NOTES, { version: '9.9.9', installerTag: 'v9.9.8', reuse: true })
  assert.ok(body.includes('releases/tag/v9.9.8'))
  assert.ok(!body.includes('releases/tag/v9.9.9'))
  assert.ok(body.includes('不重打安装包'))
  assert.ok(body.includes('沿用 `v9.9.8`'))
})

test('deriveGiteeBody 不改写中文半篇的修复条目（派生只动链接与安装包段）', () => {
  const body = deriveGiteeBody(NOTES, { version: '9.9.9', installerTag: 'v9.9.9', reuse: false })
  const bullet = NOTES.split('\n').find(l => l.startsWith('- **表格单元格'))
  assert.ok(body.includes(bullet))
  assert.ok(body.includes('npm install @worm-vue3-print/core@9.9.9'))
})

test('deriveGiteeBody 找不到英文分隔标记时抛错，不静默返回整篇', () => {
  assert.throws(() => deriveGiteeBody('# 只有中文\n\n正文', { version: '9.9.9', installerTag: 'v9.9.9', reuse: false }), /English/)
})

test('deriveGiteeBody 对仓库真实 notes.md 派生后不含英文半篇', () => {
  const notes = readFileSync(join(ROOT, '.github/release/notes.md'), 'utf8')
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  const body = deriveGiteeBody(notes, { version, installerTag: `v${version}`, reuse: false })
  assert.ok(!body.includes('English'))
  assert.ok(body.includes(`已同时发布 ${version}。`))
})

test('repackDecision 命中 core 渲染管线要重打', () => {
  const r = repackDecision(['packages/print-core/src/render/html-generator.ts'])
  assert.equal(r.needsRepack, true)
  assert.equal(r.hits.length, 1)
})

test('repackDecision 命中 core 的 client SDK 与 node 入口也要重打（旧判据只看 render 会漏）', () => {
  for (const f of ['packages/print-core/src/client/index.ts', 'packages/print-core/src/node/index.ts', 'packages/print-core/src/index.ts']) {
    assert.equal(repackDecision([f]).needsRepack, true, f)
  }
})

test('repackDecision 命中 mcp 与 contract 要重打（客户端运行时依赖）', () => {
  assert.equal(repackDecision(['packages/print-mcp/src/tools.ts']).needsRepack, true)
  assert.equal(repackDecision(['packages/print-contract/src/schema.ts']).needsRepack, true)
})

test('repackDecision 命中客户端自身源码与打包配置要重打', () => {
  assert.equal(repackDecision(['clients/print-client/src/main/index.ts']).needsRepack, true)
  assert.equal(repackDecision(['clients/print-client/electron-builder.yml']).needsRepack, true)
})

test('repackDecision 只改 canvas/common/docs/demo 时可沿用上版安装包', () => {
  const r = repackDecision([
    'packages/print-canvas/src/elements/TableElement.vue',
    'packages/print-common/src/shell/designer.ts',
    'docs/中文/CHANGELOG.md',
    'demo/src/App.vue',
    'README.md',
  ])
  assert.equal(r.needsRepack, false)
  assert.deepEqual(r.hits, [])
})

test('repackDecision 排除测试文件（改测试不影响产物）', () => {
  const r = repackDecision([
    'packages/print-core/src/render/paginate.test.ts',
    'packages/print-mcp/src/tools.spec.ts',
    'clients/print-client/src/renderer/mcp-prompt.test.ts',
  ])
  assert.equal(r.needsRepack, false)
})

test('repackDecision 不把 skills 包算进闭包（客户端只引用 npx 命令字符串）', () => {
  assert.equal(repackDecision(['packages/print-skills/src/install.js']).needsRepack, false)
})

test('releaseGaps 分别列出两平台缺的 tag', () => {
  const r = releaseGaps({
    localTags: ['v1.4.6', 'v1.4.7', 'v1.4.8'],
    ghReleases: [{ tag_name: 'v1.4.6' }, { tag_name: 'v1.4.7' }, { tag_name: 'v1.4.8' }],
    giteeReleases: [{ tag_name: 'v1.4.6' }, { tag_name: 'v1.4.7' }],
  })
  assert.deepEqual(r.ghMissing, [])
  assert.deepEqual(r.giteeMissing, ['v1.4.8'])
})

test('distHygiene 混版不通过并列出外来文件', () => {
  const r = distHygiene(['WormPrintClient-1.4.8-mac-x64.dmg', 'WormPrintClient-1.4.7-linux-amd64.deb'], '1.4.8')
  assert.equal(r.ok, false)
  assert.deepEqual(r.foreign, ['WormPrintClient-1.4.7-linux-amd64.deb'])
})

test('distHygiene 同版通过，空目录也通过', () => {
  assert.equal(distHygiene(['WormPrintClient-1.4.8-mac-x64.dmg', 'WormPrintClient-1.4.8-win-x64.exe'], '1.4.8').ok, true)
  assert.equal(distHygiene([], '1.4.8').ok, true)
})

test('distHygiene 忽略 zip/blockmap 等非安装包元数据', () => {
  const r = distHygiene(['WormPrintClient-1.4.8-mac-x64.dmg', 'WormPrintClient-1.4.7-mac-x64.dmg.blockmap', 'latest.yml'], '1.4.8')
  assert.equal(r.ok, true)
})

test('digestCompare 逐条对齐 sha256 前缀，并分别报不符与缺失', () => {
  const sums = `${'a'.repeat(64)}  x.dmg\n${'b'.repeat(64)}  y.exe\n${'c'.repeat(64)}  z.deb\n`
  const r = digestCompare(sums, [
    { name: 'x.dmg', digest: `sha256:${'a'.repeat(64)}` },
    { name: 'y.exe', digest: `sha256:${'d'.repeat(64)}` },
  ])
  assert.deepEqual(r.matched, ['x.dmg'])
  assert.deepEqual(r.mismatched, ['y.exe'])
  assert.deepEqual(r.missing, ['z.deb'])
})

test('digestCompare 远端无 digest 字段时算缺失证据，不当通过', () => {
  const r = digestCompare(`${'a'.repeat(64)}  x.dmg\n`, [{ name: 'x.dmg', digest: null }])
  assert.deepEqual(r.matched, [])
  assert.deepEqual(r.missing, ['x.dmg'])
})

test('npmOccupancy 区分已占用与未占用，并带出 latest', () => {
  const r = npmOccupancy({
    '@worm-vue3-print/core': { versions: { '1.4.7': {}, '1.4.8': {} }, 'dist-tags': { latest: '1.4.8' } },
    '@worm-vue3-print/canvas': { versions: { '1.4.7': {} }, 'dist-tags': { latest: '1.4.7' } },
  }, '1.4.8')
  assert.deepEqual(r, [
    { pkg: '@worm-vue3-print/core', published: true, latest: '1.4.8' },
    { pkg: '@worm-vue3-print/canvas', published: false, latest: '1.4.7' },
  ])
})

test('pickTagTarget 取最后一个「CHANGELOG 已含本版段」的提交，而非 HEAD', () => {
  const sha = pickTagTarget([
    { sha: 'aaa', hasSection: true },
    { sha: 'bbb', hasSection: true },
    { sha: 'ccc', hasSection: false },
  ])
  assert.equal(sha, 'bbb')
})

test('pickTagTarget 没有任何提交登记本版段时返回 null', () => {
  assert.equal(pickTagTarget([{ sha: 'aaa', hasSection: false }]), null)
})

test('verifyTagLanding 三方一致才通过', () => {
  assert.equal(verifyTagLanding({ local: 'abc', origin: 'abc', github: 'abc' }).ok, true)
  const bad = verifyTagLanding({ local: 'abc', origin: 'abc', github: 'def' })
  assert.equal(bad.ok, false)
  assert.match(bad.detail, /github/)
})

// 升版那笔会把客户端 package.json 与 mcp 版本常量一起改号，纯版本号 bump 不该触发重打。
const PKG_DIFF = `diff --git a/clients/print-client/package.json b/clients/print-client/package.json
--- a/clients/print-client/package.json
+++ b/clients/print-client/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@worm-vue3-print/print-client",
-  "version": "1.4.7",
+  "version": "1.4.8",
   "private": true,
`
const CONST_DIFF = `--- a/packages/print-mcp/src/version.ts
+++ b/packages/print-mcp/src/version.ts
@@ -1,2 +1,2 @@
 // 版本单点：与 package.json 同步维护
-export const version = '1.4.7'
+export const version = '1.4.8'
`

test('isVersionOnlyDiff 认出 package.json 只改 version', () => {
  assert.equal(isVersionOnlyDiff(PKG_DIFF), true)
})

test('isVersionOnlyDiff 认出版本常量文件只改号', () => {
  assert.equal(isVersionOnlyDiff(CONST_DIFF), true)
})

test('isVersionOnlyDiff 认出第一方依赖范围同步抬号', () => {
  const diff = `--- a/packages/print-canvas/package.json\n+++ b/packages/print-canvas/package.json\n-    "@worm-vue3-print/core": "^1.4.7",\n+    "@worm-vue3-print/core": "^1.4.8",\n`
  assert.equal(isVersionOnlyDiff(diff), true)
})

test('isVersionOnlyDiff 第三方依赖改动不算纯升版', () => {
  const diff = `--- a/clients/print-client/package.json\n+++ b/clients/print-client/package.json\n-    "ws": "^8.17.0",\n+    "ws": "^8.18.0",\n`
  assert.equal(isVersionOnlyDiff(diff), false)
})

test('isVersionOnlyDiff 混入代码行就不算纯升版', () => {
  assert.equal(isVersionOnlyDiff(`${PKG_DIFF}+  "main": "out/main/index.js",\n`), false)
})

test('isVersionOnlyDiff 空 diff 不算纯升版（无证据不放行）', () => {
  assert.equal(isVersionOnlyDiff(''), false)
})