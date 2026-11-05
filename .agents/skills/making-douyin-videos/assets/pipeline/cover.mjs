#!/usr/bin/env node
/**
 * 渲染视频封面：cover.html → out/cover.png（尺寸取剧本 script.video，16:9 为 1920×1080）
 * 副标题取 script.json 的 title（去掉品牌前缀），版本取根 package.json，日期取当天。
 * 同一张 PNG 也可直接用作平台上传封面。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { SCRIPT_PATH, OUT_DIR, STAGE } from './paths.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
const rootPkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

const subtitle = script.title.replace(/^worm-vue3-print\s+/, '')
// 剧本可写 coverVersion 覆盖版本口径（功能未随当前版本发布时用它说实话），缺省读根 package.json
const version = script.coverVersion || `v${rootPkg.version}`
const date = new Date().toISOString().slice(0, 10)
const size = `${STAGE.width} × ${STAGE.height}`

mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: STAGE.width, height: STAGE.height }, deviceScaleFactor: 1 })
const url = pathToFileURL(join(__dirname, 'cover.html'))
url.search = new URLSearchParams({ subtitle, version, date, size }).toString()
await page.goto(url.href, { waitUntil: 'load' })
await page.screenshot({ path: join(OUT_DIR, 'cover.png') })
// 结构判据：片头是成品第一段，任何元素越出内容台就会压到合成补出的黑边上，直接判红
const over = await page.evaluate(({ w, h }) => {
  const bad = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue
    if (r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1) {
      bad.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} ${Math.round(r.left)}~${Math.round(r.right)} × ${Math.round(r.top)}~${Math.round(r.bottom)}`)
    }
  }
  return bad
}, STAGE)
if (over.length) {
  console.error(`片头越出内容台 ${STAGE.width}×${STAGE.height}：\n  ` + over.slice(0, 10).join('\n  '))
  await browser.close()
  process.exit(1)
}
await browser.close()

console.log(`封面：${join(OUT_DIR, 'cover.png')}（${subtitle} · ${version} · ${date}）`)
