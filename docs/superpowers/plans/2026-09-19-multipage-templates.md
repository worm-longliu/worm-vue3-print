# 多页面模板打印实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持一次打印产出的一份文档中，各页来自不同页面模板（固定顺序版式组合，如封面+内容+条款），全部绑定同一份数据；核心渲染在 core，canvas 设计器支持多页面模板设计与纸张共享。

**Architecture:** `templateJson` 放宽为 `TemplateData | MultiPageTemplateData`（`{ pages: TemplateData[] }`）。core 的 `normalizeTemplate` 归一化与校验，逐模板复用现有「绑定→测量→分页」管线，`composeMultiPageDocument` 拼接整份文档（全局页码、整页边界、作用域 CSS）。canvas 把 `templateData` 变为「当前激活页」，外围加 `pages` 列表与页面栏。

**Tech Stack:** TypeScript（strict）、Vue 3.5+（canvas）、vitest（core/canvas 单测）、Playwright + pdfjs（render 集成测试）。

## Global Constraints

- 全部回复、提交信息用简体中文；Conventional Commits（`feat:`/`fix:` 等）。
- 依赖方向单向：core → canvas → 宿主；render/electron/SDK 只依赖 core，不得反向依赖。
- 多页编排逻辑（页码/字体合并/纸高/出图参数）唯一真实来源在 core；宿主只透传。
- 单模板路径输出必须与现状逐字一致（CSS 有 fixture 回归护栏）。
- 多模板要求各页 `getPaperDimensions`（含方向）相等；排除连续纸与拼版（`normalizeTemplate` 抛错）。
- 每份数据 = 一份完整多页文档；页码份内全局连续；下一模板必须新开一页（整页 `.print-page` 序列拼接）。
- 页面 `name?: string` 可选字段（设计器/错误上下文用，渲染端忽略）。
- 核心逻辑已完成并提交（commit `4866ec2`）：`src/print/multi-template.ts`、css-builder 拆分、html-generator 扩展、`MultiPageTemplateData` 类型与配套测试。**本计划在这些基础上接线。**

---

### Task 1: core 导出多页面模板 API 与类型放宽

**Files:**
- Modify: `packages/print-core/src/print/multi-template.ts`
- Modify: `packages/print-core/src/index.ts`
- Modify: `packages/print-core/src/render/types.ts`（`RenderRequest.templateJson` 放宽）
- Modify: `packages/print-core/src/print/types.ts`（`PrintJob.templateJson` 放宽）
- Test: `packages/print-core/src/print/__tests__/exports.spec.ts`（追加导出断言）

**Interfaces:**
- Consumes: 已有 `normalizeTemplate` / `composeMultiPageDocument` / `mergeFontDeclarations` / `MultiPageTemplateData`（commit `4866ec2`）。
- Produces: `isMultiPageTemplate(templateJson): boolean`；`RenderRequest.templateJson` 与 `PrintJob.templateJson` 为 `TemplateData | MultiPageTemplateData`。

- [ ] **Step 1: 在 `multi-template.ts` 追加 `isMultiPageTemplate` 守卫**

```ts
/** 是否多页面模板 wrapper（含 pages 数组）；与 normalizeTemplate 的判据一致 */
export function isMultiPageTemplate(
  templateJson: TemplateData | MultiPageTemplateData,
): templateJson is MultiPageTemplateData {
  return Array.isArray((templateJson as MultiPageTemplateData).pages)
}
```

- [ ] **Step 2: 放宽两处 `templateJson` 类型**

`packages/print-core/src/render/types.ts` 的 `RenderRequest`：
```ts
export interface RenderRequest {
  /** 模板 JSON：单模板或 { pages } 多页面模板 */
  templateJson: TemplateData | MultiPageTemplateData
  ...
}
```
`packages/print-core/src/print/types.ts` 的 `PrintJob` 同样放宽。两文件均已 import 同目录类型（`MultiPageTemplateData` 定义在 `render/types.ts`；`print/types.ts` 需补 import）。

- [ ] **Step 3: 在 `packages/print-core/src/index.ts` 追加导出**

在现有 `render/types.js` 类型导出块里补 `MultiPageTemplateData`；在 `print/index.js` 导出块（`export * from './print/index.js'`）已覆盖 `print/` 目录，但 `multi-template.ts` 不在 `print/index.ts` 里——把 `multi-template.ts` 的符号显式导出：

```ts
export { normalizeTemplate, mergeFontDeclarations, composeMultiPageDocument, isMultiPageTemplate } from './print/multi-template.js'
export type { MultiPageCopyInput, MultiPageDocument } from './print/multi-template.js'
export { buildBasePageCss, buildPageGeometryCss, buildPageRuleCss } from './render/css-builder.js'
export type { RenderFinalPagesOptions } from './render/html-generator.js'
```

（先查 `print/index.ts` 是否 re-export multi-template；若未导出则上面显式导出即足够，勿重复。）

- [ ] **Step 4: 在 `exports.spec.ts` 追加导出断言**（跟随该文件既有风格）

```ts
it('多页面模板 API 从根入口导出', () => {
  const core = await import('@worm-vue3-print/core')
  expect(typeof core.normalizeTemplate).toBe('function')
  expect(typeof core.composeMultiPageDocument).toBe('function')
  expect(typeof core.isMultiPageTemplate).toBe('function')
  expect(typeof core.buildBasePageCss).toBe('function')
  expect(typeof core.buildPageGeometryCss).toBe('function')
  expect(typeof core.buildPageRuleCss).toBe('function')
})
```

- [ ] **Step 5: 运行 core 测试**

Run: `npm exec -w @worm-vue3-print/core vitest run -- src/print/__tests__/exports.spec.ts src/print/__tests__/multi-template.spec.ts`
Expected: PASS（含既有多模板 15 用例）

- [ ] **Step 6: 构建 core 并提交**

```bash
npm run build -w @worm-vue3-print/core
git add packages/print-core/src/print/multi-template.ts packages/print-core/src/index.ts packages/print-core/src/render/types.ts packages/print-core/src/print/types.ts packages/print-core/src/print/__tests__/exports.spec.ts
git commit -m "feat(core): 多页面模板 API 导出与 templateJson 类型放宽"
```

---

### Task 2: pipeline 接入多模板渲染（含批量与截图）

**Files:**
- Modify: `packages/print-core/src/print/pipeline.ts`
- Test: `packages/print-core/src/print/__tests__/pipeline.spec.ts`（追加多模板用例）

**Interfaces:**
- Consumes: `normalizeTemplate` / `composeMultiPageDocument` / `isMultiPageTemplate`（Task 1）；`MultiPageCopyInput`；现有 `buildHtmlWithCodes` / `prepareSingleWithSession`。
- Produces: `prepareMultiCopy(job, session, data): Promise<MultiPageCopyInput>`（模块内函数）。

- [ ] **Step 1: 写失败测试**（追加到 `pipeline.spec.ts`，复用其 `template`/`runtimeOf` 助手）

```ts
function multiTemplate() {
  const cover = template({ name: '封面', elements: [{ id: 'c', type: 'text', options: { left: 0, top: 0, width: 50, height: 30 } }] })
  const body = template({
    name: '内容',
    elements: [
      // 100mm 高、top 隔 10mm（不重叠）→ 277 内容高可用 275：首页放 2 个（100+100），第 3 个 100>75 换页 → 内容 2 页
      { id: 'b1', type: 'text', options: { left: 0, top: 0, width: 50, height: 100 } },
      { id: 'b2', type: 'text', options: { left: 0, top: 110, width: 50, height: 100 } },
      { id: 'b3', type: 'text', options: { left: 0, top: 220, width: 50, height: 100 } },
    ],
  })
  return { version: 1 as const, pages: [cover, body] }
}

describe('多页面模板', () => {
  it('封面 1 页 + 内容 2 页：pageCount=3，作用域类与全局页码正确', async () => {
    const { runtime } = runtimeOf({ measurements: [] })
    const result = await prepareDocument({ templateJson: multiTemplate() }, runtime)
    expect(result.pageCount).toBe(3)
    expect(result.continuous).toBe(false)
    expect(result.heightSource).toBe('config')
    expect(result.paperMm).toEqual({ width: 210, height: 297 })
    const html = result.html
    expect(html).toContain('class="print-page mt-0"')
    expect(html).toContain('class="print-page mt-1"')
    expect(html).toContain('.mt-1.print-page {')
    expect(html.match(/<section class="print-page/g)).toHaveLength(3)
    expect(result.pageLayouts[2].pageIndex).toBe(2)
  })

  it('批量多模板：每份一份完整文档，页码份内重置', async () => {
    const { runtime } = runtimeOf({ measurements: [] })
    const result = await prepareDocument(
      { templateJson: multiTemplate(), printData: [{ x: 1 }, { x: 2 }] },
      runtime,
    )
    expect(result.pageCount).toBe(6)
    expect(result.copies).toBe(2)
    expect(result.html.match(/<section class="print-copy">/g)).toHaveLength(2)
  })

  it('1 页 wrapper 按单模板渲染（无 mt-0 作用域、无 print-copy 包装）', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'c', heightPx: 38 }] })
    const result = await prepareDocument(
      { templateJson: { version: 1 as const, pages: [template()] } },
      runtime,
    )
    expect(result.pageCount).toBe(1)
    expect(result.html).not.toContain('class="print-page mt-0"')
    expect(result.html).not.toContain('<section class="print-copy">')
  })

  it('截图：多模板按真实分页整份渲染（fullPage）', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [], screenshotBytes: new Uint8Array([7]) })
    const buf = await renderScreenshot({ templateJson: multiTemplate() }, runtime)
    expect(buf).toEqual(new Uint8Array([7]))
    expect(fake.calls).toContain('screenshot')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm exec -w @worm-vue3-print/core vitest run -- src/print/__tests__/pipeline.spec.ts`
Expected: FAIL（pipeline 尚无多模板分支）

- [ ] **Step 3: 实现 pipeline 多模板分支**

在 `prepareWithSession` 顶部加归一化与分支；新增 `prepareMultiCopy`。核心改动：

```ts
async function prepareWithSession(job: PrintJob, session: PrintSession): Promise<PreparedDocument> {
  const pageTemplates = normalizeTemplate(job.templateJson)

  // 多页面模板：每份数据 = 一份完整多页文档
  if (pageTemplates.length > 1) {
    const normalized = normalizePrintData(job.printData)
    const rows = normalized.mode === 'batch' ? normalized.dataList : [normalized.data]
    const copies: MultiPageCopyInput[] = []
    for (let i = 0; i < rows.length; i++) {
      try {
        copies.push(await prepareMultiCopy(job, session, rows[i]!))
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        throw new Error(`第 ${i + 1} 份渲染失败：${reason}`)
      }
    }
    const doc = composeMultiPageDocument(copies)
    return {
      html: doc.html,
      pageCount: doc.pageCount,
      paperMm: getPaperDimensions(pageTemplates[0]!),
      continuous: false,
      heightSource: 'config',
      pageLayouts: doc.pageLayouts,
      copies: copies.length,
    }
  }

  // 1 页 wrapper 归一化为单模板，走既有 single/batch/tiling 路径（行为逐字不变）
  const singleJob = pageTemplates.length === 1 && pageTemplates[0] !== job.templateJson
    ? { ...job, templateJson: pageTemplates[0] }
    : job
  // 下方既有逻辑整体把 `job` 替换为 `singleJob`：
  // - `normalizePrintData(singleJob.printData)`
  // - `prepareSingleWithSession(singleJob, session, normalized.data)`（单份）
  // - 批量循环 `prepareSingleWithSession(singleJob, session, normalized.dataList[i])`
  // - `composeTiledPrepared(singleJob, copies)`（tiling 分支，多模板已被 normalizeTemplate 拒绝，不会到达）
  // 裸单模板时 pageTemplates[0] === job.templateJson，singleJob 即原 job，零行为差异。
  const normalized = normalizePrintData(singleJob.printData)
  // 既有逻辑自此全部改用 singleJob（单份/批量循环/tiling 分支四处调用点已在上方列明）
}

/** 单份数据 → 各页面模板的绑定/分页/码制产物（供 composeMultiPageDocument 组合） */
async function prepareMultiCopy(
  job: PrintJob,
  session: PrintSession,
  data: Record<string, any>,
): Promise<MultiPageCopyInput> {
  const templates = normalizeTemplate(job.templateJson)
  const viewport = paperViewportPx(getPaperDimensions(templates[0]!))
  const boundPages: TemplateData[] = []
  const layoutsPerPage: PageLayout[][] = []
  const codeRenderers: Array<CodeRenderer | undefined> = []
  for (const t of templates) {
    const bound = bindData(t, data, job.baseUrl, job.fontBaseUrl)
    const measurement = await buildHtmlWithCodes({ bound, job, session, data, pageLayouts: [], isMeasurementPass: true })
    const measurements = await session.measure(measurement.html, viewport)
    applyTextFitSizes(bound, measurements.fits)
    const layouts = paginate(bound, normalizeMeasurements(measurements.measurements, bound))
    const final = await buildHtmlWithCodes({ bound, job, session, data, pageLayouts: layouts, isMeasurementPass: false, baseMap: measurement.map })
    boundPages.push(bound)
    layoutsPerPage.push(layouts)
    codeRenderers.push(final.codeRenderer)
  }
  return { boundPages, layoutsPerPage, data, codeRenderers }
}
```

`renderScreenshot` 顶部加同样分支（多模板走 `prepareMultiCopy` + `composeMultiPageDocument([copy])` + 真实分页 `toScreenshot`；1 页 wrapper 归一化为 singleJob 后走既有截图）。

注意：`singleJob` 分支必须保留 `prepareSingleWithSession` 内全部既有调用点把 `job` 换成 `singleJob`（含 tiling/批量），且 **tiling 校验**保持仅单模板可走（多模板已在 `normalizeTemplate` 抛错）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm exec -w @worm-vue3-print/core vitest run -- src/print/__tests__/pipeline.spec.ts`
Expected: PASS（新增 4 用例 + 既有用例）

- [ ] **Step 5: 全量 core 测试 + 提交**

```bash
npm exec -w @worm-vue3-print/core vitest run
npm run build -w @worm-vue3-print/core
git add packages/print-core/src/print/pipeline.ts packages/print-core/src/print/__tests__/pipeline.spec.ts
git commit -m "feat(core): pipeline 接入多页面模板渲染（批量/截图/1页wrapper归一化）"
```

---

### Task 3: render 服务校验放宽 + 多模板集成测试（Playwright）

**Files:**
- Modify: `services/print-render/src/server.ts`
- Create: `services/print-render/src/multipage.integration.test.ts`
- Test: `services/print-render/src/multipage.integration.test.ts`

**Interfaces:**
- Consumes: core 已导出的 `renderPdf`/`normalizeTemplate`；`@worm-vue3-print/core/node` 的 `loadExecutorBundle`；`BrowserPool`/`createPlaywrightDriverFactory`（render 包既有）。
- Produces: 无新接口；验证多模板 PDF 出图。

- [ ] **Step 1: 放宽 `server.ts` 的 templateJson 结构校验**

`/render/pdf` 端点（约 65-72 行）：
```ts
const tpl = body.templateJson as TemplateData
const hasMultiPages = Array.isArray((body.templateJson as { pages?: unknown }).pages)
if (!hasMultiPages && (!tpl.paperSize || !tpl.orientation || !tpl.margins)) {
  res.status(400).json({
    code: 'INVALID_REQUEST',
    message: 'templateJson must contain paperSize, orientation, and margins (or pages)',
  })
  return
}
```

- [ ] **Step 2: 新增 `multipage.integration.test.ts`**（仿 `tiling.integration.test.ts`：`createDomHostRuntime` + `BrowserPool` + pdfjs 解析）

```ts
import { describe, it, expect } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { renderPdf as coreRenderPdf, createDomHostRuntime } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

function page(name: string, elementHeight: number, data: string): PrintTemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    name,
    elements: [{ id: `${name}-e`, type: 'text', options: { left: 10, top: 10, width: 50, height: elementHeight, formatter: `{${data}}` } }],
  }
}

describe('多页面模板渲染（真实 Chromium）', () => {
  it('封面 1 页 + 内容 2 页 → 3 页 PDF，页码与纸张正确', async () => {
    const { pdf } = await coreRenderPdf({
      templateJson: {
        version: 1,
        pages: [page('封面', 30, 'cover'), page('内容', 150, 'body')],
      },
      printData: { cover: '封面标题', body: '内容正文' },
    }, runtime)
    const doc = await getDocument({ data: pdf.slice() }).promise
    expect(doc.numPages).toBe(3)
    // 每页 A4（595.28 × 841.89 pt）
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i)
      const { width, height } = p.view
      expect(Math.round(width)).toBe(595)
      expect(Math.round(height)).toBe(842)
    }
    // 第 2、3 页文本为内容页（第 2 页起始 = 下一模板新开一页的边界）
    const texts = []
    for (let i = 1; i <= 3; i++) {
      const content = await (await doc.getPage(i)).getTextContent()
      texts.push(content.items.map((it: any) => it.str).join(''))
    }
    expect(texts[0]).toContain('封面标题')
    expect(texts[1]).toContain('内容正文')
  })
})
```

- [ ] **Step 3: 跑 render 集成测试**

Run: `npm run build -w @worm-vue3-print/core && npm run test -w @worm-vue3-print/render -- src/multipage.integration.test.ts`
Expected: PASS（首次需 `npx playwright install chromium`；测试较慢）

- [ ] **Step 4: 确认 electron/SDK 松散耦合无需改动**

- `clients/print-client/src/main/request-validation.ts:148` 仅 `isRecord(raw.templateJson)` 校验 → wrapper 是对象，天然通过；
- `clients/print-client/src/main/print-engine.ts:115` 用 `as unknown as PrintTemplateData` 断言，透传 core 管线（core 已处理多模板）；
- `packages/print-client-sdk/src/protocol.ts:99` `templateJson: Record<string, unknown>` 松散定义 → 无需改。

验证方式：`npm run typecheck -w @worm-vue3-print/client` 通过即视为确认；若编译报类型错误，放宽对应 `PrintTemplateData` 相关局部断言（不改变运行时行为）。

- [ ] **Step 5: 跑架构守卫 + 提交**

```bash
npm run lint:print-architecture
git add services/print-render/src/server.ts services/print-render/src/multipage.integration.test.ts
git commit -m "feat(render): 多页面模板校验放宽与 PDF 集成测试"
```

---

### Task 4: canvas 多页面状态（useDesignerState）

**Files:**
- Modify: `packages/print-canvas/src/composables/useDesignerState.ts`
- Test: `packages/print-canvas/src/__tests__/useDesignerState-multipage.spec.ts`

**Interfaces:**
- Consumes: core 的 `MultiPageTemplateData` / `normalizeTemplate`（Task 1）；`toRuntimePool` / `createDefaultTemplate` / `normalizeTemplateUnits` / `generateId`（既有）。
- Produces: `pages: Ref<TemplateData[]>`、`activePageIndex: Ref<number>`、`switchPage(i)`、`addPage()`、`duplicatePage()`、`deletePage(i)`、`renamePage(i, name)`、`movePage(from, to)`；`getTemplateJson(): TemplateData | MultiPageTemplateData`；`loadTemplate(data: TemplateData | MultiPageTemplateData, els?)`；`updateTemplateData` 多页时纸张字段传播。

**状态不变量：** `templateData` 恒为当前激活页的运行时池形态；切页/保存前 `flushActivePage()` 把 `templateData` 写回 `pages[activePageIndex]`；`pages` 各页也是运行时池形态（`toRuntimePool` 结果）。

- [ ] **Step 1: 写失败测试**（直接调用 composable；keyboard 生命周期在非组件上下文不执行，不影响状态断言）

```ts
import { describe, it, expect } from 'vitest'
import { useDesignerState } from '../composables/useDesignerState'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function page(name: string, height: number): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait', unit: 'mm',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    name,
    elements: [{ id: `${name}-e`, type: 'text', options: { left: 0, top: 0, width: 50, height, formatter: 'x' }, printElementType: { type: 'text' } }],
  }
}

describe('useDesignerState 多页面', () => {
  it('加载 wrapper：pages 展开，templateData=首页', () => {
    const s = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30), page('内容', 150)] } })
    expect(s.pages.value).toHaveLength(2)
    expect(s.activePageIndex.value).toBe(0)
    expect(s.templateData.value.name).toBe('封面')
  })

  it('switchPage：当前页写入 pages，切到目标页', () => {
    const s = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30), page('内容', 150)] } })
    s.templateData.value.name = '封面改'
    s.switchPage(1)
    expect(s.pages.value[0].name).toBe('封面改')
    expect(s.templateData.value.name).toBe('内容')
  })

  it('getTemplateJson：1 页裸值，多页 wrapper', () => {
    const single = useDesignerState({ initialTemplate: page('单页', 30) })
    expect('pages' in single.getTemplateJson()).toBe(false)

    const multi = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30), page('内容', 150)] } })
    const json = multi.getTemplateJson()
    expect('pages' in json).toBe(true)
    if ('pages' in json) {
      expect(json.pages).toHaveLength(2)
      expect(json.pages[0].name).toBe('封面')
    }
  })

  it('updateTemplateData：多页时纸张字段传播到所有页', () => {
    const s = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30), page('内容', 150)] } })
    s.updateTemplateData({ ...s.templateData.value, paperSize: 'A5' })
    s.switchPage(1)
    expect(s.templateData.value.paperSize).toBe('A5')
  })

  it('addPage/duplicatePage/deletePage/movePage 基础操作', () => {
    const s = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30)] } })
    s.addPage()
    expect(s.pages.value).toHaveLength(2)
    expect(s.templateData.value.paperSize).toBe(s.pages.value[0].paperSize) // 继承首页纸张

    s.duplicatePage()
    expect(s.pages.value).toHaveLength(3)
    expect(s.templateData.value.elements[0].id).not.toBe(s.pages.value[0].elements[0].id)

    // 删除激活页之前的页：激活索引前移一位，仍停留在原页面
    s.deletePage(0)
    expect(s.pages.value).toHaveLength(2)
    expect(s.pages.value[0].name).toBe('页面 2')
    expect(s.activePageIndex.value).toBe(1)
    expect(s.templateData.value.name).toBe('页面 2 副本')

    // 右移到队首：pages=[页面 2 副本, 页面 2]，active 跟随被移页
    s.movePage(1, 0)
    expect(s.pages.value[0].name).toBe('页面 2 副本')
    expect(s.activePageIndex.value).toBe(0)
    expect(s.templateData.value).toBe(s.pages.value[0])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run build -w @worm-vue3-print/core && npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/useDesignerState-multipage.spec.ts`
Expected: FAIL（无 `pages` 等导出）

- [ ] **Step 3: 实现 useDesignerState 多页状态**

类型放宽：`DesignerStateOptions.initialTemplate?: TemplateData | MultiPageTemplateData`；`loadTemplate` 入参同。新增：

```ts
// 多页面模板：pages 列表 + 当前激活页
const pages = ref<TemplateData[]>(resolveInitialPages(options.initialTemplate))
const activePageIndex = ref(0)
const templateData = ref<TemplateData>(pages.value[0] ?? createDefaultTemplate())

function resolveInitialPages(initial?: TemplateData | MultiPageTemplateData): TemplateData[] {
  if (!initial) return [toRuntimePool(createDefaultTemplate())]
  const list = Array.isArray((initial as MultiPageTemplateData).pages)
    ? (initial as MultiPageTemplateData).pages
    : [initial as TemplateData]
  return list.length ? list.map(p => toRuntimePool(normalizeTemplateUnits(p))) : [toRuntimePool(createDefaultTemplate())]
}

function flushActivePage() {
  pages.value[activePageIndex.value] = templateData.value
}

function switchPage(i: number) {
  if (i < 0 || i >= pages.value.length) return
  flushActivePage()
  activePageIndex.value = i
  templateData.value = pages.value[i]!
  clearSelection()
}
```

`updateTemplateData` 多页纸张传播：
```ts
function updateTemplateData(data: TemplateData) {
  templateData.value = { ...data }
  if (pages.value.length > 1) {
    const paper = {
      paperSize: data.paperSize, orientation: data.orientation,
      customWidth: data.customWidth, customHeight: data.customHeight,
    }
    for (const p of pages.value) Object.assign(p, paper)
  }
  recordHistory()
}
```

`getTemplateJson` 改为逐页序列化：
```ts
function getTemplateJson(): TemplateData | MultiPageTemplateData {
  flushActivePage()
  if (pages.value.length <= 1) return serializePage(pages.value[0]!)
  return { version: 1, pages: pages.value.map(serializePage) }
}

function serializePage(page: TemplateData): TemplateData {
  const all = page.elements as RuntimeElement[]
  const ser = (zone: ElementZone) => all
    .filter(e => (e.zone || 'content') === zone)
    .map(e => ({ id: e.id, type: e.printElementType.type, options: { ...e.options }, printElementType: { ...e.printElementType } }))
  return {
    unit: 'mm' as const, ...page,
    header: { ...page.header, elements: ser('header') },
    footer: { ...page.footer, elements: ser('footer') },
    firstPageOverlay: {
      ...page.firstPageOverlay,
      elements: (page.firstPageOverlay?.elements ?? []).map(e => ({
        id: e.id || generateId(), type: e.printElementType?.type || 'text',
        options: { ...e.options }, printElementType: { ...e.printElementType },
      })),
    },
    elements: ser('content'),
    guides: [...(page.guides ?? [])],
  }
}
```

`loadTemplate` 归一化：
```ts
function loadTemplate(data: TemplateData | MultiPageTemplateData, els?: RuntimeElement[]) {
  pages.value = resolveInitialPages(data)
  activePageIndex.value = 0
  templateData.value = pages.value[0]!
  if (els) {
    templateData.value = { ...templateData.value, elements: els.map(...) }
  }
  pushHistory(getHistoryState())
}
```

页操作（addPage 继承首页纸张；duplicatePage 重建元素 id 避免同文档冲突）：
```ts
function addPage() {
  flushActivePage()
  const base = pages.value[activePageIndex.value] ?? createDefaultTemplate()
  const np = toRuntimePool({
    ...createDefaultTemplate(),
    paperSize: base.paperSize, orientation: base.orientation,
    customWidth: base.customWidth, customHeight: base.customHeight,
    name: `页面 ${pages.value.length + 1}`,
  })
  pages.value.push(np)
  activePageIndex.value = pages.value.length - 1
  templateData.value = np
  recordHistory()
}

function duplicatePage() {
  flushActivePage()
  const src = pages.value[activePageIndex.value]!
  const cp: TemplateData = JSON.parse(JSON.stringify(src))
  cp.name = `${src.name ?? `页面 ${activePageIndex.value + 1}`} 副本`
  cp.elements = cp.elements.map((e: any) => ({ ...e, id: generateId() }))
  cp.firstPageOverlay = { ...cp.firstPageOverlay, elements: (cp.firstPageOverlay?.elements ?? []).map((e: any) => ({ ...e, id: generateId() })) }
  pages.value.splice(activePageIndex.value + 1, 0, cp)
  switchPage(activePageIndex.value + 1)
  recordHistory()
}

function deletePage(i: number) {
  if (pages.value.length <= 1) return
  flushActivePage()
  pages.value.splice(i, 1)
  if (i < activePageIndex.value) activePageIndex.value--
  else if (i === activePageIndex.value && activePageIndex.value >= pages.value.length) activePageIndex.value = pages.value.length - 1
  templateData.value = pages.value[activePageIndex.value]!
  recordHistory()
}

function renamePage(i: number, name: string) {
  if (pages.value[i]) pages.value[i].name = name
}

function movePage(from: number, to: number) {
  if (from === to) return
  flushActivePage()
  const [moved] = pages.value.splice(from, 1)
  pages.value.splice(to, 0, moved!)
  activePageIndex.value = to
  templateData.value = moved!
  recordHistory()
}
```

返回对象追加：`pages, activePageIndex, switchPage, addPage, duplicatePage, deletePage, renamePage, movePage`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run build -w @worm-vue3-print/core && npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/useDesignerState-multipage.spec.ts`
Expected: PASS

- [ ] **Step 5: 全量 canvas 测试 + 提交**

```bash
npm exec -w @worm-vue3-print/canvas vitest run
git add packages/print-canvas/src/composables/useDesignerState.ts packages/print-canvas/src/__tests__/useDesignerState-multipage.spec.ts
git commit -m "feat(canvas): 设计器多页面状态（页面列表/切换/纸张传播/序列化）"
```

---

### Task 5: canvas 页面栏 UI（PageTabs）+ PrintDesigner 接线

**Files:**
- Create: `packages/print-canvas/src/components/PageTabs.vue`
- Modify: `packages/print-canvas/src/components/PrintDesigner.vue`
- Test: `packages/print-canvas/src/__tests__/PageTabs.spec.ts`

**Interfaces:**
- Consumes: `useDesignerState` 新接口（Task 4）；`MultiPageTemplateData` 类型。
- Produces: `PageTabs` 组件（props: `pages` 名列表 / `activeIndex` / `multi`；emits: `select/add/duplicate/delete/rename/move`）。

- [ ] **Step 1: 写失败测试**（mount PageTabs，仿既有组件 spec 风格）

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageTabs from '../components/PageTabs.vue'

describe('PageTabs', () => {
  it('渲染页面名与激活态，点击切换', async () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }, { name: '内容' }], activeIndex: 0, multi: true } })
    expect(w.text()).toContain('封面')
    expect(w.text()).toContain('内容')
    const second = w.findAll('button.page-tab')[1]
    await second.trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([1])
  })

  it('新增/删除/复制/排序按钮发出对应事件', async () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }], activeIndex: 0, multi: true } })
    w.find('[data-test="add-page"]').trigger('click')
    w.find('[data-test="duplicate-page"]').trigger('click')
    w.find('[data-test="delete-page"]').trigger('click')
    expect(w.emitted('add')).toHaveLength(1)
    expect(w.emitted('duplicate')).toHaveLength(1)
    expect(w.emitted('delete')).toHaveLength(1)
  })

  it('仅剩一页时删除按钮禁用', () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }], activeIndex: 0, multi: false } })
    expect(w.find('[data-test="delete-page"]').attributes('disabled')).toBeDefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/PageTabs.spec.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 创建 PageTabs.vue**（原生控件，遵循 `native-controls.css` 风格；含重命名输入与左右移动）

```vue
<template>
  <div class="page-tabs">
    <div class="page-tabs-list">
      <button
        v-for="(p, i) in pages" :key="i"
        class="page-tab" :class="{ active: i === activeIndex }"
        :data-test="`page-tab-${i}`"
        @click="$emit('select', i)"
      >
        {{ p.name || `页面 ${i + 1}` }}
      </button>
    </div>
    <div class="page-tabs-actions">
      <button data-test="add-page" title="新增页面" @click="$emit('add')">＋</button>
      <button data-test="duplicate-page" title="复制当前页" @click="$emit('duplicate')">⧉</button>
      <button data-test="delete-page" title="删除当前页" :disabled="!multi" @click="$emit('delete', activeIndex)">✕</button>
      <button data-test="move-left" title="左移" :disabled="activeIndex <= 0" @click="$emit('move', activeIndex, activeIndex - 1)">←</button>
      <button data-test="move-right" title="右移" :disabled="activeIndex >= pages.length - 1" @click="$emit('move', activeIndex, activeIndex + 1)">→</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TemplateData } from '@worm-vue3-print/core/designer'
defineProps<{
  pages: TemplateData[]
  activeIndex: number
  /** 多页模式（≥2 页）才可删除；单页回落单模板 */
  multi: boolean
}>()
defineEmits<{
  select: [index: number]
  add: []
  duplicate: []
  delete: [index: number]
  move: [from: number, to: number]
}>()
</script>

<style scoped>
.page-tabs { display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: var(--pd-sidebar, #fff); border-bottom: 1px solid var(--pd-border, #d9dde6); }
.page-tabs-list { display: flex; gap: 4px; overflow-x: auto; }
.page-tab { padding: 4px 12px; border: 1px solid var(--pd-border, #d9dde6); border-radius: 4px; background: transparent; cursor: pointer; }
.page-tab.active { background: var(--pd-accent, #165DFF); color: #fff; }
.page-tabs-actions button { padding: 4px 8px; border: 1px solid var(--pd-border, #d9dde6); border-radius: 4px; background: transparent; cursor: pointer; }
.page-tabs-actions button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

- [ ] **Step 4: PrintDesigner.vue 接线**

- `initialTemplate` prop 类型放宽为 `TemplateData | MultiPageTemplateData`（import 类型）；
- 从 `useDesignerState` 解构 `pages, activePageIndex, switchPage, addPage, duplicatePage, deletePage, movePage`；
- 在 `<DesignerToolbar>` 与三栏 body 之间插入 `<PageTabs :pages="pages" :active-index="activePageIndex" :multi="pages.length > 1" @select="switchPage" @add="addPage" @duplicate="duplicatePage" @delete="deletePage" @move="movePage" />`；
- `templateJsonWithFonts(): TemplateData | MultiPageTemplateData`：

```ts
function templateJsonWithFonts(): TemplateData | MultiPageTemplateData {
  const json = getTemplateJson()
  if (!props.fonts?.length) return json
  if (Array.isArray((json as MultiPageTemplateData).pages)) {
    return { ...(json as MultiPageTemplateData), pages: (json as MultiPageTemplateData).pages.map(p => ({ ...p, fonts: [...props.fonts!] })) }
  }
  return { ...(json as TemplateData), fonts: [...props.fonts] }
}
```

- `handleSave` 前加多页校验（用 core `normalizeTemplate`，错误 `alert` 并中断）：

```ts
import { normalizeTemplate } from '@worm-vue3-print/core'
const json = templateJsonWithFonts()
if (Array.isArray((json as MultiPageTemplateData).pages)) {
  try { normalizeTemplate(json) } catch (e) { alert(e instanceof Error ? e.message : String(e)); return }
}
emit('save', JSON.stringify(json))
```

- `onTemplateDataChanged` 若 `data.name` 变化同步到 `pages[activePageIndex].name`（重命名由 PageTabs 直接调 `renamePage`，此处可省）。

- [ ] **Step 5: 跑 canvas 测试**

Run: `npm run build -w @worm-vue3-print/core && npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/PageTabs.spec.ts src/__tests__/useDesignerState-multipage.spec.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/print-canvas/src/components/PageTabs.vue packages/print-canvas/src/components/PrintDesigner.vue packages/print-canvas/src/__tests__/PageTabs.spec.ts
git commit -m "feat(canvas): 多页面栏 UI 与 PrintDesigner 接线（含保存前多页校验）"
```

---

### Task 6: canvas 属性面板多页 gating（隐藏拼版、禁用连续纸、纸张共享）

**Files:**
- Modify: `packages/print-canvas/src/components/PropertyPanel.vue`
- Test: `packages/print-canvas/src/__tests__/PropertyPanel-multipage.spec.ts`

**Interfaces:**
- Consumes: `useDesignerState` 的 `pages`（Task 4）。
- Produces: `PropertyPanel` 新增 prop `multiPage?: boolean`；多页时隐藏 `TilingConfig`、纸型下拉禁用连续纸类。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PropertyPanel from '../components/PropertyPanel.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function tpl(): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] }, elements: [],
  }
}

describe('PropertyPanel 多页 gating', () => {
  it('多页模式隐藏拼版配置', () => {
    const w = mount(PropertyPanel, { props: { templateData: tpl(), multiPage: true } })
    expect(w.find('[data-test="tiling-config"]').exists()).toBe(false)
  })
  it('单页模式保留拼版配置', () => {
    const w = mount(PropertyPanel, { props: { templateData: tpl(), multiPage: false } })
    expect(w.find('[data-test="tiling-config"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/PropertyPanel-multipage.spec.ts`
Expected: FAIL（无 `multiPage` prop 逻辑）

- [ ] **Step 3: 实现 gating**

`PropertyPanel.vue`：
- props 增 `multiPage?: boolean`（默认 false）；
- `TilingConfig` 包一层 `<template v-if="!multiPage">`，根节点加 `data-test="tiling-config"`（改 `TilingConfig.vue` 根元素属性）；
- 纸型 `<select>` 的选项：`multiPage` 时过滤 `isContinuousPaperSize` 的纸型（`continuousPaper` 计算属性在 multiPage 时恒 false）；
- 纸张模型不变（纸张字段仍写在当前页，PrintDesigner 的 `updateTemplateData` 负责传播到所有页）。

- [ ] **Step 4: PrintDesigner 传 `multiPage`**

`<PropertyPanel :multi-page="pages.length > 1" ... />`

- [ ] **Step 5: 跑 canvas 测试 + 提交**

```bash
npm exec -w @worm-vue3-print/canvas vitest run
git add packages/print-canvas/src/components/PropertyPanel.vue packages/print-canvas/src/components/property/TilingConfig.vue packages/print-canvas/src/__tests__/PropertyPanel-multipage.spec.ts
git commit -m "feat(canvas): 属性面板多页 gating（隐藏拼版/禁用连续纸）"
```

---

### Task 7: demo 适配（加载/保存/预览接受 wrapper）

**Files:**
- Modify: `demo/src/App.vue`
- Modify: `demo/src/browser-render.ts`（仅类型放宽，透传 wrapper）

**Interfaces:**
- Consumes: `PrintDesigner` 新 `initialTemplate` 联合类型与 `getTemplateJson` 返回类型（Task 4/5）。
- Produces: demo 可加载/保存/预览多页面模板。

- [ ] **Step 1: App.vue 接线**

- `initialTemplate` 绑定处（约 21 行）类型不再强制单模板（`Record<string, unknown>` 已松散，保持）；
- 导入 JSON（`onImport`）与加载默认布局（`loadDefaultTemplate`）时，接受 `{ pages: [...] }` wrapper 原样回写 `initialTemplate` 引用（`onImport` 已 `JSON.parse` 后回写，天然支持）；
- 预览/截图（`requestScreenshot` 实现）直接传 `getTemplateJson()` 返回值（已是 `TemplateData | MultiPageTemplateData`，`render-client.ts`/`browser-render.ts` 入参 `Record<string, unknown>` 不变）。

- [ ] **Step 2: 跑 demo 类型检查**

Run: `cd demo && npx vue-tsc --noEmit`（demo 有独立 node_modules）
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add demo/src
git commit -m "feat(demo): 适配多页面模板加载/保存/预览"
```

---

### Task 8: 收尾验证

**Files:** 无（仅验证）

- [ ] **Step 1: 全量构建与测试**

```bash
npm run build && npm test
```
Expected: 全绿（core 632+ 用例、canvas、client-sdk、print-client）

- [ ] **Step 2: typecheck 与架构守卫**

```bash
npm run typecheck -w @worm-vue3-print/client
npm run lint:print-architecture
```
Expected: PASS（多页编排逻辑全在 core，render/electron 源码无新违规）

- [ ] **Step 3: render 集成测试（含新增多模板用例）**

Run: `npm run test -w @worm-vue3-print/render`
Expected: PASS（含 `multipage.integration.test.ts`）

- [ ] **Step 4: 自审 `git diff`**

检查命名、包边界、类型约定、是否外科手术式修改；确认单模板路径无行为变化。

- [ ] **Step 5: 收尾提交（如有遗漏）**

```bash
git add -A && git commit -m "chore: 多页面模板功能收尾"
```

