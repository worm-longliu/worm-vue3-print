#!/usr/bin/env node
// 下载用于「三端字体一致性」联调的公开字体（OFL-1.1，可自由再分发）。
//
// 用途：模板声明字体的联调需要一个「一眼看出有没有生效」的字体——这三款字型与宋体/黑体
// 差异极大，出图或预览里只要没换上，肉眼立刻能发现。
//
// 用法：node scripts/fetch-test-fonts.mjs [--force]
// 产物：demo/public/fonts/*.ttf（已在 .gitignore 中忽略，不进仓库、不进发布产物）
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT_DIR = fileURLToPath(new URL('../public/fonts', import.meta.url))
const BASE = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl'

/** 字体族名必须与 demo 的 DESIGNER_FONTS 声明一致 */
const FONTS = [
  { family: 'Ma Shan Zheng', file: 'MaShanZheng-Regular.ttf', source: `${BASE}/mashanzheng/MaShanZheng-Regular.ttf` },
  { family: 'ZCOOL KuaiLe', file: 'ZCOOLKuaiLe-Regular.ttf', source: `${BASE}/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf` },
  { family: 'ZCOOL QingKe HuangYou', file: 'ZCOOLQingKeHuangYou-Regular.ttf', source: `${BASE}/zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf` },
]

/** TrueType 文件头：0x00010000 或 'true'；避免把 404 页面当字体写进目录 */
function looksLikeFont(buffer) {
  if (buffer.length < 4) return false
  const tag = buffer.readUInt32BE(0)
  return tag === 0x00010000 || tag === 0x74727565
}

const force = process.argv.includes('--force')
mkdirSync(OUT_DIR, { recursive: true })

for (const font of FONTS) {
  const target = join(OUT_DIR, font.file)
  if (existsSync(target) && !force) {
    console.log(`跳过（已存在） ${font.file}  ${formatSize(statSync(target).size)}`)
    continue
  }
  process.stdout.write(`下载 ${font.family} … `)
  const res = await fetch(font.source)
  if (!res.ok) {
    console.log(`失败 HTTP ${res.status}`)
    process.exitCode = 1
    continue
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  if (!looksLikeFont(buffer)) {
    console.log('失败：响应不是字体文件')
    process.exitCode = 1
    continue
  }
  writeFileSync(target, buffer)
  console.log(`完成 ${font.file}  ${formatSize(buffer.length)}`)
}

console.log(`\n输出目录：${OUT_DIR}`)
console.log('提示：换字体只需改 demo/src/App.vue 的 DESIGNER_FONTS（family 与文件名对应），不需要改库代码。')

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
