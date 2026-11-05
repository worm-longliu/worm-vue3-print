#!/usr/bin/env node
/**
 * 逐场景渲染竖屏卡片：script.json + out/timings.json → out/cards/scene-N.png（1080×1920）
 * 卡片为纯静态排版，时长由配音反推，故此处只负责出图与页码。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { OUT_DIR, PORTRAIT_DIR, SCRIPT_PATH } from './paths.mjs'

const CARD_DIR = join(OUT_DIR, 'cards')

const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
const cardsHtml = join(PORTRAIT_DIR, script.cards || 'cards.html')
const timings = JSON.parse(readFileSync(join(OUT_DIR, 'timings.json'), 'utf8'))
const total = timings.scenes.length

mkdirSync(CARD_DIR, { recursive: true })

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: script.video.width, height: script.video.height }, deviceScaleFactor: 1 })
for (let i = 0; i < total; i++) {
  const scene = script.scenes[i]
  const url = pathToFileURL(cardsHtml)
  url.search = new URLSearchParams({ body: scene.body, idx: `${i + 1} / ${total}` }).toString()
  await page.goto(url.href, { waitUntil: 'load' })
  await page.screenshot({ path: join(CARD_DIR, `scene-${i}.png`) })
  console.log(`[${i + 1}/${total}] ${scene.name} → cards/scene-${i}.png`)
}
await browser.close()
