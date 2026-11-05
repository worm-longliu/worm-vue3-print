#!/usr/bin/env node
/**
 * 讲解卡片渲染：剧本 panels[] → out/<key>/panel-<k>.png（内容台尺寸，供 showImage fit:fill 全屏铺）
 * kind：
 * - code  代码/JSON 展示（title/lang/lines/note），lines 里可写 "hl":true 做行高亮
 * - points 要点卡（title/items:[{h,d}]）
 * - table  对照表（title/head/rows，rows 单元格可写 {t,c:'good'|'dim'|'warn'}）
 * - term   终端卡（title/cmd：真跑一次命令，stdout 原样入画；exit≠0 直接判红，绝不摆拍）
 * 判据：不越内容台、不残留占位符、正文非空，违反 exit 1。
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { SCRIPT_PATH, OUT_DIR, STAGE } from './paths.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
const panels = script.panels || []
if (!panels.length) {
  console.log('剧本没有 panels，跳过卡片渲染')
  process.exit(0)
}
mkdirSync(OUT_DIR, { recursive: true })
const tpl = readFileSync(join(__dirname, 'panels.html'), 'utf8')

function runCmd(cmd) {
  try {
    const out = execSync(cmd, { cwd: ROOT, maxBuffer: 32 << 20, encoding: 'utf8', shell: '/bin/bash' })
    return { ok: true, out }
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: STAGE.width, height: STAGE.height }, deviceScaleFactor: 1 })
let bad = 0
page.on('pageerror', (e) => console.error('  [pageerror]', e.message))

for (let i = 0; i < panels.length; i++) {
  const p = panels[i]
  const data = { ...p, stage: STAGE }
  if (p.kind === 'term') {
    const r = runCmd(p.cmd)
    if (!r.ok && !p.allowFail) {
      console.error(`终端卡「${p.title}」命令非零退出：${p.cmd}`)
      bad++
      continue
    }
    data.out = r.out.split('\n').slice(p.tail ? -p.tail : -40)
    data.exit = r.ok ? 0 : 1
  }
  // 注入必须转义 <：代码卡原文里有 </script>，不转义会把内联脚本就地截断（实测 7/8 张判红）
  const inj = JSON.stringify(data).replace(/</g, '\\u003c')
  await page.setContent(tpl.replace('<!--DATA-->', `<script>window.__PANEL = ${inj}</script>`), { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('[data-card]'))
  const report = await page.evaluate(({ w, h }) => {
    const v = []
    if (document.documentElement.scrollWidth > w + 1) v.push(`横向溢出 scrollWidth=${document.documentElement.scrollWidth}`)
    if (document.documentElement.scrollHeight > h + 1) v.push(`纵向溢出 scrollHeight=${document.documentElement.scrollHeight}`)
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (!r.width && !r.height) continue
      if (r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1) v.push(`${el.className} 越界 ${Math.round(r.left)}~${Math.round(r.right)}`)
      if (/__[A-Z]/.test(el.children.length ? '' : el.textContent || '')) v.push(`残留占位符：${(el.textContent || '').slice(0, 30)}`)
    }
    if (!(window).__PANEL) v.push('未收到剧本数据（注入被截断）')
    // 字幕安全区判据：任何内容块都不许伸进画面底部 178px，否则会被烧录字幕压住
    for (const el of document.querySelectorAll('[data-block]')) {
      const r = el.getBoundingClientRect()
      if (r.bottom > h - 170) v.push(`${el.className || el.tagName} 侵入字幕安全区 bottom=${Math.round(r.bottom)}（上界 ${h - 170}）`)
    }
    const txt = (document.querySelector('[data-card]')?.textContent || '').trim()
    if (txt.length < 12) v.push(`卡片正文过短（${txt.length} 字）`)
    return v
  }, STAGE)
  if (report.length) {
    console.error(`卡片「${p.title}」判红：\n  ${report.join('\n  ')}`)
    bad++
    continue
  }
  const out = join(OUT_DIR, `panel-${i + 1}.png`)
  await page.screenshot({ path: out })
  console.log(`[${i + 1}/${panels.length}] ${p.title} → ${out}`)
}
await browser.close()
if (bad) {
  console.error(`${bad} 张卡片未通过判据`)
  process.exit(1)
}
