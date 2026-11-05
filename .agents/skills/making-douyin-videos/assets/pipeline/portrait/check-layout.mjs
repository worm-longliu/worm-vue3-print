#!/usr/bin/env node
/**
 * 竖屏卡片排版体检：逐场景检测 DOM 是否溢出画布、元素是否侵入抖音安全区
 * （右侧按钮列、底部文案区），以及是否落在剧本声明的核心内容带内。
 * 无头环境替代人工看帧。
 *
 * 剧本可选 `video.coreTop / coreBottom / rightFrom`（缺省保持老剧本口径）：
 * - coreTop：核心内容上沿（要保住「中央 3:4 区」时填 240）
 * - coreBottom：核心内容下沿（缺省 = 画布高）
 * - rightFrom：右侧按钮列开始压屏的 y（缺省 = 底部遮挡区上沿，即老口径）
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { PORTRAIT_DIR, SCRIPT_PATH } from './paths.mjs'

const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
const cardsHtml = join(PORTRAIT_DIR, script.cards || 'cards.html')
const VH = script.video?.height ?? 1920
const SAFE = {
  right: 168,
  bottom: 520,
  coreTop: script.video?.coreTop ?? 0,
  coreBottom: script.video?.coreBottom ?? VH,
  rightFrom: script.video?.rightFrom ?? VH - 520,
}

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: script.video.width, height: script.video.height } })
let bad = 0
for (let i = 0; i < script.scenes.length; i++) {
  const url = pathToFileURL(cardsHtml)
  url.search = new URLSearchParams({ body: script.scenes[i].body, idx: `${i + 1} / ${script.scenes.length}` }).toString()
  await page.goto(url.href, { waitUntil: 'load' })
  const r = await page.evaluate((safe) => {
    const W = innerWidth, H = innerHeight
    const off = []
    for (const el of document.querySelectorAll('.stage *')) {
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue
      if (b.bottom > H + 1 || b.right > W + 1 || b.top < -1 || b.left < -1) off.push(`出画布 ${el.className||el.tagName} bottom=${Math.round(b.bottom)}`)
      else if (b.top < safe.coreTop - 1) off.push(`高于核心区上沿 ${el.className||el.tagName} top=${Math.round(b.top)} limit=${safe.coreTop}`)
      else if (b.bottom > H - safe.bottom) off.push(`侵入底部遮挡区 ${el.className||el.tagName} bottom=${Math.round(b.bottom)} limit=${H - safe.bottom}`)
      else if (b.bottom > safe.coreBottom + 1) off.push(`低于核心区下沿 ${el.className||el.tagName} bottom=${Math.round(b.bottom)} limit=${safe.coreBottom}`)
      else if (b.right > W - safe.right && b.bottom > safe.rightFrom) off.push(`侵入右侧按钮区 ${el.className||el.tagName} right=${Math.round(b.right)} limit=${W - safe.right}`)
    }
    const st = document.getElementById('stage')
    return { off, scrollH: st.scrollHeight, clientH: st.clientHeight }
  }, SAFE)
  const clip = r.scrollH > r.clientH + 1
  const issues = [...r.off, ...(clip ? [`stage 内容溢出 ${r.scrollH - r.clientH}px`] : [])]
  if (issues.length) { bad++; console.log(`✗ [${i + 1}] ${script.scenes[i].name}\n    ${issues.join('\n    ')}`) }
  else console.log(`✓ [${i + 1}] ${script.scenes[i].name}`)
}
await browser.close()
process.exit(bad ? 1 : 0)
