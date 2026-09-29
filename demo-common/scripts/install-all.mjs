import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 四个宿主 demo 是彼此独立的 npm 工程，逐个安装（file: 依赖指向本仓库 packages/）。
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const APPS = ['apps/vue3', 'apps/vue2', 'apps/react', 'apps/jquery']

// common 包必须先构建：jQuery 工程直挂的是它的 dist 产物
if (!existsSync(join(ROOT, '..', 'packages', 'print-common', 'dist', 'common.js'))) {
  console.log('缺少 packages/print-common/dist/common.js，先构建：npm run build -w @worm-vue3-print/common')
  const build = spawnSync('npm', ['run', 'build', '-w', '@worm-vue3-print/common'], { cwd: join(ROOT, '..'), shell: process.platform === 'win32', stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

for (const app of APPS) {
  console.log(`\n=== npm install — demo-common/${app} ===`)
  const res = spawnSync('npm', ['install'], { cwd: join(ROOT, app), shell: process.platform === 'win32', stdio: 'inherit' })
  if (res.status !== 0) {
    console.error(`install 失败：demo-common/${app}`)
    process.exit(res.status ?? 1)
  }
}
