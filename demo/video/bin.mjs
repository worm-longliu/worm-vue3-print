/** ffmpeg/ffprobe 解析：优先 demo 本地 npm 静态包，回退系统 PATH */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const plat = `${process.platform}-${process.arch}`

function fromPkg(pkg, bin) {
  try {
    return join(dirname(require.resolve(`${pkg}/package.json`)), bin)
  } catch {
    return null
  }
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
      console.error(`缺少可执行 ${bin}（可运行 npm i -D @ffmpeg-installer/${plat} @ffprobe-installer/${plat} 或系统安装 ffmpeg）`)
      process.exit(1)
    }
  }
}
