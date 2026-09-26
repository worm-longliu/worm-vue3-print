#!/usr/bin/env node
/**
 * 真实 demo 自动演示录制：1440×1080（4:3）Playwright 实时录制。
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEMO_DIR = resolve(__dirname, '..')
const OUT_DIR = join(__dirname, 'out')
const script = JSON.parse(readFileSync(join(__dirname, 'script.json'), 'utf8'))
const timings = JSON.parse(readFileSync(join(OUT_DIR, 'timings.json'), 'utf8'))
const overlaySrc = readFileSync(join(__dirname, 'overlay.js'), 'utf8')

const { width: W, height: H } = script.video
const BASE_URL = script.baseUrl
const SCENE_TAIL = 0.5

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
    console.error('缺少配音，请先运行：npm run video:voice -w @worm-vue3-print/demo')
    process.exit(1)
  }
  await ensureServer()

  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    recordVideo: { dir: join(OUT_DIR, 'raw'), size: { width: W, height: H } },
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

    const subtitleTask = (async () => {
      for (const s of timing.sentences) {
        await waitUntil(sceneStart + s.start * 1000)
        await page.evaluate((t) => window.__demoOverlay.setSubtitle(t), s.text)
      }
    })().catch((e) => console.error('  字幕调度异常:', e.message))

    for (const step of scene.steps || []) {
      if (step.s != null) {
        const anchor = timing.sentences[step.s]
        if (!anchor) throw new Error(`场景「${scene.name}」步骤 s=${step.s} 超出句数 ${timing.sentences.length}`)
        await waitUntil(sceneStart + anchor.start * 1000)
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
    await waitUntil(sceneStart + actual * 1000)
    await page.evaluate(() => {
      window.__demoOverlay.setSubtitle('')
      window.__demoOverlay.clearHighlight()
    })
    await subtitleTask
    runScenes.push({ name: scene.name, duration: +actual.toFixed(3) })
    console.log(`  实际 ${actual.toFixed(1)}s`)
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

  writeFileSync(
    join(OUT_DIR, 'recording_meta.json'),
    JSON.stringify({ video: 'video_raw.webm', preRoll, scenes: runScenes }, null, 2),
  )
  console.log(`录制元数据：${join(OUT_DIR, 'recording_meta.json')}（总时长 ${runScenes.reduce((s, x) => s + x.duration, 0).toFixed(1)}s）`)
}

// ── 步骤执行器 ──────────────────────────────────────────────

async function runStep(step) {
  switch (step.do) {
    case 'assert':
      await page.waitForSelector(step.selector, { timeout: 15000 })
      await sleep(step.ms ?? 300)
      return
    case 'click': {
      const loc = page.locator(step.selector).first()
      await loc.scrollIntoViewIfNeeded()
      const box = await loc.boundingBox()
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await page.mouse.move(x, y, { steps: 22 })
      await sleep(160)
      await page.mouse.down()
      await sleep(90)
      await page.mouse.up()
      await sleep(step.ms ?? 450)
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
    case 'wait':
      await sleep(step.ms ?? 1000)
      return
    default:
      throw new Error(`未知步骤类型: ${step.do}`)
  }
}

main().catch((e) => {
  console.error(e.message)
  stopServer()
  process.exit(1)
})
