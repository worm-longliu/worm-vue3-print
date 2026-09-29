import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 直挂形态的取件动作：从两个 npm 包里各挑一份「浏览器可直接用」的文件拷进 public/vendor。
// 传统项目完全等价：从制品库下载这两个文件放进自己的静态目录即可，不需要打包器。
const HERE = dirname(fileURLToPath(import.meta.url))
const APP = join(HERE, '..')
const OUT = join(APP, 'public', 'vendor')

const FILES = [
  { from: '@worm-vue3-print/common/dist/common.js', to: 'worm-print-common.js' },
  { from: '@worm-vue3-print/common/dist/common.css', to: 'worm-print-common.css' },
  { from: 'jquery/dist/jquery.min.js', to: 'jquery.min.js' },
]

await mkdir(OUT, { recursive: true })
for (const file of FILES) {
  const abs = join(APP, 'node_modules', file.from)
  try {
    await copyFile(abs, join(OUT, file.to))
    console.log(`[sync] node_modules/${file.from} → public/vendor/${file.to}`)
  } catch {
    console.error(`[sync] 缺少 ${file.from}：先 npm install（common 包需已 npm run build）`)
    process.exit(1)
  }
}
