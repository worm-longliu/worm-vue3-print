/** ffmpeg/ffprobe 解析：依次探测本目录 node_modules、demo/node_modules 静态包，回退系统 PATH */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
// ffmpeg 静态包仍挂在 demo 的 optionalDependencies：darwin-only 包放 devDeps 会让 Pages 的 Linux runner EBADPLATFORM
const demoRequire = createRequire(join(__dirname, '..', 'demo', 'package.json'))
const plat = `${process.platform}-${process.arch}`

function fromPkg(pkg, bin) {
  for (const r of [require, demoRequire]) {
    try {
      return join(dirname(r.resolve(`${pkg}/package.json`)), bin)
    } catch {}
  }
  return null
}

function resolveBin(pkgName, bin, fallback) {
  const p = fromPkg(pkgName, bin)
  if (p && existsSync(p)) return p
  return fallback
}

export const ffmpegBin = resolveBin(`@ffmpeg-installer/${plat}`, 'ffmpeg', 'ffmpeg')
export const ffprobeBin = resolveBin(`@ffprobe-installer/${plat}`, 'ffprobe', 'ffprobe')

export function ensureBins() {
  for (const bin of [ffmpegBin, ffprobeBin]) {
    try {
      require('node:child_process').execFileSync(bin, ['-version'], { stdio: 'ignore' })
    } catch {
      console.error(`缺少可执行 ${bin}（可在 ../demo 运行 npm i -O @ffmpeg-installer/${plat} @ffprobe-installer/${plat} 或系统安装 ffmpeg）`)
      process.exit(1)
    }
  }
}
