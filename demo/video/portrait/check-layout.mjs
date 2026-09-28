#!/usr/bin/env node
/**
 * 竖屏卡片排版体检：逐场景检测 DOM 是否溢出画布、元素是否侵入抖音安全区
 * （右侧 168px 按钮列、底部 320px 文案区），无头环境替代人工看帧。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const script = JSON.parse(readFileSync(join(__dirname, 'script.json'), 'utf8'))
const SAFE = { right: 168, bottom: 520 }

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: script.video.width, height: script.video.height } })
let bad = 0
for (let i = 0; i < script.scenes.length; i++) {
  const url = pathToFileURL(join(__dirname, 'cards.html'))
  url.search = new URLSearchParams({ body: script.scenes[i].body, idx: `${i + 1} / ${script.scenes.length}` }).toString()
  await page.goto(url.href, { waitUntil: 'load' })
  const r = await page.evaluate((safe) => {
    const W = innerWidth, H = innerHeight
    const off = []
    for (const el of document.querySelectorAll('.stage *')) {
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue
      if (b.bottom > H + 1 || b.right > W + 1 || b.top < -1 || b.left < -1) off.push(`出画布 ${el.className||el.tagName} bottom=${Math.round(b.bottom)}`)
      else if (b.bottom > H - safe.bottom) off.push(`侵入底部遮挡区 ${el.className||el.tagName} bottom=${Math.round(b.bottom)} limit=${H - safe.bottom}`)
      else if (b.right > W - safe.right && b.bottom > H - safe.bottom) off.push(`侵入右侧按钮区 ${el.className||el.tagName}`)
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
