# demo 批量打印实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 demo 中用同一模板 + 3 条互不相同的派生模拟数据，一次浏览器打印对话框批量输出 3 份。

**Architecture:** 改动仅限 `demo/`。对 3 条数据各调一次 core 的 `renderHtmlPages`（同构渲染管线，不重实现），demo 侧用 `DOMParser` 把 3 份完整 HTML 文档拼接为单文档（每份包 `.print-copy` 并强制分页），写入同一隐藏 iframe，一次 `window.print()` 出 3 份。不改 core/canvas/client/render 任何包。

**Tech Stack:** Vue 3.5 `<script setup>`、TypeScript（strict）、`@worm-vue3-print/core/browser`、DOMParser、Playwright 1.63.0（根 node_modules，仅临时验证脚本）。

## Global Constraints

- 所有回复、注释、提交信息使用简体中文。
- 改动范围仅 `demo/` 目录（+ 文档）；禁止修改 `packages/*`、`services/*`、`clients/*`。
- 不新增 demo 的永久依赖、不落地永久测试文件（spec 第 5 节）；临时测试/验证脚本用后即删。
- 固定 3 份（`BATCH_SIZE = 3`），不做份数输入 UI。
- 最小实现、外科手术式修改；不改动「打印输出」弹窗（服务端 PDF / Electron 静默打印）。
- demo dev server 端口 9303；Vite 按源码消费 monorepo 各包（见 `demo/vite.config.ts` alias）。
- 提交信息格式：`feat: …` + 简体中文描述 + `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

---

### Task 1: 批量模拟数据派生纯函数

**Files:**
- Create: `demo/src/batch-data.ts`
- Test（临时，提交前删除）: `demo/src/__tmp__/batch-data.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_DEMO_DATA`（`@worm-vue3-print/canvas` 转出的 `Record<string, any>`，结构：`supplier.{name,phone,address}` / `receiver.{name,phone,address}` / `order.{no,date,total}` / `goods: Array<{name,spec,unit,qty,price,amount,remark}>`）
- Produces:
  - `const BATCH_SIZE = 3`
  - `deriveBatchData(base: Record<string, any>): Record<string, any>[]` —— 返回 3 条深拷贝派生数据，不修改入参。

派生规则（i = 0,1,2）：`order.no` 追加 `-B0{i+1}`；`order.date` 加 i 天；供应商三组轮换；收货人 李四/王五/赵六；goods 截取前 8/20/50 行，`qty *= (i+1)`，`amount = round2(qty*price)`，`order.total = round2(各行 amount 之和)`。

- [ ] **Step 1: 写失败的临时测试**

创建 `demo/src/__tmp__/batch-data.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_DEMO_DATA } from '@worm-vue3-print/canvas'
import { BATCH_SIZE, deriveBatchData } from '../batch-data'

describe('deriveBatchData', () => {
  const list = deriveBatchData(DEFAULT_DEMO_DATA)

  it('返回固定 3 份且不污染原型', () => {
    expect(BATCH_SIZE).toBe(3)
    expect(list).toHaveLength(3)
    expect(DEFAULT_DEMO_DATA.order.no).toBe('PO20260801001')
    expect(DEFAULT_DEMO_DATA.goods).toHaveLength(50)
  })

  it('订单号与日期按份递增', () => {
    expect(list.map(d => d.order.no)).toEqual([
      'PO20260801001-B01',
      'PO20260801001-B02',
      'PO20260801001-B03',
    ])
    expect(list.map(d => d.order.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
  })

  it('供应商与收货人逐份不同', () => {
    expect(new Set(list.map(d => d.supplier.name)).size).toBe(3)
    expect(list.map(d => d.receiver.name)).toEqual(['李四', '王五', '赵六'])
    expect(list[1].supplier.phone).toBe('0571-86554433')
  })

  it('明细行数为 8/20/50，数量乘系数且金额、总额重算', () => {
    expect(list.map(d => d.goods.length)).toEqual([8, 20, 50])
    // 原型首行 qty=100, price=0.5
    expect(list[0].goods[0].qty).toBe(100)
    expect(list[0].goods[0].amount).toBe(50)
    expect(list[1].goods[0].qty).toBe(200)
    expect(list[1].goods[0].amount).toBe(100)
    expect(list[2].goods[0].qty).toBe(300)
    const expectedTotal = list[2].goods.reduce((s: number, g: any) => s + g.amount, 0)
    expect(list[2].order.total).toBe(Math.round(expectedTotal * 100) / 100)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `demo/` 目录）: `../../node_modules/.bin/vitest run src/__tmp__/batch-data.test.ts`
Expected: FAIL（找不到模块 `../batch-data`）。

- [ ] **Step 3: 实现 `demo/src/batch-data.ts`**

```ts
// 批量打印模拟数据：以采购收货单默认数据为原型，派生 3 份互不相同的数据。
export const BATCH_SIZE = 3

const SUPPLIERS = [
  { name: '鑫达五金有限公司', phone: '0571-88776655', address: '杭州市萧山区经济开发区88号' },
  { name: '恒泰机电设备有限公司', phone: '0571-86554433', address: '杭州市钱塘区智造六路12号' },
  { name: '瑞安钢材贸易有限公司', phone: '0577-65558899', address: '瑞安市塘下镇工业园北区3号' },
] as const

const RECEIVERS = ['李四', '王五', '赵六']

/** 各份截取的明细行数：8 行 / 20 行 / 全部 50 行，制造页数差异 */
const GOODS_LIMITS = [8, 20, 50]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * 由一条原型数据派生 BATCH_SIZE 条批量打印数据（深拷贝，不修改入参）。
 */
export function deriveBatchData(base: Record<string, any>): Record<string, any>[] {
  return Array.from({ length: BATCH_SIZE }, (_, i) => {
    const data: Record<string, any> = structuredClone(base)
    data.supplier = { ...SUPPLIERS[i] }
    data.receiver = { ...data.receiver, name: RECEIVERS[i] }
    data.order = {
      ...data.order,
      no: `${data.order.no}-B${String(i + 1).padStart(2, '0')}`,
      date: addDays(String(data.order.date), i),
    }
    const goods = (base.goods as any[]).slice(0, GOODS_LIMITS[i]).map((g: any) => {
      const qty = g.qty * (i + 1)
      return { ...g, qty, amount: round2(qty * g.price) }
    })
    data.goods = goods
    data.order.total = round2(goods.reduce((sum, g) => sum + g.amount, 0))
    return data
  })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run（在 `demo/` 目录）: `../../node_modules/.bin/vitest run src/__tmp__/batch-data.test.ts`
Expected: PASS（4 个用例全过）。

- [ ] **Step 5: typecheck**

Run（在 `demo/` 目录）: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 6: 删除临时测试并提交**

```bash
rm -r demo/src/__tmp__
git add demo/src/batch-data.ts
git commit -m "feat: demo 新增批量打印模拟数据派生（同模板 3 份不同数据）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 批量渲染与 HTML 拼接模块

**Files:**
- Create: `demo/src/batch-render.ts`

**Interfaces:**
- Consumes:
  - `renderHtmlPages(template, printData?, baseUrl?, codeRenderer?)` 与 `browserCodeRenderer`，来自 `@worm-vue3-print/core/browser`（demo vite alias 指向 `packages/print-core/src/browser/index.ts`）。单份返回 `{ html, pageCount, paperMm, continuous, pageLayouts }`，`html` 为 `<!DOCTYPE html>` 完整文档。
  - Task 1 的数据数组（`Record<string, any>[]`）。
- Produces:
  - `interface BatchRenderResult { html: string; pageCount: number; copies: number }`
  - `renderBatchInBrowser(templateJson: Record<string, unknown>, dataList: Record<string, any>[], baseUrl?: string): Promise<BatchRenderResult>`

行为：串行（for...of，避免并发隐藏 iframe 测量互相干扰）渲染每份；任一失败抛 `第 N 份渲染失败：<原因>`；以首份文档为骨架（保留其 `@page`/样式），每份 `body.innerHTML` 包 `<section class="print-copy">` 顺序放入骨架 body；head 末尾注入分页样式；`pageCount` 为三份之和。

- [ ] **Step 1: 创建 `demo/src/batch-render.ts`**

```ts
// 批量渲染：同一模板对多条数据各跑一次 core 同构管线，再把每份完整 HTML
// 文档拼接为单个文档（每份 .print-copy 之间强制分页），供一个 iframe 一次打印。
import { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'
import type { PrintTemplateData } from '@worm-vue3-print/core'

export interface BatchRenderResult {
  /** 拼接后的完整 HTML 文档 */
  html: string
  /** 三份总页数 */
  pageCount: number
  /** 份数 */
  copies: number
}

/** 每份结束后强制翻页（覆盖 core 末页 .print-page 的 break-after:auto） */
const COPY_BREAK_STYLE =
  '<style>.print-copy:not(:last-child){break-after:page;page-break-after:always;}</style>'

export async function renderBatchInBrowser(
  templateJson: Record<string, unknown>,
  dataList: Record<string, any>[],
  baseUrl?: string,
): Promise<BatchRenderResult> {
  if (dataList.length === 0) throw new Error('批量打印数据为空')

  const pages: Array<{ html: string; pageCount: number }> = []
  for (let i = 0; i < dataList.length; i++) {
    try {
      const result = await renderHtmlPages(
        templateJson as PrintTemplateData,
        dataList[i],
        baseUrl,
        browserCodeRenderer,
      )
      pages.push({ html: result.html, pageCount: result.pageCount })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`第 ${i + 1} 份渲染失败：${reason}`)
    }
  }

  // 同模板三次渲染的 head（@page/样式）必然一致，以首份为骨架
  const docs = pages.map(p => new DOMParser().parseFromString(p.html, 'text/html'))
  const skeleton = docs[0]
  skeleton.body.innerHTML = ''
  for (const doc of docs) {
    const section = skeleton.createElement('section')
    section.className = 'print-copy'
    section.innerHTML = doc.body.innerHTML
    skeleton.body.appendChild(section)
  }
  skeleton.head.insertAdjacentHTML('beforeend', COPY_BREAK_STYLE)

  return {
    html: `<!DOCTYPE html>\n${skeleton.documentElement.outerHTML}`,
    pageCount: pages.reduce((sum, p) => sum + p.pageCount, 0),
    copies: dataList.length,
  }
}
```

- [ ] **Step 2: typecheck**

Run（在 `demo/` 目录）: `npm run typecheck`
Expected: 无错误。`PrintTemplateData` 的导入路径与既有 `demo/src/browser-render.ts:3` 完全一致（`import type { PrintTemplateData } from '@worm-vue3-print/core'`），该文件已通过 typecheck。

- [ ] **Step 3: 提交**

```bash
git add demo/src/batch-render.ts
git commit -m "feat: demo 新增批量渲染拼接（3 份 HTML 合一并强制分页）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 批量预览组件与弹层切换

**Files:**
- Create: `demo/src/components/BatchPrintPreview.vue`
- Modify: `demo/src/App.vue`

**Interfaces:**
- Consumes:
  - Task 1：`BATCH_SIZE`、`deriveBatchData(base)`
  - Task 2：`renderBatchInBrowser(templateJson, dataList, baseUrl)` → `{ html, pageCount, copies }`
  - canvas：`DEFAULT_DEMO_DATA`（已在 App.vue 导入）
- Produces:
  - `BatchPrintPreview.vue` props：`templateJson?: Record<string, any> | null`、`printDataList: Record<string, any>[]`、`baseUrl?: string`；emits：`rendered: [pageCount: number, copies: number]`、`error: [message: string]`；expose：`print()`。

- [ ] **Step 1: 创建 `demo/src/components/BatchPrintPreview.vue`**

结构参照 `packages/print-canvas/src/components/PrintHtmlPreview.vue`（iframe + renderSeq + 渲染中/失败态）：

```vue
<!--
  BatchPrintPreview：demo 批量打印预览。
 同一模板对多条数据分别走 core 浏览器管线，拼接为单文档写入 iframe，
 父组件通过 ref 调 print() 一次触发浏览器原生打印（每份之间强制分页）。
-->
<template>
  <div class="batch-print-preview">
    <div v-if="errorMsg" class="batch-print-preview-error">
      <span>批量预览渲染失败：{{ errorMsg }}</span>
    </div>
    <div v-else-if="rendering" class="batch-print-preview-loading">批量预览渲染中…</div>
    <iframe
      v-show="!rendering && !errorMsg"
      ref="iframeRef"
      class="batch-print-preview-iframe"
      title="批量打印预览"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { renderBatchInBrowser } from '../batch-render'

const props = defineProps<{
  /** 模板 JSON（当前画布） */
  templateJson?: Record<string, any> | null
  /** 批量打印数据（多条） */
  printDataList: Record<string, any>[]
  /** 图片相对路径拼接前缀 */
  baseUrl?: string
}>()

const emit = defineEmits<{
  /** 渲染完成，回传总页数与份数 */
  rendered: [pageCount: number, copies: number]
  /** 渲染失败 */
  error: [message: string]
}>()

const iframeRef = ref<HTMLIFrameElement>()
const rendering = ref(false)
const errorMsg = ref('')
/** 渲染序列：过期结果丢弃，避免快速重渲染竞态 */
let renderSeq = 0

async function rerender() {
  if (!props.templateJson || props.printDataList.length === 0) {
    errorMsg.value = ''
    rendering.value = false
    return
  }
  const seq = ++renderSeq
  rendering.value = true
  errorMsg.value = ''
  try {
    const { html, pageCount, copies } = await renderBatchInBrowser(
      props.templateJson,
      props.printDataList,
      props.baseUrl,
    )
    if (seq !== renderSeq) return
    const doc = iframeRef.value?.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }
    emit('rendered', pageCount, copies)
  } catch (e) {
    if (seq !== renderSeq) return
    errorMsg.value = e instanceof Error ? e.message : '未知错误'
    emit('error', errorMsg.value)
  } finally {
    if (seq === renderSeq) rendering.value = false
  }
}

/** 触发浏览器原生打印：一个 iframe、一个对话框输出全部份 */
function print() {
  const win = iframeRef.value?.contentWindow
  if (!win) return
  win.focus()
  win.print()
}

watch(
  () => [props.templateJson, props.printDataList, props.baseUrl],
  () => void rerender(),
  { immediate: true, deep: true },
)

onBeforeUnmount(() => {
  renderSeq++
})

defineExpose({ print, rerender })
</script>

<style scoped>
.batch-print-preview {
  width: 100%;
  height: 100%;
  position: relative;
  background: #e9ebee;
}
.batch-print-preview-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.batch-print-preview-loading,
.batch-print-preview-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 14px;
}
.batch-print-preview-error {
  color: #f56c6c;
}
</style>
```

- [ ] **Step 2: 修改 `demo/src/App.vue` 模板部分**

在预览弹层的 `preview-head` 内、`preview-actions` 之前插入模式切换；正文用 `v-if/v-else` 切换两个预览组件。将 `preview-head` 改为：

```vue
          <div class="preview-head">
            <span class="preview-title">打印预览</span>
            <div class="preview-modes">
              <button
                type="button"
                class="mode-btn"
                :class="{ active: previewMode === 'single' }"
                @click="previewMode = 'single'"
              >单份预览</button>
              <button
                type="button"
                class="mode-btn"
                :class="{ active: previewMode === 'batch' }"
                @click="previewMode = 'batch'"
              >批量预览（{{ BATCH_SIZE }} 份模拟数据）</button>
            </div>
            <span class="preview-subtitle" v-if="previewPages > 0">
              {{ previewMode === 'batch' ? `共 ${BATCH_SIZE} 份 · ` : '' }}{{ previewPages }} 页
            </span>
            <div class="preview-actions">
              <button type="button" class="preview-btn" @click="printPreview">打印</button>
              <button type="button" class="preview-btn ghost" @click="previewVisible = false">关闭</button>
            </div>
          </div>
```

将现有 `<PrintHtmlPreview … @rendered="(n: number) => previewPages = n" />` 替换为：

```vue
          <PrintHtmlPreview
            v-if="previewMode === 'single'"
            ref="htmlPreviewRef"
            :template-json="previewTemplateJson"
            :print-data="DEFAULT_DEMO_DATA"
            :base-url="RENDER_BASE_URL"
            @rendered="(n: number) => previewPages = n"
          />
          <BatchPrintPreview
            v-else
            ref="batchPreviewRef"
            :template-json="previewTemplateJson"
            :print-data-list="batchDataList"
            :base-url="RENDER_BASE_URL"
            @rendered="onBatchRendered"
          />
```

- [ ] **Step 3: 修改 `demo/src/App.vue` script 部分**

import 行调整（在现有 canvas import 中已有 `DEFAULT_DEMO_DATA`，新增组件与函数导入）：

```ts
import PrintOutputDialog from './components/PrintOutputDialog.vue'
import BatchPrintPreview from './components/BatchPrintPreview.vue'
import rawTemplate from './template-purchase-receipt.json'
import {
  TEMPLATE_ID,
  TEMPLATE_NAME,
  PURCHASE_RECEIPT_FIELDS,
} from './business'
import { BATCH_SIZE, deriveBatchData } from './batch-data'
```

在现有预览状态附近新增：

```ts
/** 预览模式：单份 / 批量（3 份派生模拟数据） */
const previewMode = ref<'single' | 'batch'>('single')
const batchPreviewRef = ref<InstanceType<typeof BatchPrintPreview> | null>(null)
/** 批量数据由原型一次性派生（派生函数内部深拷贝，不污染 DEFAULT_DEMO_DATA） */
const batchDataList = deriveBatchData(DEFAULT_DEMO_DATA as unknown as Record<string, any>)

function onBatchRendered(pageCount: number) {
  previewPages.value = pageCount
}
```

将 `onPreview` 改为打开时重置为单份模式：

```ts
function onPreview() {
  const json = designerRef.value?.getTemplateJson?.()
  if (!json) return
  previewTemplateJson.value = json as unknown as Record<string, any>
  previewPages.value = 0
  previewMode.value = 'single'
  previewVisible.value = true
}
```

将 `printPreview` 改为按模式分发：

```ts
function printPreview() {
  if (previewMode.value === 'batch') {
    batchPreviewRef.value?.print()
  } else {
    htmlPreviewRef.value?.print()
  }
}
```

- [ ] **Step 4: 修改 `demo/src/App.vue` 样式部分**

在 `.preview-subtitle` 规则之后追加：

```css
.preview-modes {
  display: inline-flex;
  border: 1px solid #d9dde6;
  border-radius: 6px;
  overflow: hidden;
}
.mode-btn {
  padding: 4px 12px;
  border: none;
  background: #fff;
  color: #5a667f;
  font-size: 12px;
  cursor: pointer;
}
.mode-btn + .mode-btn {
  border-left: 1px solid #d9dde6;
}
.mode-btn.active {
  background: #165dff;
  color: #fff;
}
```

- [ ] **Step 5: typecheck**

Run（在 `demo/` 目录）: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 6: 手动冒烟**

Run（在 `demo/` 目录）: `npm run dev`（端口 9303）。浏览器中：点「加载默认布局」→ 设计器预览按钮打开预览 → 默认单份行为与之前一致 → 切「批量预览（3 份模拟数据）」→ iframe 内依次可见订单号 `…-B01 / -B02 / -B03`，副标题显示「共 3 份 · N 页」→ 点「打印」在系统打印预览中确认 3 份每份从新页开始。冒烟后关闭 dev server。

- [ ] **Step 7: 提交**

```bash
git add demo/src/components/BatchPrintPreview.vue demo/src/App.vue
git commit -m "feat: demo 预览弹层支持批量预览与一次打印 3 份

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Playwright 端到端验证（临时脚本，用后即删）

**Files:**
- Create（临时，不提交）: `demo/verify-batch-print.mjs`

**Interfaces:**
- Consumes: Task 1–3 全部成果；根 `node_modules/playwright`（1.63.0，chromium 已按 CLAUDE.md 安装过；若未安装先 `npx playwright install chromium`）。
- Produces: 无代码产出，仅控制台断言输出。

- [ ] **Step 1: 启动 demo dev server（后台）**

Run: `cd demo && npm run dev`（后台运行，监听 http://localhost:9303；`open: true` 会自动开浏览器标签，忽略即可）。

- [ ] **Step 2: 写临时验证脚本 `demo/verify-batch-print.mjs`**

```js
// 临时端到端验证脚本，验证后删除，不提交。
import { chromium } from 'playwright'

const BASE = 'http://localhost:9303'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.emulateMedia({ media: 'screen' })

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })

  // 加载默认布局（confirm 对话框自动接受）
  page.once('dialog', d => void d.accept())
  await page.getByRole('button', { name: '加载默认布局' }).click()
  await page.waitForTimeout(1000)

  // 打开设计器预览（设计器工具栏的「预览」按钮，触发 @preview）
  await page.getByRole('button', { name: '预览' }).first().click()
  await page.waitForSelector('.preview-panel', { timeout: 10000 })

  // 切到批量预览
  await page.getByRole('button', { name: /批量预览/ }).click()

  // 等待 iframe 内 3 份渲染完成
  const frame = page.frameLocator('.preview-panel iframe')
  await frame.locator('section.print-copy').nth(2).waitFor({ state: 'attached', timeout: 30000 })

  const copyCount = await frame.locator('section.print-copy').count()
  if (copyCount !== 3) throw new Error(`print-copy 数量应为 3，实际 ${copyCount}`)

  const bodyText = await frame.locator('body').innerText()
  for (const no of ['PO20260801001-B01', 'PO20260801001-B02', 'PO20260801001-B03']) {
    if (!bodyText.includes(no)) throw new Error(`缺少订单号 ${no}`)
  }
  for (const supplier of ['鑫达五金有限公司', '恒泰机电设备有限公司', '瑞安钢材贸易有限公司']) {
    if (!bodyText.includes(supplier)) throw new Error(`缺少供应商 ${supplier}`)
  }

  const subtitle = await page.locator('.preview-subtitle').innerText()
  if (!/共 3 份 · \d+ 页/.test(subtitle)) throw new Error(`副标题不符：${subtitle}`)

  // 打印媒介下，每份之间强制分页
  await page.emulateMedia({ media: 'print' })
  const breakBetween = await frame.locator('section.print-copy').nth(0).evaluate(el => {
    return getComputedStyle(el).getPropertyValue('break-after')
  })
  if (breakBetween !== 'page') throw new Error(`份间未强制分页，break-after=${breakBetween}`)
  const breakLast = await frame.locator('section.print-copy').nth(2).evaluate(el => {
    return getComputedStyle(el).getPropertyValue('break-after')
  })
  if (breakLast === 'page') throw new Error('最后一份不应强制分页')

  console.log('✅ 批量打印 E2E 全部断言通过：3 份、数据互异、份间分页正确')
} finally {
  await browser.close()
}
```

注意：`import { chromium } from 'playwright'` 从 demo 目录运行时解析的是根 `node_modules`（demo 无 playwright 依赖，Node 会向上查找）。

- [ ] **Step 3: 运行验证脚本**

Run（在 `demo/` 目录）: `node verify-batch-print.mjs`
Expected: 输出 `✅ 批量打印 E2E 全部断言通过…`。

若「预览」按钮定位失败（设计器工具栏按钮可能无 `button` 角色或文本被图标包裹），用 `page.locator('button, [role="button"]').filter({ hasText: '预览' })` 放宽选择器重跑；若批量渲染因 dev server 首次编译较慢超时，把等待超时调大到 60000 重跑。记录实际使用的选择器，但脚本最终删除、不影响仓库。

- [ ] **Step 4: 删除临时脚本、停 dev server、最终自审**

```bash
rm demo/verify-batch-print.mjs
git status          # 预期：clean（仅本计划文档可能尚未提交时为 untracked）
git diff --stat HEAD~3
```

确认 3 个提交只触及 `demo/src/batch-data.ts`、`demo/src/batch-render.ts`、`demo/src/components/BatchPrintPreview.vue`、`demo/src/App.vue` 与文档；单份预览原有行为无改动（Task 3 Step 6 已冒烟）。

- [ ] **Step 5: 提交实施计划文档（若尚未提交）**

```bash
git add docs/superpowers/plans/2026-09-17-demo-batch-print.md
git commit -m "docs: demo 批量打印实施计划

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
