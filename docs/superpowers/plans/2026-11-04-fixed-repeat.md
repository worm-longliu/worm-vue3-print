# 每页重复（fixed）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让元素高级设置中的 `options.fixed: true` 在 core 分页与所有出纸端按设计坐标逐页重复，同时不改变普通元素的分页占位。

**Architecture:** 在 `paginate()` 入口把固定元素与正常分页元素分流；固定元素不参与高度记账、显式/隐式编组和表格/动态列表跟随区，分页完成后以现有 `PageSection.type = 'element'` 合入每页。继续复用 `renderSection()` 和 `withPageNumbers()`，不新增模板字段、`PageLayout` 字段或第二套渲染逻辑。

**Tech Stack:** TypeScript、Vitest、npm workspaces、core 同构渲染管线。

**Spec:** 当前会话于 2026-11-04 确认的设计与视觉线框演示（Bounded，无独立 spec 文件）：固定元素逐页同坐标叠加、不占分页高度；表格和动态 `flowList` 完整重复、不再切片；连续纸只输出一次。

## Global Constraints

- 默认直接在 `master` 开发，不创建工作区；不提交当前已有的 `package-lock.json` 工作区改动。
- 仅 `fixed === true` 启用新语义；`false`、缺失及其他 falsy 值保持原行为。
- core 保持纯 TypeScript；不改 Vue/common 属性面板，不新增依赖，不修改模板序列化结构。
- 固定元素在每页使用原始 `options.top`，按现有 `top → zIndex → 模板数组序` 决定 sections 顺序。
- 固定元素不占分页预算，但必须保留基于原始坐标的物理越界提示；页眉/页脚语义不变。
- 表格 `repeatOnPage` 继续负责“表头重复、明细切片”；整表 `fixed` 表示“完整表格每页重复”。
- 新增行为先写失败测试，再做最小实现；连续纸等既有行为可添加直接通过的守护测试。提交信息和代码注释使用简体中文。
- 每个任务结束审查 `git diff`，只暂存本任务明确列出的文件。

## 文件结构

- `packages/print-core/src/render/pagination-engine.ts`：fixed 分类、分页分流、每页 sections 合入、跟随区公共判据同步。
- `packages/print-core/src/designer/types.ts`：补足 `fixed` 的模板契约注释。
- `packages/print-core/src/render/pagination-engine.test.ts`：普通固定元素、占位、编组、顺序、整表重复测试。
- `packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts`：动态列表完整重复及跟随区排除测试。
- `packages/print-core/src/render/html-generator.test.ts`：整表 HTML 每页完整输出测试；生产文件 `html-generator.ts` 只读复用，不修改。
- `packages/print-core/src/render/page-number-expression.test.ts`：固定元素页码表达式逐页求值测试。
- `packages/print-core/src/render/__tests__/continuous-paper.test.ts`：连续纸单页守护测试。
- `services/print-render/src/fixed-repeat.integration.test.ts`：真实 Chromium 分页与 PDF 每页文本验证。
- `skills/worm-vue3-print-mcp/references/template-schema.md`：补充模板作者可见的 `fixed` 使用口径。

---

### Task 1: 普通元素逐页重复与分页分流

**Files:**
- Modify: `packages/print-core/src/render/pagination-engine.ts:159-179,401-637`
- Test: `packages/print-core/src/render/pagination-engine.test.ts:1-4,503-534`

**Interfaces:**
- Consumes: 现有 `paginate(template, measuredElements): PageLayout[]`、`buildFollowMap()`、`buildPaginationUnits()`、`compareCanvasOrder()`。
- Produces: 内部 `isFixedEl(el)` 判据；每页普通 `PageSection`；`collectFollowMemberIds()` 对 fixed 普通成员的排除语义。Task 2 将扩大同一判据到表格和动态列表。

- [x] **Step 1: 引入公共判据测试并写普通元素失败用例**

把测试入口改为：

```ts
import { paginate, tableDesignBottom, collectFollowMemberIds } from './pagination-engine.js'
```

复用文件内 `makeFreeTemplate()`、`freeEl()`、`measureFree()`，新增：

```ts
function withoutFixed(pages: ReturnType<typeof paginate>) {
  return pages.map(page => ({
    ...page,
    sections: page.sections.filter(section => section.elementId !== 'fixed'),
  }))
}

describe('元素 fixed：逐页同位叠加，不参与分页占位', () => {
  it('两页都包含固定元素，普通元素分页与移除固定元素时一致', () => {
    const bodies = [
      freeEl('body-1', 50, 150), freeEl('body-2', 200, 100), freeEl('body-3', 300, 50),
    ]
    const measured = measureFree([
      ['body-1', 150], ['body-2', 100], ['body-3', 50], ['fixed', 40],
    ])
    const baseline = paginate(makeFreeTemplate(bodies), measured)
    const pages = paginate(makeFreeTemplate([
      freeEl('fixed', 0, 40, { fixed: true }),
      ...bodies,
    ]), measured)

    expect(pages).toHaveLength(2)
    for (const page of pages) {
      expect(page.sections).toContainEqual({ elementId: 'fixed', type: 'element', renderTop: 0 })
    }
    expect(withoutFixed(pages)).toEqual(baseline)
  })

  it('fixed 与正文重叠且同 groupId 时仍不参与显式或隐式编组', () => {
    const bodies = [freeEl('body-1', 100, 100), freeEl('body-2', 200, 100)]
    const baseline = paginate(makeFreeTemplate(bodies), measureFree([
      ['body-1', 100], ['body-2', 100],
    ]))
    const pages = paginate(makeFreeTemplate([
      freeEl('fixed', 0, 200, { fixed: true, groupId: 'g' }),
      freeEl('body-1', 100, 100, { groupId: 'g' }),
      freeEl('body-2', 200, 100),
    ]), measureFree([['fixed', 200], ['body-1', 100], ['body-2', 100]]))
    expect(pages).toHaveLength(1)
    expect(withoutFixed(pages)).toEqual(baseline)
  })

  it('fixed 普通元素不进入表格跟随区', () => {
    const table = { id: 'table', type: 'table', options: {
      left: 0, top: 0, width: 100, height: 20, tableRows: [{ height: 20 }],
    } }
    const fixed = freeEl('fixed', 30, 10, { fixed: true })
    expect(collectFollowMemberIds([table, fixed]).has('fixed')).toBe(false)
  })

  it('fixed 不占分页预算但保留每页物理越界标记', () => {
    const tpl = makeFreeTemplate([
      freeEl('body-1', 0, 150), freeEl('body-2', 150, 150),
      freeEl('fixed', 270, 20, { fixed: true }),
    ])
    const pages = paginate(tpl, measureFree([
      ['body-1', 150], ['body-2', 150], ['fixed', 20],
    ]))
    expect(pages).toHaveLength(2)
    expect(pages.every(page => page.overflow === true)).toBe(true)
  })
})
```

- [x] **Step 2: 验证普通元素用例按根因失败**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/pagination-engine.test.ts`

Expected: FAIL；固定元素只出现在第 1 页，且普通元素分页被其高度或重叠聚类影响。

- [x] **Step 3: 最小实现分页分流与每页合入**

在 `pagination-engine.ts` 增加内部判据，本任务先排除非可切片元素：

```ts
function isFixedEl(el: FollowJudgementInput): boolean {
  return el.options?.fixed === true && !isSplittableEl(el)
}
```

在 `paginate()` 中保留完整 `sorted` 用于层序和元素查找，另建正常分页序列：

```ts
const fixedSorted = sorted.filter(isFixedEl)
const flowSorted = sorted.filter(el => !isFixedEl(el))
```

把显式编组遍历、`buildFollowMap()`、`buildPaginationUnits()`、主 `while` 及 `paginateNonTable()` 的 `sortedList` 参数全部改用 `flowSorted`；`elById` 仍由完整 `sorted` 构建。`collectFollowMemberIds()` 同样先过滤 `isFixedEl`，再计算显式编组和跟随区，保证 canvas/common 公共判据一致。

在空模板兜底之后、`noteHorizontalOverflow()` 之前，为每页创建独立 section 对象并按完整 `sorted` 排名稳定合入：

```ts
const sectionRank = new Map(sorted.map((el, index) => [el.id, index]))
for (const page of pages) {
  const repeated = fixedSorted.map(el => ({
    elementId: el.id,
    type: 'element' as const,
    renderTop: el.options?.top ?? 0,
  }))
  page.sections = [...page.sections, ...repeated].sort((a, b) =>
    (sectionRank.get(a.elementId) ?? Number.MAX_SAFE_INTEGER)
    - (sectionRank.get(b.elementId) ?? Number.MAX_SAFE_INTEGER))

  for (const el of fixedSorted) {
    const settle = rotatedSettlement(el, measuredElements)
    if (settle.top + settle.height > contentHeight) page.overflow = true
    if (settle.rot !== undefined && settle.top < 0) {
      const amount = Math.round(-settle.top * 100) / 100
      page.warnings = [...(page.warnings ?? []),
        `元素 ${el.id} 旋转 ${settle.rot}° 后顶部超出页首 ${amount}mm，打印将被裁切`]
    }
  }
}
```

这段物理检查不得调用 `occupy()`，不得改变 `pageBroken`；连续纸的 `contentHeight` 为无穷大，不会产生纵向底边溢出。

- [x] **Step 4: 验证普通元素测试通过且原有用例不回归**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/pagination-engine.test.ts src/render/pagination-engine.2d.test.ts src/render/pagination-engine.edge.test.ts`

Expected: PASS；新用例通过，既有分页和二维跟随区用例全部通过。

- [x] **Step 5: 提交普通元素修复**

```bash
git add packages/print-core/src/render/pagination-engine.ts packages/print-core/src/render/pagination-engine.test.ts
git commit -m "fix(core): 普通元素支持每页固定重复"
```

---

### Task 2: 表格与动态 flowList 完整重复

**Files:**
- Modify: `packages/print-core/src/render/pagination-engine.ts`（仅放宽 Task 1 的 `isFixedEl`）
- Test: `packages/print-core/src/render/pagination-engine.test.ts`
- Test: `packages/print-core/src/render/html-generator.test.ts`
- Test: `packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts:151-207`

**Interfaces:**
- Consumes: Task 1 的 fixed 分流、每页合入和现有 `renderSection()`。
- Produces: fixed 表格/动态列表在每页为 `type: 'element'`，不得出现对应的 `table-slice`、`flow-list-slice` 或 `flow-group`；HTML 继续由现有完整元素渲染器输出。

- [x] **Step 1: 写整表分页与 HTML 失败测试**

在分页测试中基于 `makeTable(2, 0)` 创建 `fixed: true` 表格，并加入两个 150mm 普通正文元素：

```ts
const baseTable = makeTable(2, 0)
const fixedTable = { ...baseTable, options: { ...baseTable.options, fixed: true } }
const tpl = makeFreeTemplate([
  fixedTable,
  freeEl('body-1', 0, 150), freeEl('body-2', 150, 150),
])
const pages = paginate(tpl, measureFree([
  ['tbl-1', 16], ['body-1', 150], ['body-2', 150],
]))
expect(pages).toHaveLength(2)
for (const page of pages) {
  expect(page.sections).toContainEqual({ elementId: 'tbl-1', type: 'element', renderTop: 0 })
  expect(page.sections.some(s => s.elementId === 'tbl-1' && s.type !== 'element')).toBe(false)
}
```

在 HTML 测试入口引入 `paginate`，新增完整用例：

```ts
const tpl = makeTemplate({ ...matrixOptions(), fixed: true })
tpl.elements.push(
  { id: 'body-1', type: 'text', options: { left: 0, top: 0, width: 60, height: 150 } } as any,
  { id: 'body-2', type: 'text', options: { left: 0, top: 150, width: 60, height: 150 } } as any,
)
const pages = paginate(tpl, new Map([
  ['tbl-1', { id: 'tbl-1', measuredHeight: 24 }],
  ['body-1', { id: 'body-1', measuredHeight: 150 }],
  ['body-2', { id: 'body-2', measuredHeight: 150 }],
]))
const html = generateHtml(tpl, pages)
expect((html.match(/data-element-id="tbl-1"/g) ?? [])).toHaveLength(2)
expect((html.match(/>A<\/td>/g) ?? [])).toHaveLength(2)
expect((html.match(/>B<\/td>/g) ?? [])).toHaveLength(2)
```

同时加入 fixed 表格不作为跟随锚点的断言：

```ts
const baseTable = makeTable(1, 0)
const anchored = { ...baseTable, options: { ...baseTable.options, fixed: true } }
const after = freeEl('after', 30, 10)
expect(collectFollowMemberIds([anchored, after]).size).toBe(0)
```

- [x] **Step 2: 写动态 flowList 完整重复失败测试**

复用 `multiTemplate()`、`flowListEl()`、`followTextEl()`、`measuredMulti()`：

```ts
const tpl = multiTemplate([
  flowListEl('fl-fixed', 0, 16, flowRows(['甲', '乙']), { fixed: true }),
  followTextEl('body-1', 0, 150),
  followTextEl('body-2', 150, 150),
])
const pages = paginate(tpl, measuredMulti([
  { id: 'fl-fixed', flowRowHeights: [8, 8] },
  { id: 'body-1', measuredHeight: 150 },
  { id: 'body-2', measuredHeight: 150 },
]))
const html = generateHtml(tpl, pages)

expect(pages).toHaveLength(2)
for (const page of pages) {
  expect(page.sections).toContainEqual({ elementId: 'fl-fixed', type: 'element', renderTop: 0 })
  expect(page.sections.some(s => s.elementId === 'fl-fixed' && s.type !== 'element')).toBe(false)
}
expect((html.match(/data-flow-row-index="0"/g) ?? [])).toHaveLength(2)
expect((html.match(/data-flow-row-index="1"/g) ?? [])).toHaveLength(2)
```

- [x] **Step 3: 验证表格和动态列表用例失败**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/pagination-engine.test.ts src/render/html-generator.test.ts src/render/__tests__/flow-list-pagination.spec.ts`

Expected: FAIL；fixed 表格和动态列表仍走切片路径，续页没有完整元素。

- [x] **Step 4: 放宽同一判据，不增加渲染分支**

把 Task 1 的判据改为：

```ts
function isFixedEl(el: FollowJudgementInput): boolean {
  return el.options?.fixed === true
}
```

不修改 `html-generator.ts`：普通 section 已分别调用 `renderTableElement()` 和动态 flowList 完整容器渲染；表格/列表在分页分流后也不会成为跟随锚点。

- [x] **Step 5: 验证定向测试及表头重复回归**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/pagination-engine.test.ts src/render/html-generator.test.ts src/render/multilevel-header.test.ts src/render/__tests__/flow-list-pagination.spec.ts src/render/__tests__/flow-list-render.spec.ts`

Expected: PASS；整表/整列表每页完整输出，非 fixed 表格表头重复和动态列表逐行切片保持不变。

- [x] **Step 6: 提交可切片元素支持**

```bash
git add packages/print-core/src/render/pagination-engine.ts packages/print-core/src/render/pagination-engine.test.ts packages/print-core/src/render/html-generator.test.ts packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts
git commit -m "fix(core): 固定表格与动态列表逐页完整重复"
```

---

### Task 3: 页码、连续纸、文档与跨端验收

**Files:**
- Modify: `packages/print-core/src/designer/types.ts:300`
- Modify: `skills/worm-vue3-print-mcp/references/template-schema.md`
- Test: `packages/print-core/src/render/pagination-engine.test.ts`
- Create: `services/print-render/src/fixed-repeat.integration.test.ts`
- Test: `packages/print-core/src/render/page-number-expression.test.ts`
- Test: `packages/print-core/src/render/__tests__/continuous-paper.test.ts`
- Test: `services/print-render/src/fixed-repeat.integration.test.ts`

**Interfaces:**
- Consumes: Task 1/2 的 `paginate()` 输出、现有 `bindData()` 和 `generateHtml()`。
- Produces: 对外模板字段说明；不新增运行时 API。

- [x] **Step 1: 写固定元素页码逐页求值集成守护测试**

在 `page-number-expression.test.ts` 引入 `paginate`，创建 `fixed: true` 的 `{ADD(pageIndex,1)}` 元素及两个 150mm 正文元素，经真实绑定和分页生成两页：

```ts
const fixed = textEl('fixed-page', '第 {ADD(pageIndex,1)} / {totalPages} 页')
fixed.options.fixed = true
const body1 = textEl('body-1', '正文一')
const body2 = textEl('body-2', '正文二')
Object.assign(body1.options, { height: 150 })
Object.assign(body2.options, { top: 160, height: 150 })
const bound = bindData(makeTemplate([fixed, body1, body2]), {})
const measured = new Map([
  ['fixed-page', { id: 'fixed-page', measuredHeight: 8 }],
  ['body-1', { id: 'body-1', measuredHeight: 150 }],
  ['body-2', { id: 'body-2', measuredHeight: 150 }],
])
const html = generateHtml(bound, paginate(bound, measured), {}, {})
expect(html).toContain('第 2 / 2 页')
expect(html).toContain('第 3 / 2 页')
```

- [x] **Step 2: 验证前序分页实现与现有页码渲染能够衔接**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/page-number-expression.test.ts`

Expected: PASS。该断言守护 Task 1 的分页输出与现有 `withPageNumbers()` 的衔接，无需修改 `renderPage()`；若失败，先核对正文夹具是否在不触发重叠聚类的情况下稳定产出两页，再检查 Task 1 的 fixed section 是否进入续页，不在页码渲染器另加补丁。

- [x] **Step 3: 添加连续纸与 fixed-only 边界守护**

在连续纸测试的 `el()` 返回值上设置 `fixed: true`，新增：

```ts
it('连续纸只有一个页面，固定元素只出现一次', () => {
  const fixed = el('fixed', 0, 10)
  fixed.options.fixed = true
  const pages = paginate(continuousTemplate({ elements: [fixed] }), measuredOf({ elements: [fixed] } as TemplateData, () => 10))
  expect(pages).toHaveLength(1)
  expect(pages[0]!.sections.filter(s => s.elementId === 'fixed')).toHaveLength(1)
})
```

另在普通分页测试加入：

```ts
it('模板只有 fixed 元素时仍只有一页且元素不重复', () => {
  const tpl = makeFreeTemplate([freeEl('fixed', 20, 10, { fixed: true })])
  const pages = paginate(tpl, measureFree([['fixed', 10]]))
  expect(pages).toHaveLength(1)
  expect(pages[0]!.sections).toEqual([{ elementId: 'fixed', type: 'element', renderTop: 20 }])
})
```

这些是可单页场景的守护断言，不要求它们在旧代码上失败。

- [x] **Step 4: 同步字段契约注释和模板文档**

把 `fixed?: boolean` 的注释明确为：

```ts
/** 每页固定重复：按设计坐标叠加到每页，不参与分页占位、编组或跟随区；表格/动态列表完整重复，连续纸仅输出一次 */
fixed?: boolean
```

在 `template-schema.md` 的通用元素 options 说明中补充：`fixed: true` 的叠加语义、整表与表头重复的区别，以及需要自动预留空间时改用页眉/页脚。不得把 `fixed` 写成 CSS `position: fixed`。

- [x] **Step 5: 添加真实 Chromium 与 PDF 文本集成测试**

新建 `services/print-render/src/fixed-repeat.integration.test.ts`，复用 `BrowserPool`、Playwright driver 和 `loadExecutorBundle()` 的既有模式：

```ts
import { describe, it, expect } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createDomHostRuntime, renderPdf } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()), loadExecutorBundle(),
)
const templateJson = {
  paperSize: 'A4', orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
  elements: [
    { id: 'fixed', type: 'text', options: { left: 0, top: 0, width: 100, height: 10, fixed: true, formatter: '固定标题' } },
    { id: 'body-1', type: 'text', options: { left: 0, top: 0, width: 100, height: 150, formatter: '正文一' } },
    { id: 'body-2', type: 'text', options: { left: 0, top: 150, width: 100, height: 150, formatter: '正文二' } },
  ],
} as PrintTemplateData

describe('fixed 每页重复（真实 Chromium）', () => {
  it('两页 PDF 均含固定标题且正文各归其页', async () => {
    const { pdf, prepared } = await renderPdf({ templateJson, printData: {} }, runtime)
    expect(prepared.pageCount).toBe(2)
    expect((prepared.html.match(/固定标题/g) ?? [])).toHaveLength(2)
    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false })
    const doc = await task.promise
    expect(doc.numPages).toBe(2)
    const texts: string[] = []
    for (let i = 1; i <= 2; i++) {
      const content = await (await doc.getPage(i)).getTextContent()
      texts.push(content.items.map((it: any) => 'str' in it ? it.str : '').join('').normalize('NFKC'))
    }
    await task.destroy()
    expect(texts[0]).toContain('固定标题')
    expect(texts[1]).toContain('固定标题')
    expect(texts[0]).toContain('正文一')
    expect(texts[1]).toContain('正文二')
  }, 60000)
})
```

- [x] **Step 6: 运行 core 全量与渲染服务定向测试**

```bash
npm test -w @worm-vue3-print/core
npm run test -w @worm-vue3-print/render -- --run src/fixed-repeat.integration.test.ts
npm run test -w @worm-vue3-print/render
```

Expected: 全部 PASS；真实 PDF 两页均含固定标题。`parity:cross-end` 是无默认参数的人工 PDF 比对脚本，不能在此直接运行并宣称通过。

如需额外做 Electron 真机 parity，分别提供服务端和客户端用同一模板生成的 PDF，再执行：

```bash
npm run parity:cross-end -- /absolute/path/server-fixed.pdf /absolute/path/client-fixed.pdf
```

该脚本只比对页数与 MediaBox；固定标题是否逐页出现仍以本任务 pdfjs 文本断言和客户端 PDF 文本检查为准。未执行真机比对时在验收记录写“Electron 真机未覆盖”，不得写成跨端全部通过。

- [x] **Step 7: 运行构建、架构检查和 diff 审查**

```bash
npm run build
npm run lint:print-architecture
git diff --check
git status --short
```

Expected: 全部成功；无 core→canvas 反向依赖、无 Vue 依赖进入 core、无无关文件改动。`package-lock.json` 是用户已有改动，保持未暂存且不纳入提交。

- [x] **Step 8: 提交文档与边界验收**

```bash
git add packages/print-core/src/designer/types.ts packages/print-core/src/render/page-number-expression.test.ts packages/print-core/src/render/__tests__/continuous-paper.test.ts packages/print-core/src/render/pagination-engine.test.ts services/print-render/src/fixed-repeat.integration.test.ts skills/worm-vue3-print-mcp/references/template-schema.md
git commit -m "docs(core): 补充每页固定重复契约与边界测试"
```

## 回滚路径

- 未提交前发现问题：仅还原本计划列出的源码和测试文件，不触碰 `package-lock.json`。
- 提交后发现普通元素回归：回滚 Task 3、Task 2、Task 1 的提交，恢复 `paginate()` 单序列遍历；模板中的 `fixed` 字段仍可原样保留。
- 不采用删除属性面板开关或模板迁移作为回滚手段，避免破坏用户模板。

## 专家二次评审（2026-11-04 21:54）

- 评审对象与版本：`docs/superpowers/plans/2026-11-04-fixed-repeat.md` 当前工作区版本。
- 运行方式：同一个 OpenCode plan 子 Agent 串行完成 R1/R2；R1 为 `independent`，R2 通过 `--continue` 复用原角色，为 `reused-context`。
- 参与角色：`render-pipeline-expert`；主 Agent 以 `frontend-expert` 视角核对两个属性面板无需改动，以及 `collectFollowMemberIds()` 的 canvas/common 消费点。
- 未覆盖范围：Electron 真机 PDF 比对需实施时另行提供产物，不以无参数运行 parity 脚本代替。
- 用户前置批准：已确认逐页同位叠加、不占分页高度、整表/动态列表完整重复、连续纸一次的方案。

### 角色结论

- R1 质量门 `Warning`：固定语义、core 边界、公共跟随区、几何告警和真实 Chromium 验证方向均可落地；发现 Task 3 页码夹具的两个正文纵向重叠 10mm，只会形成一页，另指出 Files 清单漏列 `pagination-engine.test.ts`。
- R1 证据：既有分页产物复现为 `Task3-1 pages: 1 [fixed-page@10|body-1@10|body-2@150]`；重叠聚类规则位于 `pagination-engine.ts:350-364`。
- R2 质量门 `Pass`：`body2.top` 改为 160 后，正文区间上下相切，不再聚类；实测为两页 `[fixed-page@10|body-1@10]`、`[body-2@0]`，页码断言可达，剩余阻塞为零。

### 分歧与阻塞项

| 编号 | 结论/证据 | 提出角色 | 状态 | 复核证据 |
|---|---|---|---|---|
| B1 | 页码测试正文重叠导致仅一页 | render-pipeline-expert | 已闭环 | `body2.top=160`，R2 实测两页 |
| B2 | Task 3 Files 漏列普通分页测试文件 | render-pipeline-expert | 已闭环 | Files 已补 `pagination-engine.test.ts` |

### 主持人裁决

采纳两项夹具/清单修正，不扩大运行时分流方案。继续使用现有 `PageSection` 合入每页，不采纳新增 `PageLayout` 固定清单的契约扩张；真实 Chromium 测试必须断言 PDF 每页文本，不能只比较页数和纸尺寸。

### 用户批准

方案已批准；已按本计划完成实施、定向测试、全量测试与构建验证。Electron 真机 PDF 比对未覆盖。
