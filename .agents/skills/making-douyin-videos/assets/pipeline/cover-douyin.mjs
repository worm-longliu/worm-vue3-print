#!/usr/bin/env node
/**
 * 抖音封面：cover-douyin.html → 三种比例
 *   cover-douyin-16x9.png  1920×1080  横屏视频封面
 *   cover-douyin-9x16.png  1080×1920  竖屏封面（关键内容全落在中段 3:4 带内）
 *   cover-douyin-3x4.png   1080×1440  主页网格封面（由 9x16 中心裁切）
 * 出图前跑版式判据：16:9 要求主标题在中央 3:4 裁切带内、9:16 要求关键内容在 y 240~1680 安全带内，
 * 违反即 exit 1（本机模型无视觉能力，判据就是「看图」的替代）。
 * 样张三格二维码用 core/browser 真渲染器出图，占比从 SVG 反解实测。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { browserCodeRenderer } from '@worm-vue3-print/core/browser'
import { SCRIPT_PATH, OUT_DIR } from './paths.mjs'
import { ffmpegBin, ffprobeBin, ensureBins } from './bin.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
const rootPkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

// 版本口径：剧本可写 coverVersion 覆盖（功能未随当前版本发布时用它说实话），缺省读根 package.json
const version = script.coverVersion || `v${rootPkg.version}`
const date = new Date().toISOString().slice(0, 10)
const title = script.coverTitle || script.title.replace(/^worm-vue3-print\s+/, '')
const sub = script.coverSub || '六档实测'

/** 时长取录制元数据，未录制时退回配音总时长 */
function durationText() {
  for (const f of ['recording_meta.json', 'timings.json']) {
    const p = join(OUT_DIR, f)
    if (!existsSync(p)) continue
    const j = JSON.parse(readFileSync(p, 'utf8'))
    // 竖屏 timings.json 不写 total，退回逐场景求和
    const sec = f === 'timings.json' && Number.isFinite(j.total)
      ? j.total
      : Array.isArray(j.scenes) ? j.scenes.reduce((s, x) => s + x.duration, 0) : j.total
    if (!Number.isFinite(sec)) continue
    const m = Math.floor(sec / 60)
    return `${m} 分 ${Math.round(sec - m * 60)} 秒`
  }
  return '—'
}

/** 样张：剧本给 coverCards 时出数字卡（版本更新的实测差值），否则退回静区 0 / 4 / 8 三档 */
function samples() {
  if (Array.isArray(script.coverCards)) {
    return script.coverCards.map((c, i) => ({
      card: true,
      q: i,
      num: c.num,
      unit: c.unit || '',
      label: c.label,
      pct: c.pct || '',
      iso: c.iso || '',
    }))
  }
  const value = script.coverCode || '{waybill.qrcode}'
  return [0, 4, 8].map((q) => {
    const svg = browserCodeRenderer.render(value, 'qrcode', { qrCodeLevel: 'M', qrQuietZone: q })
    const dim = Number(svg.match(/viewBox="0 0 ([\d.]+) /)[1])
    const dot = Number(svg.match(/<rect[^>]*width="([\d.]+)"/)[1])
    let lo = Infinity
    let hi = -Infinity
    for (const r of svg.matchAll(/x="([\d.]+)"/g)) {
      lo = Math.min(lo, Number(r[1]))
      hi = Math.max(hi, Number(r[1]) + dot)
    }
    const ink = hi - lo
    return {
      q,
      pct: ((ink / dim) * 100).toFixed(1),
      iso: q === 4 ? 'ISO 推荐' : q === 0 ? '铺满' : '上限',
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    }
  })
}

const cells = samples()
const samplesHtml = cells
  .map(
    (c) => `<div class="cell" data-q="${c.q}">
    <div class="frame">${c.card ? `<div class="num">${c.num}<em>${c.unit}</em></div>` : `<img src="${c.src}" alt="quiet-${c.q}">`}</div>
    <div class="q">${c.card ? c.label : `静区 <b>${c.q}</b>`}</div>
    <div class="pct">${c.card ? c.pct : `码面 ${c.pct}%`}</div>
    <div class="iso">${c.iso}</div>
  </div>`,
  )
  .join('')

const verdict = script.coverVerdict || '静区<s>越大越保险</s>，其实是拿码面换余量'

const tpl = readFileSync(join(__dirname, 'cover-douyin.html'), 'utf8')

/** 版式判据：内容块取布局盒（文本取收缩包裹层 .w/.t，避免整宽居中盒与 CJK 字体盒虚高），再查两两重叠与裁切带越界 */
const KEY_BLOCKS = ['品牌行', '主标题', '副标题', '结论行']
const CHECK = ({ band, safeY, stamp, keys }) => {
  const blocks = []
  const push = (name, l, r, t, b) => {
    if (r - l > 1 && b - t > 1) blocks.push({ name, l, r, t, b })
  }
  for (const el of document.querySelectorAll('[data-block-ink]')) {
    const x = (el.querySelector('.w, .t') || el).getBoundingClientRect()
    push(el.getAttribute('data-block-ink'), x.left, x.right, x.top, x.bottom)
  }
  for (const el of document.querySelectorAll('[data-block]')) {
    const x = el.getBoundingClientRect()
    push(el.getAttribute('data-block'), x.left, x.right, x.top, x.bottom)
  }
  for (const cell of document.querySelectorAll('.cell')) {
    const x = cell.getBoundingClientRect()
    push(`样张${cell.dataset.q}`, x.left, x.right, x.top, x.bottom)
  }
  // 像素级自证：把样张 img 画到离屏画布，扫最左/最右墨点算实际占宽，验证画面印出的就是那一档
  const ink = []
  for (const cell of document.querySelectorAll('.cell')) {
    const img = cell.querySelector('img')
    if (!img) continue
    const r = img.getBoundingClientRect()
    const c = document.createElement('canvas')
    c.width = Math.round(r.width)
    c.height = Math.round(r.height)
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0, c.width, c.height)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let lo = Infinity
    let hi = -Infinity
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4
        if (d[i + 3] > 128 && d[i] < 128) {
          if (x < lo) lo = x
          if (x > hi) hi = x
        }
      }
    }
    ink.push({ q: Number(cell.dataset.q), pct: hi >= lo ? +(((hi - lo + 1) / c.width) * 100).toFixed(1) : 0 })
  }
  const bad = []
  for (const it of blocks) {
    if (!(keys.includes(it.name) || it.name.startsWith('样张') || (it.name === '盖章' && stamp))) continue
    if (band && (it.l < band[0] - 1 || it.r > band[1] + 1)) {
      bad.push(`${it.name} 横向越裁切带 ${Math.round(it.l)}~${Math.round(it.r)}（带内 ${Math.round(band[0])}~${Math.round(band[1])}）`)
    }
    if (safeY && (it.t < safeY[0] - 1 || it.b > safeY[1] + 1)) {
      bad.push(`${it.name} 纵向越安全带 ${Math.round(it.t)}~${Math.round(it.b)}（带内 ${safeY[0]}~${safeY[1]}）`)
    }
  }
  const hits = []
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]
      const b = blocks[j]
      const w = Math.min(a.r, b.r) - Math.max(a.l, b.l)
      const h = Math.min(a.b, b.b) - Math.max(a.t, b.t)
      if (w > 1 && h > 1) {
        hits.push(`${a.name} × ${b.name} 重叠 ${Math.round(w)}×${Math.round(h)}px @(${Math.round(Math.max(a.l, b.l))},${Math.round(Math.max(a.t, b.t))})`)
      }
    }
  }
  const leaks = [...document.querySelectorAll('body *')]
    .filter((el) => !el.children.length && /__[A-Z]/.test(el.textContent || ''))
    .map((el) => `${el.getAttribute('class') || el.tagName} 残留占位符「${(el.textContent || '').trim().slice(0, 40)}」`)
  const titles = [...document.querySelectorAll('.title .t > span')].map((s) => (s.textContent || '').trim())
  const de = document.documentElement
  return {
    overflow: de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1 ? `内容 ${de.scrollWidth}×${de.scrollHeight} 溢出画布` : null,
    bad: [...new Set(bad)],
    hits: [...new Set(hits)],
    leaks: [...new Set(leaks)],
    titles,
    ink,
  }
}

mkdirSync(OUT_DIR, { recursive: true })
ensureBins()

const browser = await chromium.launch()
let failed = false
for (const [ratio, W, H] of [['r-16x9', 1920, 1080], ['r-9x16', 1080, 1920]]) {
  // 全部用 replaceAll：占位符可能在模板里出现多次（主标题的三色叠印就是三处），
  // 只替换首次会把字面量 __TITLE__ 印到封面上
  const html = tpl
    .replaceAll('__RATIO__', ratio)
    .replaceAll('__W__', String(W))
    .replaceAll('__H__', String(H))
    .replaceAll('__TITLE__', title)
    .replaceAll('__SUB__', sub)
    .replaceAll('__SAMPLES__', samplesHtml)
    .replaceAll('__VERDICT__', verdict)
    .replaceAll('__VERSION__', version)
    .replaceAll('__DATE__', date)
    .replaceAll('__DURATION__', durationText())
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
  // 判据作用域里要拿到页面 API，故用 addScriptTag 注入而非 evaluate 闭包直传
  const band = ratio === 'r-16x9' ? [(W - (H * 3) / 4) / 2, (W + (H * 3) / 4) / 2] : null
  const safeY = ratio === 'r-9x16' ? [240, 1680] : null
  const res = await page.evaluate(
    ([src, b, s, st, k]) => {
      const fn = new Function(`return (${src})`)()
      return fn({ band: b, safeY: s, stamp: st, keys: k })
    },
    [String(CHECK), band, safeY, ratio === 'r-9x16', KEY_BLOCKS],
  )
  const out = join(OUT_DIR, `cover-douyin-${ratio === 'r-16x9' ? '16x9' : '9x16'}.png`)
  await page.screenshot({ path: out })
  await page.close()
  const inkBad = res.ink.filter((x) => Math.abs(Number((cells.find((c) => c.q === x.q) || {}).pct ?? NaN) - x.pct) > 1.5)
  const titleBad = res.titles.length !== 3 || res.titles.some((t) => t !== title)
  const ok = !res.overflow && !res.bad.length && !res.hits.length && !res.leaks.length && !titleBad && !inkBad.length
  console.log(`${ok ? '✓' : '✗'} ${ratio} 封面 ${W}×${H}：${out}`)
  console.log(`   主标题三层文本：${res.titles.join(' | ')}`)
  for (const x of res.ink) {
    console.log(`   样张 静区 ${x.q}：画面实测占宽 ${x.pct}%（SVG 算得 ${cells.find((c) => c.q === x.q).pct}%）`)
  }
  if (res.overflow) console.log(`   溢出：${res.overflow}`)
  for (const b of res.bad) console.log(`   ${b}`)
  for (const h of res.hits) console.log(`   ${h}`)
  for (const l of res.leaks) console.log(`   ${l}`)
  if (titleBad) console.log(`   主标题三层文本未全部等于「${title}」`)
  for (const x of inkBad) console.log(`   样张 静区 ${x.q} 画面实测 ${x.pct}% 与 SVG 口径不符`)
  if (!ok) failed = true
}
await browser.close()

// 3:4 主页网格封面：从 9x16 中心裁切（判据已保证关键内容落在该带内）
const src9 = join(OUT_DIR, 'cover-douyin-9x16.png')
const dst34 = join(OUT_DIR, 'cover-douyin-3x4.png')
const r = spawnSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src9, '-vf', 'crop=1080:1440:0:240', dst34], { encoding: 'utf8' })
if (r.status !== 0) {
  console.error(`3:4 裁切失败：${r.stderr}`)
  failed = true
} else {
  console.log(`✓ 3:4 封面 1080×1440：${dst34}`)
}

// 4:3 封面 1440×1080：从 16x9 中心裁切。判据已把关键内容压进中央 3:4 带（x 555~1365），
// 该带完全落在 4:3 裁切窗 x∈[240,1680] 内，所以裁出来的图必然齐全，不放大也不补边。
const src16 = join(OUT_DIR, 'cover-douyin-16x9.png')
const dst43 = join(OUT_DIR, 'cover-douyin-4x3.png')
const r43 = spawnSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src16, '-vf', 'crop=1440:1080:240:0', dst43], { encoding: 'utf8' })
if (r43.status !== 0) {
  console.error(`4:3 裁切失败：${r43.stderr}`)
  failed = true
} else {
  console.log(`✓ 4:3 封面 1440×1080：${dst43}`)
}

// 交付判据：抖音需要的两档封面尺寸必须真落地
for (const [f, w, h] of [[dst43, 1440, 1080], [dst34, 1080, 1440]]) {
  const p = spawnSync(ffprobeBin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', f], { encoding: 'utf8' })
  const got = String(p.stdout).trim()
  if (got !== `${w}x${h}`) {
    console.error(`封面尺寸判红：${f} 实测 ${got || '读不到'}，应为 ${w}×${h}`)
    failed = true
  }
}

console.log(`主标题「${title}」· 样张 ${cells.map((c) => (c.card ? `${c.label} ${c.num.replace(/<[^>]+>/g, '')} ${c.unit}` : `静区 ${c.q} 码面 ${c.pct}%`)).join(' / ')} · 版本口径 ${version}`)
if (failed) {
  console.error('封面版式判据未通过，按上面的越界项调 cover-douyin.html 的坐标')
  process.exit(1)
}
