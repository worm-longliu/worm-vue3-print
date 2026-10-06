// 收集桌面客户端安装包：校验和清单 + 发行版附件上传命令。
// 用法：node scripts/pack-client-release.mjs [标签，默认取根 package.json 版本]
// 前置：已执行 npm run pack:client（产物在 clients/print-client/dist）。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'clients/print-client/dist')
const tag = process.argv[2] || `v${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version}`

// 只收可分发安装包：dmg（mac 安装镜像）与 exe（Windows NSIS）。
// 同一构建还会产出 *.zip 与 *.blockmap，它们是 electron-updater 差量更新的元数据，
// 本客户端未接自动更新，挂进发行版只会让人下错文件，因此不上传。
const INSTALLER = /\.(dmg|exe)$/i

let files = []
try {
  files = readdirSync(dist).filter(name => INSTALLER.test(name) && statSync(join(dist, name)).isFile())
} catch {
  console.error(`未找到产物目录 ${dist}，请先执行 npm run pack:client`)
  process.exit(1)
}
if (!files.length) {
  console.error(`${dist} 内没有安装包，请先执行 npm run pack:client`)
  process.exit(1)
}

const rows = files
  .map(name => {
    const buf = readFileSync(join(dist, name))
    return { name, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

writeFileSync(join(dist, 'SHA256SUMS.txt'), rows.map(r => `${r.sha256}  ${r.name}`).join('\n') + '\n', 'utf8')

const width = Math.max(...rows.map(r => r.name.length))
console.log(`发行版 ${tag} 的桌面客户端附件（${rows.length} 个，位于 ${dist}）：\n`)
for (const r of rows) console.log(`  ${r.name.padEnd(width)}  ${(r.size / 1024 / 1024).toFixed(1).padStart(6)} MB`)
console.log(`\n  ${'SHA256SUMS.txt'.padEnd(width)}  已生成`)

console.log('\n上传到 GitHub 发行版：')
console.log(`  gh release upload ${tag} ${files.map(f => `clients/print-client/dist/${f}`).join(' ')} \\`)
console.log('    clients/print-client/dist/SHA256SUMS.txt --clobber')
console.log('（gh 未登录时先 gh auth login；或在 GitHub 发行版编辑页把上述文件拖进 Assets）')
