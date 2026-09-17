# printData 数组批量打印（core 三端）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调用方向浏览器渲染、render 服务 PDF、Electron 客户端三通道传入 `printData` 对象数组时，core 自动识别份数、在同一输出中顺序渲染多份并强制分页，合并为一个 PDF/打印作业/浏览器打印；对象入参行为零变化。

**Architecture:** 在 core pipeline 入口把 printData 归一为 single/batch；batch 在同一 PrintSession 内串行跑 N 遍现有单份阶段，新增纯字符串合并器（不经 DOMParser——core 为纯 TS 包、vitest 为 node 环境）在 html-generator 层把各份页面包进 `.print-copy` 拼成一个文档，固定纸共用 `@page`，连续纸用命名页 `@page copyN` 输出不同纸高。三端仅放宽类型与入参校验，不重实现渲染。

**Tech Stack:** TypeScript strict、vitest（core 环境 node）、Vue 3.5（canvas）、Express（render）、Electron WS 协议、Playwright（render 集成测试）。

> **与已批准 spec（`docs/superpowers/specs/2026-09-17-core-batch-print-data-design.md`）的唯一实现偏差**：spec 3.2 写的是「DOMParser 解析各份完整 HTML 再拼接」。core 是无 DOM 硬依赖的纯 TS 包且 vitest 为 node 环境（无 DOMParser），因此改为在 `html-generator`/`css-builder` 层以纯字符串直接生成合并文档（Task 2、Task 3）。外部行为契约（一个 HTML/PDF、份间分页、copies/pageCount/copyPaperMm）完全不变。

## Global Constraints

- 简体中文回复、注释、提交信息、用户可见错误文案。
- 份数上限常量 `MAX_BATCH_COPIES = 500`，空数组与非对象数组项在 core 归一函数集中报错。
- 对象入参（single）路径行为必须与改造前完全一致（pipeline.spec 现有用例全部不改断言即通过）。
- 错误文案精确值：`批量打印数据必须是非空对象数组`、`批量打印数据第 N 项必须是对象`（N 为 1 基）、`批量打印最多支持 500 份，当前 M 份`、`第 N 份渲染失败：<原因>`。
- 提交类型用 Conventional Commits，提交信息末尾空一行加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 窄测试：core 用 `npm exec -w @worm-vue3-print/core vitest run -- <相对 tests/ 或源码同目录路径>`；在包目录可 `npx vitest run <path>`。render 集成测试慢：`npm run test -w @worm-vue3-print/render`。
- 不新增任何运行时依赖；不引入 DOMParser/jsdom 到 core。
- 改动后三端不得出现架构守卫禁止项（直接 DOM 测量/纸高推导/码制库 import/硬编码出图参数），收尾跑 `npm run lint:print-architecture`。

---

### Task 1: printData 归一函数与类型放宽

**Files:**
- Create: `packages/print-core/src/print/normalize-print-data.ts`
- Test: `packages/print-core/src/print/__tests__/normalize-print-data.spec.ts`

注意：本任务只新增纯函数与其测试，**不**改任何既有类型/函数（PrintJob、RenderRequest、bindData 的放宽统一在 Task 4 与 pipeline 改造同批完成，避免中间编译破损）。

**Interfaces:**
- Produces（后续任务与外部消费）:
  - `const MAX_BATCH_COPIES = 500`
  - `type PrintDataInput = Record<string, any> | Record<string, any>[]`
  - `type NormalizedPrintData = { mode: 'single'; data: Record<string, any> } | { mode: 'batch'; dataList: Record<string, any>[] }`
  - `normalizePrintData(raw: PrintDataInput | undefined): NormalizedPrintData`
- Consumes: 无（本任务为纯函数基础）。

- [ ] **Step 1: 写失败测试**

创建 `packages/print-core/src/print/__tests__/normalize-print-data.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  MAX_BATCH_COPIES,
  normalizePrintData,
} from '../normalize-print-data.js'

describe('normalizePrintData', () => {
  it('undefined 归一为 single 空对象', () => {
    expect(normalizePrintData(undefined)).toEqual({ mode: 'single', data: {} })
  })

  it('对象归一为 single，原样返回引用', () => {
    const data = { a: 1 }
    expect(normalizePrintData(data)).toEqual({ mode: 'single', data })
  })

  it('非空对象数组归一为 batch', () => {
    const r = normalizePrintData([{ a: 1 }, { a: 2 }])
    expect(r.mode).toBe('batch')
    if (r.mode !== 'batch') throw new Error('类型收窄失败')
    expect(r.dataList).toHaveLength(2)
  })

  it('空数组抛错', () => {
    expect(() => normalizePrintData([])).toThrow('批量打印数据必须是非空对象数组')
  })

  it('数组含非对象项时报告 1 基项序号', () => {
    expect(() => normalizePrintData([{ a: 1 }, null])).toThrow('批量打印数据第 2 项必须是对象')
    expect(() => normalizePrintData([{ a: 1 }, 'x' as unknown as Record<string, any>])).toThrow(
      '批量打印数据第 2 项必须是对象',
    )
  })

  it(`超过 ${MAX_BATCH_COPIES} 份抛错并报告实际份数`, () => {
    const list = Array.from({ length: MAX_BATCH_COPIES + 1 }, () => ({}))
    expect(() => normalizePrintData(list)).toThrow(
      `批量打印最多支持 ${MAX_BATCH_COPIES} 份，当前 ${MAX_BATCH_COPIES + 1} 份`,
    )
  })

  it('恰好上限可通过', () => {
    const list = Array.from({ length: MAX_BATCH_COPIES }, () => ({}))
    expect(normalizePrintData(list).mode).toBe('batch')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run（在 `packages/print-core`）: `npx vitest run src/print/__tests__/normalize-print-data.spec.ts`
Expected: FAIL（找不到模块 ../normalize-print-data.js）。

- [ ] **Step 3: 实现归一函数**

创建 `packages/print-core/src/print/normalize-print-data.ts`：

```ts
// 打印数据归一：对象=单份；非空对象数组=批量（数组长度即份数）。
// 这是整条管线唯一的数组拆分点。

export const MAX_BATCH_COPIES = 500

export type PrintDataInput = Record<string, any> | Record<string, any>[]

export type NormalizedPrintData =
  | { mode: 'single'; data: Record<string, any> }
  | { mode: 'batch'; dataList: Record<string, any>[] }

function isPlainRecord(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function normalizePrintData(raw: PrintDataInput | undefined): NormalizedPrintData {
  if (raw === undefined) return { mode: 'single', data: {} }
  if (!Array.isArray(raw)) return { mode: 'single', data: raw }

  if (raw.length === 0) {
    throw new Error('批量打印数据必须是非空对象数组')
  }
  if (raw.length > MAX_BATCH_COPIES) {
    throw new Error(`批量打印最多支持 ${MAX_BATCH_COPIES} 份，当前 ${raw.length} 份`)
  }
  for (let i = 0; i < raw.length; i++) {
    if (!isPlainRecord(raw[i])) {
      throw new Error(`批量打印数据第 ${i + 1} 项必须是对象`)
    }
  }
  return { mode: 'batch', dataList: raw }
}
```

- [ ] **Step 4: 运行确认通过 + core 构建不受影响**

Run（在 `packages/print-core`）:
`npx vitest run src/print/__tests__/normalize-print-data.spec.ts`
Expected: PASS（7 用例）。
`npm run build -w @worm-vue3-print/core`
Expected: 成功（纯新增文件、未改既有代码）。

- [ ] **Step 5: 提交**

```bash
git add packages/print-core/src/print/normalize-print-data.ts \
  packages/print-core/src/print/__tests__/normalize-print-data.spec.ts
git commit -m "feat(core): 新增打印数据归一与份数上限

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: html-generator 拆分与批量 CSS

**Files:**
- Modify: `packages/print-core/src/render/html-generator.ts`（提取两个导出函数，`generateHtml` 行为不变）
- Modify: `packages/print-core/src/render/css-builder.ts`（新增 `buildBatchPageCss`）
- Test: `packages/print-core/src/render/html-generator.test.ts`（追加用例）
- Test（新建）: `packages/print-core/src/render/css-builder.test.ts`

**Interfaces:**
- Consumes: 无（本任务只做纯字符串重构与新增）。
- Produces（Task 3 消费）:
  - `renderFinalPages(template: TemplateData, pageLayouts: PageLayout[], printData: Record<string, any>, ctx: { codeRenderer?: CodeRenderer; pageHeightMm?: number }): string` —— 仅 body 内 `.print-page` 序列（已注入系统变量），不含 head/body 外壳。
  - `wrapHtmlDocument(css: string, bodyInnerHtml: string, bodyClass?: string): string` —— `<!DOCTYPE html>…<head><style>css</style></head><body[ class]>…</body>`，已注入系统变量。
  - `buildBatchPageCss(template: TemplateData, copies: Array<{ heightMm?: number }>): string` —— 批量文档 CSS：固定纸共用单一 `@page`；连续纸每份命名页 `@page copyN` + 作用域尺寸；均含份间强制分页规则。

- [ ] **Step 1: 重构 html-generator（先改实现，现有测试即回归网）**

在 `html-generator.ts` 中：

a) 新增并导出 `renderFinalPages`，把 `generateFinalHtml`（:113-140）里 pagesHtml 的生成逻辑整体搬入：

```ts
/** 第二遍最终渲染：仅生成 body 内的 .print-page 序列（含系统变量注入），不含文档外壳 */
export function renderFinalPages(
  template: TemplateData,
  pageLayouts: PageLayout[],
  printData: Record<string, any>,
  ctx: RenderCtx,
): string {
  const totalPages = pageLayouts.length
  const pagesHtml = pageLayouts.map(page => {
    const pageNum = page.pageIndex + 1
    return renderPage(template, page, pageNum, totalPages, ctx, printData)
  }).join('\n')
  return injectSystemVariables(pagesHtml)
}
```

b) 新增并导出 `wrapHtmlDocument`：

```ts
/** 套上完整 HTML 文档外壳（含系统变量注入） */
export function wrapHtmlDocument(css: string, bodyInnerHtml: string, bodyClass?: string): string {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>${css}</style>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${bodyInnerHtml}
</body>
</html>`
  return injectSystemVariables(html)
}
```

c) `generateFinalHtml` 改为薄封装（保持 `generateHtml` 对外行为字节一致——两趟 injectSystemVariables 原对整篇执行，现 renderFinalPages 已注入 body，wrap 再注入 head/外壳；系统变量替换是幂等字符串替换，结果等价）：

```ts
function generateFinalHtml(
  template: TemplateData,
  pageLayouts: PageLayout[],
  css: string,
  _totalPages: number,
  ctx: RenderCtx,
  printData?: Record<string, any> | Record<string, any>[],
): string {
  const bodyInner = renderFinalPages(template, pageLayouts, printData ?? {}, ctx)
  return wrapHtmlDocument(
    css,
    bodyInner,
    template.paperSize === 'CONTINUOUS' ? 'continuous' : undefined,
  )
}
```

d) `renderPage`（:142-198）不动；其私有 printData 联合类型保留无访（传入已为单对象）。

- [ ] **Step 2: 跑现有 html-generator 测试确认无回归**

Run（在 `packages/print-core`）: `npx vitest run src/render/html-generator.test.ts`
Expected: 全部既有用例 PASS（输出结构未变）。

- [ ] **Step 3: 给两个新导出补测试**

在 `src/render/html-generator.test.ts` 末尾的 describe 内（或同风格新建 describe）追加：

```ts
describe('批量文档拆分函数', () => {
  const tpl = {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
  } as unknown as TemplateData

  it('renderFinalPages 只产出 .print-page 序列', () => {
    const html = renderFinalPages(
      tpl,
      [{ pageIndex: 0, sections: [] }, { pageIndex: 1, sections: [] }],
      {},
      {},
    )
    expect(html).not.toContain('<!DOCTYPE')
    expect(html).not.toContain('<head>')
    expect(html).toContain('data-page="1"')
    expect(html).toContain('data-page="2"')
  })

  it('wrapHtmlDocument 包外壳并支持 body class', () => {
    const html = wrapHtmlDocument('/*c*/', '<section class="print-page"></section>', 'continuous')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<style>/*c*/</style>')
    expect(html).toContain('<body class="continuous">')
    expect(html).toContain('<section class="print-page"></section>')
  })
})
```

（import 行补 `renderFinalPages, wrapHtmlDocument` 与 `TemplateData` 类型，跟随该文件既有 import 风格。）

- [ ] **Step 4: 实现 buildBatchPageCss**

在 `css-builder.ts` 末尾追加：

```ts
/** 份间强制分页：覆盖每份最后一个 .print-page 的 page-break-after:auto */
const COPY_BREAK_CSS =
  '.print-copy:not(:last-child){break-after:page;page-break-after:always;}'

/**
 * 批量（多份）文档 CSS。
 * - 固定纸：各份 @page 相同，共用 buildPageCss，仅追加份间分页；
 * - 连续纸：每份纸高独立推导，用命名页 @page copyN + 作用域 .print-copy-N
 *   使一个文档内各份输出不同物理页高（Chromium preferCSSPageSize 支持）。
 */
export function buildBatchPageCss(
  template: TemplateData,
  copies: Array<{ heightMm?: number }>,
): string {
  if (template.paperSize !== 'CONTINUOUS') {
    return `${buildPageCss(template)}\n${COPY_BREAK_CSS}`
  }

  const { bottom: mb } = template.margins
  const footerH = template.footer?.height ?? 0
  const base = buildPageCss(template, copies[0]?.heightMm)
  const scoped = copies
    .map((copy, i) => {
      const h = copy.heightMm
      const rules = [`@page copy${i} { size: ${mm(getPaperDimensions(template).width)} ${h ? mm(h) : 'auto'}; margin: 0; }`,
        `.print-copy-${i} { page: copy${i}; }`]
      if (h) {
        rules.push(`.print-copy-${i} .print-page { min-height: ${mm(h)}; }`)
        rules.push(`.print-copy-${i} .page-footer { top: ${mm(h - mb - footerH)}; }`)
      }
      return rules.join('\n')
    })
    .join('\n')
  return `${base}\n${scoped}\n${COPY_BREAK_CSS}`
}
```

- [ ] **Step 5: 写 css-builder 测试**

创建 `src/render/css-builder.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildBatchPageCss } from './css-builder.js'
import type { TemplateData } from './types.js'

function tpl(paperSize: 'A4' | 'CONTINUOUS'): TemplateData {
  return {
    paperSize,
    orientation: 'portrait',
    customWidth: 80,
    margins: { top: 0, right: 0, bottom: 2, left: 0 },
    header: { height: 0, elements: [] },
    footer: { height: 4, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
  } as unknown as TemplateData
}

describe('buildBatchPageCss', () => {
  it('固定纸：单一 @page + 份间分页，无命名页', () => {
    const css = buildBatchPageCss(tpl('A4'), [{}, {}])
    expect(css).toContain('@page {')
    expect(css).toContain('.print-copy:not(:last-child)')
    expect(css).not.toContain('@page copy0')
  })

  it('连续纸：每份命名页尺寸与作用域 min-height/footer top', () => {
    const css = buildBatchPageCss(tpl('CONTINUOUS'), [{ heightMm: 100 }, { heightMm: 200 }])
    expect(css).toContain('@page copy0 { size: 80mm 100mm')
    expect(css).toContain('@page copy1 { size: 80mm 200mm')
    expect(css).toContain('.print-copy-0 { page: copy0; }')
    expect(css).toContain('.print-copy-1 .print-page { min-height: 200mm; }')
    // footer top = 纸高 100 - 下边距 2 - 页脚 4 = 94mm
    expect(css).toContain('.print-copy-0 .page-footer { top: 94mm; }')
    expect(css).toContain('.print-copy:not(:last-child)')
  })
})
```

- [ ] **Step 6: 运行并构建**

Run: `npx vitest run src/render/html-generator.test.ts src/render/css-builder.test.ts`
Expected: PASS。
`npm run build -w @worm-vue3-print/core`
Expected: 成功。

- [ ] **Step 7: 提交**

```bash
git add packages/print-core/src/render/html-generator.ts \
  packages/print-core/src/render/css-builder.ts \
  packages/print-core/src/render/html-generator.test.ts \
  packages/print-core/src/render/css-builder.test.ts
git commit -m "refactor(core): html-generator 拆出页面序列/文档外壳，新增批量页 CSS

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 批量 HTML 合并器（纯字符串）

**Files:**
- Create: `packages/print-core/src/print/batch-compose.ts`
- Test: `packages/print-core/src/print/__tests__/batch-compose.spec.ts`

**Interfaces:**
- Consumes（Task 2 产出）:
  - `renderFinalPages`、`wrapHtmlDocument`（`../../render/html-generator.js`）
  - `buildBatchPageCss`（`../../render/css-builder.js`）
  - `buildPageCss`（`../../render/css-builder.js`，固定纸用）
- Produces（Task 4 消费）:
  - `interface BatchCopyInput { bound: TemplateData; pageLayouts: PageLayout[]; data: Record<string, any>; codeRenderer?: CodeRenderer; derivedHeightMm?: number; paperMm: PaperMm; heightSource: HeightSource }`（`HeightSource` 从 `../types.js` 导入；composeBatchHtml 不读取该字段，仅供 pipeline 入口传递来源）
  - `composeBatchHtml(copies: BatchCopyInput[]): { html: string; pageCount: number; copyPaperMm: PaperMm[] }`
  - `copies.length` 即份数；调用方保证非空。

- [ ] **Step 1: 写失败测试**

创建 `src/print/__tests__/batch-compose.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { composeBatchHtml } from '../batch-compose.js'
import type { BatchCopyInput } from '../batch-compose.js'
import type { TemplateData, PageLayout } from '../../render/types.js'

function tpl(paperSize: 'A4' | 'CONTINUOUS'): TemplateData {
  return {
    paperSize, orientation: 'portrait', customWidth: 80,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
  } as unknown as TemplateData
}

function copy(bound: TemplateData, pages: number, heightMm: number | undefined): BatchCopyInput {
  const pageLayouts: PageLayout[] = Array.from({ length: pages }, (_, i) => ({
    pageIndex: i, sections: [],
  }))
  return {
    bound, pageLayouts, data: {},
    derivedHeightMm: heightMm,
    paperMm: { width: 80, height: heightMm ?? 297 },
    heightSource: heightMm ? 'derived' : 'config',
  }
}

describe('composeBatchHtml', () => {
  it('固定纸：两份合并为一个文档，section 数=2，pageCount 求和', () => {
    const bound = tpl('A4')
    const r = composeBatchHtml([copy(bound, 1, undefined), copy(bound, 3, undefined)])
    expect(r.pageCount).toBe(4)
    expect(r.copyPaperMm).toHaveLength(2)
    expect(r.html).toContain('<!DOCTYPE html>')
    expect(r.html).toContain('<section class="print-copy">')
    expect((r.html.match(/<section class="print-copy">/g) ?? []).length).toBe(2)
    expect(r.html).toContain('data-page="1"')
    expect(r.html).toContain('data-page="3"')
    expect(r.html).not.toContain('@page copy0')
    expect(r.html).toContain('.print-copy:not(:last-child)')
  })

  it('连续纸：每份带索引 class 与命名页，纸高取自各份', () => {
    const bound = tpl('CONTINUOUS')
    const r = composeBatchHtml([copy(bound, 1, 100), copy(bound, 1, 200)])
    expect(r.html).toContain('<section class="print-copy print-copy-0">')
    expect(r.html).toContain('<section class="print-copy print-copy-1">')
    expect(r.html).toContain('@page copy0 { size: 80mm 100mm')
    expect(r.html).toContain('@page copy1 { size: 80mm 200mm')
    expect(r.copyPaperMm).toEqual([{ width: 80, height: 100 }, { width: 80, height: 200 }])
  })

  it('单份批量也强制不额外分页（最后一份 no break）', () => {
    const r = composeBatchHtml([copy(tpl('A4'), 2, undefined)])
    expect((r.html.match(/<section class="print-copy">/g) ?? []).length).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/print/__tests__/batch-compose.spec.ts`
Expected: FAIL（找不到模块 ../batch-compose.js）。

- [ ] **Step 3: 实现合并器**

创建 `src/print/batch-compose.ts`：

```ts
// 批量合并：多份单份渲染产物 → 单个 HTML 文档（纯字符串，不依赖 DOM）。
import { renderFinalPages, wrapHtmlDocument } from '../render/html-generator.js'
import { buildBatchPageCss, buildPageCss } from '../render/css-builder.js'
import type { CodeRenderer, PageLayout, TemplateData } from '../render/types.js'
import type { PaperMm } from './types.js'

export interface BatchCopyInput {
  /** 该份数据绑定后的模板 */
  bound: TemplateData
  pageLayouts: PageLayout[]
  /** 该份原始数据（水印层使用） */
  data: Record<string, any>
  codeRenderer?: CodeRenderer
  /** 连续纸探针推导出的纸高（mm）；固定纸为 undefined */
  derivedHeightMm?: number
  paperMm: PaperMm
  /** 纸高来源（透传，合并器不使用） */
  heightSource: HeightSource
}

/**
 * 将多份单份产物合并为一个 HTML 文档；份间强制分页。
 * 同模板各份纸张宽度/边距一致，固定纸共用单一 @page；连续纸走命名页。
 */
export function composeBatchHtml(copies: BatchCopyInput[]): {
  html: string
  pageCount: number
  copyPaperMm: PaperMm[]
} {
  const bound = copies[0].bound
  const continuous = bound.paperSize === 'CONTINUOUS'

  const bodyInner = copies
    .map((copy, i) => {
      const cls = continuous ? `print-copy print-copy-${i}` : 'print-copy'
      const pages = renderFinalPages(copy.bound, copy.pageLayouts, copy.data, {
        codeRenderer: copy.codeRenderer,
        pageHeightMm: copy.derivedHeightMm,
      })
      return `<section class="${cls}">\n${pages}\n</section>`
    })
    .join('\n')

  const css = continuous
    ? buildBatchPageCss(bound, copies.map(c => ({ heightMm: c.derivedHeightMm })))
    : `${buildPageCss(bound)}\n.print-copy:not(:last-child){break-after:page;page-break-after:always;}`

  return {
    html: wrapHtmlDocument(
      css,
      bodyInner,
      continuous ? 'continuous' : undefined,
    ),
    pageCount: copies.reduce((sum, c) => sum + c.pageLayouts.length, 0),
    copyPaperMm: copies.map(c => c.paperMm),
  }
}
```

- [ ] **Step 4: 运行测试 + 构建**

Run: `npx vitest run src/print/__tests__/batch-compose.spec.ts`
Expected: PASS（3 用例）。
`npm run build -w @worm-vue3-print/core`
Expected: 成功。

- [ ] **Step 5: 提交**

```bash
git add packages/print-core/src/print/batch-compose.ts \
  packages/print-core/src/print/__tests__/batch-compose.spec.ts
git commit -m "feat(core): 新增多份 HTML 纯字符串合并器（份间分页/连续纸命名页）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: pipeline 批量分流与类型放宽

**Files:**
- Modify: `packages/print-core/src/print/pipeline.ts`（拆 `prepareSingleWithSession`，三入口分流）
- Modify: `packages/print-core/src/print/types.ts`（`PrintJob.printData` 放宽；`PreparedDocument` 增 `copies`/`copyPaperMm`）
- Modify: `packages/print-core/src/render/types.ts`（`RenderRequest.printData` 放宽）
- Modify: `packages/print-core/src/render/data-binder.ts:11-17`（bindData 收敛单对象、删 raw[0]）
- Modify（按需）: `packages/print-core/src/render/data-binder.test.ts`（删数组降级用例）
- Modify: `packages/print-core/src/print/index.ts`（导出归一函数/类型与合并器）
- Test: `packages/print-core/src/print/__tests__/pipeline.spec.ts`（追加批量用例）

**Interfaces:**
- Consumes: Task 1 `normalizePrintData`/`PrintDataInput`；Task 3 `composeBatchHtml`/`BatchCopyInput`。
- Produces:
  - `PreparedDocument` 增 `copies: number`（single=1）、`copyPaperMm?: PaperMm[]`（仅 batch）。
  - `prepareDocument`/`renderPdf`/`renderScreenshot` 接受数组 printData；`BrowserRenderResult`（Task 5）与 SDK 透传依赖。

- [ ] **Step 1: 放宽类型**

`src/print/types.ts`：顶部 `import type { PrintDataInput } from './normalize-print-data.js'`；`PrintJob.printData?: PrintDataInput`；`PreparedDocument` 增：

```ts
  /** 份数：单对象=1，数组=数组长度 */
  copies: number
  /** 批量时每份的物理纸张尺寸（连续纸各份高度不同）；单份无此字段 */
  copyPaperMm?: PaperMm[]
```

`src/render/types.ts`：`RenderRequest.printData?: PrintDataInput`（顶部 `import type { PrintDataInput } from '../print/normalize-print-data.js'`）。

`src/render/data-binder.ts`：形参 `printData?: Record<string, any>`，函数体首行改 `const data = printData ?? {}`（删 `Array.isArray(raw) ? raw[0] : raw`）。若 `data-binder.test.ts` 有数组取首项用例，删除该用例。

- [ ] **Step 2: 重构 pipeline.ts**

把现有 `prepareWithSession(job, session)` 整体改名为 `prepareSingleWithSession(job, session, data: Record<string, any>)`，函数体内所有 `job.printData` 引用替换为 `data`（共 4 处：bindData 调用、连续纸分支的 generateHtml、buildHtmlWithCodes 内三处 generateHtml——通过让 buildHtmlWithCodes 增加 data 参数透传，签名改为 `buildHtmlWithCodes(input & { data: Record<string, any> })`，内部不再读 `input.job.printData`）。

返回类型扩展为内部结构（在 PreparedDocument 基础上加批量合并所需中间件）：

```ts
interface SinglePrepared extends PreparedDocument {
  bound: TemplateData
  codeRenderer?: CodeRenderer
  derivedHeightMm?: number
}
```

`prepareSingleWithSession` 返回时在现有返回对象上补：`copies: 1`、`bound`、`codeRenderer: finalBuild.codeRenderer`、`derivedHeightMm: derivedHeightMm`。

新增批量准备与入口分流（替换原 `prepareDocument` 实现，renderPdf 同理）：

```ts
export async function prepareDocument(job: PrintJob, runtime: PrintRuntime): Promise<PreparedDocument> {
  return runtime.withSession(job, session => prepareWithSession(job, session))
}

async function prepareWithSession(job: PrintJob, session: PrintSession): Promise<PreparedDocument> {
  const normalized = normalizePrintData(job.printData)
  if (normalized.mode === 'single') {
    const single = await prepareSingleWithSession(job, session, normalized.data)
    return toPreparedDocument(single)
  }
  const copies: BatchCopyInput[] = []
  for (let i = 0; i < normalized.dataList.length; i++) {
    try {
      const single = await prepareSingleWithSession(job, session, normalized.dataList[i])
      copies.push({
        bound: single.bound,
        pageLayouts: single.pageLayouts,
        data: normalized.dataList[i],
        codeRenderer: single.codeRenderer,
        derivedHeightMm: single.derivedHeightMm,
        paperMm: single.paperMm,
        heightSource: single.heightSource,
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`第 ${i + 1} 份渲染失败：${reason}`)
    }
  }
  const merged = composeBatchHtml(copies)
  return {
    html: merged.html,
    pageCount: merged.pageCount,
    paperMm: copies[0].paperMm,
    continuous: copies[0].bound.paperSize === 'CONTINUOUS',
    // 同模板同参数各份来源必然一致；不能用 derivedHeightMm 是否存在判断——
    // 连续纸逃生门时该字段有值但来源是 config
    heightSource: copies[0].heightSource,
    // 各份 pageIndex 均从 0 开始，批量拼接后该字段仅作调试用途
    pageLayouts: copies.flatMap(c => c.pageLayouts),
    copies: copies.length,
    copyPaperMm: merged.copyPaperMm,
  }
}

/** 批量内部结构 → 对外 PreparedDocument（剥离中间件，补 copies=1） */
function toPreparedDocument(s: SinglePrepared): PreparedDocument {
  return {
    html: s.html,
    pageCount: s.pageCount,
    paperMm: s.paperMm,
    continuous: s.continuous,
    heightSource: s.heightSource,
    pageLayouts: s.pageLayouts,
    copies: 1,
  }
}
```

`renderPdf` 内把 `prepareWithSession(job, session)` 调用保留（它现在内部已分流）；toPdf 规格用合并后 `prepared.paperMm`（首份尺寸兜底，真实尺寸由 @page 决定），其余不动。

`renderScreenshot`：分流，数组时取第一条：

```ts
const normalized = normalizePrintData(job.printData)
const data = normalized.mode === 'batch' ? normalized.dataList[0] : normalized.data
const bound = bindData(job.templateJson, data, job.baseUrl)
```
（其余截图逻辑不变；在函数上方加注释：截图仅渲染首条数据。）

文件顶部新增 import：

```ts
import { normalizePrintData } from './normalize-print-data.js'
import { composeBatchHtml } from './batch-compose.js'
import type { BatchCopyInput } from './batch-compose.js'
```

- [ ] **Step 3: 导出公共能力**

`src/print/index.ts` 增：

```ts
export * from './normalize-print-data.js'
export * from './batch-compose.js'
```

- [ ] **Step 4: 先跑现有测试确认单份零回归**

Run（在 `packages/print-core`）: `npx vitest run src/print/__tests__/pipeline.spec.ts src/render/data-binder.test.ts`
Expected: 现有用例全部 PASS，断言不改（result.copies 新字段不影响既有断言）。

- [ ] **Step 5: 追加 pipeline 批量用例（失败→已实现应直接通过，作为行为锁定）**

在 `src/print/__tests__/pipeline.spec.ts` 末尾追加：

```ts
describe('批量 printData（数组）', () => {
  it('对象入参 copies=1 且无 copyPaperMm', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    const result = await prepareDocument({ templateJson: template(), printData: { x: 1 } }, runtime)
    expect(result.copies).toBe(1)
    expect(result.copyPaperMm).toBeUndefined()
  })

  it('2 条数组：合并为一个文档，copies=2，pageCount 为各份之和', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    const result = await prepareDocument(
      { templateJson: template(), printData: [{ x: 1 }, { x: 2 }] },
      runtime,
    )
    expect(result.copies).toBe(2)
    expect(result.copyPaperMm).toHaveLength(2)
    expect(result.pageCount).toBe(2)
    expect((result.html.match(/<section class="print-copy">/g) ?? []).length).toBe(2)
    expect(result.html).toContain('.print-copy:not(:last-child)')
  })

  it('空数组抛中文错误', async () => {
    const { runtime } = runtimeOf()
    await expect(
      prepareDocument({ templateJson: template(), printData: [] }, runtime),
    ).rejects.toThrow('批量打印数据必须是非空对象数组')
  })

  it('数组含非对象项报告项序号', async () => {
    const { runtime } = runtimeOf()
    await expect(
      prepareDocument(
        { templateJson: template(), printData: [{}, null] as unknown as Record<string, unknown>[] },
        runtime,
      ),
    ).rejects.toThrow('批量打印数据第 2 项必须是对象')
  })

  it('连续纸 2 份：输出命名页与两份不同纸高', async () => {
    const { runtime } = runtimeOf({
      measurements: [{ id: 'a', heightPx: 38 }],
      contentBottomPx: 76,
    })
    const result = await prepareDocument(
      { templateJson: template({ paperSize: 'CONTINUOUS', customWidth: 80 }), printData: [{}, {}] },
      runtime,
    )
    expect(result.copies).toBe(2)
    expect(result.html).toContain('print-copy print-copy-0')
    expect(result.html).toContain('@page copy1')
    expect(result.copyPaperMm?.[0].height).toBe(result.copyPaperMm?.[1].height)
  })

  it('某一份失败时错误带份序（第 2 份）', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    // 第二次进入测量会话时让驱动抛错
    let measureCalls = 0
    fake.onMeasure = () => {
      measureCalls += 1
      if (measureCalls === 2) throw new Error('模拟测量失败')
    }
    await expect(
      prepareDocument({ templateJson: template(), printData: [{}, {}] }, runtime),
    ).rejects.toThrow(/第 2 份渲染失败：模拟测量失败/)
  })
})
```

若 `fake-driver.ts` 没有 `onMeasure` 钩子（实现时读 `src/print/__tests__/fake-driver.ts` 确认），则该用例改为传 501 份数组触发上限错误来锁定错误传播路径；优先用 fake-driver 现有钩子实现，不为此修改 fake 生产行为。

- [ ] **Step 6: 全量 core 测试 + 构建**

Run: `npm run test -w @worm-vue3-print/core`
Expected: 全部 PASS。
Run: `npm run build -w @worm-vue3-print/core`
Expected: 成功。

- [ ] **Step 7: 提交**

```bash
git add packages/print-core
git commit -m "feat(core): 管线支持 printData 数组批量渲染，合并单文档并强制份间分页

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: 浏览器入口与 canvas 预览组件

**Files:**
- Modify: `packages/print-core/src/browser/browser-pagination.ts`（删强转，BrowserRenderResult 增 copies/copyPaperMm）
- Modify: `packages/print-canvas/src/components/PrintHtmlPreview.vue`（emit copies）

**Interfaces:**
- Consumes: Task 4 的 `PreparedDocument.copies/copyPaperMm`。
- Produces: `BrowserRenderResult` 增 `copies: number`、`copyPaperMm?: { width: number; height: number }[]`；`PrintHtmlPreview` 的 `rendered` 事件变为 `[pageCount: number, copies: number]`。

- [ ] **Step 1: 修 browser-pagination.ts**

`src/browser/browser-pagination.ts`：

`BrowserRenderResult` 接口增：

```ts
  /** 份数（对象数据=1；数组=数组长度） */
  copies: number
  /** 批量时每份纸张尺寸（连续纸各份高度可能不同） */
  copyPaperMm?: { width: number; height: number }[]
```

`BrowserRenderOptions` 不动。`renderHtmlPages` 中把 job 构造改为直接透传（删除 :42 的 `as Record<string, any> | undefined` 强转，printData 形参类型已是联合，与 PrintJob.printData 新类型一致）；返回值补：

```ts
    copies: prepared.copies,
    copyPaperMm: prepared.copyPaperMm,
```

- [ ] **Step 2: 构建 core 并跑浏览器侧测试**

Run: `npm run build -w @worm-vue3-print/core`
Run（在 `packages/print-core`）: `npx vitest run src/browser`
Expected: 通过。

- [ ] **Step 3: canvas PrintHtmlPreview 透出 copies**

`packages/print-canvas/src/components/PrintHtmlPreview.vue`：

- emits 类型改：`rendered: [pageCount: number, copies: number]`。
- `rerender()` 内 `emit('rendered', pageCount)` 改 `emit('rendered', pageCount, result.copies)`（renderHtmlPages 解构补 copies）。
- 不改 props（printData 联合类型已存在）。

检查 canvas 包内对 `@rendered` 的其它消费（grep `@rendered`、`onRendered`），若有只收一个参数的调用方无需改（第二参向后兼容）；demo 在 Task 9 消费 copies。

- [ ] **Step 4: canvas 测试与构建**

Run: `npm run test -w @worm-vue3-print/canvas`
Expected: 全过（不新增组件测试；若有 PrintHtmlPreview 相关 spec 断言 emit 参数数，按新签名补第二个参数 1）。
Run: `npm run build -w @worm-vue3-print/canvas`
Expected: 成功。

- [ ] **Step 5: 提交**

```bash
git add packages/print-core/src/browser packages/print-canvas
git commit -m "feat(canvas): 浏览器渲染结果透出份数，预览组件 rendered 回传 copies

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: SDK 协议放宽与 Electron 入参校验

**Files:**
- Modify: `packages/print-client-sdk/src/protocol.ts:100`（`PrintSubmitRequest.printData` 联合类型）
- Modify: `packages/print-client-sdk/src/print-client.ts:67-83`（`print()` 形参联合类型）
- Modify: `clients/print-client/src/main/request-validation.ts`（`PrintSubmitSpec.printData` 类型 + 数组校验）
- Test: `packages/print-client-sdk/src/protocol.test.ts`（追加透传用例，若该文件形态适合）
- Test: `clients/print-client/src/main/request-validation.test.ts`（数组合法/空数组/501/非对象项）

**Interfaces:**
- Consumes: core 导出的 `MAX_BATCH_COPIES`（Electron 包可 import core，协议包 SDK 不依赖 core——SDK 只放宽类型，不引入常量）。
- Produces: 三通道契约：`printData?: Record<string, unknown> | Array<Record<string, unknown>>`。

- [ ] **Step 1: SDK 类型放宽**

`packages/print-client-sdk/src/protocol.ts`：

```ts
  printData?: Record<string, unknown> | Array<Record<string, unknown>>
```

`packages/print-client-sdk/src/print-client.ts` 的 `print()` 第二参同步：

```ts
    printData?: Record<string, unknown> | Array<Record<string, unknown>>,
```

（不改 printHtml：HTML 通道无 printData。）

- [ ] **Step 2: 先写 Electron 校验失败测试**

在 `clients/print-client/src/main/request-validation.test.ts` 已有的 print.submit 用例旁追加（按该文件既有构造请求的辅助风格；以下断言假设存在 `parsePrintSubmit(raw)` 与 invalid 抛错断言，实现时跟随现有写法）：

```ts
it('printData 数组合法时透传', () => {
  const spec = parsePrintSubmit({
    templateJson: {},
    printData: [{ a: 1 }, { a: 2 }],
    print: {},
  })
  expect(Array.isArray(spec.printData)).toBe(true)
  expect(spec.printData).toHaveLength(2)
})

it('printData 空数组拒绝', () => {
  expect(() => parsePrintSubmit({ templateJson: {}, printData: [], print: {} }))
    .toThrow('批量打印数据必须是非空对象数组')
})

it('printData 超过 500 份拒绝并报告份数', () => {
  const list = Array.from({ length: 501 }, () => ({}))
  expect(() => parsePrintSubmit({ templateJson: {}, printData: list, print: {} }))
    .toThrow('批量打印最多支持 500 份，当前 501 份')
})

it('printData 数组含非对象项拒绝并报告项序号', () => {
  expect(() => parsePrintSubmit({ templateJson: {}, printData: [{}, 1], print: {} }))
    .toThrow('批量打印数据第 2 项必须是对象')
})
```

- [ ] **Step 3: 实现 Electron 校验**

`clients/print-client/src/main/request-validation.ts`：

a) 文件顶部：`import { MAX_BATCH_COPIES } from '@worm-vue3-print/core'`（确认该包已依赖 core；若 client 仅经 dist 消费，导入路径用既有 core 导入风格）。

b) `PrintSubmitSpec.printData` 类型改：

```ts
  printData?: Record<string, unknown> | Array<Record<string, unknown>>
```

c) 替换现有 :131-136 的 printData 分支为：

```ts
  if (raw.printData !== undefined) {
    spec.printData = parsePrintData(raw.printData)
  }
```

d) 文件内新增（放在 isRecord 等辅助函数附近）：

```ts
function parsePrintData(
  value: unknown,
): Record<string, unknown> | Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    if (value.length === 0) invalid('批量打印数据必须是非空对象数组')
    if (value.length > MAX_BATCH_COPIES) {
      invalid(`批量打印最多支持 ${MAX_BATCH_COPIES} 份，当前 ${value.length} 份`)
    }
    for (let i = 0; i < value.length; i++) {
      if (!isRecord(value[i])) invalid(`批量打印数据第 ${i + 1} 项必须是对象`)
    }
    return value as Array<Record<string, unknown>>
  }
  if (!isRecord(value)) invalid('printData 必须是对象或数组')
  return value
}
```

- [ ] **Step 4: print-engine 透传确认（预期零改动）**

读 `clients/print-client/src/main/print-engine.ts:113-129`，确认 `produceFromTemplate` 把 `spec.printData` 原样放入 PrintJob；类型已是联合，无需改逻辑。若 TS 报错，仅做类型对齐。

- [ ] **Step 5: 运行测试与 typecheck**

Run: `npm run test -w @worm-vue3-print/print-client`（仅 request-validation 相关；若该 workspace test 脚本跑全量则全跑）
Run: `npm exec -w @worm-vue3-print/client vitest run -- src/protocol.test.ts src/print-client.test.ts`
Run: `npm run typecheck -w @worm-vue3-print/client`
Expected: 全过。

- [ ] **Step 6: 提交**

```bash
git add packages/print-client-sdk clients/print-client/src/main/request-validation.ts \
  clients/print-client/src/main/request-validation.test.ts
git commit -m "feat(client): 静默打印协议接受 printData 数组并按上限校验

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: render 服务入参校验

**Files:**
- Modify: `services/print-render/src/server.ts`（/render/pdf 与 /render/screenshot 的 body 校验）
- 文档: `services/print-render/README.md`（printData 数组语义，一小节）

**Interfaces:**
- Consumes: core 导出的 `RenderRequest`（printData 已为联合）与 `MAX_BATCH_COPIES`。
- Produces: 非法数组返回 400 `INVALID_REQUEST` + 中文 message。

- [ ] **Step 1: 加校验函数并在两端点使用**

在 `server.ts` 顶部导入区加 `import { MAX_BATCH_COPIES } from '@worm-vue3-print/core'`，在路由前新增：

```ts
/** 校验 printData：对象放行；数组检查非空、上限与每项类型。返回错误信息或 null */
function validatePrintData(printData: unknown): string | null {
  if (printData === undefined || !Array.isArray(printData)) return null
  if (printData.length === 0) return '批量打印数据必须是非空对象数组'
  if (printData.length > MAX_BATCH_COPIES) {
    return `批量打印最多支持 ${MAX_BATCH_COPIES} 份，当前 ${printData.length} 份`
  }
  for (let i = 0; i < printData.length; i++) {
    const item = printData[i]
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return `批量打印数据第 ${i + 1} 项必须是对象`
    }
  }
  return null
}
```

在 `/render/pdf` 现有 templateJson 校验之后插入：

```ts
  const printDataError = validatePrintData(body.printData)
  if (printDataError) {
    res.status(400).json({ code: 'INVALID_REQUEST', message: printDataError })
    return
  }
```

`/render/screenshot` 分支同样插入该校验（截图数组按首条渲染由 core 处理，但非法数组仍拒绝）。

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build -w @worm-vue3-print/render`（若该包无 build 脚本则跳过，跑其 typecheck/lint 既有脚本）
Run: `npm run lint:print-architecture`
Expected: 守卫通过（未在 render 侧引入 DOM 测量/码制/纸高逻辑）。

- [ ] **Step 3: 更新 README**

在 `services/print-render/README.md` 请求体字段说明处补一小段：

```markdown
- `printData`：业务数据，传对象渲染单份；传非空对象数组时按数组长度批量渲染，
  各份数据不同、份间自动分页，合并为同一个 PDF（最多 500 份）。`/render/screenshot`
  传数组时仅渲染第一条数据。
```

- [ ] **Step 4: 提交**

```bash
git add services/print-render/src/server.ts services/print-render/README.md
git commit -m "feat(render): PDF/截图接口校验 printData 数组批量入参

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: render 服务 Playwright 批量集成测试

**Files:**
- Create: `services/print-render/src/batch.integration.test.ts`

**Interfaces:**
- Consumes: Task 1–4 core 能力（`prepareDocument`/`renderPdf` 接受数组）。
- Produces: 无代码产出，验证真实 Chromium 下合并文档与命名页可生成 PDF。

说明：render 仓现有测试不解析 PDF 内部页面尺寸（无 PDF 解析依赖，不新增），因此连续纸「物理页高不同」在本层通过 `prepared.copyPaperMm` 与合并 HTML 中的命名页规则断言；真实出纸效果列入人工验证（Task 9）。

- [ ] **Step 1: 写集成测试**

创建 `services/print-render/src/batch.integration.test.ts`（runtime 构造方式照搬 `continuous.integration.test.ts:24-27`）：

```ts
// 端到端：printData 数组 → core 批量合并 → Playwright 出单个 PDF
import { describe, it, expect } from 'vitest'
import {
  prepareDocument,
  renderPdf as coreRenderPdf,
  createDomHostRuntime,
} from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

function fixedTemplate(): PrintTemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [
      { id: 't1', type: 'text', options: { left: 0, top: 0, width: 60, height: 8, formatter: '{title}' } },
    ],
  } as PrintTemplateData
}

function continuousTemplate(): PrintTemplateData {
  return {
    paperSize: 'CONTINUOUS',
    orientation: 'portrait',
    customWidth: 80,
    margins: { top: 2, right: 2, bottom: 2, left: 2 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [
      { id: 't1', type: 'text', options: { left: 0, top: 0, width: 60, height: 8, formatter: '{title}' } },
    ],
  } as PrintTemplateData
}

// 第二份数据塞足够多的元素，迫使连续纸推导出更高纸高
function tallContinuousTemplate(): PrintTemplateData {
  const elements = Array.from({ length: 40 }, (_, i) => ({
    id: `t${i}`,
    type: 'text',
    options: { left: 0, top: i * 6, width: 60, height: 5, formatter: `行${i}` },
  }))
  return { ...continuousTemplate(), elements } as PrintTemplateData
}

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

describe('批量打印（printData 数组）', () => {
  it('固定纸 2 份：copies=2，HTML 含两个 print-copy，合成一个 PDF', async () => {
    const job = {
      templateJson: fixedTemplate(),
      printData: [{ title: '第一份' }, { title: '第二份' }],
    }
    const prepared = await prepareDocument(job, runtime)
    expect(prepared.copies).toBe(2)
    expect(prepared.copyPaperMm).toHaveLength(2)
    expect((prepared.html.match(/<section class="print-copy">/g) ?? []).length).toBe(2)
    expect(prepared.html).toContain('.print-copy:not(:last-child)')

    const { pdf } = await coreRenderPdf(job, runtime)
    expect(Buffer.from(pdf.subarray(0, 4)).toString('latin1')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
  }, 60000)

  it('连续纸 2 份：命名页尺寸不同，各份 class 带索引', async () => {
    const prepared = await prepareDocument(
      {
        templateJson: tallContinuousTemplate(),
        printData: [{}, {}],
      },
      runtime,
    )
    expect(prepared.copies).toBe(2)
    expect(prepared.continuous).toBe(true)
    expect(prepared.html).toContain('print-copy print-copy-0')
    expect(prepared.html).toContain('print-copy print-copy-1')
    expect(prepared.copyPaperMm?.[0].height).toBeGreaterThanOrEqual(25.4)
    // 同一模板两份内容相同，此用例只锁定命名页机制；纸高差异在 HTML 规则中可见
    expect(prepared.html).toMatch(/@page copy0 \{ size: 80mm [\d.]+mm/)
    expect(prepared.html).toMatch(/@page copy1 \{ size: 80mm [\d.]+mm/)

    const { pdf } = await coreRenderPdf(
      { templateJson: tallContinuousTemplate(), printData: [{}, {}] },
      runtime,
    )
    expect(Buffer.from(pdf.subarray(0, 4)).toString('latin1')).toBe('%PDF')
  }, 60000)

  it('空数组被拒绝', async () => {
    await expect(
      prepareDocument({ templateJson: fixedTemplate(), printData: [] }, runtime),
    ).rejects.toThrow('批量打印数据必须是非空对象数组')
  }, 30000)
})
```

- [ ] **Step 2: 运行集成测试**

先确保 core 已构建（render 经 dist 消费）：`npm run build -w @worm-vue3-print/core`
Run: `npm run test -w @worm-vue3-print/render`
Expected: 新增 3 用例与既有用例全部 PASS。若浏览器未安装，先 `npx playwright install chromium`（在 services/print-render 目录）。

- [ ] **Step 3: 连续纸失败的处置（条件步骤）**

若第二个用例 `coreRenderPdf` 阶段报错（命名页不被 Chromium PDF 接受）或 HTML 不含命名页规则：**停止执行**，回到本计划与 spec 的连续纸退路——在 pipeline 连续纸批量路径改为「各份独立 toPdf、调用方顺序拼接」，先报告问题再继续，不要静默改测试断言。

- [ ] **Step 4: 提交**

```bash
git add services/print-render/src/batch.integration.test.ts
git commit -m "test(render): printData 数组批量渲染与连续纸命名页集成测试

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: demo 回收为数组 API 示例与全量验收

**Files:**
- Delete: `demo/src/batch-render.ts`
- Delete: `demo/src/components/BatchPrintPreview.vue`
- Modify: `demo/src/App.vue`（批量分支改用 canvas `PrintHtmlPreview` 直传数组）
- 保留: `demo/src/batch-data.ts`

**Interfaces:**
- Consumes: Task 5 的 `PrintHtmlPreview` rendered 第二参 copies；`PrintHtmlPreview` props 已支持数组。

- [ ] **Step 1: App.vue 批量分支切换到标准组件**

`demo/src/App.vue`：

a) 删除 `import BatchPrintPreview ...`、`batchPreviewRef`、`renderBatchInBrowser` 相关残留（上一轮实现只在被删组件中引用，确认 App.vue 无该 import）。

b) 模板中 `<PrintHtmlPreview v-if="previewMode === 'single'">` 与 `<BatchPrintPreview v-else>` 两个分支合并为同一个组件，用 computed 数据切换：

```vue
          <PrintHtmlPreview
            ref="htmlPreviewRef"
            :template-json="previewTemplateJson"
            :print-data="previewPrintData"
            :base-url="RENDER_BASE_URL"
            @rendered="onPreviewRendered"
          />
```

c) script 调整：

```ts
import { ref, computed } from 'vue'
// 删除 BatchPrintPreview 导入；batch-data 的 BATCH_SIZE/deriveBatchData 保留

const previewMode = ref<'single' | 'batch'>('single')
const batchDataList = deriveBatchData(DEFAULT_DEMO_DATA as unknown as Record<string, any>)
/** 单份传对象、批量传数组——由 core 自动识别份数 */
const previewPrintData = computed(() =>
  previewMode.value === 'batch'
    ? batchDataList
    : (DEFAULT_DEMO_DATA as unknown as Record<string, any>),
)

function onPreviewRendered(pageCount: number, copies: number) {
  previewPages.value = pageCount
  previewCopies.value = copies
}
```

新增 `const previewCopies = ref(1)`；`onPreview` 重置时置 `previewCopies.value = 1`。

`printPreview()` 回到单 ref 调用：`htmlPreviewRef.value?.print()`（删除 batch 分发）。

副标题改：

```vue
<span class="preview-subtitle" v-if="previewPages > 0">
  {{ previewCopies > 1 ? `共 ${previewCopies} 份 · ` : '' }}{{ previewPages }} 页
</span>
```

分段切换按钮文案 `批量预览（{{ BATCH_SIZE }} 份模拟数据）` 与单份按钮、样式块全部保留。

- [ ] **Step 2: 删除废弃文件并 typecheck**

```bash
git rm demo/src/batch-render.ts demo/src/components/BatchPrintPreview.vue
```

Run（在 `demo/`）: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 3: demo 端到端实测（临时 Playwright 脚本，用后即删）**

后台启动：在 `demo/` 执行 `npx vite --port 9303 --no-open`（后台任务）。创建 `demo/verify-core-batch.mjs`（完整内容如下；复用仓库根 Playwright 与已缓存 chromium-1228，Playwright 1.63 默认查找的 headless shell 未安装，故必须显式传 executablePath）：

```js
// 用后即删：验证 core printData 数组批量能力在 demo 预览链路端到端可用。
// 在 demo/ 目录执行：node verify-core-batch.mjs
import { chromium } from '../node_modules/playwright/index.mjs'
import { homedir } from 'node:os'

const EXECUTABLE_PATH =
  `${homedir()}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/` +
  'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const BASE = 'http://localhost:9303'
// 与 demo/src/batch-data.ts 的三组供应商一一对应
const SUPPLIERS = ['鑫达五金有限公司', '恒泰机电设备有限公司', '瑞安钢材贸易有限公司']

function assert(cond, msg) {
  if (!cond) throw new Error(`断言失败：${msg}`)
}

const browser = await chromium.launch({ executablePath: EXECUTABLE_PATH, headless: true })
try {
  const page = await browser.newPage()
  // 「加载默认布局」前的 confirm 对话框自动确认
  page.on('dialog', (d) => d.accept())

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '加载默认布局' }).click()
  await page.getByRole('button', { name: '预览' }).click()
  await page.waitForSelector('.preview-panel', { timeout: 10000 })

  await page.getByRole('button', { name: /批量预览/ }).click()

  // 等 iframe 内第 3 份渲染出来（模板渲染 + 码值收集较慢，给 60s）
  const frameEl = await page.waitForSelector('.preview-panel iframe', { timeout: 10000 })
  const frame = await frameEl.contentFrame()
  await frame.waitForSelector('section.print-copy:nth-of-type(3)', { timeout: 60000 })

  const copies = await frame.$$eval('section.print-copy', (nodes) =>
    nodes.map((n) => n.textContent ?? ''),
  )
  assert(copies.length === 3, `应有 3 个 print-copy，实际 ${copies.length}`)
  // 每份只含自己的供应商，不含另外两家（防止拼接串份/丢份）
  copies.forEach((text, i) => {
    assert(text.includes(SUPPLIERS[i]), `第 ${i + 1} 份缺少供应商 ${SUPPLIERS[i]}`)
    SUPPLIERS.forEach((name, j) => {
      if (j !== i) assert(!text.includes(name), `第 ${i + 1} 份串入了 ${name}`)
    })
  })

  const subtitle = (await page.locator('.preview-subtitle').textContent()) ?? ''
  assert(/共 3 份 · 14 页/.test(subtitle), `副标题不符：${subtitle.trim()}`)

  // print 媒体下：前两份强制翻页，最后一份不翻
  await page.emulateMedia({ media: 'print' })
  const breaks = await frame.evaluate(() =>
    [...document.querySelectorAll('section.print-copy')].map(
      (n) => getComputedStyle(n).breakAfter,
    ),
  )
  assert(breaks[0] === 'page', `第 1 份 break-after 应为 page，实际 ${breaks[0]}`)
  assert(breaks[2] !== 'page', `第 3 份 break-after 不应为 page，实际 ${breaks[2]}`)

  console.log('全部断言通过：3 份 · 14 页 · 份间分页正确')
} finally {
  await browser.close()
}
```

Run（在 `demo/`）: `node verify-core-batch.mjs`
Expected: 输出 `全部断言通过：3 份 · 14 页 · 份间分页正确`。完成后 `rm demo/verify-core-batch.mjs` 并停掉后台 vite。若供应商/页数断言失败，先确认 `demo/src/batch-data.ts` 的派生规则未被改动（8/20/50 行 → 2/4/8 页）。

- [ ] **Step 4: 提交 demo 回收**

```bash
git add demo
git commit -m "refactor(demo): 批量预览改用 core 数组能力，移除应用层拼接实现

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [ ] **Step 5: 全量验收**

```bash
npm run build
npm test
npm run lint:print-architecture
npm run test -w @worm-vue3-print/render
```

Expected: 全量构建顺序成功；core/canvas/client-sdk/print-client 单测全过；架构守卫通过；render 集成测试（含 batch.integration）全过。任何失败必须修复后重跑，不得带红收尾。

- [ ] **Step 6: 人工验证项（报告给用户，不阻塞提交）**

以下无法自动化，完成后在交付说明中列出，请用户本机确认：
- demo 批量预览点「打印」，系统打印对话框中 3 份各自从新页开始；
- 连续纸（80mm 热敏等）多份在真实打印机的页高是否与各份内容匹配（命名页方案的最终物理验证）。

---

## 完成标准对照（spec 覆盖自检）

- 数据契约/上限/中文错误：Task 1 + Task 4 + Task 6 + Task 7。
- pipeline 单份零回归、批量同 session 串行、第 N 份错误包装：Task 4（pipeline.spec 锁定）。
- 纯字符串合并器、固定纸单 @page、连续纸命名页：Task 2/3 单测 + Task 8 真实 Chromium。
- 三端：浏览器 Task 5；render Task 7+8；SDK/Electron Task 6（HTML 通道零改动）。
- demo 回收：Task 9；render README：Task 7 Step 3；全量验收与守卫：Task 9 Step 5。
- 发版号/CHANGELOG：不在本计划执行，交付时提示用户按仓库发版流程另行处理。
