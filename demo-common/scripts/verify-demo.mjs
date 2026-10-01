import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 子 demo 验收：版式必须与 ./demo 完全一致，且四条集成链路真的跑得通。
// 用法：node demo-common/scripts/verify-demo.mjs [url]   （默认 http://localhost:9331/）
// 四个宿主类名逐字相同（样式由 sync-demo-styles.mjs 同源生成），故一律按 demo 类名断言；
// 遮罩是 position:fixed，可见性只能按尺寸 + hidden + display 判定，不能用 offsetParent。
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'demo', 'package.json'))
const { chromium } = require('playwright')

const URL_ = process.argv[2] || 'http://localhost:9331/'
// 示例库由 sync-demo-samples.mjs 从 demo 同源生成（四份同 MD5），断言口径直接读产物，不再手工维护计数。
const { SAMPLES } = await import(new URL('../apps/vue3/src/templates.js', import.meta.url))
const DEFAULT_SAMPLE = SAMPLES[0]
const FIRST_LABEL_SAMPLE = SAMPLES.find(s => s.group === '标签')
/** 取示例数据里的字符串叶子：纸面必须出现它们，才算表达式真的绑定到位（不写死任何示例字样） */
const dataLeaves = (obj, out = []) => {
  for (const v of Object.values(obj ?? {})) {
    if (v && typeof v === 'object') dataLeaves(v, out)
    else if (typeof v === 'string' && v.length >= 4) out.push(v)
  }
  return out
}
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'evidence')
mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 生成一段浏览器侧「选择器可见」表达式，同时用于 evaluate 与 waitForFunction */
const visibleExpr = sel => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el || el.hasAttribute('hidden')) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'
})()`

const waitVisible = (page, sel, timeout = 5000) => page.waitForFunction(visibleExpr(sel), { timeout })
const waitHidden = (page, sel, timeout = 5000) => page.waitForFunction(`!(${visibleExpr(sel)})`, { timeout })

/** 按可见文本点按钮 */
async function clickByText(page, text, scope = 'button') {
  const btn = page.locator(scope).filter({ hasText: text }).first()
  if (!(await btn.count())) throw new Error(`未找到按钮：${text}（范围 ${scope}）`)
  await btn.click()
  await page.waitForTimeout(300)
}

/** 写文本框：走原生 value setter 再派发 input，兼容 Vue/React 受控绑定 */
async function setText(page, selector, value, nth = 0) {
  await page.locator(selector).nth(nth).evaluate((el, text) => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
  await page.waitForTimeout(200)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(URL_, { waitUntil: 'networkidle' })
await page.waitForSelector('print-designer', { timeout: 20000 })
await page.waitForFunction(() => {
  const el = document.querySelector('print-designer')
  return !!el?.shadowRoot?.querySelector('.designer-container')
}, { timeout: 20000 })
await page.waitForTimeout(800)

// ── 1. 版式骨架与 demo 一致 ──
const layout = await page.evaluate(() => {
  const container = document.querySelector('.demo-container')
  const el = document.querySelector('print-designer')
  const cRect = container.getBoundingClientRect()
  const dRect = el.getBoundingClientRect()
  return {
    topbar: !!document.querySelector('.demo-topbar'),
    btnCount: document.querySelectorAll('.demo-topbar .demo-print-btn').length,
    batchSwitch: !!document.querySelector('.demo-batch-switch'),
    hostSwitch: (() => {
      const box = document.querySelector('.demo-host-switch')
      return {
        open: !!box?.open,
        summary: box?.querySelector('summary')?.textContent.trim() ?? '',
        links: [...(box?.querySelectorAll('a') ?? [])].map(a => ({
          href: a.getAttribute('href'),
          on: a.classList.contains('on'),
        })),
      }
    })(),
    badges: [...document.querySelectorAll('.demo-badge')].map(b => b.textContent.trim()),
    container: { w: Math.round(cRect.width), h: Math.round(cRect.height) },
    designer: { w: Math.round(dRect.width), h: Math.round(dRect.height) },
    sidePanel: !!document.querySelector('.side, .logs, .canvas-pane'),
    designerEls: el.shadowRoot.querySelectorAll('[data-el-id]').length,
    hasFields: (el.store?.fields ?? []).length,
    uploadIsFn: typeof el.uploadImage === 'function',
    jsonLen: el.getTemplateJson().length,
  }
})
check('顶栏与画布容器沿用 demo 类名', layout.topbar && layout.container.w > 0, '.demo-topbar/.demo-container')
check('顶栏动作数=6（与 demo 相同的按钮数）', layout.btnCount === 6, `实际 ${layout.btnCount}`)
// 顶栏「宿主示例」下拉：默认收起，五个工程入口齐备（链接用 <a>，不计入上面的按钮数），summary 标出当前宿主
const HOST_PORTS = ['9303', '9331', '9332', '9335', '9334']
const SWITCH_NAME_BY_PORT = { '9303': 'Vue3 canvas', '9331': 'Vue3', '9332': 'Vue2', '9335': 'React', '9334': 'jQuery' }
const hostOrigin = new URL(URL_).origin + '/'
const sw = layout.hostSwitch
const switchOk =
  !sw.open &&
  sw.links.length === HOST_PORTS.length &&
  HOST_PORTS.every(p => sw.links.some(a => a.href === `http://localhost:${p}/`)) &&
  sw.links.filter(a => a.on).length === 1 &&
  sw.links.find(a => a.on).href === hostOrigin &&
  sw.summary.endsWith(SWITCH_NAME_BY_PORT[new URL(URL_).port])
check('宿主示例下拉收起态：五入口齐备且 summary 标出当前宿主', switchOk,
  `${sw.summary}·open=${sw.open}·${sw.links.map(a => a.href).join(' ')}`)
// 展开态：菜单可见、挂在顶栏下方，且命中测试归菜单所有（顶栏与画布容器是同级 flex item，
// 浏览器按原子层整体绘制，菜单层级不够就会被设计器元素盖住——只看 rect 会漏判）
await page.locator('.demo-host-switch > summary').click()
await page.waitForTimeout(150)
const opened = await page.evaluate(() => {
  const box = document.querySelector('.demo-host-switch')
  const menu = box.querySelector('.demo-host-switch-menu')
  const m = menu.getBoundingClientRect()
  const bar = document.querySelector('.demo-topbar').getBoundingClientRect()
  let covered = 0
  for (let row = 1; row <= 6; row++) {
    for (const col of [12, Math.round(m.width / 2), Math.round(m.width) - 12]) {
      const el = document.elementFromPoint(m.left + col, m.top + (m.height * row) / 7)
      if (!el || !menu.contains(el)) covered++
    }
  }
  return {
    open: box.open,
    visible: m.width > 150 && m.height > 60,
    belowTopbar: m.top >= bar.bottom - 8,
    covered,
  }
})
check('宿主示例下拉展开态：菜单挂在顶栏下方且未被画布元素遮挡',
  opened.open && opened.visible && opened.belowTopbar && opened.covered === 0,
  `被盖采样点 ${opened.covered}/18`)
await page.locator('.demo-host-switch > summary').click()
await page.waitForTimeout(150)
check('批量开关沿用 demo 的 .demo-batch-switch', layout.batchSwitch)
check('画布撑满 .demo-container（自定义元素非塌陷）',
  layout.designer.w > 800 && layout.designer.h > 500
  && Math.abs(layout.designer.w - layout.container.w) < 4 && Math.abs(layout.designer.h - layout.container.h) < 4,
  `${layout.designer.w}x${layout.designer.h} vs 容器 ${layout.container.w}x${layout.container.h}`)
check('已删除宿主侧栏（无日志面板/预览分栏）', !layout.sidePanel)
check('顶部不展示模板 ID 徽章', !layout.badges.some(b => b.includes('模板 ID')), layout.badges.join(' | '))
check('业务类型徽章=当前示例', layout.badges.some(b => b.includes(DEFAULT_SAMPLE.name)), layout.badges.join(' | '))
check('设计器已载入示例并注入字段与回调',
  layout.designerEls > 0 && layout.hasFields > 0 && layout.uploadIsFn && layout.jsonLen > 200,
  `元素 ${layout.designerEls}·字段 ${layout.hasFields}·JSON ${layout.jsonLen} 字符`)

// ── 2. 示例库弹窗：卡片 / 缩略图 / 页签筛选 / 应用 ──
await clickByText(page, '加载示例')
await waitVisible(page, '.gallery-mask')
const gallery = await page.evaluate(() => ({
  cards: document.querySelectorAll('.gallery-mask .sample-card').length,
  thumbs: document.querySelectorAll('.gallery-mask .thumb-page').length,
  tabs: [...document.querySelectorAll('.gallery-mask .gallery-tab')].map(t => t.textContent.trim()),
  subtitle: document.querySelector('.gallery-subtitle')?.textContent.trim(),
  firstThumb: (() => {
    const p = document.querySelector('.gallery-mask .thumb-page')
    if (!p) return { w: 0, h: 0, els: 0 }
    const r = p.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), els: p.querySelectorAll('.thumb-el').length }
  })(),
}))
check(`示例库卡片数=${SAMPLES.length}（与 demo 同源）`, gallery.cards === SAMPLES.length, `cards=${gallery.cards}`)
check('每张卡片绘制版式缩略图', gallery.thumbs === SAMPLES.length && gallery.firstThumb.els > 0,
  `thumb-page=${gallery.thumbs}·首页元素=${gallery.firstThumb.els}`)
check('缩略图纸张按比例绘制（非 0 尺寸）', gallery.firstThumb.w > 20 && gallery.firstThumb.h > 10,
  `${gallery.firstThumb.w}x${gallery.firstThumb.h}`)
check('筛选页签=全部/单据/标签/小票（带计数）', gallery.tabs.length === 4 && /\d/.test(gallery.tabs[0]),
  gallery.tabs.join(' | '))
check('示例库副标题沿用 demo 文案', /个示例 · 全部使用静态数据/.test(gallery.subtitle ?? ''), gallery.subtitle)

await clickByText(page, '标签', '.gallery-mask .gallery-tab')
const labelCount = SAMPLES.filter(s => s.group === '标签').length
const filtered = await page.evaluate(() => document.querySelectorAll('.gallery-mask .sample-card').length)
check(`切到「标签」页签只剩 ${labelCount} 张卡片`, filtered === labelCount, `cards=${filtered}`)
// demo 口径：切页签不改选中项，需先点卡片再确认
await page.locator('.gallery-mask .sample-card').first().click()
await page.waitForTimeout(200)
await clickByText(page, '使用该模板')
await waitHidden(page, '.gallery-mask')
const applied = await page.evaluate(() => ({
  biz: [...document.querySelectorAll('.demo-badge')].map(b => b.textContent).join(' '),
  paper: JSON.parse(document.querySelector('print-designer').getTemplateJson()).paperSize,
}))
check('应用示例后徽章与画布同步切换', applied.biz.includes(FIRST_LABEL_SAMPLE.name) && /LABEL/.test(applied.paper),
  `${applied.biz} · ${applied.paper}`)

// ── 3. 预览链路：点设计器自身「预览」→ 全屏预览层出纸（先单份，再批量） ──
const openDesignerPreview = () => page.evaluate(() => {
  const btn = [...document.querySelector('print-designer').shadowRoot.querySelectorAll('button')]
    .find(b => b.textContent.trim() === '预览')
  if (!btn) throw new Error('未找到设计器「预览」按钮')
  btn.click()
})
const readPreview = () => page.evaluate(() => {
  const doc = document.querySelector('.preview-mask iframe').contentWindow.document
  return {
    pages: doc.body.querySelectorAll('.print-page').length,
    bars: doc.querySelectorAll('svg').length + doc.querySelectorAll('img[src^="data:image/svg"]').length,
    text: doc.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
    subtitle: document.querySelector('.preview-subtitle')?.textContent.trim() ?? '',
    head: !!document.querySelector('.preview-head .preview-title'),
    loading: !!document.querySelector('.print-html-preview-loading'),
  }
})
/** 纸面数稳定：批量份数的后续纸面是异步追加的，只等「首页出现」会偶发读到 1 页 */
const pageCount = () =>
  page.evaluate(() => document.querySelector('.preview-mask iframe')?.contentWindow?.document.querySelectorAll('.print-page').length ?? 0)
async function waitPreviewSettled(timeout = 20000) {
  const started = Date.now()
  let prev = -1
  let same = 0
  for (;;) {
    const n = await pageCount()
    same = n > 0 && n === prev ? same + 1 : 0
    prev = n
    if (same >= 2) return n
    if (Date.now() - started > timeout) throw new Error(`预览纸面数未稳定（当前 ${n} 页）`)
    await page.waitForTimeout(120)
  }
}
async function previewOnce() {
  await openDesignerPreview()
  await waitVisible(page, '.preview-mask', 8000)
  await page.waitForFunction(() => !!document.querySelector('.preview-mask iframe')?.contentWindow?.document, { timeout: 20000 })
  await waitPreviewSettled()
  await page.waitForFunction(() => {
    const doc = document.querySelector('.preview-mask iframe')?.contentWindow.document
    return doc.querySelectorAll('svg, img[src^="data:image/svg"]').length > 0
  }, { timeout: 10000 }).catch(() => {})
  const res = await readPreview()
  await page.keyboard.press('Escape')
  await waitHidden(page, '.preview-mask')
  return res
}

const single = await previewOnce()
check('预览层为 demo 的全屏版式', single.head && single.subtitle.includes('页'), single.subtitle)
check('预览渲染出纸面', single.pages > 0, `${single.pages} 页`)
const expectedTexts = dataLeaves(FIRST_LABEL_SAMPLE.data).slice(0, 4)
check('纸面含当前示例的数据值', expectedTexts.every(t => single.text.includes(t)),
  `应含 ${expectedTexts.join(' / ')} → ${single.text}`)
check('码值已渲染（条形码 svg / 二维码 svg data-url）', single.bars > 0, `码值节点 ${single.bars} 个`)

await page.locator('.demo-batch-switch input').check()
const batchState = await page.evaluate(() => ({
  on: document.querySelector('.demo-batch-switch').classList.contains('on'),
  text: document.querySelector('.demo-batch-switch span')?.textContent.trim(),
}))
check('批量开关点亮 .demo-batch-switch.on 并显示份数', batchState.on && /批量打印（\d+ 份）/.test(batchState.text), batchState.text)
const batched = await previewOnce()
check('批量预览份数不少于单份（多份合并为一个作业）', batched.pages >= single.pages && batched.subtitle.includes('页'),
  `单份 ${single.pages} 页 → 批量 ${batched.pages} 页`)

// ── 4. 自定义字段与数据弹窗：预填 / 非法拦截 / 应用 ──
await clickByText(page, '自定义字段与数据')
await waitVisible(page, '.custom-mask')
const prefill = await page.evaluate(() => ({
  editors: document.querySelectorAll('.custom-mask .custom-editor').length,
  fields: JSON.parse(document.querySelector('.custom-mask .custom-editor').value).length,
}))
check('字段与数据两个编辑区', prefill.editors === 2, `editor=${prefill.editors}`)
check('弹窗预填当前字段树', prefill.fields > 0, `字段 ${prefill.fields} 个`)
await setText(page, '.custom-mask .custom-editor', '{ 不是合法 JSON', 0)
await clickByText(page, '应用')
const blocked = await page.evaluate(() => document.querySelector('.custom-mask .custom-error')?.textContent?.trim())
check('非法字段 JSON 拦截并给出提示', !!blocked, blocked)
await setText(page, '.custom-mask .custom-editor',
  JSON.stringify([{ fieldKey: 'hello', fieldLabel: '问候', fieldType: 'string', sortOrder: 1 }]), 0)
await setText(page, '.custom-mask .custom-editor', JSON.stringify({ hello: 'world' }), 1)
await clickByText(page, '应用')
await waitHidden(page, '.custom-mask')
const customFields = await page.evaluate(() => (document.querySelector('print-designer').store?.fields ?? []).length)
check('应用自定义字段后设计器生效', customFields === 1, `store.fields=${customFields}`)

// ── 5. 打印输出弹窗：两条服务链路的探测与降级 ──
await clickByText(page, '打印输出')
await waitVisible(page, '.print-mask')
await page.waitForFunction(() => {
  const statuses = [...document.querySelectorAll('.print-mask .status')]
  return statuses.length >= 2 && statuses.every(s => /离线|在线/.test(s.textContent))
}, { timeout: 25000 })
const output = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('.print-mask .primary-btn')]
  return {
    cards: document.querySelectorAll('.print-mask .print-card').length,
    statuses: [...document.querySelectorAll('.print-mask .status')].map(s => `${s.className.replace('status', '').trim()}:${s.textContent.trim()}`),
    serverDisabled: buttons[0]?.disabled,
    select: !!document.querySelector('.print-mask .printer-select'),
    recheck: document.querySelectorAll('.print-mask .text-btn').length,
  }
})
check('打印输出弹窗含两张卡片', output.cards === 2, `cards=${output.cards}`)
check('服务端与客户端状态均已探测', output.statuses.length === 2 && output.statuses.every(s => /在线|离线/.test(s)),
  output.statuses.join(' | '))
check('打印机下拉与重新检测沿用 demo 类名', output.select && output.recheck === 2, `text-btn=${output.recheck}`)
const renderOffline = output.statuses[0]?.startsWith('offline')
if (renderOffline) {
  check('渲染服务离线时服务端按钮置灰', output.serverDisabled === true, `serverDisabled=${output.serverDisabled}`)
}

await page.locator('.print-mask .print-close').first().click()
await waitHidden(page, '.print-mask')
check('打印输出弹窗可关闭', true)

// ── 6. 导出模板走下载旁路 ──
const download = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
await clickByText(page, '导出模板')
const dl = await download
check('导出模板触发下载', !!dl, dl ? await dl.suggestedFilename() : '无下载事件')

await page.screenshot({ path: join(OUT, `demo-${new URL(URL_).port}.png`), fullPage: false })
const realErrors = errors.filter(e => !/Failed to load resource|WebSocket|favicon/.test(e))
check('全程无页面异常', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))
await browser.close()

const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} 通过  (${URL_})`)
process.exit(failed.length ? 1 : 0)
