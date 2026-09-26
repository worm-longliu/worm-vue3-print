#!/usr/bin/env node
/**
 * 渲染视频封面：cover.html → out/cover.png（1920×1440）
 * 副标题取 script.json 的 title（去掉品牌前缀），版本取根 package.json，日期取当天。
 * 同一张 PNG 也可直接用作平台上传封面。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'out')

const script = JSON.parse(readFileSync(join(__dirname, 'script.json'), 'utf8'))
const rootPkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'))

const subtitle = script.title.replace(/^worm-vue3-print\s+/, '')
const version = `v${rootPkg.version}`
const date = new Date().toISOString().slice(0, 10)

mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1440 }, deviceScaleFactor: 1 })
const url = pathToFileURL(join(__dirname, 'cover.html'))
url.search = new URLSearchParams({ subtitle, version, date }).toString()
await page.goto(url.href, { waitUntil: 'load' })
await page.screenshot({ path: join(OUT_DIR, 'cover.png') })
await browser.close()

console.log(`封面：${join(OUT_DIR, 'cover.png')}（${subtitle} · ${version} · ${date}）`)
