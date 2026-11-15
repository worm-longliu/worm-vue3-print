/**
 * 把共享样式源随 core 一起发布：tsup 只产 JS/声明，designer.css / theme.css /
 * icon-manifest.json 需要单独复制进 dist，供 exports 子路径消费。
 */
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/styles', import.meta.url))
const OUT = fileURLToPath(new URL('../dist/styles', import.meta.url))

mkdirSync(OUT, { recursive: true })
const files = readdirSync(SRC)
for (const name of files) copyFileSync(join(SRC, name), join(OUT, name))
console.log(`[copy-styles] 已随 core 发布共享样式源：${files.join(', ')}`)
