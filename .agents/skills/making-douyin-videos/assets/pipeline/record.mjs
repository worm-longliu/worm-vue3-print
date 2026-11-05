#!/usr/bin/env node
/**
 * 真实 demo 自动演示录制：尺寸取剧本 script.video（16:9 为 1920×1080）Playwright 实时录制。
 * - 按 timings.json 逐场景执行 script.json 里的动作步骤
 * - 注入 overlay.js：字幕条 / 大号鼠标指针 / 目标高亮框，随画面一起被录制
 * - 场景时长 = max(配音时长, 步骤耗时)，实际时长写入 recording_meta.json 供合成补齐音频
 * 运行前需保证 demo dev server 可访问（本脚本未检测到一个时会自动拉起）。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { SCRIPT_PATH, OUT_DIR, STAGE } from './paths.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEMO_DIR = resolve(__dirname, '..', 'demo')
const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
const timings = JSON.parse(readFileSync(join(OUT_DIR, 'timings.json'), 'utf8'))
const overlaySrc = readFileSync(join(__dirname, 'overlay.js'), 'utf8')

const { width: W, height: H } = script.video
// 抖音留白：录制按内容台宽 SW（= W − 2×margin）出图，合成期补左右黑边，画面全程不缩放
const SW = STAGE.width
const BASE_URL = script.baseUrl
const SCENE_TAIL = 0.5
// VIDEO_FAST=1 只跑步骤与断言、不录像也不等配音，用来把 140 步的选择器与数值先验证一遍
const FAST = process.env.VIDEO_FAST === '1'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitUntil = async (t) => {
  const d = t - Date.now()
  if (d > 0) await sleep(d)
}

async function serverUp() {
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(1500) })
    return true
  } catch {
    return false
  }
}

let viteProc = null
async function ensureServer() {
  if (await serverUp()) return
  console.log(`未检测到 ${BASE_URL}，自动拉起 vite dev server…`)
  viteProc = spawn('npx', ['vite', '--strictPort'], { cwd: DEMO_DIR, stdio: 'ignore', detached: true })
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (await serverUp()) return
    await sleep(1000)
  }
  throw new Error('vite dev server 启动超时')
}

function stopServer() {
  if (viteProc) {
    try {
      process.kill(-viteProc.pid)
    } catch {}
    viteProc = null
  }
}

let page = null

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  if (!existsSync(join(OUT_DIR, 'voice'))) {
    console.error('缺少配音，请先在 .video 目录运行：npm run video:voice')
    process.exit(1)
  }
  await ensureServer()

  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: SW, height: H },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    ...(FAST ? {} : { recordVideo: { dir: join(OUT_DIR, 'raw'), size: { width: SW, height: H } } }),
  })
  page = await context.newPage()
  await page.addInitScript(overlaySrc)
  page.on('dialog', (d) => {
    console.log(`  [dialog] ${d.message()}`)
    d.accept().catch(() => {})
  })

  const navStart = Date.now()
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.designer-container', { timeout: 20000 })
  await sleep(1200)

  // 录像从 goto 起就有帧，而音轨从场景 1 才计 0：记录这个片头偏移供合成裁剪
  const preRoll = +((Date.now() - navStart) / 1000).toFixed(3)

  const runScenes = []
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i]
    const timing = timings.scenes[i]
    console.log(`\n▶ 场景 ${i + 1}/${script.scenes.length}：${scene.name}（配音 ${timing.duration.toFixed(1)}s）`)
    const sceneStart = Date.now()

    const subtitleTask = FAST
      ? Promise.resolve()
      : (async () => {
          // 句内持续重贴：showImage 的 setContent 会换掉文档，新页面里字幕条是空的，
          // 只在句首 set 一次会让整屏卡片那几幕没有烧录字幕（实测抽帧抓到）。
          for (const s of timing.sentences) {
            const t0 = sceneStart + s.start * 1000
            const t1 = sceneStart + s.end * 1000 + 250
            while (Date.now() < t1) {
              await waitUntil(t0)
              try {
                await page.evaluate((t) => window.__demoOverlay.setSubtitle(t), s.text)
              } catch {}
              await sleep(400)
            }
          }
        })().catch((e) => console.error('  字幕调度异常:', e.message))

    for (const step of scene.steps || []) {
      if (step.s != null) {
        const anchor = timing.sentences[step.s]
        if (!anchor) throw new Error(`场景「${scene.name}」步骤 s=${step.s} 超出句数 ${timing.sentences.length}`)
        if (!FAST) await waitUntil(sceneStart + anchor.start * 1000)
      }
      await runStep(step).catch((e) => {
        throw new Error(`场景「${scene.name}」步骤 ${JSON.stringify(step)} 失败: ${e.message}`)
      })
    }
    const stepsElapsed = (Date.now() - sceneStart) / 1000
    const voiceElapsed = timing.duration + SCENE_TAIL
    if (stepsElapsed > voiceElapsed) {
      console.warn(`  ⚠ 步骤耗时 ${stepsElapsed.toFixed(1)}s 超过配音时长，音频将在合成时补齐`)
    }
    const actual = Math.max(voiceElapsed, stepsElapsed + SCENE_TAIL)
    if (!FAST) await waitUntil(sceneStart + actual * 1000)
    await page.evaluate(() => {
      window.__demoOverlay.setSubtitle('')
      window.__demoOverlay.clearHighlight()
    })
    await subtitleTask
    runScenes.push({ name: scene.name, duration: +actual.toFixed(3) })
    console.log(`  实际 ${actual.toFixed(1)}s${FAST ? '（快跑模式，步骤真实耗时 ' + stepsElapsed.toFixed(1) + 's）' : ''}`)
  }

  await sleep(800)
  await context.close()
  const video = page.video()
  if (video) {
    const src = await video.path()
    const dest = join(OUT_DIR, 'video_raw.webm')
    rmSync(dest, { force: true })
    renameSync(src, dest)
    console.log(`\n原始录像：${dest}`)
  }
  await browser.close()
  stopServer()

  if (FAST) {
    console.log(`\n快跑完成：全部断言通过，未录像、未改写 recording_meta.json`)
    return
  }
  writeFileSync(
    join(OUT_DIR, 'recording_meta.json'),
    JSON.stringify({ video: 'video_raw.webm', preRoll, scenes: runScenes }, null, 2),
  )
  console.log(`录制元数据：${join(OUT_DIR, 'recording_meta.json')}（总时长 ${runScenes.reduce((s, x) => s + x.duration, 0).toFixed(1)}s）`)
}

// ── 步骤执行器 ──────────────────────────────────────────────

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const resolveKeys = (keys) => keys.replace(/\bMod\b/g, MOD)

// 剧本里「展开前后不变」这类断言要跨步骤比数值，故用一个 run 作用域的存值表
const saved = {}
const PX_PER_MM = 96 / 25.4

// 取值走 Playwright 定位器，剧本才能用 :has-text() 这类按标签文本的定位写法
async function frameOf(step) {
  if (step.in !== 'preview') return page
  const h = await page.locator('iframe.print-html-preview-iframe').elementHandle()
  if (!h) throw new Error(`${step.do}: 预览未打开`)
  return h.contentFrame()
}

async function locOf(step, sel) {
  const loc = (await frameOf(step)).locator(sel).first()
  await loc.waitFor({ timeout: 12000 })
  return loc
}

const BOX_FN = (node) => {
  const r = node.getBoundingClientRect()
  return { w: r.width, h: r.height, top: r.top, left: r.left }
}

const conv = (step, v) => (step.unit === 'mm' ? v / PX_PER_MM : v)
const toNum = (str) => {
  const m = String(str).match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : NaN
}

function expectNum(step, label, got, want) {
  if (want == null) return
  const tol = step.tol ?? 0.5
  if (Math.abs(got - want) > tol) {
    throw new Error(`${step.do}: ${label} ${got.toFixed(2)} ≠ ${want}（容差 ${tol}）`)
  }
}

function expectStr(step, label, got) {
  if (step.expect != null && String(got) !== String(step.expect)) {
    throw new Error(`${step.do}: ${label} ≠ ${step.expect}（实为 ${String(got).slice(0, 120)}）`)
  }
  if (step.expectContains != null && !String(got).includes(step.expectContains)) {
    throw new Error(`${step.do}: ${label} 不含「${step.expectContains}」（实为 ${String(got).slice(0, 120)}）`)
  }
  if (step.expectNot != null && String(got).includes(step.expectNot)) {
    throw new Error(`${step.do}: ${label} 不应出现「${step.expectNot}」（实为 ${String(got).slice(0, 120)}）`)
  }
}

// 「展开前后不变」这类断言靠跨步骤比数值：前一步 save，后一步 sameAs
function compareSaved(step, label, got, key) {
  if (step.sameAs == null) return
  const name = step.sameAs + (key ? `.${key}` : '')
  const prev = saved[name]
  if (prev == null) throw new Error(`${step.do}: 未存过 ${name}，先给前一步加 save`)
  const tol = step.tol ?? 0.5
  if (Math.abs(got - prev) > tol) {
    throw new Error(`${step.do}: ${label} ${got.toFixed(2)} 与已存 ${name}=${prev.toFixed(2)} 相差 > ${tol}`)
  }
  console.log(`  [${step.do}] ${label} 与 ${name}=${prev.toFixed(2)} 一致（Δ${Math.abs(got - prev).toFixed(2)}）`)
}

function store(step, key, v) {
  if (step.save) {
    saved[step.save + (key ? `.${key}` : '')] = v
    console.log(`  [${step.do}] 存值 ${step.save}${key ? `.${key}` : ''} = ${+v.toFixed(2)}`)
  }
}

async function moveAndClick(selector, { modifiers, clickCount = 1, xRatio, yRatio } = {}) {
  const loc = page.locator(selector).first()
  await loc.scrollIntoViewIfNeeded()
  const box = await loc.boundingBox()
  // 缺省点中心；给 xRatio/yRatio 时点相对位置（如内容区空白处，用来取消选中）
  const x = xRatio == null ? box.x + box.width / 2 : box.x + box.width * xRatio
  const y = yRatio == null ? box.y + box.height / 2 : box.y + box.height * yRatio
  await page.mouse.move(x, y, { steps: 22 })
  await sleep(160)
  if (modifiers) for (const k of modifiers) await page.keyboard.down(resolveKeys(k))
  await page.mouse.down()
  await sleep(90)
  await page.mouse.up()
  if (clickCount > 1) {
    await sleep(60)
    await page.mouse.down({ clickCount })
    await sleep(60)
    await page.mouse.up({ clickCount })
  }
  if (modifiers) for (const k of [...modifiers].reverse()) await page.keyboard.up(resolveKeys(k))
}

async function runStep(step) {
  // 动作步骤习惯写 selector，量测步骤习惯写 sel，两者互通，剧本里少一类笔误
  if (step.selector && !step.sel) step.sel = step.selector
  switch (step.do) {
    case 'assert':
      await page.waitForSelector(step.selector, { timeout: 15000 })
      await sleep(step.ms ?? 300)
      return
    case 'countAssert': {
      // 轮询等待 selector 命中数达标（如 .print-element.selected 多选/组合扩展）
      const deadline = Date.now() + 10000
      for (;;) {
        const n = await page.locator(step.selector).count()
        if (n === step.count) return
        if (Date.now() > deadline) throw new Error(`${step.selector} 数量 ${n} ≠ ${step.count}`)
        await sleep(200)
      }
    }
    case 'measureQr': {
      // 从设计态 <img> 的 data-URL SVG 里真量静区几何，剧本台词引用的数字必须在这里过断言
      const m = await page.evaluate(
        (sel) => {
          const img = document.querySelector(sel)
          const src = (img && img.getAttribute('src')) || ''
          if (!src.startsWith('data:image/svg')) return { err: `未取到 SVG：${sel}` }
          const svg = decodeURIComponent(src.slice(src.indexOf(',') + 1))
          const dim = Number(svg.match(/viewBox="0 0 ([\d.]+) /)?.[1])
          const dot = Number(svg.match(/<rect[^>]*width="([\d.]+)"/)?.[1])
          let lo = Infinity
          let hi = -Infinity
          for (const r of svg.matchAll(/x="([\d.]+)"/g)) {
            lo = Math.min(lo, Number(r[1]))
            hi = Math.max(hi, Number(r[1]) + dot)
          }
          if (!Number.isFinite(dim) || !Number.isFinite(dot) || hi < 0) return { err: 'SVG 尺寸解析失败' }
          const ink = hi - lo
          return {
            dim, ink, dot,
            modules: Math.round(ink / dot),
            quiet: +((dim - ink) / 2 / dot).toFixed(3),
            ratio: +((ink / dim) * 100).toFixed(1),
          }
        },
        step.selector || '.print-qrcode img',
      )
      if (m.err) throw new Error(`measureQr: ${m.err}`)
      console.log(`  [measureQr] ${m.modules} 模块 · 静区 ${m.quiet} · 码面占框 ${m.ratio}%（SVG ${m.dim}px / 码面 ${m.ink}px）`)
      if (step.expectModules != null && m.modules !== step.expectModules) {
        throw new Error(`measureQr: 模块数 ${m.modules} ≠ ${step.expectModules}`)
      }
      if (step.expectQuiet != null && Math.abs(m.quiet - step.expectQuiet) > 0.001) {
        throw new Error(`measureQr: 静区 ${m.quiet} 模块 ≠ ${step.expectQuiet}`)
      }
      if (step.expectRatio != null && Math.abs(m.ratio - step.expectRatio) > (step.tol ?? 0.5)) {
        throw new Error(`measureQr: 码面占框 ${m.ratio}% ≠ ${step.expectRatio}%（容差 ${step.tol ?? 0.5}）`)
      }
      await sleep(step.ms ?? 400)
      return
    }
    case 'measureBarcode': {
      // 热敏清晰度的判据：从条码内联 SVG 反解「每模块物理宽度」，再按剧本给定的打印机 dpi
      // 折算成打印点数。台词里引用的模块数、静区、点数、毫米值都必须在这里过断言。
      // 尺寸读法两端不同：画布写在 style（Vue 绑定），出纸端写在 width 属性（mm）。
      const m = await (await locOf(step, step.selector || '.print-element.type-barcode .print-barcode svg')).evaluate(
        (svg, dpi) => {
          const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
          if (vb.length !== 4 || !Number.isFinite(vb[2])) return { err: `viewBox 解析失败：${svg.getAttribute('viewBox')}` }
          const st = (svg.getAttribute('style') || '').match(/width:\s*([\d.]+)mm/)
          const at = (svg.getAttribute('width') || '').match(/^([\d.]+)mm$/)
          if (!st && !at) return { err: `条码宽度没写成 mm（style="${svg.getAttribute('style')}" width="${svg.getAttribute('width')}"）` }
          const widthMm = Number((st || at)[1])
          let units = Infinity
          let lo = Infinity
          let hi = -Infinity
          let bars = 0
          for (const r of svg.querySelectorAll('rect')) {
            const w = Number(r.getAttribute('width'))
            const x = Number(r.getAttribute('x'))
            // 最窄矩形即 1 个模块；jsbarcode 的满幅背景条要排除
            if (!(w > 0) || !(x >= 0) || w > vb[2] * 0.6) continue
            bars++
            units = Math.min(units, w)
            lo = Math.min(lo, x)
            hi = Math.max(hi, x + w)
          }
          if (!bars) return { err: '没找到条码矩形' }
          const modsRaw = vb[2] / units
          const mods = Math.round(modsRaw)
          if (Math.abs(modsRaw - mods) > 0.5) return { err: `模块数不是整数：${modsRaw.toFixed(3)}` }
          const moduleMm = widthMm / mods
          const dots = dpi > 0 ? (moduleMm * dpi) / 25.4 : null
          return {
            widthMm,
            modules: mods,
            moduleMm,
            quiet: (mods - (hi - lo) / units) / 2,
            dots,
            dev: dots == null ? null : Math.abs(dots - Math.round(dots)),
            dotsRounded: dots == null ? null : Math.round(dots),
            shape: svg.getAttribute('shape-rendering') || '',
            sizeFrom: st ? 'style' : 'attr',
          }
        },
        step.dpi ?? 0,
      )
      if (m.err) throw new Error(`measureBarcode: ${m.err}`)
      console.log(
        `  [measureBarcode] ${m.modules} 模块 · 静区 ${m.quiet.toFixed(1)} 模块 · 成品宽 ${m.widthMm.toFixed(3)}mm · ` +
          `每模块 ${m.moduleMm.toFixed(4)}mm` +
          (m.dots == null
            ? `（未给 dpi，不折点）`
            : ` = ${m.dots.toFixed(3)} 点@${step.dpi}dpi（${m.dev < (step.intTol ?? 0.02) ? `整点 ${m.dotsRounded}` : `★非整点，偏 ${m.dev.toFixed(3)} 点`}）`) +
          ` · shape-rendering=${m.shape || '未设'} · 尺寸取自 ${m.sizeFrom}`,
      )
      if (step.expectModules != null && m.modules !== step.expectModules) {
        throw new Error(`measureBarcode: 模块数 ${m.modules} ≠ ${step.expectModules}`)
      }
      if (step.expectQuiet != null && Math.abs(m.quiet - step.expectQuiet) > (step.tol ?? 0.5)) {
        throw new Error(`measureBarcode: 静区 ${m.quiet.toFixed(2)} ≠ ${step.expectQuiet}（容差 ${step.tol ?? 0.5}）`)
      }
      if (step.expectWidthMm != null) expectNum(step, '成品宽', m.widthMm, step.expectWidthMm)
      if (step.expectShape != null) expectStr({ ...step, expect: step.expectShape }, 'shape-rendering', m.shape)
      if (step.expectDots != null && (m.dots == null || Math.abs(m.dots - step.expectDots) > (step.dotsTol ?? 0.02))) {
        throw new Error(`measureBarcode: 点数 ${m.dots == null ? '未折算' : m.dots.toFixed(3)} ≠ ${step.expectDots}`)
      }
      if (step.expectInteger === true && m.dev >= (step.intTol ?? 0.02)) {
        throw new Error(`measureBarcode: 期望整点，实测偏 ${m.dev.toFixed(3)} 点（${m.dots.toFixed(3)}）`)
      }
      if (step.expectInteger === false && m.dev < (step.intTol ?? 0.02)) {
        throw new Error(`measureBarcode: 期望非整点，实测 ${m.dots.toFixed(3)} 已是整点`)
      }
      if (m.dots != null) {
        store(step, 'dots', m.dots)
        compareSaved(step, '点数', m.dots, 'dots')
      }
      await sleep(step.ms ?? 400)
      return
    }
    case 'click':
      for (let i = 0; i < (step.repeat ?? 1); i++) {
        await moveAndClick(step.selector, { modifiers: step.modifiers, xRatio: step.xRatio, yRatio: step.yRatio })
        await sleep(step.ms ?? 450)
      }
      return
    case 'dblclick':
      await moveAndClick(step.selector, { clickCount: 2 })
      await sleep(step.ms ?? 600)
      return
    case 'rightClick': {
      // 右键定位：默认取目标盒子中心，可用 xRatio/yRatio 偏移到空白处（如内容层未命中元素）
      const loc = page.locator(step.selector).first()
      await loc.scrollIntoViewIfNeeded()
      const box = await loc.boundingBox()
      const x = box.x + box.width * (step.xRatio ?? 0.5)
      const y = box.y + box.height * (step.yRatio ?? 0.5)
      await page.mouse.move(x, y, { steps: 18 })
      await sleep(200)
      await page.mouse.down({ button: 'right' })
      await sleep(80)
      await page.mouse.up({ button: 'right' })
      await sleep(step.ms ?? 900)
      return
    }
    case 'key':
      await page.keyboard.press(resolveKeys(step.keys))
      await sleep(step.ms ?? 500)
      return
    case 'type': {
      const loc = page.locator(step.selector).first()
      await loc.scrollIntoViewIfNeeded()
      await loc.click()
      await sleep(200)
      if (step.clear !== false) {
        await page.keyboard.press(`${MOD}+a`)
        await page.keyboard.press('Backspace')
      }
      await page.keyboard.type(step.text, { delay: step.delay ?? 70 })
      await sleep(step.ms ?? 500)
      return
    }
    case 'hover': {
      const loc = page.locator(step.selector).first()
      await loc.hover({ force: true })
      await sleep(step.ms ?? 600)
      return
    }
    case 'highlight': {
      const loc = page.locator(step.selector).first()
      await loc.scrollIntoViewIfNeeded()
      await sleep(200)
      const box = await loc.boundingBox()
      await page.evaluate(([x, y, w, h]) => window.__demoOverlay.highlightRect(x, y, w, h), [box.x, box.y, box.width, box.height])
      await sleep(step.ms ?? 1800)
      await page.evaluate(() => window.__demoOverlay.clearHighlight())
      return
    }
    case 'dragCard': {
      const cardSel = `.material-card:has(.material-label:text-is("${step.card}"))`
      const src = page.locator(cardSel).first()
      await src.scrollIntoViewIfNeeded()
      const srcBox = await src.boundingBox()
      await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2, { steps: 20 })
      await sleep(250)
      const tgt = await page.locator(step.target).first().elementHandle()
      const tBox = await tgt.boundingBox()
      const x = tBox.x + tBox.width * (step.xRatio ?? 0.5)
      const y = tBox.y + tBox.height * step.yRatio
      // HTML5 拖拽用合成 DragEvent + 共享 DataTransfer，绕开 CDP 拖放时序问题
      await src.evaluate((el, [tx, ty]) => {
        const target = document.elementFromPoint(tx, ty) || el
        const dt = new DataTransfer()
        const mk = (t, cx, cy) => new DragEvent(t, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: cx, clientY: cy })
        const r = el.getBoundingClientRect()
        el.dispatchEvent(mk('dragstart', r.x + r.width / 2, r.y + r.height / 2))
        target.dispatchEvent(mk('dragenter', tx, ty))
        target.dispatchEvent(mk('dragover', tx, ty))
        target.dispatchEvent(mk('drop', tx, ty))
        el.dispatchEvent(mk('dragend', tx, ty))
      }, [x, y])
      await page.mouse.move(x, y, { steps: 18 })
      await sleep(700)
      return
    }
    case 'waitForPreview': {
      const iframe = page.frameLocator('iframe.print-html-preview-iframe')
      await iframe.locator('.print-page').first().waitFor({ timeout: 20000 })
      await sleep(800)
      return
    }
    case 'previewScroll': {
      const handle = await page.locator('iframe.print-html-preview-iframe').elementHandle()
      const frame = await handle.contentFrame()
      await frame.evaluate((y) => {
        const scroller = document.querySelector('.print-html-preview') || document.scrollingElement
        scroller.scrollBy({ top: y, behavior: 'smooth' })
      }, step.y)
      await sleep(1100)
      return
    }
    case 'download': {
      const dlPromise = page.waitForEvent('download', { timeout: 15000 })
      await runStep({ do: 'click', selector: step.selector, ms: 200 })
      const dl = await dlPromise
      const dest = join(OUT_DIR, step.saveAs || dl.suggestedFilename())
      await dl.saveAs(dest)
      console.log(`  下载保存：${dest}`)
      return
    }
    case 'reload':
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.designer-container', { timeout: 20000 })
      await sleep(step.ms ?? 1200)
      return
    case 'showImage': {
      // 全屏展示图片。about:blank 里加载 localhost 资源会被 Private Network
      // Access 拦截（net::ERR_FAILED），故直接读文件内联为 base64。
      // src 以 @ 开头时相对本剧本的 OUT_DIR（放流水线自产图，如片尾测试输出截图），否则相对 demo/public。
      const bare = step.src.replace(/^\//, '')
      const file = step.src.startsWith('@') ? join(OUT_DIR, bare.slice(1)) : join(DEMO_DIR, 'public', bare)
      const b64 = readFileSync(file).toString('base64')
      const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg'
      await page.goto('about:blank')
      const fill = step.fit === 'fill'
      const bodyStyle = `margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:${step.bg || '#0e1420'}`
      const imgStyle = fill
        ? 'width:100%;height:100%;object-fit:contain'
        : 'max-width:86%;max-height:82%;border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.55)'
      await page.setContent(
        `<body style="${bodyStyle}"><img src="data:${mime};base64,${b64}" style="${imgStyle}">`,
        { waitUntil: 'load' },
      )
      await page.waitForFunction(() => {
        const i = document.querySelector('img')
        return i && i.complete && i.naturalWidth > 0
      })
      await sleep(step.ms ?? 2000)
      return
    }
    case 'goto':
      // 带 url 时整页导航；否则视为从 showImage 等临时页返回上一页
      if (step.url) await page.goto(step.url, { waitUntil: 'networkidle' })
      else await page.goBack({ waitUntil: 'networkidle' })
      if (step.selector) await page.waitForSelector(step.selector, { timeout: 20000 })
      await sleep(step.ms ?? 1200)
      return
    case 'wait':
      await sleep(step.ms ?? 1000)
      return
    case 'select': {
      // 原生下拉：设值后派发 change，Vue 的 @change 才会落库重出图；按可见文案选更稳
      const loc = page.locator(step.selector).first()
      await loc.selectOption(step.label != null ? { label: step.label } : step.value)
      await sleep(step.ms ?? 600)
      return
    }
    case 'measureBox': {
      const r = await (await locOf(step, step.sel)).evaluate(BOX_FN)
      const u = step.unit === 'mm' ? 'mm' : 'px'
      const w = conv(step, r.w)
      const h = conv(step, r.h)
      console.log(`  [measureBox] ${step.sel} → ${w.toFixed(2)}×${h.toFixed(2)}${u}`)
      expectNum(step, '宽', w, step.expectW)
      expectNum(step, '高', h, step.expectH)
      store(step, 'w', w)
      store(step, 'h', h)
      if (step.sameAs) {
        // 缺省两个轴都比；只关心一轴时写 sameAsKey: "w" 或 "h"（如「中文名占满容器宽」只比宽）
        const keys = step.sameAsKey ? [step.sameAsKey] : ['w', 'h']
        for (const k of keys) compareSaved(step, k === 'w' ? '宽' : '高', k === 'w' ? w : h, k)
      }
      await sleep(step.ms ?? 200)
      return
    }
    case 'measurePos': {
      const loc = await locOf(step, step.sel)
      const r = await loc.evaluate((node, parent) => {
        const a = node.getBoundingClientRect()
        const p = parent ? node.closest(parent) : null
        const b = p ? p.getBoundingClientRect() : { left: 0, top: 0 }
        return { top: a.top - b.top, left: a.left - b.left }
      }, step.parent || null)
      const key = step.axis === 'left' ? 'left' : 'top'
      const v = conv(step, r[key])
      console.log(`  [measurePos] ${step.sel}${step.parent ? ` 相对 ${step.parent}` : ''} 的 ${key} = ${v.toFixed(2)}${step.unit === 'mm' ? 'mm' : 'px'}`)
      expectNum(step, key, v, step.expect)
      compareSaved(step, key, v, key)
      store(step, key, v)
      await sleep(step.ms ?? 200)
      return
    }
    case 'measureCount': {
      const n = await (await frameOf(step)).locator(step.sel).count()
      console.log(`  [measureCount] ${step.sel} 命中 ${n} 个`)
      if (step.expect != null && n !== step.expect) {
        throw new Error(`measureCount: ${step.sel} 命中 ${n} ≠ ${step.expect}`)
      }
      await sleep(step.ms ?? 200)
      return
    }
    case 'measureText': {
      const t = await (await locOf(step, step.sel)).evaluate((node) => (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim())
      console.log(`  [measureText] ${step.sel} → ${t.slice(0, 100)}`)
      expectStr(step, '文本', t)
      if (step.save) store(step, '', t)
      await sleep(step.ms ?? 200)
      return
    }
    case 'measureCss': {
      const v = await (await locOf(step, step.sel)).evaluate((node, prop) => getComputedStyle(node)[prop], step.prop)
      console.log(`  [measureCss] ${step.sel} 的 ${step.prop} = ${v}`)
      if (typeof step.expect === 'number') {
        const num = conv(step, toNum(v))
        if (Number.isNaN(num)) throw new Error(`measureCss: ${step.prop} 解析不出数字：${v}`)
        expectNum(step, step.prop, num, step.expect)
        compareSaved(step, step.prop, num)
        store(step, '', num)
      } else {
        expectStr(step, step.prop, v)
      }
      await sleep(step.ms ?? 200)
      return
    }
    case 'cropWin': {
      // 取景窗红框是内联百分比样式，与视口尺寸无关，可直接当「画面被裁到哪」的证据
      const sel = step.sel || '.pd-crop-win'
      const style = await (await locOf(step, sel)).evaluate((node) => node.getAttribute('style') || '')
      const pick = (p) => {
        for (const part of style.split(';')) {
          const i = part.indexOf(':')
          if (i > 0 && part.slice(0, i).trim() === p) return parseFloat(part.slice(i + 1))
        }
        return NaN
      }
      const w = { left: pick('left'), top: pick('top'), width: pick('width'), height: pick('height') }
      if (Object.values(w).some((v) => Number.isNaN(v))) throw new Error(`cropWin: 样式百分比解析失败：${style}`)
      console.log(`  [cropWin] left ${w.left}% · top ${w.top}% · ${w.width}%×${w.height}%（${sel}）`)
      expectNum(step, 'left', w.left, step.expectLeft)
      expectNum(step, 'top', w.top, step.expectTop)
      expectNum(step, '宽', w.width, step.expectW)
      expectNum(step, '高', w.height, step.expectH)
      await sleep(step.ms ?? 300)
      return
    }
    default:
      throw new Error(`未知步骤类型: ${step.do}`)
  }
}

main().catch((e) => {
  console.error(e.message)
  stopServer()
  process.exit(1)
})
