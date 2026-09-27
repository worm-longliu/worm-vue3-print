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
import { SCRIPT_PATH, OUT_DIR } from './paths.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
const rootPkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'))

const subtitle = script.title.replace(/^worm-vue3-print\s+/, '')
const version = `v${rootPkg.version}`
const date = new Date().toISOString().slice(0, 10)
const size = `${script.video.width} × ${script.video.height}`

mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: script.video.width, height: script.video.height }, deviceScaleFactor: 1 })
const url = pathToFileURL(join(__dirname, 'cover.html'))
url.search = new URLSearchParams({ subtitle, version, date, size }).toString()
await page.goto(url.href, { waitUntil: 'load' })
await page.screenshot({ path: join(OUT_DIR, 'cover.png') })
await browser.close()

console.log(`封面：${join(OUT_DIR, 'cover.png')}（${subtitle} · ${version} · ${date}）`)
