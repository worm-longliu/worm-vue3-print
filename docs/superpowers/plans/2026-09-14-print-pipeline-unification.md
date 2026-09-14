# 打印管线三端同源抽离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把浏览器、服务端、客户端三端「目的相同」的打印逻辑收敛到 `packages/print-core`，三端只保留 driver 级宿主适配。

**Architecture:** core 新增纯 TS 的 `print/` 模块（管线编排、测量归一化、分页、连续纸、纸张解析、出图规格、错误与超时），DOM 相关能力以「driver 契约 + 共享 DOM 宿主 runtime + 三端 driver」实现；服务端用 Playwright driver，客户端用 Electron driver（常驻隐藏窗口 + 顶层文档），浏览器用 iframe driver。

**Tech Stack:** TypeScript、vitest、tsup（core 构建，含新增 IIFE 入口）、Playwright（服务端）、Electron + electron-vite（客户端）、happy-dom（DOM 单测）。

**Spec:** `docs/superpowers/specs/2026-09-14-print-pipeline-unification-design.md`

## Global Constraints

- core 现有导出只增不改：`renderHtmlPages`、`generateHtml`、`paginate`、`browserCodeRenderer` 的签名与行为不变；`renderHtmlPages` 第 4 参数 `CodeRenderer` 的调用方覆盖语义必须保留。
- 静默打印 SDK 协议不变：`print.submit` / `print.submitHtml` 的 payload 与响应结构不动；客户端错误码只能取现有 8 个值（`INVALID_REQUEST`、`UNAUTHORIZED`、`PRINTER_NOT_FOUND`、`PRINTER_OFFLINE`、`BUSY`、`RENDER_TIMEOUT`、`PRINT_FAILED`、`INTERNAL`）。
- 服务端 HTTP 路径、鉴权头 `X-Render-Key`、`/render/pdf` 与 `/render/screenshot` 的导出名与签名（`renderPdf` / `renderScreenshot`）不变。
- core 根入口必须能在 Node 下直接 `import`，模块加载期不得触碰 DOM；core 不引入 Vue/React 依赖。
- core 生成的打印 HTML 保持 mm 绝对定位，`html-generator` / `css-builder` 禁止引入 `vw`、`vh` 等视口单位。
- 单位常量：1mm = 1000µm；1in = 25.4mm = 25400µm；`PX_PER_MM = 3.7795275591`（测量与视口同源）。
- 缺省超时：`timeoutMs` 30000ms、`readinessMs` 5000ms；码制渲染失败必须降级为文本占位，不中断任务。
- PDF 规格固定：边距 0（边距由 core 生成的 HTML padding 控制）、`printBackground: true`、`scale: 1`、`preferCSSPageSize: false`。
- 每个提交只做一件事，提交信息用中文，遵循 `feat(core)：…`、`fix(print-client)：…`、`test(render)：…` 风格。
- 单次文件写入不超过 500 行（仓库 AGENTS.md 要求）。
- 测试命令：core 用 `npm run test -w @worm-vue3-print/core -- <路径>`；服务端用 `npm run test -w @worm-vue3-print/render -- <路径>`；客户端用 `npm run test -w @worm-vue3-print/print-client -- <路径>`。

---

## 文件结构

新增（core，纯逻辑）：

- `packages/print-core/src/print/units.ts` — 单位常量与换算（px/mm/µm/inch）。
- `packages/print-core/src/print/errors.ts` — `PrintFailure`、失败码、`withTimeout`、错误归一化。
- `packages/print-core/src/print/types.ts` — `PaperMm`、`ViewportPx`、`RawMeasurement`、`CodeSpec`、`PrintJob`、`PreparedDocument`、`PdfTargetSpec`、`ScreenshotTargetSpec`。
- `packages/print-core/src/print/paper.ts` — 纸张解析、覆盖逃生门、`paperViewportPx`。
- `packages/print-core/src/print/pdf-spec.ts` — PDF/截图目标规格与 Electron/Playwright 选项映射。
- `packages/print-core/src/print/measure.ts` — `normalizeMeasurements`。
- `packages/print-core/src/print/codes.ts` — 收集型渲染器、映射渲染器、规格合并。
- `packages/print-core/src/print/driver.ts` — `PageDriver`、`ExecutorBundle`、`ExecutorMethod`。
- `packages/print-core/src/print/ports.ts` — `PrintRuntime`、`PrintSession`。
- `packages/print-core/src/print/dom-host-runtime.ts` — `createDomHostRuntime`。
- `packages/print-core/src/print/pipeline.ts` — `prepareDocument`、`renderPdf`、`renderScreenshot`。
- `packages/print-core/src/print/index.ts` — `print/` 子模块出口。
- `packages/print-core/src/browser/dom-executor.ts` — 唯一一份 DOM 执行器（测量/探针/就绪/码制）。
- `packages/print-core/src/browser/driver-iframe.ts` — iframe driver。
- `packages/print-core/src/browser/browser-runtime.ts` — `createBrowserPrintRuntime`。
- `packages/print-core/src/browser/dom-executor.iife.ts` — IIFE 入口（挂载 `globalThis.__wormDom`）。
- `services/print-render/src/driver-playwright.ts` — Playwright driver 工厂。
- `clients/print-client/src/main/driver-electron.ts` — Electron driver 工厂。

修改：

- `packages/print-core/src/browser/browser-pagination.ts` — `renderHtmlPages` 改薄包装（保留签名与第 4 参数覆盖）。
- `packages/print-core/src/browser/browser-code-renderer.ts` — 抽出 `renderCodeSvg` 供执行器复用。
- `packages/print-core/src/index.ts` — 导出 `print/` 公共 API。
- `packages/print-core/package.json`、`packages/print-core/tsup.config.ts` — 新增 IIFE 入口与导出。
- `services/print-render/src/pdf-render.ts` — 内部改调 core 管线，保留导出。
- `services/print-render/package.json`、`package-lock.json` — 移除 `bwip-js`。
- `clients/print-client/src/main/print-engine.ts` — 改调 core 管线与 Electron driver。
- `clients/print-client/electron.vite.config.ts` — 删除 preload worker 入口与 renderer worker 入口。
- `.github/workflows/ci.yml` — render job 步骤调整。

删除：

- `services/print-render/src/barcode-renderer.ts`、`services/print-render/src/barcode-renderer.test.ts`
- `clients/print-client/src/main/paper.ts`、`paper.test.ts`
- `clients/print-client/src/main/render-engine.ts`、`render-engine.test.ts`（`buildWebPrintSettings` 迁至 `print-settings.ts` + 同名测试）
- `clients/print-client/src/main/renderer-pool.ts`、`src/preload/worker-preload.ts`、`src/shared/render-protocol.ts`、`src/worker/*`

---

### Task 1: core 单位与错误基座

**Files:**
- Create: `packages/print-core/src/print/units.ts`
- Create: `packages/print-core/src/print/errors.ts`
- Test: `packages/print-core/src/print/__tests__/units.spec.ts`
- Test: `packages/print-core/src/print/__tests__/errors.spec.ts`

**Interfaces:**
- Consumes: 无（core 内部零依赖）
- Produces: `PX_PER_MM`、`pxToMm(px)`、`mmToPx(mm)`、`millimetersToMicrometers(mm)`、`micrometersToMillimeters(um)`、`millimetersToInches(mm)`；`PrintFailureCode`、`PrintFailure`、`toPrintFailure(err, code, context)`、`withTimeout(task, ms, code, message)`

- [ ] **Step 1: 写失败测试（单位）**

```ts
// packages/print-core/src/print/__tests__/units.spec.ts
import { describe, it, expect } from 'vitest'
import { PX_PER_MM, pxToMm, mmToPx, millimetersToMicrometers, micrometersToMillimeters, millimetersToInches } from '../units.js'

describe('打印单位换算', () => {
  it('毫米转英寸：Electron printToPDF 的 pageSize 单位是英寸', () => {
    expect(millimetersToInches(210)).toBeCloseTo(8.2677165354, 9)
    expect(millimetersToInches(297)).toBeCloseTo(11.6929133858, 9)
  })

  it('毫米与微米互转：协议与任务记录沿用微米', () => {
    expect(millimetersToMicrometers(80)).toBe(80000)
    expect(millimetersToMicrometers(25.4)).toBe(25400)
    expect(micrometersToMillimeters(80000)).toBe(80)
  })

  it('像素与毫米同源：测量换算与视口尺寸使用同一常量', () => {
    expect(PX_PER_MM).toBe(3.7795275591)
    expect(pxToMm(PX_PER_MM)).toBeCloseTo(1, 9)
    expect(mmToPx(210)).toBe(794)
    expect(mmToPx(297)).toBe(1122)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/units.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../units.js"`

- [ ] **Step 3: 实现 units.ts**

```ts
// packages/print-core/src/print/units.ts
/** 96dpi 下 1mm 的 CSS 像素数；浏览器测量与服务端视口必须共用同一常量 */
export const PX_PER_MM = 3.7795275591
/** 1mm = 1000µm（协议与任务记录使用微米） */
export const MICROMETERS_PER_MM = 1000
/** 1in = 25.4mm = 25400µm（Electron printToPDF 的 pageSize 使用英寸） */
export const MM_PER_INCH = 25.4
export const MICROMETERS_PER_INCH = 25400

export function pxToMm(px: number): number {
  return px / PX_PER_MM
}

export function mmToPx(mm: number): number {
  return Math.round(mm * PX_PER_MM)
}

export function millimetersToMicrometers(mm: number): number {
  return Math.round(mm * MICROMETERS_PER_MM)
}

export function micrometersToMillimeters(um: number): number {
  return um / MICROMETERS_PER_MM
}

export function millimetersToInches(mm: number): number {
  return mm / MM_PER_INCH
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/units.spec.ts`
Expected: PASS（3 个用例）

- [ ] **Step 5: 写失败测试（错误与超时）**

```ts
// packages/print-core/src/print/__tests__/errors.spec.ts
import { describe, it, expect } from 'vitest'
import { PrintFailure, toPrintFailure, withTimeout } from '../errors.js'

describe('PrintFailure', () => {
  it('保留失败码与原因', () => {
    const cause = new Error('底层崩了')
    const err = new PrintFailure('PDF_FAILED', '出图失败', cause)
    expect(err.code).toBe('PDF_FAILED')
    expect(err.message).toBe('出图失败')
    expect(err.cause).toBe(cause)
    expect(err).toBeInstanceOf(Error)
  })

  it('已是 PrintFailure 时原样返回，不重复包装', () => {
    const origin = new PrintFailure('INVALID_PAPER', '纸张不合法')
    expect(toPrintFailure(origin, 'INTERNAL', '渲染')).toBe(origin)
  })

  it('普通异常按上下文包装并保留原始信息', () => {
    const err = toPrintFailure(new Error('boom'), 'MEASURE_FAILED', '测量失败')
    expect(err.code).toBe('MEASURE_FAILED')
    expect(err.message).toBe('测量失败：boom')
  })
})

describe('withTimeout', () => {
  it('超时抛指定失败码', async () => {
    const never = new Promise<never>(() => {})
    await expect(withTimeout(never, 10, 'RENDER_TIMEOUT', '渲染超过 10ms')).rejects.toMatchObject({
      code: 'RENDER_TIMEOUT',
      message: '渲染超过 10ms',
    })
  })

  it('按时完成时透传结果并清理定时器', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'INTERNAL', 'x')).resolves.toBe('ok')
  })
})
```

- [ ] **Step 6: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/errors.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../errors.js"`

- [ ] **Step 7: 实现 errors.ts**

```ts
// packages/print-core/src/print/errors.ts
/** core 统一失败分类；各端只做映射，不新增协议码 */
export type PrintFailureCode =
  | 'INVALID_PAPER'
  | 'MEASURE_FAILED'
  | 'RENDER_TIMEOUT'
  | 'PDF_FAILED'
  | 'SCREENSHOT_FAILED'
  | 'UNSUPPORTED_RUNTIME'
  | 'INTERNAL'

export class PrintFailure extends Error {
  readonly code: PrintFailureCode
  readonly cause?: unknown

  constructor(code: PrintFailureCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'PrintFailure'
    this.code = code
    this.cause = cause
  }
}

export function toPrintFailure(err: unknown, fallbackCode: PrintFailureCode, context: string): PrintFailure {
  if (err instanceof PrintFailure) return err
  const detail = err instanceof Error ? err.message : String(err)
  return new PrintFailure(fallbackCode, `${context}：${detail}`, err)
}

export async function withTimeout<T>(
  task: Promise<T>,
  ms: number,
  code: PrintFailureCode,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new PrintFailure(code, message)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
```

- [ ] **Step 8: 运行测试确认通过并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/units.spec.ts src/print/__tests__/errors.spec.ts`
Expected: PASS（6 个用例）

```bash
git add packages/print-core/src/print/units.ts packages/print-core/src/print/errors.ts packages/print-core/src/print/__tests__
git commit -m "feat(core)：新增打印单位换算与失败分类基座"
```

---

### Task 2: core 纸张解析与覆盖逃生门

**Files:**
- Create: `packages/print-core/src/print/types.ts`（仅本文用到的 `PaperMm`、`ViewportPx`、`HeightSource`）
- Create: `packages/print-core/src/print/paper.ts`
- Test: `packages/print-core/src/print/__tests__/paper.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `mmToPx`
- Produces: `PaperMm`、`ViewportPx`、`HeightSource`、`PaperOverride`、`resolvePaperMm(input)`、`paperViewportPx(paper)`、`escapeHeightMm(input)`

- [ ] **Step 1: 写失败测试（用例源自客户端 paper.test.ts，单位改为 mm）**

```ts
// packages/print-core/src/print/__tests__/paper.spec.ts
import { describe, it, expect } from 'vitest'
import { resolvePaperMm, paperViewportPx, escapeHeightMm } from '../paper.js'

const derived = { paperMm: { width: 80, height: 132.5 }, continuous: true }
const plain = { paperMm: { width: 210, height: 297 }, continuous: false }

describe('resolvePaperMm', () => {
  it('普通模板无覆盖：取 core 纸尺寸，来源 config', () => {
    expect(resolvePaperMm(plain)).toEqual({ paperMm: plain.paperMm, heightSource: 'config' })
  })
  it('连续纸无覆盖：采用推导高度，来源 derived', () => {
    expect(resolvePaperMm(derived)).toEqual({ paperMm: derived.paperMm, heightSource: 'derived' })
  })
  it('连续纸显式覆盖高度：来源 config', () => {
    expect(resolvePaperMm({ ...derived, override: { height: 200 } }))
      .toEqual({ paperMm: { width: 80, height: 200 }, heightSource: 'config' })
  })
  it('连续纸同时覆盖宽高：全部覆盖', () => {
    expect(resolvePaperMm({ ...derived, override: { width: 58, height: 200 } }))
      .toEqual({ paperMm: { width: 58, height: 200 }, heightSource: 'config' })
  })
  it('连续纸只覆盖宽度：高度仍用推导值，来源仍 derived', () => {
    expect(resolvePaperMm({ ...derived, override: { width: 58 } }))
      .toEqual({ paperMm: { width: 58, height: 132.5 }, heightSource: 'derived' })
  })
  it('非连续纸覆盖纸型：以覆盖为准，来源 config', () => {
    expect(resolvePaperMm({ ...plain, override: { width: 215.9, height: 279.4 } }))
      .toEqual({ paperMm: { width: 215.9, height: 279.4 }, heightSource: 'config' })
  })
  it('覆盖高度为 0 或负数视为未传', () => {
    expect(resolvePaperMm({ ...derived, override: { height: 0 } }).heightSource).toBe('derived')
    expect(resolvePaperMm({ ...derived, override: { height: -5 } }).paperMm.height).toBe(132.5)
    expect(resolvePaperMm({ ...plain, override: { height: 0 } }).paperMm.height).toBe(297)
  })
})

describe('paperViewportPx', () => {
  it('按同一常量换算，A4 纵向为 794×1122', () => {
    expect(paperViewportPx({ width: 210, height: 297 })).toEqual({ width: 794, height: 1122 })
  })
})

describe('escapeHeightMm', () => {
  it('paperHeightMm 优先于协议覆盖高度', () => {
    expect(escapeHeightMm({ paperHeightMm: 150, override: { height: 200 } })).toBe(150)
  })
  it('未提供或非法时返回 undefined', () => {
    expect(escapeHeightMm({})).toBeUndefined()
    expect(escapeHeightMm({ paperHeightMm: 0, override: { height: -1 } })).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/paper.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../paper.js"`

- [ ] **Step 3: 实现 types.ts 中的纸张类型与 paper.ts**

```ts
// packages/print-core/src/print/types.ts（本任务先落这几个类型，后续任务继续追加）
/** 物理尺寸（毫米）；三端与协议的公共纸尺寸表示 */
export interface PaperMm {
  width: number
  height: number
}

/** 测量容器尺寸（CSS 像素）；浏览器为 iframe 尺寸，服务端为 page viewport */
export interface ViewportPx {
  width: number
  height: number
}

/** 纸高来源：config = 模板/宿主给定，derived = 连续纸探针推导 */
export type HeightSource = 'config' | 'derived'
```

```ts
// packages/print-core/src/print/paper.ts
import { mmToPx } from './units.js'
import type { HeightSource, PaperMm, ViewportPx } from './types.js'

/** 宿主纸张覆盖（mm）；字段为 0 或负数视为未提供 */
export interface PaperOverride {
  width?: number
  height?: number
}

export interface ResolvePaperInput {
  /** core 计算出的纸尺寸：连续纸为探针推导高度，其余为模板纸张 */
  paperMm: PaperMm
  continuous: boolean
  override?: PaperOverride
}

function positive(value: number | undefined): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined
}

/** 连续纸 HTML 纸高逃生门：显式 paperHeightMm 优先于协议覆盖高度 */
export function escapeHeightMm(input: { paperHeightMm?: number; override?: PaperOverride }): number | undefined {
  return positive(input.paperHeightMm) ?? positive(input.override?.height)
}

/**
 * 应用宿主覆盖并给出纸高来源。
 * 连续纸仅覆盖宽度时，高度仍取推导值且来源保持 derived（不可降级为 config）。
 */
export function resolvePaperMm(input: ResolvePaperInput): { paperMm: PaperMm; heightSource: HeightSource } {
  const width = positive(input.override?.width) ?? input.paperMm.width
  const overrideHeight = positive(input.override?.height)
  if (input.continuous) {
    return overrideHeight
      ? { paperMm: { width, height: overrideHeight }, heightSource: 'config' }
      : { paperMm: { width, height: input.paperMm.height }, heightSource: 'derived' }
  }
  return { paperMm: { width, height: overrideHeight ?? input.paperMm.height }, heightSource: 'config' }
}

/** 测量容器尺寸（CSS px）；三端必须使用同一结果 */
export function paperViewportPx(paper: PaperMm): ViewportPx {
  return { width: mmToPx(paper.width), height: mmToPx(paper.height) }
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/paper.spec.ts`
Expected: PASS（11 个用例）

```bash
git add packages/print-core/src/print/types.ts packages/print-core/src/print/paper.ts packages/print-core/src/print/__tests__/paper.spec.ts
git commit -m "feat(core)：新增纸张解析与覆盖逃生门"
```

---

### Task 3: core 出图规格（PDF 与截图）

**Files:**
- Modify: `packages/print-core/src/print/types.ts`（追加 `PdfTargetSpec`、`ScreenshotTargetSpec`、`MarginsMm`）
- Create: `packages/print-core/src/print/pdf-spec.ts`
- Test: `packages/print-core/src/print/__tests__/pdf-spec.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `millimetersToInches`；Task 2 的 `PaperMm`
- Produces: `buildPdfTargetSpec(paperMm)`、`toElectronPrintToPdfOptions(spec)`、`toPlaywrightPdfOptions(spec)`、`buildScreenshotTargetSpec()`

- [ ] **Step 1: 写失败测试（用例源自客户端 pdf-generator.test.ts）**

```ts
// packages/print-core/src/print/__tests__/pdf-spec.spec.ts
import { describe, it, expect } from 'vitest'
import { buildPdfTargetSpec, toElectronPrintToPdfOptions, toPlaywrightPdfOptions, buildScreenshotTargetSpec } from '../pdf-spec.js'

describe('buildPdfTargetSpec', () => {
  it('固定零边距、保留背景、缩放 1、不优先 CSS 纸型', () => {
    expect(buildPdfTargetSpec({ width: 210, height: 297 })).toEqual({
      paperMm: { width: 210, height: 297 },
      marginsMm: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      scale: 1,
      preferCSSPageSize: false,
    })
  })
})

describe('toElectronPrintToPdfOptions', () => {
  it('纸张毫米换算为英寸：printToPDF 的 pageSize 单位是英寸，不是微米', () => {
    const opts = toElectronPrintToPdfOptions(buildPdfTargetSpec({ width: 210, height: 297 }))
    expect(opts.pageSize.width).toBeCloseTo(8.2677165354, 9)
    expect(opts.pageSize.height).toBeCloseTo(11.6929133858, 9)
  })
  it('零边距（英寸）+ 保留背景 + 不优先 CSS 纸型', () => {
    const opts = toElectronPrintToPdfOptions(buildPdfTargetSpec({ width: 80, height: 132.5 }))
    expect(opts.margins).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
    expect(opts.printBackground).toBe(true)
    expect(opts.scale).toBe(1)
    expect(opts.preferCSSPageSize).toBe(false)
  })
  it('连续纸推导高度同样按英寸换算', () => {
    const opts = toElectronPrintToPdfOptions(buildPdfTargetSpec({ width: 80, height: 132.5 }))
    expect(opts.pageSize.height).toBeCloseTo(5.2165354331, 9)
  })
})

describe('toPlaywrightPdfOptions', () => {
  it('显式 mm 宽高 + 零边距 + 保留背景 + 不优先 CSS 纸型', () => {
    expect(toPlaywrightPdfOptions(buildPdfTargetSpec({ width: 80, height: 132.5 }))).toEqual({
      width: '80mm',
      height: '132.5mm',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      printBackground: true,
      preferCSSPageSize: false,
    })
  })
})

describe('buildScreenshotTargetSpec', () => {
  it('PNG、整页、不省略背景', () => {
    expect(buildScreenshotTargetSpec()).toEqual({ type: 'png', fullPage: true, omitBackground: false })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/pdf-spec.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../pdf-spec.js"`

- [ ] **Step 3: 追加类型并实现 pdf-spec.ts**

```ts
// packages/print-core/src/print/types.ts（追加）
export interface MarginsMm {
  top: number
  right: number
  bottom: number
  left: number
}

/** 出图目标规格：与宿主无关，宿主负责翻译成自己的选项 */
export interface PdfTargetSpec {
  paperMm: PaperMm
  marginsMm: MarginsMm
  printBackground: boolean
  scale: number
  preferCSSPageSize: boolean
}

export interface ScreenshotTargetSpec {
  type: 'png'
  fullPage: boolean
  omitBackground: boolean
}
```

```ts
// packages/print-core/src/print/pdf-spec.ts
import { millimetersToInches } from './units.js'
import type { MarginsMm, PaperMm, PdfTargetSpec, ScreenshotTargetSpec } from './types.js'

const ZERO_MARGINS_MM: MarginsMm = { top: 0, right: 0, bottom: 0, left: 0 }

/** 边距恒为零：边距由 core 生成的 HTML padding 控制，避免两层边距叠加 */
export function buildPdfTargetSpec(paperMm: PaperMm): PdfTargetSpec {
  return {
    paperMm,
    marginsMm: { ...ZERO_MARGINS_MM },
    printBackground: true,
    scale: 1,
    preferCSSPageSize: false,
  }
}

/** Electron.PrintToPDFOptions 的最小结构（pageSize/margins 单位均为英寸） */
export interface ElectronPrintToPdfOptions {
  margins: MarginsMm
  pageSize: { width: number; height: number }
  printBackground: boolean
  scale: number
  preferCSSPageSize: boolean
}

export function toElectronPrintToPdfOptions(spec: PdfTargetSpec): ElectronPrintToPdfOptions {
  return {
    margins: { ...spec.marginsMm },
    pageSize: {
      width: millimetersToInches(spec.paperMm.width),
      height: millimetersToInches(spec.paperMm.height),
    },
    printBackground: spec.printBackground,
    scale: spec.scale,
    preferCSSPageSize: spec.preferCSSPageSize,
  }
}

/** Playwright page.pdf 的最小结构（宽高与边距使用 mm 字符串） */
export interface PlaywrightPdfOptions {
  width: string
  height: string
  margin: { top: string; right: string; bottom: string; left: string }
  printBackground: boolean
  preferCSSPageSize: boolean
}

export function toPlaywrightPdfOptions(spec: PdfTargetSpec): PlaywrightPdfOptions {
  const mm = (value: number): string => `${value}mm`
  return {
    width: mm(spec.paperMm.width),
    height: mm(spec.paperMm.height),
    margin: {
      top: mm(spec.marginsMm.top),
      right: mm(spec.marginsMm.right),
      bottom: mm(spec.marginsMm.bottom),
      left: mm(spec.marginsMm.left),
    },
    printBackground: spec.printBackground,
    preferCSSPageSize: spec.preferCSSPageSize,
  }
}

/** Playwright page.screenshot 的最小结构 */
export function buildScreenshotTargetSpec(): ScreenshotTargetSpec {
  return { type: 'png', fullPage: true, omitBackground: false }
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/pdf-spec.spec.ts`
Expected: PASS（6 个用例）

```bash
git add packages/print-core/src/print/types.ts packages/print-core/src/print/pdf-spec.ts packages/print-core/src/print/__tests__/pdf-spec.spec.ts
git commit -m "feat(core)：新增 PDF 与截图目标规格推导"
```

---

### Task 4: core 预测量归一化

**Files:**
- Modify: `packages/print-core/src/print/types.ts`（追加 `RawMeasurement`）
- Create: `packages/print-core/src/print/measure.ts`
- Test: `packages/print-core/src/print/__tests__/measure.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `pxToMm`；`packages/print-core/src/render/types.js` 的 `TemplateData`、`MeasuredElement`
- Produces: `RawMeasurement`、`normalizeMeasurements(raw, template) => Map<string, MeasuredElement>`

- [ ] **Step 1: 写失败测试**

```ts
// packages/print-core/src/print/__tests__/measure.spec.ts
import { describe, it, expect } from 'vitest'
import { normalizeMeasurements } from '../measure.js'
import { PX_PER_MM } from '../units.js'
import type { TemplateData } from '../../render/types.js'

const template = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [
    { id: 'a', type: 'text', options: { left: 0, top: 0, width: 50, height: 10 } },
    { id: 't', type: 'table', options: { left: 0, top: 20, width: 100, height: 40, _repeatHeaderCount: 2 } },
  ],
} as unknown as TemplateData

describe('normalizeMeasurements', () => {
  it('普通元素：像素高度换算为毫米，无行高与重复表头高度', () => {
    const map = normalizeMeasurements([{ id: 'a', heightPx: 38 }], template)
    const a = map.get('a')!
    expect(a.measuredHeight).toBeCloseTo(38 / PX_PER_MM, 9)
    expect(a.measuredRowHeights).toBeUndefined()
    expect(a.repeatHeaderHeight).toBe(0)
  })

  it('表格元素：行高逐行换算，重复表头高度取前 N 行之和', () => {
    const map = normalizeMeasurements(
      [{ id: 't', heightPx: 760, rowHeightsPx: [38, 38, 190, 190] }],
      template,
    )
    const t = map.get('t')!
    expect(t.measuredRowHeights).toEqual([38 / PX_PER_MM, 38 / PX_PER_MM, 190 / PX_PER_MM, 190 / PX_PER_MM])
    expect(t.repeatHeaderHeight).toBeCloseTo((38 + 38) / PX_PER_MM, 9)
  })

  it('模板未知 id 或未配置重复表头时，重复表头高度为 0', () => {
    const map = normalizeMeasurements([{ id: 'ghost', heightPx: 76, rowHeightsPx: [38, 38] }], template)
    expect(map.get('ghost')!.repeatHeaderHeight).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/measure.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../measure.js"`

- [ ] **Step 3: 实现**

```ts
// packages/print-core/src/print/types.ts（追加）
/** 宿主回传的原始测量值（CSS px，不做任何业务换算） */
export interface RawMeasurement {
  id: string
  heightPx: number
  /** 表格行高（px），仅表格元素有值 */
  rowHeightsPx?: number[]
}
```

```ts
// packages/print-core/src/print/measure.ts
import { pxToMm } from './units.js'
import type { RawMeasurement } from './types.js'
import type { MeasuredElement, TemplateData } from '../render/types.js'

/**
 * 原始测量 → 分页输入。三端共用：px→mm、表格行高、重复表头段高度。
 * repeatHeaderHeight = 前 `options._repeatHeaderCount` 个渲染行高之和。
 */
export function normalizeMeasurements(
  raw: RawMeasurement[],
  template: TemplateData,
): Map<string, MeasuredElement> {
  const index = new Map(template.elements.map(el => [el.id, el]))
  const measured = new Map<string, MeasuredElement>()
  for (const item of raw) {
    const element = index.get(item.id)
    const repeatCount: number = element?.options?._repeatHeaderCount ?? 0
    const rowHeights = item.rowHeightsPx?.map(pxToMm)
    measured.set(item.id, {
      id: item.id,
      measuredHeight: pxToMm(item.heightPx),
      measuredRowHeights: rowHeights,
      repeatHeaderHeight:
        rowHeights && rowHeights.length > 0 && repeatCount > 0
          ? rowHeights.slice(0, repeatCount).reduce((sum, h) => sum + h, 0)
          : 0,
    })
  }
  return measured
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/measure.spec.ts`
Expected: PASS（3 个用例）

```bash
git add packages/print-core/src/print/types.ts packages/print-core/src/print/measure.ts packages/print-core/src/print/__tests__/measure.spec.ts
git commit -m "feat(core)：新增测量结果归一化"
```

---

### Task 5: core 码制收集与映射渲染器

**Files:**
- Modify: `packages/print-core/src/print/types.ts`（追加 `CodeSpec`）
- Create: `packages/print-core/src/print/codes.ts`
- Test: `packages/print-core/src/print/__tests__/codes.spec.ts`

**Interfaces:**
- Consumes: `packages/print-core/src/render/types.js` 的 `CodeRenderer`、`CodeRenderOptions`
- Produces: `CodeSpec`、`codeSpecKey(value, cellType, opts)`、`createMapCodeRenderer(map)`、`createCollectingCodeRenderer(base?)`、`mergeCodeMaps(...maps)`

- [ ] **Step 1: 写失败测试**

```ts
// packages/print-core/src/print/__tests__/codes.spec.ts
import { describe, it, expect } from 'vitest'
import { codeSpecKey, createMapCodeRenderer, createCollectingCodeRenderer, mergeCodeMaps } from '../codes.js'

describe('codeSpecKey', () => {
  it('码值相同但码制或选项不同 → 键不同', () => {
    const a = codeSpecKey('123', 'barcode', { barcodeType: 'CODE128' })
    const b = codeSpecKey('123', 'barcode', { barcodeType: 'EAN13' })
    const c = codeSpecKey('123', 'qrcode', { barcodeType: 'CODE128' })
    expect(new Set([a, b, c]).size).toBe(3)
  })
  it('参数相同 → 键稳定（可跨进程传输后比对）', () => {
    expect(codeSpecKey('123', 'barcode', { barWidth: 2, showText: true }))
      .toBe(codeSpecKey('123', 'barcode', { barWidth: 2, showText: true }))
  })
})

describe('createMapCodeRenderer', () => {
  const map = new Map([[codeSpecKey('123', 'barcode', {}), '<svg id="fake"/>']])
  it('命中返回 SVG', () => {
    expect(createMapCodeRenderer(map).render('123', 'barcode', {})).toBe('<svg id="fake"/>')
  })
  it('未命中抛错，交由渲染管线降级为文本占位', () => {
    expect(() => createMapCodeRenderer(map).render('456', 'barcode', {})).toThrow()
  })
})

describe('createCollectingCodeRenderer', () => {
  it('记录规格并抛错（上层因此输出文本占位）', () => {
    const collector = createCollectingCodeRenderer()
    expect(() => collector.renderer.render('123', 'barcode', { barcodeType: 'CODE128' })).toThrow()
    const specs = collector.takeSpecs()
    expect(specs).toHaveLength(1)
    expect(specs[0]).toMatchObject({ value: '123', cellType: 'barcode' })
    expect(specs[0].key).toBe(codeSpecKey('123', 'barcode', { barcodeType: 'CODE128' }))
  })

  it('基映射命中时直接返回，不重复收集', () => {
    const key = codeSpecKey('123', 'barcode', {})
    const collector = createCollectingCodeRenderer(new Map([[key, '<svg id="hit"/>']]))
    expect(collector.renderer.render('123', 'barcode', {})).toBe('<svg id="hit"/>')
    expect(collector.takeSpecs()).toHaveLength(0)
  })

  it('takeSpecs 取走后清空，重复调用不会重复渲染', () => {
    const collector = createCollectingCodeRenderer()
    expect(() => collector.renderer.render('123', 'barcode', {})).toThrow()
    expect(collector.takeSpecs()).toHaveLength(1)
    expect(collector.takeSpecs()).toHaveLength(0)
  })

  it('同码值同参数只收集一次', () => {
    const collector = createCollectingCodeRenderer()
    expect(() => collector.renderer.render('123', 'barcode', {})).toThrow()
    expect(() => collector.renderer.render('123', 'barcode', {})).toThrow()
    expect(collector.takeSpecs()).toHaveLength(1)
  })
})

describe('mergeCodeMaps', () => {
  it('后者覆盖前者同名键，且不修改入参', () => {
    const a = new Map([['k', 'a'], ['x', '1']])
    const b = new Map([['k', 'b']])
    const merged = mergeCodeMaps(a, b)
    expect(merged.get('k')).toBe('b')
    expect(merged.get('x')).toBe('1')
    expect(a.get('k')).toBe('a')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/codes.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../codes.js"`

- [ ] **Step 3: 实现**

```ts
// packages/print-core/src/print/types.ts（追加）
import type { CodeRenderOptions } from '../render/types.js'

/** 一次码值渲染请求；key 为稳定键，用于跨进程映射 */
export interface CodeSpec {
  key: string
  value: string
  cellType: 'barcode' | 'qrcode'
  opts: CodeRenderOptions
}
```

```ts
// packages/print-core/src/print/codes.ts
import type { CodeRenderer, CodeRenderOptions } from '../render/types.js'
import type { CodeSpec } from './types.js'

/** 码值 + 码制 + 影响产物几何的选项 → 稳定键（顺序固定，跨进程可比对） */
export function codeSpecKey(
  value: string,
  cellType: 'barcode' | 'qrcode',
  opts: CodeRenderOptions = {},
): string {
  return JSON.stringify([
    value,
    cellType,
    opts.barcodeType ?? null,
    opts.qrCodeLevel ?? null,
    opts.showText ?? null,
    opts.barWidth ?? null,
    opts.fontSize ?? null,
  ])
}

/** 映射渲染器：未命中抛错，由 html-generator 的既有降级逻辑输出文本占位 */
export function createMapCodeRenderer(map: Map<string, string>): CodeRenderer {
  return {
    render(value, cellType, opts) {
      const svg = map.get(codeSpecKey(value, cellType, opts))
      if (!svg) throw new Error(`码值未渲染：${value}`)
      return svg
    },
  }
}

export interface CollectingCodeRenderer {
  /** 传入 generateHtml 的渲染器：命中基映射则返回，否则记录规格并抛错 */
  renderer: CodeRenderer
  /** 取走本趟收集到的规格并清空 */
  takeSpecs(): CodeSpec[]
}

export function createCollectingCodeRenderer(base?: Map<string, string>): CollectingCodeRenderer {
  const collected = new Map<string, CodeSpec>()
  return {
    renderer: {
      render(value, cellType, opts = {}) {
        const key = codeSpecKey(value, cellType, opts)
        const hit = base?.get(key)
        if (hit) return hit
        collected.set(key, { key, value, cellType, opts })
        throw new Error('collect')
      },
    },
    takeSpecs() {
      const specs = [...collected.values()]
      collected.clear()
      return specs
    },
  }
}

/** 合并多趟码值映射；后者覆盖同键，入参不被修改 */
export function mergeCodeMaps(...maps: Array<Map<string, string>>): Map<string, string> {
  const merged = new Map<string, string>()
  for (const map of maps) {
    for (const [key, svg] of map) merged.set(key, svg)
  }
  return merged
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/codes.spec.ts`
Expected: PASS（9 个用例）

```bash
git add packages/print-core/src/print/types.ts packages/print-core/src/print/codes.ts packages/print-core/src/print/__tests__/codes.spec.ts
git commit -m "feat(core)：新增码值收集与映射渲染器"
```

---

### Task 6: core driver 契约与共享 DOM 宿主 runtime

**Files:**
- Create: `packages/print-core/src/print/driver.ts`
- Create: `packages/print-core/src/print/ports.ts`
- Create: `packages/print-core/src/print/dom-host-runtime.ts`
- Test helper: `packages/print-core/src/print/__tests__/fake-driver.ts`
- Test: `packages/print-core/src/print/__tests__/dom-host-runtime.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `PrintFailure`/`toPrintFailure`/`withTimeout`；Task 2/3/5 的类型
- Produces: `ExecutorMethod`、`ExecutorBundle`、`PageDriver`、`DriverFactory`、`PrintSession`、`PrintRuntime`、`createDomHostRuntime(factory, bundle?)`

- [ ] **Step 1: 写测试（含假 driver 工具）**

```ts
// packages/print-core/src/print/__tests__/fake-driver.ts
import type { DriverFactory, ExecutorBundle, PageDriver } from '../driver.js'
import type { RawMeasurement } from '../types.js'

export interface FakeDriverOptions {
  measurements?: RawMeasurement[]
  contentBottomPx?: number
  codeMap?: Record<string, string>
  pdfBytes?: Uint8Array
  screenshotBytes?: Uint8Array
  /** 该原语调用前抛错，用于验证错误归一化 */
  failAt?: string
  /** 该原语调用前延迟，用于验证超时 */
  delayMs?: number
  supportsPdf?: boolean
  supportsScreenshot?: boolean
}

export function createFakeDriverFactory(options: FakeDriverOptions = {}) {
  const calls: string[] = []
  const documents: string[] = []
  const slow = async (name: string) => {
    calls.push(name)
    if (options.failAt === name) throw new Error(`fake failure at ${name}`)
    if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs))
  }
  const driver: PageDriver = {
    async open() { await slow('open') },
    async setContent(html) { await slow('setContent'); documents.push(html) },
    async injectExecutor() { await slow('injectExecutor') },
    async evaluate(method, args) {
      await slow(`evaluate:${method}`)
      if (method === 'readMeasurements') return (options.measurements ?? []) as never
      if (method === 'readContentBottom') return (options.contentBottomPx ?? 0) as never
      if (method === 'renderCodes') {
        const specs = (args?.[0] ?? []) as Array<{ key: string }>
        const map: Record<string, string> = {}
        for (const spec of specs) map[spec.key] = options.codeMap?.[spec.key] ?? '<svg id="fake"/>'
        return map as never
      }
      return undefined as never
    },
    ...(options.supportsPdf === false ? {} : {
      async pdf() { await slow('pdf'); return options.pdfBytes ?? new Uint8Array([1, 2, 3]) },
    }),
    ...(options.supportsScreenshot === false ? {} : {
      async screenshot() { await slow('screenshot'); return options.screenshotBytes ?? new Uint8Array([9]) },
    }),
    async close() { calls.push('close') },
  }
  const factory: DriverFactory = { async createDriver() { calls.push('createDriver'); return driver } }
  return { factory, calls, documents, driver }
}

export const EXECUTOR: ExecutorBundle = { source: '/* fake executor */', version: 'test' }
```

```ts
// packages/print-core/src/print/__tests__/dom-host-runtime.spec.ts
import { describe, it, expect } from 'vitest'
import { createDomHostRuntime } from '../dom-host-runtime.js'
import { codeSpecKey } from '../codes.js'
import { EXECUTOR, createFakeDriverFactory } from './fake-driver.js'
import type { PrintJob } from '../types.js'
import type { TemplateData } from '../../render/types.js'

const job: PrintJob = { templateJson: {} as TemplateData }
const viewport = { width: 794, height: 1122 }

describe('createDomHostRuntime', () => {
  it('measure：按 open → setContent → 注入 → 就绪 → 读测量 的顺序调用，并返回原始 px', async () => {
    const raw = [{ id: 'a', heightPx: 38 }]
    const fake = createFakeDriverFactory({ measurements: raw })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    const result = await runtime.withSession(job, session => session.measure('<html/>', viewport))
    expect(result).toEqual(raw)
    expect(fake.calls).toEqual([
      'createDriver', 'open', 'setContent', 'injectExecutor',
      'evaluate:waitReady', 'evaluate:readMeasurements', 'close',
    ])
  })

  it('每次 setContent 后重新注入执行器（文档已重建）', async () => {
    const fake = createFakeDriverFactory({ measurements: [] })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    await runtime.withSession(job, async session => {
      await session.measure('<html/>', viewport)
      await session.measure('<html/>', viewport)
    })
    expect(fake.calls.filter(call => call === 'injectExecutor')).toHaveLength(2)
  })

  it('renderCodes：把页面返回的对象转换为 Map，空规格不触碰 driver', async () => {
    const fake = createFakeDriverFactory({ codeMap: {} })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    const key = codeSpecKey('123', 'barcode', {})
    const map = await runtime.withSession(job, session =>
      session.renderCodes([{ key, value: '123', cellType: 'barcode', opts: {} }]))
    expect(map.get(key)).toBe('<svg id="fake"/>')
    const empty = await runtime.withSession(job, session => session.renderCodes([]))
    expect(empty.size).toBe(0)
  })

  it('宿主不支持 PDF 时抛 UNSUPPORTED_RUNTIME', async () => {
    const fake = createFakeDriverFactory({ supportsPdf: false })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    await expect(runtime.withSession(job, session =>
      session.toPdf('<html/>', { paperMm: { width: 80, height: 100 }, marginsMm: { top: 0, right: 0, bottom: 0, left: 0 }, printBackground: true, scale: 1, preferCSSPageSize: false }, viewport),
    )).rejects.toMatchObject({ code: 'UNSUPPORTED_RUNTIME' })
  })

  it('宿主异常归一化为对应失败码，且仍释放会话', async () => {
    const fake = createFakeDriverFactory({ failAt: 'readMeasurements' as never, measurements: [] })
    const fakeBroken = createFakeDriverFactory({ failAt: 'evaluate:readMeasurements' })
    const runtime = createDomHostRuntime(fakeBroken.factory, EXECUTOR)
    await expect(runtime.withSession(job, session => session.measure('<html/>', viewport)))
      .rejects.toMatchObject({ code: 'MEASURE_FAILED' })
    expect(fakeBroken.calls).toContain('close')
    void fake
  })

  it('阶段超过预算时报 RENDER_TIMEOUT', async () => {
    const fake = createFakeDriverFactory({ measurements: [], delayMs: 30 })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    await expect(runtime.withSession({ ...job, timeoutMs: 15 }, session => session.measure('<html/>', viewport)))
      .rejects.toMatchObject({ code: 'RENDER_TIMEOUT' })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/dom-host-runtime.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../dom-host-runtime.js"`

- [ ] **Step 3: 实现 driver.ts / ports.ts / dom-host-runtime.ts**

```ts
// packages/print-core/src/print/driver.ts
import type { PdfTargetSpec, RawMeasurement, ScreenshotTargetSpec, ViewportPx } from './types.js'

/** 执行器可被宿主调用的方法名（与 dom-executor.ts 一一对应） */
export type ExecutorMethod = 'waitReady' | 'readMeasurements' | 'readContentBottom' | 'renderCodes'

/** core 自带的 DOM 执行器产物；宿主负责把它送进页面 */
export interface ExecutorBundle {
  source: string
  version: string
}

/**
 * 单文档槽位原语：只做宿主 I/O，不含任何业务规则（纸张、分页、码制参数均不得出现在实现里）。
 * 工厂返回时该槽位必须已存在一个空白文档（open 只负责调整视口）。
 */
export interface PageDriver {
  open(viewport: ViewportPx): Promise<void>
  setContent(html: string): Promise<void>
  /** 同一文档内幂等；文档重建后必须重新注入 */
  injectExecutor(bundle: ExecutorBundle): Promise<void>
  evaluate<T>(method: ExecutorMethod, args?: unknown[]): Promise<T>
  pdf?(html: string, spec: PdfTargetSpec): Promise<Uint8Array>
  screenshot?(html: string, spec: ScreenshotTargetSpec): Promise<Uint8Array>
  close(): Promise<void>
}

export interface DriverFactory {
  createDriver(): Promise<PageDriver>
}
```

```ts
// packages/print-core/src/print/ports.ts
import type { CodeSpec, PdfTargetSpec, RawMeasurement, ScreenshotTargetSpec, ViewportPx } from './types.js'

/** 会话预算：PrintJob 天然满足本结构；print.submitHtml 这类无模板直出图场景也可直接传入 */
export interface SessionBudget {
  timeoutMs?: number
  readinessMs?: number
}

/** 一次任务内的文档槽位会话；方法内部已完成超时与错误归一化 */
export interface PrintSession {
  /** 码值 → SVG 映射；specs 为空时直接返回空 Map，不触碰宿主 */
  renderCodes(specs: CodeSpec[]): Promise<Map<string, string>>
  measure(html: string, viewport: ViewportPx): Promise<RawMeasurement[]>
  probeContentBottom(html: string, viewport: ViewportPx): Promise<number>
  toPdf(html: string, spec: PdfTargetSpec, viewport: ViewportPx): Promise<Uint8Array>
  toScreenshot(html: string, spec: ScreenshotTargetSpec, viewport: ViewportPx): Promise<Uint8Array>
}

export interface PrintRuntime {
  /** 借用一个槽位跑完整个任务；退出时无论成败都释放 */
  withSession<T>(budget: SessionBudget, fn: (session: PrintSession) => Promise<T>): Promise<T>
}

export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_READINESS_MS = 5_000
```

```ts
// packages/print-core/src/print/dom-host-runtime.ts
import { PrintFailure, toPrintFailure, withTimeout } from './errors.js'
import { DEFAULT_READINESS_MS, DEFAULT_TIMEOUT_MS } from './ports.js'
import type { DriverFactory, ExecutorBundle, PageDriver } from './driver.js'
import type { PrintRuntime, PrintSession, SessionBudget } from './ports.js'
import type { CodeSpec, PdfTargetSpec, RawMeasurement, ScreenshotTargetSpec, ViewportPx } from './types.js'

/**
 * 共享 DOM 宿主 runtime：把「载入 → 注入 → 等就绪 → 执行 → 释放」的时序、
 * 超时预算与错误分类集中实现一次。三端只提供 driver。
 */
export function createDomHostRuntime(factory: DriverFactory, bundle?: ExecutorBundle): PrintRuntime {
  return {
    async withSession<T>(options: SessionBudget, fn: (session: PrintSession) => Promise<T>): Promise<T> {
      const driver = await factory.createDriver()
      const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      const readinessMs = options.readinessMs ?? DEFAULT_READINESS_MS
      const budget = (): number => Math.max(1, deadline - Date.now())
      const fail = (err: unknown, code: Parameters<typeof toPrintFailure>[1], context: string): PrintFailure =>
        toPrintFailure(err, code, context)

      let injected = false
      const ensureExecutor = async (): Promise<void> => {
        if (injected) return
        if (!bundle) throw new PrintFailure('INTERNAL', '缺少 core DOM 执行器产物')
        await driver.injectExecutor(bundle)
        injected = true
      }
      const load = async (html: string, viewport: ViewportPx): Promise<void> => {
        await driver.open(viewport)
        await driver.setContent(html)
        injected = false
        await ensureExecutor()
        await driver.evaluate<void>('waitReady', [readinessMs])
      }

      const session: PrintSession = {
        async renderCodes(specs: CodeSpec[]): Promise<Map<string, string>> {
          if (specs.length === 0) return new Map()
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await ensureExecutor()
                const map = await driver.evaluate<Record<string, string>>('renderCodes', [specs])
                return new Map(Object.entries(map))
              } catch (err) {
                throw fail(err, 'INTERNAL', '码值渲染失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `码值渲染超过 ${ms}ms`,
          )
        },

        async measure(html: string, viewport: ViewportPx): Promise<RawMeasurement[]> {
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await load(html, viewport)
                return await driver.evaluate<RawMeasurement[]>('readMeasurements')
              } catch (err) {
                throw fail(err, 'MEASURE_FAILED', '测量失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `测量超过 ${ms}ms`,
          )
        },

        async probeContentBottom(html: string, viewport: ViewportPx): Promise<number> {
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await load(html, viewport)
                return await driver.evaluate<number>('readContentBottom')
              } catch (err) {
                throw fail(err, 'MEASURE_FAILED', '连续纸探针失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `连续纸探针超过 ${ms}ms`,
          )
        },

        async toPdf(html: string, spec: PdfTargetSpec, viewport: ViewportPx): Promise<Uint8Array> {
          if (!driver.pdf) throw new PrintFailure('UNSUPPORTED_RUNTIME', '当前宿主不支持生成 PDF')
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await load(html, viewport)
                return await driver.pdf!(html, spec)
              } catch (err) {
                throw fail(err, 'PDF_FAILED', 'PDF 生成失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `PDF 生成超过 ${ms}ms`,
          )
        },

        async toScreenshot(html: string, spec: ScreenshotTargetSpec, viewport: ViewportPx): Promise<Uint8Array> {
          if (!driver.screenshot) throw new PrintFailure('UNSUPPORTED_RUNTIME', '当前宿主不支持截图')
          const ms = budget()
          return withTimeout(
            (async () => {
              try {
                await load(html, viewport)
                return await driver.screenshot!(html, spec)
              } catch (err) {
                throw fail(err, 'SCREENSHOT_FAILED', '截图失败')
              }
            })(),
            ms, 'RENDER_TIMEOUT', `截图超过 ${ms}ms`,
          )
        },
      }

      try {
        return await fn(session)
      } finally {
        try {
          await driver.close()
        } catch {
          // 释放失败不影响任务结果
        }
      }
    },
  }
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/dom-host-runtime.spec.ts`
Expected: PASS（6 个用例）

```bash
git add packages/print-core/src/print/driver.ts packages/print-core/src/print/ports.ts packages/print-core/src/print/dom-host-runtime.ts packages/print-core/src/print/__tests__
git commit -m "feat(core)：新增 driver 契约与共享 DOM 宿主 runtime"
```

---

### Task 7: core 打印管线

**Files:**
- Modify: `packages/print-core/src/print/types.ts`（追加 `PrintJob`、`PreparedDocument`、`RenderPdfResult`）
- Create: `packages/print-core/src/print/pipeline.ts`
- Test: `packages/print-core/src/print/__tests__/pipeline.spec.ts`

**Interfaces:**
- Consumes: Task 2–6 的全部产出；`render/data-binder.js`、`render/html-generator.js`、`render/pagination-engine.js`、`render/continuous-paper.js`、`render/types.js`
- Produces: `prepareDocument(job, runtime)`、`renderPdf(job, runtime)`、`renderScreenshot(job, runtime)`

- [ ] **Step 1: 写失败测试**

```ts
// packages/print-core/src/print/__tests__/pipeline.spec.ts
import { describe, it, expect } from 'vitest'
import { prepareDocument, renderPdf, renderScreenshot } from '../pipeline.js'
import { createDomHostRuntime } from '../dom-host-runtime.js'
import { EXECUTOR, createFakeDriverFactory } from './fake-driver.js'
import type { PrintJob } from '../types.js'
import type { TemplateData } from '../../render/types.js'

function template(overrides: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [{ id: 'a', type: 'text', options: { left: 0, top: 0, width: 50, height: 10 } }],
    ...overrides,
  } as TemplateData
}

function runtimeOf(options: Parameters<typeof createFakeDriverFactory>[0] = {}) {
  const fake = createFakeDriverFactory(options)
  return { fake, runtime: createDomHostRuntime(fake.factory, EXECUTOR) }
}

describe('prepareDocument', () => {
  it('普通纸：返回分页 HTML、页数、纸张与 config 来源', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    const job: PrintJob = { templateJson: template() }
    const result = await prepareDocument(job, runtime)
    expect(result.pageCount).toBe(1)
    expect(result.continuous).toBe(false)
    expect(result.heightSource).toBe('config')
    expect(result.paperMm).toEqual({ width: 210, height: 297 })
    expect(result.html).toContain('data-page="1"')
    expect(fake.calls.filter(c => c === 'evaluate:readContentBottom')).toHaveLength(0)
  })

  it('连续纸：探针推导纸高，@page 高度与返回纸高一致', async () => {
    const { fake, runtime } = runtimeOf({
      measurements: [{ id: 'a', heightPx: 38 }],
      contentBottomPx: 76, // ≈20.11mm + 页脚 0 + 下边距 10 ≈ 30.11mm
    })
    const job: PrintJob = {
      templateJson: template({
        paperSize: 'CONTINUOUS',
        customWidth: 80,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    }
    const result = await prepareDocument(job, runtime)
    expect(result.continuous).toBe(true)
    expect(result.heightSource).toBe('derived')
    expect(fake.calls).toContain('evaluate:readContentBottom')
    expect(result.html).toContain(`@page { size: 80mm ${result.paperMm.height}mm`)
  })

  it('连续纸带纸高逃生门：不再走探针', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    const job: PrintJob = {
      templateJson: template({ paperSize: 'CONTINUOUS', customWidth: 80 }),
      paperHeightMm: 150,
    }
    const result = await prepareDocument(job, runtime)
    expect(result.paperMm.height).toBe(150)
    expect(result.heightSource).toBe('config')
    expect(fake.calls.filter(c => c === 'evaluate:readContentBottom')).toHaveLength(0)
  })

  it('连续纸仅覆盖宽度：高度仍取推导值，来源仍为 derived', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }], contentBottomPx: 76 })
    const job: PrintJob = {
      templateJson: template({ paperSize: 'CONTINUOUS', customWidth: 80 }),
      paperOverride: { width: 58 },
    }
    const result = await prepareDocument(job, runtime)
    expect(result.paperMm.width).toBe(58)
    expect(result.heightSource).toBe('derived')
  })

  it('含码模板：先收集再渲染，最终 HTML 内嵌真实 SVG', async () => {
    const { fake, runtime } = runtimeOf({
      measurements: [{ id: 'b', heightPx: 114 }],
      codeMap: {},
    })
    const job: PrintJob = {
      templateJson: template({
        elements: [{ id: 'b', type: 'barcode', options: { left: 0, top: 0, width: 40, height: 20, formatter: '12345678' } }],
      }),
    }
    const result = await prepareDocument(job, runtime)
    expect(fake.calls.filter(c => c === 'evaluate:renderCodes')).toHaveLength(1)
    expect(result.html).toContain('data:image/svg+xml')
    expect(result.html).not.toContain('<span>12345678</span>')
  })
})

describe('renderPdf', () => {
  it('同一会话内完成出图，返回 PDF 字节与 prepared', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }], pdfBytes: new Uint8Array([7, 7]) })
    const result = await renderPdf({ templateJson: template() }, runtime)
    expect(Array.from(result.pdf)).toEqual([7, 7])
    expect(result.prepared.pageCount).toBe(1)
    expect(fake.calls.filter(c => c === 'createDriver')).toHaveLength(1)
    expect(fake.calls[fake.calls.length - 1]).toBe('close')
    expect(fake.calls).toContain('pdf')
  })
})

describe('renderScreenshot', () => {
  it('不分页：只做测量模式 HTML 与截图', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }], screenshotBytes: new Uint8Array([5]) })
    const shot = await renderScreenshot({ templateJson: template() }, runtime)
    expect(Array.from(shot)).toEqual([5])
    expect(fake.calls.filter(c => c === 'evaluate:readMeasurements')).toHaveLength(0)
    expect(fake.calls.filter(c => c === 'evaluate:readContentBottom')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/pipeline.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../pipeline.js"`

- [ ] **Step 3: 追加类型并实现 pipeline.ts**

```ts
// packages/print-core/src/print/types.ts（追加）
import type { PageLayout, PrintTemplateData } from '../render/types.js'

export interface PrintJob {
  /** 模板 JSON（设计器 TemplateData 结构兼容） */
  templateJson: PrintTemplateData
  printData?: Record<string, any>
  /** 相对路径图片基址 */
  baseUrl?: string
  /** 宿主纸张覆盖（mm）；0 或负数视为未提供 */
  paperOverride?: { width?: number; height?: number }
  /** 连续纸显式纸高逃生门（mm） */
  paperHeightMm?: number
  /** 单任务总预算（ms），缺省 30000 */
  timeoutMs?: number
  /** 就绪等待（ms），缺省 5000 */
  readinessMs?: number
}

export interface PreparedDocument {
  html: string
  pageCount: number
  paperMm: PaperMm
  continuous: boolean
  heightSource: HeightSource
  pageLayouts: PageLayout[]
}

export interface RenderPdfResult {
  pdf: Uint8Array
  prepared: PreparedDocument
}
```

```ts
// packages/print-core/src/print/pipeline.ts
import { bindData } from '../render/data-binder.js'
import { generateHtml } from '../render/html-generator.js'
import { paginate } from '../render/pagination-engine.js'
import { composeContinuousHeight } from '../render/continuous-paper.js'
import { getPaperDimensions, isContinuousPaper } from '../render/types.js'
import { createCollectingCodeRenderer, createMapCodeRenderer, mergeCodeMaps } from './codes.js'
import { escapeHeightMm, paperViewportPx, resolvePaperMm } from './paper.js'
import { buildPdfTargetSpec, buildScreenshotTargetSpec } from './pdf-spec.js'
import { normalizeMeasurements } from './measure.js'
import { pxToMm } from './units.js'
import type { CodeRenderer, PageLayout, PrintTemplateData } from '../render/types.js'
import type { PrintRuntime, PrintSession } from './ports.js'
import type { PreparedDocument, PrintJob, RenderPdfResult } from './types.js'

/** 阶段 1–6：绑定 → 码值收集/渲染 → 测量 → 分页 → 连续纸 → 最终 HTML */
export async function prepareDocument(job: PrintJob, runtime: PrintRuntime): Promise<PreparedDocument> {
  return runtime.withSession(job, session => prepareWithSession(job, session))
}

/** 阶段 1–7：prepared + HTML→PDF，且与准备阶段共用同一个 driver 会话 */
export async function renderPdf(job: PrintJob, runtime: PrintRuntime): Promise<RenderPdfResult> {
  return runtime.withSession(job, async (session) => {
    const prepared = await prepareWithSession(job, session)
    const viewport = paperViewportPx(prepared.paperMm)
    const pdf = await session.toPdf(prepared.html, buildPdfTargetSpec(prepared.paperMm), viewport)
    return { pdf, prepared }
  })
}

/** 截图：不分页，用测量模式 HTML 单页完整渲染 */
export async function renderScreenshot(job: PrintJob, runtime: PrintRuntime): Promise<Uint8Array> {
  return runtime.withSession(job, async (session) => {
    const bound = bindData(job.templateJson, job.printData, job.baseUrl)
    const built = await buildHtmlWithCodes({
      bound, job, session, pageLayouts: [], isMeasurementPass: true,
    })
    const viewport = paperViewportPx(getPaperDimensions(bound))
    return session.toScreenshot(built.html, buildScreenshotTargetSpec(), viewport)
  })
}

async function prepareWithSession(job: PrintJob, session: PrintSession): Promise<PreparedDocument> {
  const bound = bindData(job.templateJson, job.printData, job.baseUrl)
  const continuous = isContinuousPaper(bound)
  const designPaper = getPaperDimensions(bound)
  const viewport = paperViewportPx(designPaper)
  const heightEscape = escapeHeightMm({ paperHeightMm: job.paperHeightMm, override: job.paperOverride })

  // 测量 HTML：先收集码值 → 渲染 → 用真实渲染器再生成
  const measurement = await buildHtmlWithCodes({
    bound, job, session, pageLayouts: [], isMeasurementPass: true,
  })
  const measurements = await session.measure(measurement.html, viewport)
  const pageLayouts = paginate(bound, normalizeMeasurements(measurements, bound))

  // 最终 HTML：补齐测量趟看不到的码值（页眉/页脚/首页叠加中的真实页码）
  const finalBuild = await buildHtmlWithCodes({
    bound, job, session, pageLayouts, isMeasurementPass: false, baseMap: measurement.map,
  })
  let html = finalBuild.html

  let derivedHeightMm: number | undefined
  if (continuous) {
    if (heightEscape && heightEscape > 0) {
      derivedHeightMm = heightEscape
    } else {
      const bottomPx = await session.probeContentBottom(html, viewport)
      derivedHeightMm = composeContinuousHeight(bound, pxToMm(bottomPx))
    }
    html = generateHtml(bound, pageLayouts, job.printData, {
      codeRenderer: finalBuild.codeRenderer,
      pageHeightMm: derivedHeightMm,
    })
  }

  const { paperMm, heightSource } = resolvePaperMm({
    paperMm: { width: designPaper.width, height: derivedHeightMm ?? designPaper.height },
    continuous,
    override: job.paperOverride,
  })

  return { html, pageCount: pageLayouts.length, paperMm, continuous, heightSource, pageLayouts }
}

interface BuildHtmlInput {
  bound: PrintTemplateData
  job: PrintJob
  session: PrintSession
  pageLayouts: PageLayout[]
  isMeasurementPass: boolean
  baseMap?: Map<string, string>
}

/**
 * 生成 HTML：先跑一趟「收集型渲染器」拿到本趟真实码值规格，
 * 渲染后若有新规格则用完整映射再生成一次；无码模板只生成一次。
 */
async function buildHtmlWithCodes(
  input: BuildHtmlInput,
): Promise<{ html: string; codeRenderer?: CodeRenderer; map: Map<string, string> }> {
  const baseMap = input.baseMap ?? new Map<string, string>()
  const collector = createCollectingCodeRenderer(baseMap)
  const draft = generateHtml(input.bound, input.pageLayouts, input.job.printData, {
    isMeasurementPass: input.isMeasurementPass,
    codeRenderer: collector.renderer,
  })
  const extra = collector.takeSpecs()
  const rendered = extra.length > 0 ? await input.session.renderCodes(extra) : new Map<string, string>()
  const map = mergeCodeMaps(baseMap, rendered)
  const codeRenderer = map.size > 0 ? createMapCodeRenderer(map) : undefined
  if (extra.length === 0) return { html: draft, codeRenderer, map }
  const html = generateHtml(input.bound, input.pageLayouts, input.job.printData, {
    isMeasurementPass: input.isMeasurementPass,
    codeRenderer,
  })
  return { html, codeRenderer, map }
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/pipeline.spec.ts`
Expected: PASS（7 个用例）

```bash
git add packages/print-core/src/print/types.ts packages/print-core/src/print/pipeline.ts packages/print-core/src/print/__tests__/pipeline.spec.ts
git commit -m "feat(core)：新增三端共用的打印管线"
```

---

### Task 8: core 公共导出与「根入口不触碰 DOM」契约

**Files:**
- Create: `packages/print-core/src/print/index.ts`
- Modify: `packages/print-core/src/index.ts`
- Test: `packages/print-core/src/print/__tests__/exports.spec.ts`

**Interfaces:**
- Consumes: Task 1–7 的全部产出
- Produces: `@worm-vue3-print/core` 根入口上的 `prepareDocument`、`renderPdf`、`renderScreenshot`、`createDomHostRuntime`、`resolvePaperMm`、`paperViewportPx`、`buildPdfTargetSpec`、`toElectronPrintToPdfOptions`、`toPlaywrightPdfOptions`、`normalizeMeasurements`、`codeSpecKey`、`createMapCodeRenderer`、`PrintFailure`、`withTimeout` 及全部相关类型

- [ ] **Step 1: 写失败测试**

```ts
// packages/print-core/src/print/__tests__/exports.spec.ts
import { describe, it, expect } from 'vitest'

describe('core 根入口的打印 API', () => {
  it('导出管线与规格函数', async () => {
    const core = await import('../../index.js')
    for (const name of [
      'prepareDocument', 'renderPdf', 'renderScreenshot', 'createDomHostRuntime',
      'resolvePaperMm', 'paperViewportPx', 'buildPdfTargetSpec',
      'toElectronPrintToPdfOptions', 'toPlaywrightPdfOptions',
      'normalizeMeasurements', 'codeSpecKey', 'createMapCodeRenderer',
      'PrintFailure', 'withTimeout', 'PX_PER_MM',
    ] as const) {
      expect(typeof (core as Record<string, unknown>)[name]).not.toBe('undefined')
    }
  })

  it('Node 下加载 core 根入口不触碰 DOM（服务端与 Electron 主进程的前提）', async () => {
    expect(typeof (globalThis as Record<string, unknown>).document).toBe('undefined')
    await import('../../index.js')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/exports.spec.ts`
Expected: FAIL，`prepareDocument` 为 `undefined`

- [ ] **Step 3: 实现 print/index.ts 并接到根入口**

```ts
// packages/print-core/src/print/index.ts
export * from './units.js'
export * from './errors.js'
export * from './types.js'
export * from './paper.js'
export * from './pdf-spec.js'
export * from './measure.js'
export * from './codes.js'
export * from './driver.js'
export * from './ports.js'
export * from './dom-host-runtime.js'
export * from './pipeline.js'
```

```ts
// packages/print-core/src/index.ts（追加到现有导出之后）
export * from './print/index.js'
```

- [ ] **Step 4: 运行测试与构建并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/print`
Expected: PASS（全部 `src/print/__tests__` 用例）

Run: `npm run build -w @worm-vue3-print/core`
Expected: 构建成功，`dist/index.d.ts` 含 `prepareDocument`

```bash
git add packages/print-core/src/print/index.ts packages/print-core/src/index.ts packages/print-core/src/print/__tests__/exports.spec.ts
git commit -m "feat(core)：导出打印管线公共 API"
```

---

### Task 9: core 浏览器 DOM 执行器（测量/探针/就绪/码制的唯一实现）

**Files:**
- Modify: `packages/print-core/src/browser/browser-code-renderer.ts`（抽出 `renderCodeSvg`）
- Create: `packages/print-core/src/browser/dom-executor.ts`
- Create: `packages/print-core/src/browser/dom-executor.iife.ts`
- Test: `packages/print-core/src/browser/__tests__/dom-executor.spec.ts`

**Interfaces:**
- Consumes: Task 5 的 `CodeSpec`/`codeSpecKey`；Task 4 的 `RawMeasurement`
- Produces: `EXECUTOR_VERSION`、`waitReady(win, timeoutMs)`、`readMeasurements(doc)`、`readContentBottom(doc)`、`renderCodes(specs)`、`domExecutor`

- [ ] **Step 1: 写失败测试（happy-dom；沿用既有 canvas 桩）**

```ts
// packages/print-core/src/browser/__tests__/dom-executor.spec.ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest'
import { readMeasurements, readContentBottom, renderCodes } from '../dom-executor.js'
import { codeSpecKey } from '../../print/codes.js'

beforeAll(() => {
  // happy-dom 不实现 canvas 2d 上下文；jsbarcode 需要它测量文字宽度
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = () => ({ font: '', measureText: (text: string) => ({ width: String(text).length * 8 }) })
})

function stubHeight<T extends HTMLElement>(node: T, height: number): T {
  Object.defineProperty(node, 'offsetHeight', { value: height, configurable: true })
  return node
}

describe('readMeasurements', () => {
  it('读取元素高度与表格行高（原始 px，不做换算）', () => {
    document.body.innerHTML = `
      <div data-measure-id="a" style="height:38px"></div>
      <div data-measure-id="t">
        <table class="print-table"><tbody>
          <tr data-row-index="0"></tr><tr data-row-index="1"></tr>
        </tbody></table>
      </div>`
    stubHeight(document.querySelector('[data-measure-id="a"]') as HTMLElement, 38)
    stubHeight(document.querySelector('[data-measure-id="t"]') as HTMLElement, 760)
    const rows = document.querySelectorAll('tbody > tr[data-row-index]')
    stubHeight(rows[0] as HTMLElement, 38)
    stubHeight(rows[1] as HTMLElement, 190)

    const result = readMeasurements(document)
    expect(result).toEqual([
      { id: 'a', heightPx: 38 },
      { id: 't', heightPx: 760, rowHeightsPx: [38, 190] },
    ])
  })

  it('缺 data-measure-id 的元素被跳过', () => {
    document.body.innerHTML = '<div data-measure-id=""><span></span></div>'
    expect(readMeasurements(document)).toEqual([])
  })
})

describe('readContentBottom', () => {
  it('取内容区后代相对页面顶部的最大底边（px）', () => {
    document.body.innerHTML = `
      <section class="print-page">
        <div class="content-area"><div id="inner"></div></div>
      </section>`
    const page = document.querySelector('.print-page') as HTMLElement
    const inner = document.querySelector('#inner') as HTMLElement
    Object.defineProperty(page, 'getBoundingClientRect', { value: () => ({ top: 100, bottom: 400 }) })
    Object.defineProperty(inner, 'getBoundingClientRect', { value: () => ({ top: 120, bottom: 250, height: 130 }) })
    expect(readContentBottom(document)).toBe(150) // 250 - 100
  })

  it('缺少打印页或内容区时返回 0', () => {
    document.body.innerHTML = '<div></div>'
    expect(readContentBottom(document)).toBe(0)
  })
})

describe('renderCodes', () => {
  it('返回 键→SVG 映射，键与 codeSpecKey 一致', () => {
    const key = codeSpecKey('12345678', 'barcode', { barcodeType: 'CODE128' })
    const map = renderCodes([{ key, value: '12345678', cellType: 'barcode', opts: { barcodeType: 'CODE128' } }])
    expect(Object.keys(map)).toEqual([key])
    expect(map[key]).toContain('<svg')
  })

  it('二维码同样产出 SVG', () => {
    const key = codeSpecKey('https://example.com', 'qrcode', { qrCodeLevel: 'M' })
    const map = renderCodes([{ key, value: 'https://example.com', cellType: 'qrcode', opts: { qrCodeLevel: 'M' } }])
    expect(map[key]).toContain('shape-rendering="crispEdges"')
  })

  it('码值渲染失败时跳过该键，交由 core 降级为文本占位', () => {
    const key = codeSpecKey('', 'barcode', {})
    const map = renderCodes([{ key, value: '', cellType: 'barcode', opts: {} }])
    expect(map).toEqual({})
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/browser/__tests__/dom-executor.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../dom-executor.js"`

- [ ] **Step 3: 实现**

```ts
// packages/print-core/src/browser/browser-code-renderer.ts（改为导出可复用的纯函数）
/** 码值 → SVG；供 browserCodeRenderer 与 DOM 执行器共用同一算法 */
export function renderCodeSvg(value: string, cellType: 'barcode' | 'qrcode', opts: CodeRenderOptions = {}): string {
  if (!value) throw new Error('empty barcode value')
  return cellType === 'qrcode' ? renderQrSvg(value, opts) : renderBarcodeSvg(value, opts)
}

/** 浏览器条码/二维码渲染器；码值非法或为空时抛错，由渲染管线降级文本占位 */
export const browserCodeRenderer: CodeRenderer = {
  render(value, cellType, opts = {}) {
    return renderCodeSvg(value, cellType, opts)
  },
}
```

```ts
// packages/print-core/src/browser/dom-executor.ts
// 唯一一份 DOM 执行器：浏览器进程内直接调用，服务端/客户端以 IIFE 注入后调用。
import { renderCodeSvg } from './browser-code-renderer.js'
import type { CodeSpec, RawMeasurement } from '../print/types.js'

/** 执行器版本：宿主注入失败时用于日志定位产物不匹配 */
export const EXECUTOR_VERSION = '1'

const DEFAULT_READY_TIMEOUT_MS = 5000

/** 等待文档加载、字体就绪与图片完成；任何失败都不阻断（测量有兜底） */
export async function waitReady(win: Window, timeoutMs = DEFAULT_READY_TIMEOUT_MS): Promise<void> {
  const doc = win.document
  const wait = (task: Promise<unknown>): Promise<unknown> =>
    Promise.race([task, new Promise(resolve => setTimeout(resolve, timeoutMs))])
  const ready = (async () => {
    if (doc.readyState !== 'complete') {
      await wait(new Promise<void>(resolve => win.addEventListener('load', () => resolve(), { once: true })))
    }
    const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts
    if (fonts?.ready) await wait(fonts.ready)
    await wait(Promise.all(Array.from(doc.images ?? []).map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    )))
  })()
  await wait(ready)
}

/** 读取 [data-measure-id] 元素高度与表格行高（原始 CSS px） */
export function readMeasurements(doc: Document): RawMeasurement[] {
  const result: RawMeasurement[] = []
  doc.querySelectorAll('[data-measure-id]').forEach(node => {
    const el = node as HTMLElement
    const id = el.getAttribute('data-measure-id')
    if (!id) return
    const table = el.querySelector('table.print-table')
    if (!table) {
      result.push({ id, heightPx: el.offsetHeight })
      return
    }
    const rowHeightsPx: number[] = []
    table.querySelectorAll('tbody > tr[data-row-index]').forEach(row => {
      rowHeightsPx.push((row as HTMLElement).offsetHeight)
    })
    result.push({ id, heightPx: el.offsetHeight, rowHeightsPx })
  })
  return result
}

/** 内容区后代相对 .print-page 顶部的最大底边（CSS px）；绝对定位元素的几何由真实引擎决定 */
export function readContentBottom(doc: Document): number {
  const page = doc.querySelector('.print-page') as HTMLElement | null
  const area = doc.querySelector('.content-area') as HTMLElement | null
  if (!page || !area) return 0
  const pageTop = page.getBoundingClientRect().top
  let maxBottom = 0
  area.querySelectorAll<HTMLElement>('*').forEach(node => {
    const rect = node.getBoundingClientRect()
    if (rect.height > 0) maxBottom = Math.max(maxBottom, rect.bottom - pageTop)
  })
  const areaRect = area.getBoundingClientRect()
  if (areaRect.height > 0) maxBottom = Math.max(maxBottom, areaRect.bottom - pageTop)
  return maxBottom
}

/** 码值 → SVG 映射；单项失败跳过，交由 core 降级文本占位 */
export function renderCodes(specs: CodeSpec[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const spec of specs) {
    try {
      map[spec.key] = renderCodeSvg(spec.value, spec.cellType, spec.opts)
    } catch {
      // 单值失败不影响其它码值
    }
  }
  return map
}

/** 注入后挂在 globalThis.__wormDom 上的执行器对象 */
export const domExecutor = {
  version: EXECUTOR_VERSION,
  waitReady,
  readMeasurements,
  readContentBottom,
  renderCodes,
}
```

```ts
// packages/print-core/src/browser/dom-executor.iife.ts
import { domExecutor } from './dom-executor.js'

// IIFE 入口：服务端 Playwright 与客户端 Electron 注入该产物后调用同一份执行器
;(globalThis as Record<string, unknown>).__wormDom = domExecutor
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/browser/__tests__/dom-executor.spec.ts`
Expected: PASS（7 个用例）

```bash
git add packages/print-core/src/browser/browser-code-renderer.ts packages/print-core/src/browser/dom-executor.ts packages/print-core/src/browser/dom-executor.iife.ts packages/print-core/src/browser/__tests__/dom-executor.spec.ts
git commit -m "feat(core)：新增唯一的浏览器 DOM 执行器"
```

---

### Task 10: core/browser 接线（iframe driver、浏览器 runtime、`renderHtmlPages` 薄包装）

**Files:**
- Modify: `packages/print-core/src/print/types.ts`（`PrintJob` 追加 `codeRenderer?`）
- Modify: `packages/print-core/src/print/pipeline.ts`（尊重调用方传入的 `codeRenderer`）
- Create: `packages/print-core/src/browser/driver-iframe.ts`
- Create: `packages/print-core/src/browser/browser-runtime.ts`
- Modify: `packages/print-core/src/browser/browser-pagination.ts`（改为薄包装）+ `packages/print-core/src/browser/index.ts`
- Test: `packages/print-core/src/browser/__tests__/browser-runtime.spec.ts`

**Interfaces:**
- Consumes: Task 7 的 `prepareDocument`；Task 9 的 `domExecutor`
- Produces: `createIframeDriver()`、`createBrowserPrintRuntime()`；`renderHtmlPages` 保持原签名与原返回字段

- [ ] **Step 1: 写失败测试（外部渲染器覆盖 + 走 core 管线）**

```ts
// packages/print-core/src/browser/__tests__/browser-runtime.spec.ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createBrowserPrintRuntime } from '../browser-runtime.js'
import { renderHtmlPages } from '../browser-pagination.js'
import type { CodeRenderer, TemplateData } from '../../render/types.js'

const template = {
  paperSize: 'A4', orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  elements: [{ id: 'a', type: 'text', options: { left: 0, top: 0, width: 40, height: 8, formatter: 'hi' } }],
} as unknown as TemplateData

describe('renderHtmlPages', () => {
  it('调用方传入 CodeRenderer 时直接使用，不走向量收集与页面渲染', async () => {
    const calls: string[] = []
    const custom: CodeRenderer = {
      render(value) { calls.push(value); return '<svg id="custom"/>' },
    }
    const result = await renderHtmlPages(template, {}, undefined, custom)
    expect(result.pageCount).toBeGreaterThanOrEqual(1)
    expect(result.paperMm).toEqual({ width: 210, height: 297 })
    expect(result.continuous).toBe(false)
    expect(calls).toHaveLength(0) // 模板无码值元素
    expect(typeof result.html).toBe('string')
  })

  it('不传 CodeRenderer 时由 runtime 自建（走 core 管线）', async () => {
    const result = await renderHtmlPages(template, {})
    expect(result.html).toContain('data-page="1"')
  })
})

describe('createBrowserPrintRuntime', () => {
  it('返回可用的 runtime（含 withSession）', () => {
    expect(typeof createBrowserPrintRuntime().withSession).toBe('function')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w @worm-vue3-print/core -- src/browser/__tests__/browser-runtime.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../browser-runtime.js"`

- [ ] **Step 3: 实现**

```ts
// packages/print-core/src/print/types.ts（PrintJob 追加一个字段）
  /** 调用方提供的码值渲染器（浏览器端沿用既有覆盖语义）；提供时跳过多趟收集 */
  codeRenderer?: import('../render/types.js').CodeRenderer
```

```ts
// packages/print-core/src/print/pipeline.ts（buildHtmlWithCodes 开头追加）
  if (input.job.codeRenderer) {
    const html = generateHtml(input.bound, input.pageLayouts, input.job.printData, {
      isMeasurementPass: input.isMeasurementPass,
      codeRenderer: input.job.codeRenderer,
    })
    return { html, codeRenderer: input.job.codeRenderer, map: baseMap }
  }
```

```ts
// packages/print-core/src/browser/driver-iframe.ts
import { domExecutor } from './dom-executor.js'
import type { DriverFactory, ExecutorBundle, PageDriver } from '../print/driver.js'
import type { PdfTargetSpec, RawMeasurement, ScreenshotTargetSpec, ViewportPx } from '../print/types.js'

/** 浏览器 iframe driver：进程内直调执行器，不需要注入脚本；不支持出图 */
export function createIframeDriverFactory(): DriverFactory {
  return {
    async createDriver(): Promise<PageDriver> {
      const iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.style.cssText =
        'position:fixed;left:-10000px;top:0;border:0;visibility:hidden;pointer-events:none;'
      document.body.appendChild(iframe)
      let viewport: ViewportPx = { width: 0, height: 0 }
      let doc: Document = iframe.contentDocument ?? document

      return {
        async open(next): Promise<void> {
          viewport = next
          iframe.style.width = `${next.width}px`
          iframe.style.height = `${next.height}px`
          doc = iframe.contentDocument ?? document
        },
        async setContent(html: string): Promise<void> {
          doc = iframe.contentDocument ?? document
          doc.open()
          doc.write(html)
          doc.close()
        },
        async injectExecutor(_bundle: ExecutorBundle): Promise<void> {
          // 进程内直调 domExecutor，无需注入
        },
        async evaluate<T>(method, args): Promise<T> {
          const fn = domExecutor[method] as (...rest: unknown[]) => unknown
          if (method === 'waitReady') return fn(iframe.contentWindow, ...(args ?? [])) as T
          return fn(doc, ...(args ?? [])) as T
        },
        async pdf(_html: string, _spec: PdfTargetSpec): Promise<Uint8Array> {
          throw new Error('浏览器端不提供 PDF')
        },
        async close(): Promise<void> {
          iframe.remove()
        },
      }
    },
  }
}
```

> 说明：`renderCodes` 无 DOM 参数，`evaluate` 已按方法名分派；`viewport` 记录在 `open`，iframe 尺寸即测量容器。

```ts
// packages/print-core/src/browser/browser-runtime.ts
import { createDomHostRuntime } from '../print/dom-host-runtime.js'
import { createIframeDriverFactory } from './driver-iframe.js'
import type { PrintRuntime } from '../print/ports.js'

/** 浏览器端 runtime：iframe driver + 进程内执行器；不提供 PDF/截图 */
export function createBrowserPrintRuntime(): PrintRuntime {
  return createDomHostRuntime(createIframeDriverFactory())
}
```

```ts
// packages/print-core/src/browser/browser-pagination.ts（替换原实现，签名与返回字段不变）
import { createBrowserPrintRuntime } from './browser-runtime.js'
import { prepareDocument } from '../print/pipeline.js'
import type { CodeRenderer, PageLayout, TemplateData as PrintTemplateData } from '../render/types.js'

export interface BrowserRenderResult {
  html: string
  pageCount: number
  pageLayouts: PageLayout[]
  paperMm: { width: number; height: number }
  continuous: boolean
}

export interface BrowserRenderOptions {
  /** 连续纸显式纸高覆盖（mm） */
  paperHeightMm?: number
}

/**
 * 浏览器内完成「绑定 → 测量 → 分页 → 连续纸推导 → 最终 HTML」。
 * 与 print-render / print-client 走同一份 core 管线，仅 driver 不同。
 */
export async function renderHtmlPages(
  template: PrintTemplateData,
  printData?: Record<string, any> | Record<string, any>[],
  baseUrl?: string,
  codeRenderer?: CodeRenderer,
  options?: BrowserRenderOptions,
): Promise<BrowserRenderResult> {
  const prepared = await prepareDocument(
    {
      templateJson: template,
      printData: printData as Record<string, any> | undefined,
      baseUrl,
      paperHeightMm: options?.paperHeightMm,
      codeRenderer,
    },
    createBrowserPrintRuntime(),
  )
  return {
    html: prepared.html,
    pageCount: prepared.pageCount,
    pageLayouts: prepared.pageLayouts,
    paperMm: prepared.paperMm,
    continuous: prepared.continuous,
  }
}

export type { CodeRenderer }
```

```ts
// packages/print-core/src/browser/index.ts（追加导出）
export { createBrowserPrintRuntime } from './browser-runtime.js'
export { createIframeDriverFactory } from './driver-iframe.js'
export { domExecutor, EXECUTOR_VERSION, waitReady, readMeasurements, readContentBottom, renderCodes } from './dom-executor.js'
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npm run test -w @worm-vue3-print/core -- src/browser`
Expected: PASS（含既有码制用例与新增 runtime 用例）

Run: `npm run test -w @worm-vue3-print/canvas`
Expected: PASS（画布预览与客户端同一路径，必须无回归）

```bash
git add packages/print-core/src/print packages/print-core/src/browser
git commit -m "feat(core)：浏览器端改用共享管线与 iframe driver"
```

---

### Task 11: core IIFE 产物与 Node 出口

**Files:**
- Modify: `packages/print-core/tsup.config.ts`
- Modify: `packages/print-core/package.json`
- Create: `packages/print-core/src/node/index.ts`
- Test: `packages/print-core/src/node/__tests__/executor-bundle.spec.ts`

**Interfaces:**
- Consumes: Task 9 的 IIFE 入口
- Produces: `@worm-vue3-print/core/browser/dom-executor.iife`（文件路径导出）、`@worm-vue3-print/core/node` 的 `loadExecutorBundle(): ExecutorBundle`

- [ ] **Step 1: 写失败测试**

```ts
// packages/print-core/src/node/__tests__/executor-bundle.spec.ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { loadExecutorBundle } from '../index.js'

describe('loadExecutorBundle', () => {
  it('读取 core 自带的执行器产物并返回版本', () => {
    const bundle = loadExecutorBundle()
    expect(bundle.version).toBe('1')
    expect(bundle.source).toContain('__wormDom')
  })

  it('产物在当前作用域求值后可挂载出四个执行器方法', () => {
    const bundle = loadExecutorBundle()
    ;(0, eval)(bundle.source)
    const dom = (globalThis as Record<string, any>).__wormDom
    for (const name of ['waitReady', 'readMeasurements', 'readContentBottom', 'renderCodes']) {
      expect(typeof dom[name]).toBe('function')
    }
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run build -w @worm-vue3-print/core && npm run test -w @worm-vue3-print/core -- src/node/__tests__/executor-bundle.spec.ts`
Expected: FAIL，`dist/dom-executor.iife.js` 不存在

- [ ] **Step 3: 增加 IIFE 构建与 Node 出口**

```ts
// packages/print-core/tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/designer/index.ts', 'src/browser/index.ts', 'src/node/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    shims: true,
  },
  {
    // 注入用产物：服务端 Playwright 与客户端 Electron 共用同一份执行器
    entry: { 'dom-executor.iife': 'src/browser/dom-executor.iife.ts' },
    format: ['iife'],
    globalName: '__wormDomBundle',
    platform: 'browser',
    dts: false,
    clean: false,
    minify: true,
  },
])
```

```json
// packages/print-core/package.json（exports 追加两项，files 保持 ["dist"]）
"exports": {
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" },
  "./designer": { "types": "./dist/designer/index.d.ts", "import": "./dist/designer/index.js", "require": "./dist/designer/index.cjs" },
  "./browser": { "types": "./dist/browser/index.d.ts", "import": "./dist/browser/index.js", "require": "./dist/browser/index.cjs" },
  "./browser/dom-executor.iife": "./dist/dom-executor.iife.js",
  "./node": { "types": "./dist/node/index.d.ts", "import": "./dist/node/index.js", "require": "./dist/node/index.cjs" }
}
```

```ts
// packages/print-core/src/node/index.ts
// Node 宿主专用出口（服务端、Electron 主进程）；浏览器端不得 import 本文件。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { ExecutorBundle } from '../print/driver.js'

/** 读取 core 自带的 DOM 执行器 IIFE 产物；宿主把它注入页面后即可调用 __wormDom */
export function loadExecutorBundle(): ExecutorBundle {
  const require_ = createRequire(import.meta.url)
  const file = require_.resolve('@worm-vue3-print/core/browser/dom-executor.iife')
  return { source: readFileSync(file, 'utf8'), version: '1' }
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npm run build -w @worm-vue3-print/core && npm run test -w @worm-vue3-print/core -- src/node/__tests__/executor-bundle.spec.ts`
Expected: PASS（2 个用例），且 `ls packages/print-core/dist/dom-executor.iife.js` 存在

```bash
git add packages/print-core/tsup.config.ts packages/print-core/package.json packages/print-core/src/node
git commit -m "build(core)：新增 DOM 执行器 IIFE 产物与 Node 出口"
```

---

### Task 12: 服务端切换（Playwright driver + core 管线）

**Files:**
- Modify: `packages/print-core/src/render/types.ts`（`RenderRequest` 追加两个可选逃生门字段）
- Create: `services/print-render/src/driver-playwright.ts`
- Modify: `services/print-render/src/pdf-render.ts`（内部改调 core，保留导出）
- Delete: `services/print-render/src/barcode-renderer.ts`、`services/print-render/src/barcode-renderer.test.ts`
- Modify: `services/print-render/package.json`、`package-lock.json`、`.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 11 的 `loadExecutorBundle()`、Task 6 的 `createDomHostRuntime`、Task 7 的 `renderPdf`/`renderScreenshot`
- Produces: `createPlaywrightDriverFactory(pool?)`；`renderPdf(request): Promise<Buffer>`、`renderScreenshot(request): Promise<Buffer>`（签名与导出名不变）

- [ ] **Step 1: 给 RenderRequest 增加逃生门字段**

```ts
// packages/print-core/src/render/types.ts（RenderRequest 追加）
  /** 宿主纸张覆盖（mm）：宽/高沿用 print.paperSize 语义，0 或负数视为未提供 */
  paperOverride?: { width?: number; height?: number }
  /** 连续纸显式纸高（mm）逃生门 */
  paperHeightMm?: number
```

- [ ] **Step 2: 实现 Playwright driver**

```ts
// services/print-render/src/driver-playwright.ts
import type { Page } from 'playwright'
import { toPlaywrightPdfOptions } from '@worm-vue3-print/core'
import type {
  DriverFactory, ExecutorBundle, ExecutorMethod, PageDriver, PdfTargetSpec, ScreenshotTargetSpec, ViewportPx,
} from '@worm-vue3-print/core'
import { BrowserPool } from './browser-pool.js'

class PlaywrightDriver implements PageDriver {
  private injected = false

  constructor(private readonly page: Page, private readonly pool: BrowserPool) {}

  async open(viewport: ViewportPx): Promise<void> {
    await this.page.setViewportSize(viewport)
  }

  async setContent(html: string): Promise<void> {
    // 就绪等待交给 core 执行器的 waitReady，这里只保证「可执行脚本」
    await this.page.setContent(html, { waitUntil: 'domcontentloaded' })
    this.injected = false
  }

  async injectExecutor(bundle: ExecutorBundle): Promise<void> {
    if (this.injected) return
    await this.page.addScriptTag({ content: bundle.source })
    this.injected = true
  }

  async evaluate<T>(method: ExecutorMethod, args: unknown[] = []): Promise<T> {
    return this.page.evaluate(
      ({ name, payload }) => {
        const dom = (globalThis as Record<string, any>).__wormDom
        if (!dom) throw new Error('DOM 执行器未注入')
        const fn = dom[name]
        if (typeof fn !== 'function') throw new Error(`执行器缺少方法：${name}`)
        return name === 'waitReady' ? fn(window, ...payload) : fn(document, ...payload)
      },
      { name: method, payload: args },
    ) as Promise<T>
  }

  async pdf(_html: string, spec: PdfTargetSpec): Promise<Uint8Array> {
    return new Uint8Array(await this.page.pdf(toPlaywrightPdfOptions(spec)))
  }

  async screenshot(_html: string, spec: ScreenshotTargetSpec): Promise<Uint8Array> {
    const buffer = await this.page.screenshot({
      type: spec.type, fullPage: spec.fullPage, omitBackground: spec.omitBackground,
    })
    return new Uint8Array(buffer)
  }

  async close(): Promise<void> {
    await this.pool.release(this.page)
  }
}

/** 每任务一个 driver：BrowserPool 的 acquire/release 本身即「请求级绑定」 */
export function createPlaywrightDriverFactory(pool: BrowserPool = BrowserPool.getInstance()): DriverFactory {
  return {
    async createDriver(): Promise<PageDriver> {
      return new PlaywrightDriver(await pool.acquire(), pool)
    },
  }
}
```

- [ ] **Step 3: 改写 pdf-render.ts（保留导出名与签名）**

```ts
// services/print-render/src/pdf-render.ts
import {
  createDomHostRuntime,
  renderPdf as coreRenderPdf,
  renderScreenshot as coreRenderScreenshot,
} from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import type { PrintJob, PrintRuntime, RenderRequest } from '@worm-vue3-print/core'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

/** 与 server.ts 的请求级超时同源；core 预算留 1s 余量，避免外层先回 504、内部仍在跑 */
const REQUEST_BUDGET_MS = 30_000
const BUDGET_MARGIN_MS = 1_000

let cachedRuntime: PrintRuntime | undefined

function runtime(): PrintRuntime {
  if (!cachedRuntime) {
    cachedRuntime = createDomHostRuntime(
      createPlaywrightDriverFactory(BrowserPool.getInstance()),
      loadExecutorBundle(),
    )
  }
  return cachedRuntime
}

function toJob(request: RenderRequest): PrintJob {
  return {
    templateJson: request.templateJson,
    printData: request.printData,
    baseUrl: request.baseUrl,
    paperOverride: request.paperOverride,
    paperHeightMm: request.paperHeightMm,
    timeoutMs: REQUEST_BUDGET_MS - BUDGET_MARGIN_MS,
  }
}

/** 两遍渲染生成 PDF：与浏览器、客户端走同一份 core 管线 */
export async function renderPdf(request: RenderRequest): Promise<Buffer> {
  const { pdf } = await coreRenderPdf(toJob(request), runtime())
  return Buffer.from(pdf)
}

/** 单遍渲染生成 PNG 截图（测量模式 HTML，不分页） */
export async function renderScreenshot(request: RenderRequest): Promise<Buffer> {
  return Buffer.from(await coreRenderScreenshot(toJob(request), runtime()))
}
```

- [ ] **Step 4: 删除 bwip-js 实现与依赖，调整 CI 步骤**

```bash
git rm services/print-render/src/barcode-renderer.ts services/print-render/src/barcode-renderer.test.ts
npm pkg delete dependencies.bwip-js -w @worm-vue3-print/render
npm install --package-lock-only
```

```yaml
# .github/workflows/ci.yml：render job 中原「条码渲染单元测试」步骤替换为：
      - name: 连续纸与出图规格集成测试
        run: npm run test -w @worm-vue3-print/render -- src/continuous.integration.test.ts
        timeout-minutes: 5
```

- [ ] **Step 5: 构建并跑既有服务端测试（证明导出兼容）**

Run: `npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/render && npm run test -w @worm-vue3-print/render -- src/subtotal.integration.test.ts src/screenshot.test.ts`
Expected: PASS（这两个测试文件未改动即通过）

```bash
git add packages/print-core/src/render/types.ts services/print-render package.json package-lock.json .github/workflows/ci.yml
git commit -m "feat(render)：服务端改用 core 管线与 Playwright driver，移除 bwip-js"
```

---

### Task 13: 服务端连续纸与出图规格集成测试

**Files:**
- Create: `services/print-render/src/continuous.integration.test.ts`

**Interfaces:**
- Consumes: Task 12 的 `renderPdf`、core 的 `prepareDocument`/`createDomHostRuntime`/`renderPdf`
- Produces: 覆盖「服务端连续纸从无实现到有实现」的回归用例

- [ ] **Step 1: 写测试**

```ts
// services/print-render/src/continuous.integration.test.ts
// 端到端：连续纸模板经 测量 → 分页 → 探针推导 → PDF；服务端此前固定输出 80×297mm
import { describe, it, expect } from 'vitest'
import { createDomHostRuntime, prepareDocument, renderPdf as coreRenderPdf } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'
import { renderPdf } from './pdf-render.js'

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
      { id: 't1', type: 'text', options: { left: 0, top: 0, width: 60, height: 8, formatter: '第一行' } },
      { id: 't2', type: 'text', options: { left: 0, top: 20, width: 60, height: 8, formatter: '第二行' } },
    ],
  } as PrintTemplateData
}

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

describe('服务端连续纸渲染', () => {
  it('纸高按内容推导，而不是固定 297mm', async () => {
    const prepared = await prepareDocument({ templateJson: continuousTemplate(), printData: {} }, runtime)
    expect(prepared.continuous).toBe(true)
    expect(prepared.heightSource).toBe('derived')
    expect(prepared.paperMm.width).toBe(80)
    expect(prepared.paperMm.height).toBeGreaterThanOrEqual(25.4)
    expect(prepared.paperMm.height).toBeLessThan(60)
  }, 30000)

  it('纸高逃生门生效且不再走探针', async () => {
    const prepared = await prepareDocument(
      { templateJson: continuousTemplate(), printData: {}, paperHeightMm: 120 },
      runtime,
    )
    expect(prepared.paperMm.height).toBe(120)
    expect(prepared.heightSource).toBe('config')
  }, 30000)

  it('产物以 %PDF 开头、非空且页数为 1', async () => {
    const { pdf, prepared } = await coreRenderPdf({ templateJson: continuousTemplate(), printData: {} }, runtime)
    expect(Buffer.from(pdf.subarray(0, 4)).toString('latin1')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
    expect(prepared.pageCount).toBe(1)
  }, 30000)

  it('HTTP 层 renderPdf 返回 PDF Buffer（导出兼容）', async () => {
    const buffer = await renderPdf({ templateJson: continuousTemplate(), printData: {} })
    expect(Buffer.from(buffer.subarray(0, 4)).toString('latin1')).toBe('%PDF')
  }, 30000)
})
```

- [ ] **Step 2: 运行测试（需要本机 Chromium/Chrome）**

Run: `npx playwright install chromium`（仅当系统没有任何 Chromium 内核浏览器时）
Run: `npm run build -w @worm-vue3-print/core && npm run test -w @worm-vue3-print/render -- src/continuous.integration.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 3: 提交**

```bash
git add services/print-render/src/continuous.integration.test.ts
git commit -m "test(render)：新增服务端连续纸与出图规格集成测试"
```

---

### Task 14: 客户端切换（Electron driver + core 管线）

**Files:**
- Create: `clients/print-client/src/main/driver-electron.ts`
- Create: `clients/print-client/src/main/print-settings.ts`（由 `render-engine.ts` 搬移 `buildWebPrintSettings`）
- Modify: `clients/print-client/src/main/print-engine.ts`
- Delete: `clients/print-client/src/main/render-engine.ts`、`src/main/paper.ts`、`src/main/renderer-pool.ts`、`src/preload/worker-preload.ts`、`src/shared/render-protocol.ts`、`src/worker/*`
- Modify: `clients/print-client/electron.vite.config.ts`

**Interfaces:**
- Consumes: Task 11 的 `loadExecutorBundle()`、Task 6 的 `createDomHostRuntime`、Task 7 的 `renderPdf`、Task 3 的 `buildPdfTargetSpec`/`toElectronPrintToPdfOptions`
- Produces: `createElectronDriverFactory()`；`print-engine` 的 `submit`/`submitHtml` 对外行为不变

- [ ] **Step 1: 实现 Electron driver**

```ts
// clients/print-client/src/main/driver-electron.ts
import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { toElectronPrintToPdfOptions } from '@worm-vue3-print/core'
import type {
  DriverFactory, ExecutorBundle, ExecutorMethod, PageDriver, PdfTargetSpec, ViewportPx,
} from '@worm-vue3-print/core'

/** 模板 HTML 临时目录（隐藏窗口顶层文档） */
const DOM_HOST_DIR = join(tmpdir(), 'worm-print-client')

/**
 * Electron driver：常驻隐藏窗口承载模板 HTML（顶层文档）。
 * core 生成的 HTML 是 mm 绝对定位，测量不依赖窗口尺寸，因此 open(viewport) 为 no-op。
 */
export function createElectronDriverFactory(): DriverFactory {
  return {
    async createDriver(): Promise<PageDriver> {
      const win = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      })
      let currentFile = ''
      let injected = false

      const clearFile = (): void => {
        if (!currentFile) return
        rmSync(currentFile, { force: true })
        currentFile = ''
      }

      return {
        async open(_viewport: ViewportPx): Promise<void> {
          // 测量容器由 HTML 的 mm 尺寸决定
        },
        async setContent(html: string): Promise<void> {
          mkdirSync(DOM_HOST_DIR, { recursive: true })
          clearFile()
          currentFile = join(DOM_HOST_DIR, `${randomUUID()}.html`)
          writeFileSync(currentFile, html, 'utf8')
          await win.loadFile(currentFile)
          injected = false
        },
        async injectExecutor(bundle: ExecutorBundle): Promise<void> {
          if (injected) return
          await win.webContents.executeJavaScript(bundle.source, true)
          injected = true
        },
        async evaluate<T>(method: ExecutorMethod, args: unknown[] = []): Promise<T> {
          const isWaitReady = method === 'waitReady'
          const code = `(() => {
            const dom = globalThis.__wormDom
            if (!dom) throw new Error('DOM 执行器未注入')
            const fn = dom[${JSON.stringify(method)}]
            if (typeof fn !== 'function') throw new Error('执行器缺少方法：' + ${JSON.stringify(method)})
            const payload = ${JSON.stringify(args)}
            return ${isWaitReady ? 'fn(window, ...payload)' : 'fn(document, ...payload)'}
          })()`
          return win.webContents.executeJavaScript(code, true) as Promise<T>
        },
        async pdf(_html: string, spec: PdfTargetSpec): Promise<Uint8Array> {
          // 文档已由会话载入并等待就绪，直接出图
          return new Uint8Array(await win.webContents.printToPDF(toElectronPrintToPdfOptions(spec)))
        },
        async close(): Promise<void> {
          clearFile()
          if (!win.isDestroyed()) win.destroy()
        },
      }
    },
  }
}
```

- [ ] **Step 2: 改写 print-engine 的渲染与出图路径**

```ts
// clients/print-client/src/main/print-engine.ts（关键改动，其余保持原样）
import {
  buildPdfTargetSpec,
  createDomHostRuntime,
  millimetersToMicrometers,
  micrometersToMillimeters,
  paperViewportPx,
  renderPdf,
} from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import type { PrintJob, PrintRuntime } from '@worm-vue3-print/core'
import { createElectronDriverFactory } from './driver-electron.js'

const runtime: PrintRuntime = createDomHostRuntime(createElectronDriverFactory(), loadExecutorBundle())

/** 协议里的 print.paperSize 单位是微米；core 的覆盖逃生门用毫米 */
function toPaperOverride(paperSize?: { width?: number; height?: number }): PrintJob['paperOverride'] {
  const width = paperSize?.width && paperSize.width > 0 ? micrometersToMillimeters(paperSize.width) : undefined
  const height = paperSize?.height && paperSize.height > 0 ? micrometersToMillimeters(paperSize.height) : undefined
  return width || height ? { width, height } : undefined
}

// ── submit：客户端内渲染 ──
const job: PrintJob = {
  templateJson: spec.templateJson as PrintTemplateData,
  printData: spec.printData,
  baseUrl: spec.baseUrl,
  paperOverride: toPaperOverride(print.paperSize),
  timeoutMs: PDF_GENERATION_TIMEOUT_MS,
}
const { pdf, prepared } = await renderPdf(job, runtime)
const paperMicrometers = {
  width: millimetersToMicrometers(prepared.paperMm.width),
  height: millimetersToMicrometers(prepared.paperMm.height),
}

// ── submitHtml：浏览器预渲染 HTML 直提交，不跑管线，只复用出图规格与超时 ──
const pdfSpec = buildPdfTargetSpec({ width: job.paperMm.width, height: job.paperMm.height })
const pdf = await runtime.withSession(
  { timeoutMs: PDF_GENERATION_TIMEOUT_MS },
  session => session.toPdf(job.html, pdfSpec, paperViewportPx(job.paperMm)),
)
```

> `buildWebPrintSettings` 原样搬到 `print-settings.ts`（份数、驱动纸型名、页范围仍属客户端）。

- [ ] **Step 3: 删除旧实现并清理构建配置**

```bash
git rm clients/print-client/src/main/render-engine.ts \
       clients/print-client/src/main/paper.ts \
       clients/print-client/src/main/renderer-pool.ts \
       clients/print-client/src/preload/worker-preload.ts \
       clients/print-client/src/shared/render-protocol.ts
git rm -r clients/print-client/src/worker
```

```ts
// clients/print-client/electron.vite.config.ts（preload / renderer 两处）
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
        input: { index: resolve(__dirname, 'src/preload/index.ts') }, // 不再有 worker-preload
      },
    },
  },
  renderer: {
    plugins: [vue()],
    root: 'src',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }, // 不再有 worker 页面
      },
    },
  },
```

- [ ] **Step 4: 构建并跑客户端测试**

Run: `npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/print-client`
Expected: 构建成功；`grep -c "createElectronDriverFactory" clients/print-client/out/main/index.js` 大于 0

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: 除 Task 15 明确迁移的用例外全部通过

```bash
git add clients/print-client
git commit -m "feat(print-client)：改用 core 管线与 Electron driver，删除 worker 与 IPC 桥"
```

---

### Task 15: 客户端测试迁移与打包冒烟

**Files:**
- Rename: `clients/print-client/src/main/render-engine.test.ts` → `print-settings.test.ts`
- Delete: `clients/print-client/src/main/paper.test.ts`、`clients/print-client/src/main/pdf-generator.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `paper.spec.ts`（已覆盖 7 条 `resolvePaper` 用例）、Task 3 的 `pdf-spec.spec.ts`（已覆盖换算与规格）
- Produces: 客户端不再保留重复实现的测试；`buildWebPrintSettings` 测试留在客户端

- [ ] **Step 1: 迁移与删除测试**

```bash
git mv clients/print-client/src/main/render-engine.test.ts clients/print-client/src/main/print-settings.test.ts
git rm clients/print-client/src/main/paper.test.ts clients/print-client/src/main/pdf-generator.test.ts
```

```ts
// clients/print-client/src/main/print-settings.test.ts（只改 import，断言保持原样）
import { describe, it, expect } from 'vitest'
import { buildWebPrintSettings } from './print-settings.js'
```

- [ ] **Step 2: 运行客户端测试并确认无残留引用**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: PASS

Run: `rg -n "pdf-generator|render-engine|paper\.js|renderer-pool|render-protocol|worker-preload" clients/print-client/src clients/print-client/electron.vite.config.ts`
Expected: 无输出

- [ ] **Step 3: 打包冒烟（验证 asar 内 core 可解析）**

Run: `npm run pack:client:dir`
Expected: 产出 `clients/print-client/dist/*-unpacked`；启动应用日志无 `Cannot find module '@worm-vue3-print/core'`

Run: `node clients/print-client/scripts/smoke.mjs`
Expected: `hello` → `printers.list` → `print.submit` 三步成功

```bash
git add clients/print-client
git commit -m "test(print-client)：迁移打印设置测试并验证 asar 内 core 解析"
```

---

### Task 16: 防复制回归门禁

**Files:**
- Create: `scripts/check-print-architecture.mjs`
- Modify: `package.json`（新增 `lint:print-architecture`）
- Modify: `.github/workflows/ci.yml`（build-test 与 render job 各加一步）

**Interfaces:**
- Consumes: 无
- Produces: 可在本地与 CI 运行的架构守卫命令

- [ ] **Step 1: 实现守卫脚本**

```js
// scripts/check-print-architecture.mjs
// 架构守卫：三端不得各自实现测量、纸高推导、出图参数与码制渲染；这些必须来自 core。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TARGETS = ['services/print-render/src', 'clients/print-client/src']
/** 白名单：允许出现宿主能力的文件（driver 与平台适配层） */
const ALLOW = [
  /client\/src\/main\/driver-electron\.ts$/,
  /render\/src\/driver-playwright\.ts$/,
  /client\/src\/main\/pdf-printer\.ts$/, // 出纸命令：唯一消费者，属平台适配
  /\.test\.ts$/,
]
const FORBIDDEN = [
  { pattern: /\boffsetHeight\b|\bgetBoundingClientRect\b/, why: 'DOM 测量必须走 core 的 DOM 执行器' },
  { pattern: /\bcomposeContinuousHeight\b/, why: '连续纸纸高推导必须在 core' },
  { pattern: /from ['"](jsbarcode|qrcode|bwip-js)['"]/, why: '码制渲染必须走 core 执行器' },
  { pattern: /pageSize:\s*\{\s*$/, why: '出图参数必须来自 core 的 pdf-spec' },
]

const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})

const violations = []
for (const target of TARGETS) {
  for (const file of walk(target)) {
    if (!/\.(ts|mjs|js)$/.test(file)) continue
    if (ALLOW.some(rule => rule.test(file))) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    for (const rule of FORBIDDEN) {
      const index = lines.findIndex(text => rule.pattern.test(text))
      if (index >= 0) violations.push(`${file}:${index + 1} ${rule.why}`)
    }
  }
}

if (violations.length > 0) {
  console.error('打印架构守卫未通过：\n' + violations.join('\n'))
  process.exit(1)
}
console.log('打印架构守卫通过：三端未出现重复的测量/纸高/出图/码制实现')
```

- [ ] **Step 2: 接入脚本与 CI**

```json
// package.json（scripts 追加）
"lint:print-architecture": "node scripts/check-print-architecture.mjs",
```

```yaml
# .github/workflows/ci.yml：build-test job 的 npm test 之后、render job 的集成测试之前各加一步
      - run: npm run lint:print-architecture
```

- [ ] **Step 3: 运行守卫并提交**

Run: `npm run lint:print-architecture`
Expected: 输出「打印架构守卫通过」；若有违规先改实现再提交

```bash
git add scripts/check-print-architecture.mjs package.json .github/workflows/ci.yml
git commit -m "chore：新增三端打印架构守卫门禁"
```

---

### Task 17: 文档口径同步与 CHANGELOG

**Files:**
- Modify: `services/print-render/README.md`、`README.md`、`packages/print-core/README.md`
- Modify: `clients/print-client/README.md`
- Modify: `skills/worm-vue3-print-integration/references/silent-print.md`、`troubleshooting.md`、`integration-api.md`
- Modify: `docs/中文/指南/静默打印.md`、`docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md`

**Interfaces:**
- Consumes: 全部实现改动
- Produces: 文档与实现一致，且两处行为变更有明确记录

- [ ] **Step 1: 逐处改写**

```text
1. services/print-render/README.md:9「由服务端纯 Node 侧完成渲染」→
   「模板绑定、分页与 HTML 生成在 Node 侧完成；测量、连续纸探针、码制渲染与出图由 core 的 DOM 执行器在页面上下文执行」
2. README.md:48、README.md:249、packages/print-core/README.md:25 的「保证浏览器预览与服务端输出一致」→
   补限定：「三端共用同一套渲染与分页算法（逻辑同源）；像素级一致还需三端字体与 Chromium 内核同源」
3. clients/print-client/README.md:16-17 架构图、:32-35 目录表、:97 → 删除 worker/IPC 描述，
   改为「主进程装配 core 管线 + Electron driver（隐藏窗口顶层文档 + printToPDF）」，
   目录表补 driver-electron.ts 与 print-settings.ts，删 worker / worker-preload / render-protocol 行
4. skills/worm-vue3-print-integration/references/silent-print.md:7,17 → 客户端渲染描述同步；
   :81-90 的 renderHtmlPages 用法保持不变（签名与第 4 参数覆盖语义未变）
5. skills/worm-vue3-print-integration/references/troubleshooting.md:88 → 出图超时与英寸换算的封装位置
   由 clients/print-client/src/main/pdf-generator.ts 改为 core 的 pdf-spec.ts
6. skills/worm-vue3-print-integration/references/integration-api.md:173 →「服务端测量由 render 服务实现」
   改为「三端测量共用 core 的 DOM 执行器」
7. docs/中文/指南/静默打印.md:173 → 保留字体提示，补一条：三端字体不同仍会让条码固有宽度不同
   （jsbarcode 的 SVG 宽度取 ceil(max(textWidth, barcodeWidth))）
```

- [ ] **Step 2: 记录两处行为变更**

```markdown
<!-- docs/中文/CHANGELOG.md 与 docs/en/CHANGELOG.en.md 同步追加 -->
- `@worm-vue3-print/core`：新增打印管线模块（driver 契约 + 共享 DOM 宿主 runtime + 三端 driver），
  三端统一使用同一份测量、分页、连续纸推导、码制渲染与出图规格；
- `@worm-vue3-print/render`：**行为变更** ① 连续纸模板按内容推导纸高（此前固定 80×297mm）；
  ② 条码/二维码渲染基线由 bwip-js 切换为 jsbarcode/qrcode（与浏览器预览一致）；
  ③ 就绪等待由 `networkidle` 改为 `domcontentloaded` + 5s 就绪等待；
- `print-client`：**行为变更** 客户端测量就绪等待由 3s 调整为 5s；渲染 worker 与 IPC 桥删除，
  改由主进程装配 core 管线与 Electron driver（协议与出纸行为不变）。
```

- [ ] **Step 3: 校验文档引用并提交**

Run: `rg -n "worker-preload|render-protocol|renderer-pool|barcode-renderer|bwip" docs clients services skills README.md packages --glob '!**/node_modules/**'`
Expected: 仅剩本设计与计划文档中的历史描述

```bash
git add docs clients services skills README.md packages
git commit -m "docs：同步打印管线三端同源口径与行为变更"
```

---

### Task 18: 跨端一致性比对（Playwright 与 Electron）

**Files:**
- Create: `services/print-render/src/cross-end.parity.mjs`
- Modify: `package.json`（新增 `parity:cross-end`）
- Modify: `.github/workflows/ci.yml`（render job 用 xvfb 运行）

**Interfaces:**
- Consumes: Task 12 与 Task 14 的两端 driver
- Produces: 同一模板两端出图的页数与纸尺寸比对结果（退出码 0 = 一致）

- [ ] **Step 1: 写比对脚本**

```js
// services/print-render/src/cross-end.parity.mjs
// 用法：node services/print-render/src/cross-end.parity.mjs <服务端PDF> <客户端PDF>
// 判定范围：页数与 MediaBox（档位一只保证逻辑同源；文字/条码的位图差异属已知字体残留差异）
import { readFileSync } from 'node:fs'

/** Chromium 产物中页面对象以明文出现，可直接抓 MediaBox */
export function readMediaBoxes(file) {
  const text = readFileSync(file, 'latin1')
  return [...text.matchAll(/MediaBox\s*\[([^\]]+)\]/g)].map(match => match[1].trim())
}

export const A4_TEMPLATE = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  elements: [
    { id: 't', type: 'text', options: { left: 0, top: 0, width: 120, height: 8, formatter: '跨端一致性' } },
  ],
}

if (process.argv[1]?.endsWith('cross-end.parity.mjs')) {
  const [, serverPdf, clientPdf] = process.argv
  if (!serverPdf || !clientPdf) {
    console.error('用法：node cross-end.parity.mjs <服务端 PDF> <客户端 PDF>')
    process.exit(2)
  }
  const server = readMediaBoxes(serverPdf)
  const client = readMediaBoxes(clientPdf)
  console.log('服务端 MediaBox:', server.join(' | ') || '（未解析到）')
  console.log('客户端 MediaBox:', client.join(' | ') || '（未解析到）')
  const same = server.length === client.length && server.join('|') === client.join('|')
  console.log(same ? '页数与纸尺寸一致' : '页数或纸尺寸不一致，需要人工核对')
  process.exit(same ? 0 : 1)
}
```

- [ ] **Step 2: 本地各出一份产物并比对**

```bash
# 服务端产物（构建后运行）
npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/render
node -e "import('./services/print-render/dist/pdf-render.js').then(async m => { const { writeFileSync } = await import('node:fs'); const { A4_TEMPLATE } = await import('./services/print-render/src/cross-end.parity.mjs'); writeFileSync('/tmp/server.pdf', await m.renderPdf({ templateJson: A4_TEMPLATE, printData: {} })) })"
# 客户端产物：启动客户端，开启「保留生成的 PDF」开关，打印同一模板后从日志中取 pdfPath
node services/print-render/src/cross-end.parity.mjs /tmp/server.pdf <客户端 PDF 路径>
```

Expected: 输出「页数与纸尺寸一致」

- [ ] **Step 3: 接入 CI（Linux + xvfb）并提交**

```json
// package.json（scripts 追加）
"parity:cross-end": "node services/print-render/src/cross-end.parity.mjs",
```

```yaml
# .github/workflows/ci.yml（render job 追加，客户端出图需无显示器环境）
      - name: 安装 xvfb
        run: sudo apt-get update && sudo apt-get install -y xvfb
      - name: 跨端产物比对
        run: xvfb-run -a npm run parity:cross-end
        timeout-minutes: 10
```

```bash
git add services/print-render/src/cross-end.parity.mjs package.json .github/workflows/ci.yml
git commit -m "test(render)：新增跨端 PDF 页数与纸尺寸比对"
```

---

## 计划自审记录

**规格覆盖**：spec 第 2 节的「进 core」清单逐项落在 Task 1–8（units/errors/paper/pdf-spec/measure/codes/runtime/pipeline）；第 5 节结构与导出面对应 Task 8–11；第 6 节的 driver 分层对应 Task 6、9、10、12、14；第 7 节的阶段序列与码值两趟对应 Task 7 与 Task 10 的 `job.codeRenderer` 覆盖分支；第 8 节的错误码映射与超时预算对应 Task 1、3、6、12；第 9 节迁移步骤对应 Task 12–17；第 10 节验证与门禁对应 Task 9、13、15、16、18；第 11 节风险项分别由 Task 13（连续纸行为变更）、Task 16（防复制回归）、Task 17（文档口径）、Task 18（跨端比对）承载。

**占位符扫描**：全文无「待定/TODO/稍后补充」；每个代码步骤都给出可直接落盘的代码，机械改动给出确切命令与预期输出。

**类型一致性**：`RawMeasurement.heightPx/rowHeightsPx`（Task 4 定义，Task 6、9 消费）、`CodeSpec.key/value/cellType/opts`（Task 5 定义，Task 9 消费）、`PrintSession` 五方法（Task 6 定义，Task 7、10、12、14 消费）、`PageDriver` 七原语（Task 6 定义，Task 10、12、14 实现）、`SessionBudget`（Task 6 定义，Task 14 的 `submitHtml` 消费）、`PreparedDocument.paperMm/continuous/pageCount/heightSource/pageLayouts`（Task 7 定义，Task 10 映射为 `renderHtmlPages` 返回值、Task 14 映射为任务记录的微米值、Task 13 断言连续纸纸高），命名与单位口径均已对齐。
