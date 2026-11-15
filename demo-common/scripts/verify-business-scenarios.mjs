import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 业务场景全量回归：以示例库为数据源，逐个把模板注入 <print-designer> 并走完整出纸链路。
// 与 verify-demo.mjs 的分工：那份验 UI 版式，这份验「任意业务模板都能被 common 正确加载、
// 校验、绑定、分页、出纸」；新增示例后自动纳入，不手工维护用例清单。
// 用法：node demo-common/scripts/verify-business-scenarios.mjs [url] [--quick]
//   --quick 只跑体检报告深度场景，用于四个宿主的一致性快检。
const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(HERE, '..', '..', 'demo', 'package.json'))
const { chromium } = require('playwright')
const { SAMPLES } = await import(new URL('../apps/vue3/src/templates.js', import.meta.url))

const URL_ = process.argv.find(a => a.startsWith('http')) || 'http://localhost:9331/'
const QUICK = process.argv.includes('--quick')
const HEALTH = SAMPLES.find(s => s.id === 'health-report')

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// 本机若只装了旧版 Chromium，可用 CHROMIUM_PATH 指到缓存里的可执行文件；
// 默认仍走 Playwright 自带的浏览器解析（CI / 常规环境无需设置）。
const browser = await chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {})
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(URL_, { waitUntil: 'networkidle' })
await page.waitForFunction(() => {
  const el = document.querySelector('print-designer')
  return !!el?.shadowRoot?.querySelector('.designer-container')
}, undefined, { timeout: 20000 })

/** 按可见文本点按钮 */
async function clickByText(text, scope = 'button') {
  const btn = page.locator(scope).filter({ hasText: text }).first()
  if (!(await btn.count())) throw new Error(`未找到按钮：${text}`)
  await btn.click()
  await page.waitForTimeout(180)
}

/** 从示例库选中并应用一个示例，返回设计器侧的模板与校验结果 */
async function applySample(name) {
  await clickByText('加载示例')
  await page.waitForFunction(() => {
    const m = document.querySelector('.gallery-mask')
    return m && !m.hasAttribute('hidden')
  }, undefined, { timeout: 15000 })
  const card = page.locator('.gallery-mask .sample-card').filter({ hasText: name }).first()
  if (!(await card.count())) throw new Error(`示例库没有卡片：${name}`)
  await card.click()
  await page.waitForTimeout(150)
  await clickByText('使用该模板')
  await page.waitForFunction(() => {
    const m = document.querySelector('.gallery-mask')
    return !m || m.hasAttribute('hidden')
  }, undefined, { timeout: 15000 })
  await page.waitForTimeout(250)
  return page.evaluate(() => {
    const el = document.querySelector('print-designer')
    const json = el.getTemplateJson()
    let parsed = null
    try { parsed = typeof json === 'string' ? JSON.parse(json) : json } catch { /* 下面断言会报 */ }
    let validation = 'ok'
    try {
      const r = el.validateTemplate?.()
      if (r === false || (r && r.valid === false)) validation = String(r.message ?? 'invalid')
    } catch (e) { validation = String(e) }
    return {
      parsed,
      fieldCount: (el.store?.fields ?? []).length,
      canvasEls: el.shadowRoot?.querySelectorAll('[data-el-id]').length ?? 0,
      badge: [...document.querySelectorAll('.demo-badge')].map(b => b.textContent.trim()).join(' '),
      validation,
    }
  })
}

/** 打开设计器预览，等纸面数稳定后读取出纸文档 */
async function previewOnce(timeout = 30000) {
  await page.evaluate(() => {
    const btn = [...document.querySelector('print-designer').shadowRoot.querySelectorAll('button')]
      .find(b => b.textContent.trim() === '预览')
    if (!btn) throw new Error('未找到设计器「预览」按钮')
    btn.click()
  })
  await page.waitForFunction(() => {
    const m = document.querySelector('.preview-mask')
    return m && !m.hasAttribute('hidden') && !!m.querySelector('iframe')?.contentWindow?.document
  }, undefined, { timeout: 20000 })
  const count = () => page.evaluate(() =>
    document.querySelector('.preview-mask iframe')?.contentWindow?.document.querySelectorAll('.print-page').length ?? 0)
  let prev = -1, same = 0
  const started = Date.now()
  for (;;) {
    const n = await count()
    same = n > 0 && n === prev ? same + 1 : 0
    prev = n
    if (same >= 2) break
    if (Date.now() - started > timeout) throw new Error(`预览纸面数未稳定（当前 ${n} 页）`)
    await page.waitForTimeout(120)
  }
  const res = await page.evaluate(() => {
    const doc = document.querySelector('.preview-mask iframe').contentWindow.document
    const pages = [...doc.querySelectorAll('.print-page')]
    return {
      pageCount: pages.length,
      text: doc.body.innerText.replace(/\s+/g, ' '),
      pageTexts: pages.map(p => p.innerText.replace(/\s+/g, ' ')),
      tables: doc.querySelectorAll('table, .print-table').length,
      chartImages: [...doc.querySelectorAll('img[src^="data:image/svg"]')]
        .filter(img => img.getAttribute('src').includes('preserveAspectRatio')).length,
      svgImages: doc.querySelectorAll('img[src^="data:image/svg"]').length,
      spans: /rowspan|colspan/.test(doc.body.innerHTML) ? 1 : 0,
      subtitle: document.querySelector('.preview-subtitle')?.textContent.trim() ?? '',
    }
  })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => {
    const m = document.querySelector('.preview-mask')
    return !m || m.hasAttribute('hidden')
  }, undefined, { timeout: 15000 })
  return res
}

/** 取示例数据里的字符串叶子：至少一个原样落到纸面，才算表达式绑定到位 */
const dataLeaves = (obj, out = []) => {
  for (const v of Object.values(obj ?? {})) {
    if (v && typeof v === 'object') dataLeaves(v, out)
    else if (typeof v === 'string' && v.length >= 4) out.push(v)
  }
  return out
}

// ── 1. 全量示例：加载 → 校验 → 预览出纸 → 数据绑定 ──
const list = QUICK ? [] : SAMPLES
for (const s of list) {
  try {
    const applied = await applySample(s.name)
    const pageCount = applied.parsed?.pages?.length ?? 0
    // 部分示例刻意用纯静态文本（fields 为空数组），字段断言按示例自身声明比对而非一律要求非空
    check(`[${s.group}] ${s.name}：模板注入与校验`,
      !!applied.parsed && applied.fieldCount === (s.fields ?? []).length &&
      applied.canvasEls > 0 && applied.validation === 'ok' && applied.badge.includes(s.name),
      `字段 ${applied.fieldCount}/${(s.fields ?? []).length}·画布 ${applied.canvasEls}·多页 ${pageCount}·校验 ${applied.validation}`)
    const pv = await previewOnce()
    const leaves = dataLeaves(s.data).slice(0, 3)
    check(`[${s.group}] ${s.name}：预览出纸与数据绑定`,
      pv.pageCount > 0 && pv.text.length > 20 && (leaves.length === 0 || leaves.some(t => pv.text.includes(t))) &&
      !/\{[a-zA-Z_][\w.]*\}/.test(pv.text),
      `${pv.pageCount} 页·文本 ${pv.text.length} 字·样例值 ${leaves[0] ?? '无'}`)
  } catch (e) {
    check(`[${s.group}] ${s.name}：场景执行`, false, String(e).slice(0, 160))
  }
}

// ── 2. 体检报告深度场景：多页分项目 / 表格 / 图表 / 文字 / 页码 / 批量 ──
try {
  const applied = await applySample(HEALTH.name)
  const pages = applied.parsed?.pages ?? []
  check('体检报告：5 页多页面模板被完整加载（version:1 + pages）',
    applied.parsed?.version === 1 && pages.length === 5 && applied.validation === 'ok',
    `version=${applied.parsed?.version} pages=${pages.length} 校验=${applied.validation}`)
  check('体检报告：五页纸张、方向、边距一致',
    pages.every(p => p.paperSize === 'A4' && p.orientation === 'portrait' &&
      JSON.stringify(p.margins) === JSON.stringify(pages[0].margins)), '')
  check('体检报告：页签按检验项目命名',
    pages.map(p => p.name).join('/') === '封面与总检结论/一般检查/血常规/生化检验/尿常规与影像检查',
    pages.map(p => p.name).join('/'))
  check('体检报告：业务字段树注入设计器', applied.fieldCount >= 20, `字段 ${applied.fieldCount} 个`)
  const chartsInTemplate = pages.reduce((n, p) => n + (p.elements ?? []).filter(e =>
    (e.type || e.printElementType?.type) === 'image' && String(e.options?.src ?? '').startsWith('data:image/svg')).length, 0)
  check('体检报告：模板含 3 个内联 SVG 图表元素（未被屏蔽类型剥离）', chartsInTemplate === 3, `图表元素 ${chartsInTemplate} 个`)
  await page.evaluate(() => document.querySelector('print-designer').store.switchPage(2)) // 第 3 页「血常规」
  await page.waitForTimeout(350)
  const canvasCharts = await page.evaluate(() =>
    [...document.querySelector('print-designer').shadowRoot.querySelectorAll('.print-image img')]
      .filter(img => img.getAttribute('src')?.includes('preserveAspectRatio')).length)
  check('体检报告：切换页签后画布显示该检验项目的图表', canvasCharts >= 1, `画布图表 ${canvasCharts} 个`)

  const pv = await previewOnce()
  check('体检报告：多页出纸不少于 5 页', pv.pageCount >= 5, `${pv.pageCount} 页`)
  for (const word of ['健康体检报告', '总检结论', '健康建议', '血常规', '生化检验', '尿常规', '影像与心电检查']) {
    check(`体检报告：纸面含「${word}」`, pv.text.includes(word), '')
  }
  check('体检报告：矢量图表落到纸面', pv.chartImages >= 3, `图表 ${pv.chartImages} 个 / 全部 SVG 图 ${pv.svgImages} 个`)
  check('体检报告：表格与多级表头渲染', pv.tables > 0 && pv.spans === 1, `表格节点 ${pv.tables}`)
  check('体检报告：页脚连续页码', /第\s*1\s*页\s*\/\s*共\s*\d+\s*页/.test(pv.text),
    (pv.text.match(/第\s*\d+\s*页\s*\/\s*共\s*\d+\s*页/) ?? ['未找到'])[0])
  check('体检报告：异常检验值绑定到位',
    pv.text.includes('6.28') && pv.text.includes('4.12') && pv.text.includes('27.4'), '')
  check('体检报告：第 3 页为血常规专项（多级表头 + 白细胞分类图）',
    !!pv.pageTexts[2]?.includes('五分类') && !pv.pageTexts[2]?.includes('尿蛋白'), '')
  check('体检报告：第 4 页为生化检验专项（趋势图）',
    !!pv.pageTexts[3]?.includes('历年血脂与血糖趋势') && !pv.pageTexts[3]?.includes('尿蛋白'), '')
  check('体检报告：第 5 页为尿常规与影像专项',
    !!pv.pageTexts[4]?.includes('尿蛋白') && !!pv.pageTexts[4]?.includes('影像与心电检查'), '')
  check('体检报告：不同检验项目不混在同一页',
    pv.pageTexts.filter(t => t.includes('五分类')).every(t => !t.includes('尿蛋白')), '')

  // 批量：同一多页模板换受检人，份间分页合并为一个作业
  await page.locator('.demo-batch-switch input').check()
  await page.waitForTimeout(200)
  const batched = await previewOnce()
  check('体检报告：批量 2 份（张明远 / 陈国平）合并出纸',
    batched.pageCount >= pv.pageCount * 2 && batched.text.includes('陈国平'),
    `单份 ${pv.pageCount} 页 → 批量 ${batched.pageCount} 页`)
  await page.locator('.demo-batch-switch input').uncheck()
} catch (e) {
  check('体检报告：深度场景执行', false, String(e).slice(0, 200))
}

// ── 3. 旁路 API 与事件：保存导出前的设计器契约 ──
try {
  const api = await page.evaluate(() => {
    const el = document.querySelector('print-designer')
    el.store?.switchPage?.(0)
    const json = el.getTemplateJson()
    const before = JSON.parse(json)
    const count = t => (t.pages ?? [t]).reduce((n, p) => n +
      (p.elements?.length ?? 0) + (p.header?.elements?.length ?? 0) + (p.footer?.elements?.length ?? 0), 0)
    el.loadTemplate(before)
    const after = JSON.parse(el.getTemplateJson())
    return {
      methods: ['save', 'validateTemplate', 'loadTemplate', 'getTemplateJson'].every(k => typeof el[k] === 'function'),
      before: count(before), after: count(after), pages: after.pages?.length ?? 1, jsonLen: json.length,
    }
  })
  check('自定义元素旁路 API 齐备且 loadTemplate 多页往返不丢元素',
    api.methods && api.pages === 5 && api.before > 0 && api.after === api.before && api.jsonLen > 1000,
    `页数 ${api.pages}·元素 ${api.before}→${api.after}·JSON ${api.jsonLen} 字符`)
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await clickByText('导出模板')
  const download = await dl
  check('导出模板走 save 旁路并触发下载', !!download, download ? await download.suggestedFilename() : '无下载事件')
} catch (e) {
  check('旁路 API 场景执行', false, String(e).slice(0, 160))
}

// 主站 demo 会在页面加载后自动探测本机打印客户端；CI/本地没起客户端时的
// WebSocket ECONNREFUSED 与 /render-api 500 属于环境噪声，不是页面异常，口径与 verify-demo 一致。
const realErrors = errors.filter(e => !/Failed to load resource|WebSocket|favicon/.test(e))
check('全程 console / pageerror 洁净', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter(r => !r.pass)
console.log(`\n${URL_} 共 ${results.length} 项：通过 ${results.length - failed.length}、失败 ${failed.length}${QUICK ? '（--quick）' : ''}`)
if (failed.length) {
  failed.forEach(f => console.log(`  FAIL  ${f.name} — ${f.detail}`))
  process.exit(1)
}
