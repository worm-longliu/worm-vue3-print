# 元素与单元格字体设置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让文本元素与表格单元格的字体设置在预览与三端出图中真正生效，并让可用字体清单由服务端容器与桌面客户端动态上报、在设计器中并集展示与校验。

**Architecture:** core 新增 `print/fonts.ts`，作为字体清单清洗/合并、`font-family` 栈生成与缺失校验的**唯一真实来源**；渲染管线两处断链（data-binder 的字段映射表、`matrixCellStyle` 缺 `font-family`）在 core 修复；服务端与客户端各自只做「本机字体采集」这一件平台适配，分别经 HTTP 与 WebSocket 上报；canvas 通过 host adapter 注入两份清单，在属性面板与状态栏呈现。

**Tech Stack:** TypeScript（strict）、Vitest（core 配 happy-dom）、Vue 3.5（原生控件，禁 UI 库）、Express、Electron、WebSocket、Playwright（仅 render 集成测试）

**设计依据：** [docs/superpowers/specs/2026-09-18-font-settings-design.md](../specs/2026-09-18-font-settings-design.md)。该文档第 13 节列出已实证结论与**未验证假设**，Task 6/Task 7 的验证步骤对应其中 13.2。

## Global Constraints

- 回复、代码注释、提交信息一律**简体中文**；提交用 Conventional Commits 前缀（`feat:`/`fix:`/`refactor:`）。
- **最小实现**：每行改动可追溯到需求，不做超范围抽象、不混入无关重构。
- **字体栈的唯一真实来源在 core**：`services/print-render` 与 `clients/print-client` 源码中**不得**出现硬编码字体栈或纸高推导，架构守卫 `npm run lint:print-architecture` 会拦截。两端只允许做「采集本机字体名」这一件平台适配。
- 单次写入文件不超过 500 行；UTF-8 无 BOM。
- **窄测试**：改动后只跑受影响 workspace 的相关测试文件（命令见各任务）；收尾才跑全量。
- 提交信息结尾附 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- `core` 与 SDK 均以 **dist** 被下游消费：改了 core 或 SDK 后，下游测试前必须先构建对应包。

## 文件结构

**新增**

| 文件 | 职责 | 任务 |
|---|---|---|
| `packages/print-core/src/print/fonts.ts` | 字体契约、清洗、合并、`font-family` 栈、缺失校验（纯函数，无 IO、无 DOM） | 1 |
| `packages/print-core/tests/fonts.test.ts` | 上者的单元测试 | 1 |
| `packages/print-core/src/print/system-fonts.ts` | 三平台字体枚举输出的纯解析 + `readSystemFonts` 采集入口 | 6 |
| `packages/print-core/tests/system-fonts.test.ts` | 上者的单元测试 | 6 |
| `packages/print-canvas/src/composables/useFontCatalog.ts` | 消费两份上报 → `FontCatalog`；`findFontCandidate`、`FontIssueSummary` | 3、4、5 |
| `packages/print-canvas/src/__tests__/useFontCatalog.spec.ts` | 上者的测试 | 3 |
| `packages/print-canvas/src/components/property/FontSelect.vue` | 字体下拉（清单并集 + 可用范围标注 + 缺失提示） | 4、5 |
| `packages/print-canvas/src/__tests__/FontSelect.spec.ts` | 上者的测试 | 4、5 |
| `packages/print-canvas/src/__tests__/StatusBar.spec.ts` | 状态栏缺失汇总测试 | 5 |
| `services/print-render/src/font-service.ts` | 容器字体采集（进程内缓存） | 6 |
| `services/print-render/src/font-service.test.ts` | 上者的测试 | 6 |
| `services/print-render/src/font-warnings.ts` | 出图告警响应头生成（纯函数） | 8 |
| `services/print-render/src/font-warnings.test.ts` | 上者的测试 | 8 |
| `clients/print-client/src/main/font-service.ts` | 本机字体采集（进程内缓存） | 7 |
| `clients/print-client/src/main/font-service.test.ts` | 上者的测试 | 7 |
| `clients/print-client/src/main/font-warning.ts` | 出图前缺失字体采集（纯函数） | 8 |
| `clients/print-client/src/main/font-warning.test.ts` | 上者的测试 | 8 |

**修改**：`core/src/print/index.ts`、`core/src/render/{types,data-binder,html-generator,css-builder}.ts`、`core/src/designer/utils/{table-matrix,property-search}.ts`、`canvas/src/composables/useHostAdapter.ts`、`canvas/src/components/{PrintDesigner,StatusBar}.vue`、`canvas/src/components/property/{AppearanceGroup,TableCellGroup}.vue`、`services/print-render/src/server.ts`、`clients/print-client/src/main/{protocol-handler,print-engine,index}.ts`、`packages/print-client-sdk/src/{protocol,print-client}.ts`、`demo/src/{App.vue,render-client.ts,components/PrintOutputDialog.vue}`、中文/英文 CHANGELOG 与 `docs/中文/指南/三端渲染一致性方案.md`。

> 文件名与 spec §12 的清单不同：spec 写的是 `font-catalog.ts` / `platform-fonts.ts`。实施时按上表为准，spec 已同步更正——三平台解析统一放进 core 的 `system-fonts.ts`（两端共用一份，避免漂移），宿主侧只剩 `font-service.ts` 负责缓存与命令执行。

---

### Task 1: core 字体模块

纯函数模块，不依赖任何 IO。后续所有任务都消费它。

**Files:**
- Create: `packages/print-core/src/print/fonts.ts`
- Test: `packages/print-core/tests/fonts.test.ts`
- Modify: `packages/print-core/src/print/index.ts`

**Interfaces:**
- Consumes: 无
- Produces（全部从 `@worm-vue3-print/core` 根入口可用）：
  - `type FontSource = 'server' | 'client'`
  - `interface FontSourceReport { available: boolean; fonts: readonly string[] }`
  - `const UNAVAILABLE: FontSourceReport`
  - `interface FontCandidate { family: string; sources: FontSource[] }`
  - `interface FontCatalog { fonts: FontCandidate[]; available: Record<FontSource, boolean> }`
  - `interface MissingFont { family: string; targets: string[] }`
  - `interface FontScannableElement { id: string; options?: Record<string, any> }`
  - `interface FontScannableTemplate { elements?; header?; footer?; firstPageOverlay? }`
  - `const FALLBACK_FONT_STACK: readonly string[]`
  - `normalizeFontList(raw: readonly string[]): string[]`
  - `mergeFontSources(input: { server: FontSourceReport; client: FontSourceReport }): FontCatalog`
  - `toFontFamilyStack(family?: string): string`
  - `findMissingFonts(template: FontScannableTemplate, catalog: FontCatalog, source: FontSource): MissingFont[]`

**设计要点（与 spec 的差异，已确认采用）**

1. `mergeFontSources` 直接返回 `FontCatalog`（含 `available` 标记），而不是只返回候选数组。这样「该端未上报就跳过校验」由 `findMissingFonts` **在函数内保证**，不依赖调用方记得跳过——约定会写错，代码不会。
2. 参数类型用**结构性最小接口** `FontScannableTemplate`，不 import 任何一侧的 `TemplateData`。core 同时存在 render 侧与 designer 侧两个 `TemplateData`（`render/types.ts:25-41`、`designer/types.ts:24-55`），二者结构不同；用结构接口可同时兼容，且避免跨模块类型耦合。
3. `FALLBACK_FONT_STACK` 的元素是**可直接拼接的合法 CSS 片段**（需要引号的族名自带引号），以逐字对齐 `css-builder.ts:40` 现有输出的形式固化：

```ts
export const FALLBACK_FONT_STACK: readonly string[] = [
  '"Microsoft YaHei"',
  '"PingFang SC"',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',   // 通用族名，绝不能加引号，否则语义变为字面字体名
]
```

4. 排序用自实现的 `compareKey`（基于规范化后的小写比较），**不用 `localeCompare`**——其行为随 Node ICU 与 locale 变化，会导致测试在不同环境结果不同。

- [x] **Step 1: 写失败测试**

创建 `packages/print-core/tests/fonts.test.ts`：

```ts
// print-core/tests/fonts.test.ts
import { describe, it, expect } from 'vitest'
import {
  UNAVAILABLE,
  FALLBACK_FONT_STACK,
  normalizeFontList,
  mergeFontSources,
  toFontFamilyStack,
  findMissingFonts,
} from '../src/print/fonts.js'

describe('normalizeFontList', () => {
  it('去空、去重、大小写不敏感且保留首次出现的写法', () => {
    expect(normalizeFontList(['SimSun', ' simsun ', '', 'Arial', 'Arial']))
      .toEqual(['Arial', 'SimSun'])
  })

  it('剔除 . 开头的系统隐藏字体', () => {
    expect(normalizeFontList(['.Apple Color Emoji UI', 'Arial'])).toEqual(['Arial'])
  })

  it('非字符串项被忽略', () => {
    expect(normalizeFontList(['Arial', undefined as any, 42 as any])).toEqual(['Arial'])
  })
})

describe('mergeFontSources', () => {
  it('并集并标注来源，两端都有的排最前', () => {
    const cat = mergeFontSources({
      server: { available: true, fonts: ['Noto Sans CJK SC', 'SimSun'] },
      client: { available: true, fonts: ['SimSun', 'KaiTi'] },
    })
    expect(cat.available).toEqual({ server: true, client: true })
    expect(cat.fonts.map(f => [f.family, f.sources])).toEqual([
      ['SimSun', ['server', 'client']],
      ['KaiTi', ['client']],
      ['Noto Sans CJK SC', ['server']],
    ])
  })

  it('单端不可用时只产出可用端的来源，且不抛错', () => {
    const cat = mergeFontSources({
      server: { available: true, fonts: ['Arial'] },
      client: UNAVAILABLE,
    })
    expect(cat.available).toEqual({ server: true, client: false })
    expect(cat.fonts).toEqual([{ family: 'Arial', sources: ['server'] }])
  })

  it('两端都不可用时返回空清单', () => {
    const cat = mergeFontSources({ server: UNAVAILABLE, client: UNAVAILABLE })
    expect(cat.fonts).toEqual([])
    expect(cat.available).toEqual({ server: false, client: false })
  })
})

describe('toFontFamilyStack', () => {
  it('无字体时返回纯兜底栈', () => {
    expect(toFontFamilyStack()).toBe(FALLBACK_FONT_STACK.join(', '))
  })

  it('显式族名加引号并前置兜底栈', () => {
    expect(toFontFamilyStack('SimSun')).toBe(`"SimSun", ${FALLBACK_FONT_STACK.join(', ')}`)
  })

  it('已含逗号的完整栈原样前置，不被整体加引号', () => {
    expect(toFontFamilyStack('SimSun, serif')).toBe(`SimSun, serif, ${FALLBACK_FONT_STACK.join(', ')}`)
  })

  it('空字符串与纯空白等同于未设置', () => {
    expect(toFontFamilyStack('   ')).toBe(FALLBACK_FONT_STACK.join(', '))
  })
})

describe('findMissingFonts', () => {
  const template = {
    elements: [
      { id: 'txt-1', options: { fontFamily: 'KaiTi' } },
      {
        id: 'tbl-1',
        options: {
          tableRows: [
            { cells: [{ id: 'c1', fontFamily: 'SimSun' }, { id: 'c2' }] },
            { cells: [{ id: 'c3', fontFamily: 'KaiTi' }] },
          ],
        },
      },
    ],
  }

  it('收集元素与单元格引用的字体，并聚合引用位置', () => {
    const catalog = mergeFontSources({
      server: { available: true, fonts: ['SimSun'] },
      client: UNAVAILABLE,
    })
    expect(findMissingFonts(template, catalog, 'server')).toEqual([
      { family: 'KaiTi', targets: ['txt-1', 'tbl-1#r1c0'] },
    ])
  })

  it('该端未上报时一律不判定缺失（不阻断策略的前提）', () => {
    const catalog = mergeFontSources({ server: UNAVAILABLE, client: UNAVAILABLE })
    expect(findMissingFonts(template, catalog, 'server')).toEqual([])
    expect(findMissingFonts(template, catalog, 'client')).toEqual([])
  })

  it('大小写差异不算缺失', () => {
    const catalog = mergeFontSources({
      server: { available: true, fonts: ['simsun'] },
      client: UNAVAILABLE,
    })
    const t = { elements: [{ id: 'e', options: { fontFamily: 'SimSun' } }] }
    expect(findMissingFonts(t, catalog, 'server')).toEqual([])
  })

  it('按端独立判定：服务端有、客户端没有', () => {
    const catalog = mergeFontSources({
      server: { available: true, fonts: ['SimSun'] },
      client: { available: true, fonts: ['KaiTi'] },
    })
    const t = { elements: [{ id: 'e', options: { fontFamily: 'SimSun' } }] }
    expect(findMissingFonts(t, catalog, 'server')).toEqual([])
    expect(findMissingFonts(t, catalog, 'client')).toEqual([{ family: 'SimSun', targets: ['e'] }])
  })

  it('页眉/页脚/首页叠层也在扫描范围内', () => {
    const catalog = mergeFontSources({ server: { available: true, fonts: [] }, client: UNAVAILABLE })
    const t = {
      elements: [],
      header: { elements: [{ id: 'h1', options: { fontFamily: 'KaiTi' } }] },
      footer: { elements: [{ id: 'f1', options: { fontFamily: 'KaiTi' } }] },
      firstPageOverlay: { elements: [{ id: 'o1', options: { fontFamily: 'KaiTi' } }] },
    }
    expect(findMissingFonts(t, catalog, 'server')).toEqual([
      { family: 'KaiTi', targets: ['h1', 'f1', 'o1'] },
    ])
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
npm exec -w @worm-vue3-print/core vitest run -- tests/fonts.test.ts
```

预期：FAIL，报无法解析 `../src/print/fonts.js`。

- [x] **Step 3: 实现 `fonts.ts`**

创建 `packages/print-core/src/print/fonts.ts`：

```ts
// packages/print-core/src/print/fonts.ts
// 字体清单与字体栈的唯一真实来源：浏览器设计器、服务端 PDF 渲染、桌面客户端打印共用。
// 本模块为纯逻辑，不做任何 IO、不依赖 DOM。

export type FontSource = 'server' | 'client'

/** 单个出图端的字体上报结果。available=false 表示未连接/不可达，与「已连接但清单为空」语义不同 */
export interface FontSourceReport {
  available: boolean
  fonts: readonly string[]
}

/** 该端未上报时的标准值 */
export const UNAVAILABLE: FontSourceReport = { available: false, fonts: [] }

export interface FontCandidate {
  family: string
  /** 只含真实上报成功且包含该字体的端 */
  sources: FontSource[]
}

/** 合并后的字体目录，供设计器展示与校验使用 */
export interface FontCatalog {
  fonts: FontCandidate[]
  available: Record<FontSource, boolean>
}

export interface MissingFont {
  family: string
  /** 引用该字体的元素/单元格位置标识 */
  targets: string[]
}

/** 结构性最小接口：同时兼容 render 侧与 designer 侧两个 TemplateData，避免跨模块类型耦合 */
export interface FontScannableElement {
  id: string
  options?: Record<string, any>
}

export interface FontScannableTemplate {
  elements?: readonly FontScannableElement[]
  header?: { elements?: readonly FontScannableElement[] }
  footer?: { elements?: readonly FontScannableElement[] }
  firstPageOverlay?: { elements?: readonly FontScannableElement[] }
}

/**
 * 全局兜底字体栈，逐字对齐原 css-builder 中 body 的 font-family 输出。
 * 元素是可直接拼接的合法 CSS 片段：需要引号的族名自带引号，
 * 通用族名（sans-serif）绝不能加引号——加了会被解析为字面字体名而失效。
 */
export const FALLBACK_FONT_STACK: readonly string[] = [
  '"Microsoft YaHei"',
  '"PingFang SC"',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
]

/** 比较用键：去空白 + 小写。不复用展示值，避免大小写与空格造成重复项 */
function compareKey(name: string): string {
  return name.trim().toLowerCase()
}

/** 稳定、与 locale/ICU 无关的族名比较 */
function compareFamily(a: string, b: string): number {
  const ka = compareKey(a)
  const kb = compareKey(b)
  if (ka < kb) return -1
  if (ka > kb) return 1
  return 0
}

/**
 * 规范化一个端上报的原始字体名列表：
 * 去空白、丢空值与非法类型、去重（大小写不敏感，保留首次出现写法）、
 * 剔除 '.' 开头的系统隐藏字体、按族名稳定升序。
 */
export function normalizeFontList(raw: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw ?? []) {
    if (typeof item !== 'string') continue
    const name = item.trim()
    if (!name) continue
    if (name.startsWith('.')) continue
    const key = compareKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out.sort(compareFamily)
}

/**
 * 合并两端上报。仅 available=true 的端贡献来源标注；
 * 排序为「来源数降序 → 族名升序」，使两端都可用的字体排在最前（最安全的选择最先出现）。
 */
export function mergeFontSources(input: {
  server: FontSourceReport
  client: FontSourceReport
}): FontCatalog {
  const byKey = new Map<string, FontCandidate>()

  const ingest = (report: FontSourceReport | undefined, source: FontSource): void => {
    if (!report?.available) return
    for (const family of normalizeFontList(report.fonts)) {
      const key = compareKey(family)
      const found = byKey.get(key)
      if (found) {
        if (!found.sources.includes(source)) found.sources.push(source)
      } else {
        byKey.set(key, { family, sources: [source] })
      }
    }
  }

  ingest(input.server, 'server')
  ingest(input.client, 'client')

  return {
    fonts: [...byKey.values()].sort(
      (a, b) => b.sources.length - a.sources.length || compareFamily(a.family, b.family),
    ),
    available: {
      server: input.server?.available === true,
      client: input.client?.available === true,
    },
  }
}

/**
 * 生成 CSS font-family 值：显式族名 + 全局兜底栈。
 * - 未设置/空白 → 纯兜底栈
 * - 值已含逗号 → 视为调用方给出的完整栈，原样前置（不整体加引号，否则整串会变成一个字体名）
 * - 其余 → 作为单个族名加引号后前置
 */
export function toFontFamilyStack(family?: string): string {
  const name = family?.trim()
  if (!name) return FALLBACK_FONT_STACK.join(', ')
  const head = name.includes(',') ? name : `"${name.replace(/"/g, '')}"`
  return [head, ...FALLBACK_FONT_STACK].join(', ')
}

/**
 * 找出模板中引用、但指定端没有的字体。
 *
 * 该端未成功上报时**直接返回空数组**——拿不到清单不等于字体缺失，
 * 这是「校验不阻断」策略成立的前提，故在函数内保证而非依赖调用方。
 */
export function findMissingFonts(
  template: FontScannableTemplate,
  catalog: FontCatalog,
  source: FontSource,
): MissingFont[] {
  if (!catalog?.available?.[source]) return []

  const known = new Set<string>()
  for (const candidate of catalog.fonts ?? []) {
    if (candidate.sources.includes(source)) known.add(compareKey(candidate.family))
  }

  const missing = new Map<string, MissingFont>()
  const record = (family: unknown, target: string): void => {
    if (typeof family !== 'string') return
    const name = family.trim()
    if (!name) return
    const key = compareKey(name)
    if (known.has(key)) return
    const found = missing.get(key)
    if (found) {
      if (!found.targets.includes(target)) found.targets.push(target)
      return
    }
    missing.set(key, { family: name, targets: [target] })
  }

  const scanElement = (el: FontScannableElement | undefined): void => {
    if (!el?.id) return
    const opts = el.options ?? {}
    record(opts.fontFamily, el.id)
    const rows = opts.tableRows
    if (!Array.isArray(rows)) return
    rows.forEach((row: any, rowIndex: number) => {
      if (!Array.isArray(row?.cells)) return
      row.cells.forEach((cell: any, colIndex: number) => {
        record(cell?.fontFamily, `${el.id}#r${rowIndex}c${colIndex}`)
      })
    })
  }

  const groups = [
    template?.elements,
    template?.header?.elements,
    template?.footer?.elements,
    template?.firstPageOverlay?.elements,
  ]
  for (const group of groups) {
    if (Array.isArray(group)) group.forEach(scanElement)
  }

  return [...missing.values()]
}
```

- [x] **Step 4: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/core vitest run -- tests/fonts.test.ts
```

预期：PASS，16 个用例全绿。

- [x] **Step 5: 挂到核心导出面并提交**

在 `packages/print-core/src/print/index.ts` 末尾（`export * from './pipeline.js'` 之后）追加一行：

```ts
export * from './fonts.js'
```

根入口 `packages/print-core/src/index.ts` 已有 `export * from './print/index.js'`，无需再改——`@worm-vue3-print/core` 根入口即自动获得全部字体契约。

```bash
npm run build -w @worm-vue3-print/core
npm exec -w @worm-vue3-print/core vitest run -- tests/fonts.test.ts
git add packages/print-core/src/print/fonts.ts packages/print-core/src/print/index.ts packages/print-core/tests/fonts.test.ts
git commit -m "feat(core): 新增字体清单合并、字体栈生成与缺失校验模块

字体清单与 font-family 栈的唯一真实来源，供设计器、服务端与客户端共用。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: core 渲染断开链修复

修复两处导致单元格字体失效的断链，并把兜底栈统一到 core。

**Files:**
- Modify: `packages/print-core/src/render/types.ts`（`RenderCell` 加字段）
- Modify: `packages/print-core/src/render/data-binder.ts:158-181`（字段映射表补一项）
- Modify: `packages/print-core/src/render/html-generator.ts`（`textStyle` 与 `matrixCellStyle`）
- Modify: `packages/print-core/src/render/css-builder.ts:40`（兜底栈改为引用常量）
- Modify: `packages/print-core/src/designer/utils/table-matrix.ts:175-186`（`copyCellStyle`）
- Test: `packages/print-core/src/render/html-generator.test.ts`（追加用例）
- Test: `packages/print-core/src/designer/utils/__tests__/table-matrix.spec.ts`（追加用例）

**Interfaces:**
- Consumes：Task 1 的 `FALLBACK_FONT_STACK`、`toFontFamilyStack`
- Produces：`RenderCell.fontFamily?: string`；渲染产物中单元格与文本元素均输出带兜底栈的 `font-family`

**已实证的现状（勿凭直觉改动）**

| 现象 | 实证方式 |
|---|---|
| 文本元素输出裸值 `font-family:KaiTi;`（无引号、无兜底） | 跑 `generateHtml` 打印元素内联样式 |
| 单元格 `<td>` 完全没有 `font-family` | 同上 |
| 绑定后单元格 `fontFamily` 为 `undefined` | `bindData` 后检查 `_renderRows[].cells[]` |
| 文本元素**不输出** `data-element-id`（表格才输出） | 输出中搜元素 id 为空 |

**注意 `copyCellStyle` 的真实触发路径**：它只被 `splitCells`（拆分合并单元格）调用，**不是格式刷**。所以该 bug 的表现是「拆分合并单元格后，恢复出来的占位格丢失主格字体」。

- [x] **Step 1: 写失败测试**

在 `packages/print-core/src/render/html-generator.test.ts` 文件**末尾**追加（复用该文件既有的 `makeTemplate`、`baseCell`、`pageWith` 辅助函数）：

```ts
// ─── 字体（fontFamily）输出 ───

describe('单元格与文本元素的字体输出', () => {
  const STACK_SUFFIX = '"Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif'

  it('单元格 fontFamily 输出 font-family 并带全局兜底栈', () => {
    const html = generateHtml(makeTemplate({
      tableColWidths: [100],
      _repeatHeaderCount: 0,
      _renderRows: [
        { type: 'data', height: 8, cells: [{ ...baseCell, content: 'A', fontFamily: 'SimSun' }] },
      ],
    }), pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 1 }]))
    expect(html).toContain(`font-family:"SimSun", ${STACK_SUFFIX}`)
  })

  it('单元格未设 fontFamily 时不输出 font-family（交还 CSS 继承）', () => {
    const html = generateHtml(makeTemplate({
      tableColWidths: [100],
      _repeatHeaderCount: 0,
      _renderRows: [
        { type: 'data', height: 8, cells: [{ ...baseCell, content: 'A' }] },
      ],
    }), pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 1 }]))
    const td = html.slice(html.indexOf('<td'), html.indexOf('</td>'))
    expect(td).not.toContain('font-family')
  })

  it('文本元素 fontFamily 输出引号与兜底栈（原为裸值）', () => {
    const t: TemplateData = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] },
      footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [{
        id: 'txt-1', type: 'text',
        options: { left: 0, top: 0, width: 50, height: 10, fontFamily: 'KaiTi', fontSize: 12, formatter: 'HELLO' },
      }] as any,
    } as TemplateData
    const html = generateHtml(t, pageWith([{ elementId: 'txt-1', type: 'element', renderTop: 0 }]))
    expect(html).toContain(`font-family:"KaiTi", ${STACK_SUFFIX}`)
  })
})
```

在 `packages/print-core/src/designer/utils/__tests__/table-matrix.spec.ts` 文件**末尾**追加（对照该文件既有 `createCell` / `mergeCells` 的用法）：

```ts
describe('splitCells 保留字体', () => {
  it('拆分合并单元格后，恢复出的占位格继承主格 fontFamily', () => {
    const rows: TableRow[] = [
      { id: 'r1', type: 'data', height: 8, cells: [
        createCell({ id: 'c1', fontFamily: 'SimSun' }),
        createCell({ id: 'c2' }),
      ] },
    ]
    mergeCells(rows, { r1: 0, c1: 0, r2: 0, c2: 1 })
    splitCells(rows, { r1: 0, c1: 0, r2: 0, c2: 1 })
    expect(rows[0]!.cells[0]!.fontFamily).toBe('SimSun')
    expect(rows[0]!.cells[1]!.fontFamily).toBe('SimSun')
  })
})
```

若该文件尚未 import `splitCells` 与 `TableRow` 类型，在顶部 import 语句中补上。

- [x] **Step 2: 跑测试确认失败**

```bash
npm exec -w @worm-vue3-print/core vitest run -- src/render/html-generator.test.ts src/designer/utils/__tests__/table-matrix.spec.ts
```

预期：新增的 4 个用例 FAIL（单元格两条找不到 `font-family`；文本元素实际为 `font-family:KaiTi`；拆分后 `fontFamily` 为 `undefined`），既有用例保持 PASS。

- [x] **Step 3: 补齐 `RenderCell` 字段与绑定映射**

`packages/print-core/src/render/types.ts`，在 `RenderCell` 的 `fontSize` 声明旁加一行：

```ts
  fontFamily?: string
```

`packages/print-core/src/render/data-binder.ts`：在 `RenderCell` 映射对象中 `fontSize: cell.fontSize,` 之后插入一行（该映射表是逐字段枚举的，`fontFamily` 此前根本不在表内，因此在绑定阶段消失）：

```ts
      fontFamily: cell.fontFamily,
```

- [x] **Step 4: 让两处样式函数输出字体**

`packages/print-core/src/render/html-generator.ts` 顶部 import 区追加：

```ts
import { FALLBACK_FONT_STACK, toFontFamilyStack } from '../print/fonts.js'
```

`textStyle()` 中把裸值输出改为经 `toFontFamilyStack`：

```ts
  if (opts.fontFamily) parts.push(`font-family:${toFontFamilyStack(opts.fontFamily)}`)
```

`matrixCellStyle()` 中，在 `if (fontSize) parts.push(\`font-size:${fontSize}pt\`)` 之后插入（该函数拼接**不带末尾分号**，新增项须与既有风格一致）：

```ts
  if (cell.fontFamily) parts.push(`font-family:${toFontFamilyStack(cell.fontFamily)}`)
```

- [x] **Step 5: 兜底栈改引用 core 常量**

`packages/print-core/src/render/css-builder.ts`：顶部 import 区追加：

```ts
import { FALLBACK_FONT_STACK } from '../print/fonts.js'
```

把第 40 行 `body` 规则中硬编码的字体栈替换为插值（**替换后输出必须与原来逐字一致**，Task 1 的测试已锁定该常量内容）：

```ts
body { font-family: ${FALLBACK_FONT_STACK.join(', ')}; }
```

- [x] **Step 6: 修复拆分单元格丢字体**

`packages/print-core/src/designer/utils/table-matrix.ts` 的 `copyCellStyle()`，在 `dst.fontSize = src.fontSize` 之后加一行：

```ts
  dst.fontFamily = src.fontFamily
```

- [x] **Step 7: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/core vitest run -- src/render/html-generator.test.ts src/designer/utils/__tests__/table-matrix.spec.ts src/render/css-builder.test.ts src/render/data-binder.test.ts
```

预期：全部 PASS。特别注意 `css-builder.test.ts` 保持绿——它验证兜底栈替换后输出逐字未变。

- [x] **Step 8: 构建并提交**

```bash
npm run build -w @worm-vue3-print/core
git add packages/print-core/src/render packages/print-core/src/designer/utils/table-matrix.ts
git commit -m "fix(core): 修复单元格字体断链并统一字体兜底栈

RenderCell 补 fontFamily 字段与绑定映射，矩阵单元格样式输出 font-family；
文本元素字体改为经 toFontFamilyStack 生成（原为无引号无兜底的裸值）；
拆分合并单元格时保留主格字体；全局兜底栈上移为 core 常量。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

> **实施偏差记录（2026-09-18）**：计划原定在内联样式中直接输出 `font-family:"SimSun", ...`。
> 实测该写法位于双引号包裹的 `style="..."` 属性内会提前闭合属性（happy-dom 解析后 `fontFamily` 为空串，
> 整条声明丢失）。故 core 新增 `escapeInlineStyleValue`，内联样式的字体栈引号统一转义为 `&quot;`；
> HTML 解析后仍是 `"SimSun", "Microsoft YaHei", ...`，与计划语义一致。`<style>` 块内 body 的兜底栈保持双引号原样，
> css-builder 输出逐字未变。html-generator 的测试断言相应改为转义形式，并新增一条「不得输出未转义裸引号」的守卫用例。
>
> 另：`makeFontService` 的 `platform` 改为可注入（默认 `process.platform`）。计划中的 render 字体用例按 Linux 容器编写，
> 而开发机为 macOS，不注入平台则 `fc-list` 分支在本地永远走不到、缓存用例也必然失败。

---

### Task 3: canvas 字体目录注入

把两份上报合并成 `FontCatalog` 并沿既有 host adapter 模式 provide，供深层组件 inject。

**Files:**
- Create: `packages/print-canvas/src/composables/useFontCatalog.ts`
- Test: `packages/print-canvas/src/__tests__/useFontCatalog.spec.ts`
- Modify: `packages/print-canvas/src/composables/useHostAdapter.ts`
- Modify: `packages/print-canvas/src/components/PrintDesigner.vue:220-221`

**Interfaces:**
- Consumes：Task 1 的 `FontSourceReport`、`FontCatalog`、`UNAVAILABLE`、`mergeFontSources`
- Produces：
  - `useFontCatalog(serverFonts: MaybeRefOrGetter<FontSourceReport | undefined>, clientFonts: MaybeRefOrGetter<FontSourceReport | undefined>): { catalog: ComputedRef<FontCatalog> }`
  - `FONT_CATALOG_KEY: InjectionKey<ComputedRef<FontCatalog>>`
  - `useInjectedFontCatalog(): ComputedRef<FontCatalog>`（无 provide 时回退空目录）
  - `PrintDesigner` 新增 props `serverFonts?`、`clientFonts?`（类型均为 `FontSourceReport`）

**设计要点**

- 合并逻辑完全复用 core 的 `mergeFontSources`，本组合式函数只负责「读 props → 合并」的响应式接线，不含任何字体业务规则。
- `useInjectedFontCatalog()` 必须带默认值：`AppearanceGroup` / `TableCellGroup` 的组件测试会**单独挂载**它们，没有设计器上下文。提供空目录兜底后，这些组件不注入也能正常渲染（表现为「字体清单不可用」，而非崩溃）。
- 组合式函数的参数用 `MaybeRefOrGetter` + `toValue()`，这样既接受 `ref()`（测试）也接受 `computed()`（PrintDesigner），无需为调用方形态做适配。

- [x] **Step 1: 写失败测试**

创建 `packages/print-canvas/src/__tests__/useFontCatalog.spec.ts`：

```ts
// pages/print-canvas/src/__tests__/useFontCatalog.spec.ts
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import type { FontSourceReport } from '@worm-vue3-print/core'
import { useFontCatalog } from '../composables/useFontCatalog'

describe('useFontCatalog', () => {
  it('两端都未上报时返回空目录且 available 全为 false', () => {
    const { catalog } = useFontCatalog(ref(undefined), ref(undefined))
    expect(catalog.value.fonts).toEqual([])
    expect(catalog.value.available).toEqual({ server: false, client: false })
  })

  it('只上报服务端时并集仅含服务端来源', () => {
    const { catalog } = useFontCatalog(
      ref({ available: true, fonts: ['SimSun'] } satisfies FontSourceReport),
      ref(undefined),
    )
    expect(catalog.value.fonts).toEqual([{ family: 'SimSun', sources: ['server'] }])
    expect(catalog.value.available).toEqual({ server: true, client: false })
  })

  it('客户端上报后响应式补齐来源标注', () => {
    const client = ref<FontSourceReport | undefined>(undefined)
    const { catalog } = useFontCatalog(
      ref({ available: true, fonts: ['SimSun'] } satisfies FontSourceReport),
      client,
    )
    expect(catalog.value.fonts).toEqual([{ family: 'SimSun', sources: ['server'] }])

    client.value = { available: true, fonts: ['SimSun', 'KaiTi'] }
    expect(catalog.value.available).toEqual({ server: true, client: true })
    expect(catalog.value.fonts.map(f => [f.family, f.sources])).toEqual([
      ['SimSun', ['server', 'client']],
      ['KaiTi', ['client']],
    ])
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
npm run build -w @worm-vue3-print/core   # 确保下游能解到 Task 1 的新导出
npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/useFontCatalog.spec.ts
```

预期：FAIL，报无法解析 `../composables/useFontCatalog`。

- [x] **Step 3: 实现组合式函数**

创建 `packages/print-canvas/src/composables/useFontCatalog.ts`：

```ts
// 字体目录：消费宿主注入的两端上报，合并为可供 UI 与校验使用的 FontCatalog。
// 合并规则本身在 core（mergeFontSources），此处只做响应式接线。
import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import {
  UNAVAILABLE,
  mergeFontSources,
  type FontCatalog,
  type FontSourceReport,
} from '@worm-vue3-print/core'
import { FONT_CATALOG_KEY } from './useHostAdapter'

/** 空目录：两端均不可用，用于未注入或未上报时的兜底 */
export const EMPTY_FONT_CATALOG: ComputedRef<FontCatalog> = computed(() =>
  mergeFontSources({ server: UNAVAILABLE, client: UNAVAILABLE }),
)

/**
 * 由 PrintDesigner 调用：把两个 props 合并为响应式字体目录。
 * 参数接受 ref / computed / getter 任意形态。
 */
export function useFontCatalog(
  serverFonts: MaybeRefOrGetter<FontSourceReport | undefined>,
  clientFonts: MaybeRefOrGetter<FontSourceReport | undefined>,
): { catalog: ComputedRef<FontCatalog> } {
  const catalog = computed<FontCatalog>(() =>
    mergeFontSources({
      server: toValue(serverFonts) ?? UNAVAILABLE,
      client: toValue(clientFonts) ?? UNAVAILABLE,
    }),
  )
  return { catalog }
}

/** 由深层组件调用（属性面板 / 状态栏）：未注入时回退空目录，组件可独立挂载 */
export function useInjectedFontCatalog(): ComputedRef<FontCatalog> {
  return inject(FONT_CATALOG_KEY, EMPTY_FONT_CATALOG)
}
```

- [x] **Step 4: 加注入键**

`packages/print-canvas/src/composables/useHostAdapter.ts` 顶部类型 import 改为同时引入 core 的字体类型，并在文件末尾追加：

```ts
/** 字体目录：PrintDesigner provide，属性面板与状态栏 inject */
export const FONT_CATALOG_KEY: InjectionKey<ComputedRef<FontCatalog>> =
  Symbol('print-font-catalog')
```

对应地在顶部补 import：

```ts
import type { FontCatalog } from '@worm-vue3-print/core'
```

- [x] **Step 5: 接到 PrintDesigner**

`packages/print-canvas/src/components/PrintDesigner.vue`：

在 `defineProps` 的 `showHelp` 之后追加两个 prop（沿用该处既有的 JSDoc 风格）：

```ts
  /** 服务端（PDF 出图端）字体清单；未注入时该端字体不可用 */
  serverFonts?: FontSourceReport
  /** 桌面客户端（静默打印端）字体清单；未注入时该端字体不可用 */
  clientFonts?: FontSourceReport
```

在 `provide(UPLOAD_DESIGN_BACKGROUND_KEY, ...)`（第 221 行）之后追加：

```ts
const { catalog: fontCatalog } = useFontCatalog(
  computed(() => props.serverFonts),
  computed(() => props.clientFonts),
)
provide(FONT_CATALOG_KEY, fontCatalog)
```

并在顶部 import 区补上 `useFontCatalog`（自 `../composables/useFontCatalog`）、`FONT_CATALOG_KEY`（并入已有的 `../composables/useHostAdapter` import），以及 `FontSourceReport` 类型（自 `@worm-vue3-print/core`）。

- [x] **Step 6: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/useFontCatalog.spec.ts
npm run typecheck -w @worm-vue3-print/client
```

预期：新增 3 个用例 PASS；typecheck 不引入新错误（canvas 自身无独立 typecheck 脚本，由下游 client 的 typecheck 间接覆盖）。

- [x] **Step 7: 提交**

```bash
git add packages/print-canvas/src/composables packages/print-canvas/src/__tests__/useFontCatalog.spec.ts packages/print-canvas/src/components/PrintDesigner.vue
git commit -m "feat(canvas): 接入两端字体清单并产出字体目录

沿 host adapter 模式新增 FONT_CATALOG_KEY 与 useFontCatalog，
PrintDesigner 接收 serverFonts/clientFonts 两个 props 后 provide 给深层组件。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 字体下拉组件与两个面板接入

文本元素面板与单元格面板的字体选择行为完全一致（选项来源、可用范围标注、模板当前值兜底、未连接提示），抽成一个共用组件，避免多份实现各自漂移。

**Files:**
- Create: `packages/print-canvas/src/components/property/FontSelect.vue`
- Test: `packages/print-canvas/src/__tests__/FontSelect.spec.ts`
- Modify: `packages/print-canvas/src/composables/useFontCatalog.ts`（追加两个纯函数）
- Modify: `packages/print-canvas/src/components/property/AppearanceGroup.vue:4-17`
- Modify: `packages/print-canvas/src/components/property/TableCellGroup.vue:80-90`
- Modify: `packages/print-core/src/designer/utils/property-search.ts:27-36`

**Interfaces:**
- Consumes：Task 1 的 `FontCandidate`、`FontCatalog`；Task 3 的 `useInjectedFontCatalog`、`FONT_CATALOG_KEY`
- Produces：
  - `findFontCandidate(catalog: FontCatalog, family?: string): FontCandidate | undefined`
  - `fontOptionLabel(candidate: FontCandidate): string`
  - `FontSelect` 组件：props `modelValue?: string`、`placeholder?: string`；emits `update:model-value`（值 `string | undefined`）

**设计要点**

- `FontSelect` 用 `update:model-value`，值为 `undefined` 表示「未设置，走兜底栈」。单元格面板接到 `write(c => ...)`，文本元素面板直接 `v-model`。
- **必须包含模板当前值**：导入的模板可能使用清单里没有的字体（如 `Comic Sans MS`），若下拉不含该项，原生 `<select>` 找不到匹配会错位成空选中，设计者一打开面板就会误以为字体丢了。
- 面板接入是纯模板接线，不新增面板级用例——写「挂载整个属性面板再断言 DOM」会很脆；行为差异全部收敛在 `FontSelect.spec.ts`，面板由既有 spec 的回归保证。

- [x] **Step 1: 写失败测试**

创建 `packages/print-canvas/src/__tests__/FontSelect.spec.ts`：

```ts
// packages/print-canvas/src/__tests__/FontSelect.spec.ts
import { describe, it, expect } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'
import type { FontCatalog } from '@worm-vue3-print/core'
import FontSelect from '../components/property/FontSelect.vue'
import { FONT_CATALOG_KEY } from '../composables/useHostAdapter'

const catalogOf = (
  fonts: Array<[string, Array<'server' | 'client'>]>,
  available: { server: boolean; client: boolean } = { server: true, client: true },
): FontCatalog => ({
  fonts: fonts.map(([family, sources]) => ({ family, sources })),
  available,
})

function mountSelect(catalog: FontCatalog, modelValue?: string) {
  return mount(FontSelect, {
    props: { modelValue },
    global: { provide: { [FONT_CATALOG_KEY]: computed(() => catalog) } },
  })
}

describe('FontSelect', () => {
  it('两端都可用的字体不加标注', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]))
    expect(w.findAll('option').map(o => o.text())).toContain('SimSun')
  })

  it('单端可用的字体标注可用范围', () => {
    const w = mountSelect(catalogOf([
      ['Noto Sans CJK SC', ['server']],
      ['KaiTi', ['client']],
    ]))
    const texts = w.findAll('option').map(o => o.text())
    expect(texts).toContain('Noto Sans CJK SC（仅服务端）')
    expect(texts).toContain('KaiTi（仅本机）')
  })

  it('首项为空值，表示未设置走兜底栈', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]))
    expect(w.findAll('option')[0]!.attributes('value')).toBe('')
  })

  it('当前值不在清单内时补一项并标注未知', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), 'Comic Sans MS')
    expect(w.findAll('option').map(o => o.text())).toContain('Comic Sans MS（未知）')
  })

  it('当前值在清单内时不产生未知项', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), 'SimSun')
    expect(w.text()).not.toContain('（未知）')
  })

  it('客户端未连接时提示本机字体未知', () => {
    const w = mountSelect(catalogOf([['Noto Sans CJK SC', ['server']]], { server: true, client: false }))
    expect(w.text()).toContain('桌面客户端未连接，本机字体未知')
  })

  it('服务端不可达时给出对应提示', () => {
    const w = mountSelect(catalogOf([['KaiTi', ['client']]], { server: false, client: true }))
    expect(w.text()).toContain('服务端字体清单不可用')
  })

  it('两端都正常时不显示任何提示', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]))
    expect(w.text()).not.toContain('不可用')
    expect(w.text()).not.toContain('未连接')
  })

  it('选择字体后 emit 族名，选空值 emit undefined', async () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]))
    const select = w.find('select')
    await select.setValue('SimSun')
    expect(w.emitted('update:model-value')?.[0]).toEqual(['SimSun'])
    await select.setValue('')
    expect(w.emitted('update:model-value')?.[1]).toEqual([undefined])
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/FontSelect.spec.ts
```

预期：FAIL，报无法解析 `../components/property/FontSelect.vue`。

- [x] **Step 3: 给 `useFontCatalog.ts` 追加两个纯函数**

在 `packages/print-canvas/src/composables/useFontCatalog.ts` 末尾追加（并把 `FontCandidate` 加入顶部 core 类型 import）：

```ts
/** 在目录中按族名查找（大小写不敏感） */
export function findFontCandidate(
  catalog: FontCatalog,
  family?: string,
): FontCandidate | undefined {
  const key = family?.trim().toLowerCase()
  if (!key) return undefined
  return catalog.fonts.find(f => f.family.trim().toLowerCase() === key)
}

/** 下拉选项文案：两端都可用不加标注，单端可用标注范围，避免设计者误以为处处可打 */
export function fontOptionLabel(candidate: FontCandidate): string {
  if (candidate.sources.length !== 1) return candidate.family
  if (candidate.sources[0] === 'server') return `${candidate.family}（仅服务端）`
  if (candidate.sources[0] === 'client') return `${candidate.family}（仅本机）`
  return candidate.family
}
```

- [x] **Step 4: 实现 `FontSelect.vue`**

创建 `packages/print-canvas/src/components/property/FontSelect.vue`：

```vue
<template>
  <div class="font-select">
    <select
      :value="modelValue ?? ''"
      class="pd-select"
      style="width: 100%"
      @change="onChange(($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ placeholder }}</option>
      <option v-if="unknownFamily" :value="unknownFamily">{{ unknownFamily }}（未知）</option>
      <option v-for="candidate in catalog.fonts" :key="candidate.family" :value="candidate.family">
        {{ fontOptionLabel(candidate) }}
      </option>
    </select>
    <div v-if="hint" class="font-select-hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { findFontCandidate, fontOptionLabel, useInjectedFontCatalog } from '../../composables/useFontCatalog'

const props = withDefaults(defineProps<{
  /** 当前族名；undefined 表示未设置，走全局兜底字体栈 */
  modelValue?: string
  /** 空值项文案 */
  placeholder?: string
}>(), {
  placeholder: '默认',
})

const emit = defineEmits<{ 'update:model-value': [value: string | undefined] }>()

const catalog = useInjectedFontCatalog()

/**
 * 模板当前值不在任何清单内时（如导入了使用未上报字体的模板）必须补一项，
 * 否则原生 select 找不到匹配项会错位成空选中，设计者会误以为字体丢失。
 */
const unknownFamily = computed(() => {
  const current = props.modelValue?.trim()
  if (!current) return ''
  return findFontCandidate(catalog.value, current) ? '' : current
})

/** 仅在清单异常时给出提示；两端均正常时不占位 */
const hint = computed(() => {
  const { server, client } = catalog.value.available
  if (!server && !client) return '字体清单不可用'
  if (!client) return '桌面客户端未连接，本机字体未知'
  if (!server) return '服务端字体清单不可用'
  return ''
})

function onChange(value: string): void {
  emit('update:model-value', value || undefined)
}
</script>

<style scoped>
.font-select-hint {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pd-text-muted, #8b909c);
}
</style>
```

- [x] **Step 5: 文本元素面板接入**

`packages/print-canvas/src/components/property/AppearanceGroup.vue`：在 `<template v-if="isTextType">` 内、**「字体大小」那一项之前**插入：

```vue
        <div class="pd-field" v-show="showItem('ap-font-family')"><span class="pd-label">字体</span>
          <FontSelect v-model="element.options.fontFamily" />
        </div>
```

并在 `<script setup>` 的组件 import 区加入 `import FontSelect from './FontSelect.vue'`。

- [x] **Step 6: 单元格面板接入并修掉清不掉的缺陷**

`packages/print-canvas/src/components/property/TableCellGroup.vue`：把第 80-90 行的单元格「字体」整块 `<div class="pd-field">` 替换为：

```vue
        <div class="pd-field"><span class="pd-label">字体</span>
          <FontSelect
            :model-value="mainCell.fontFamily"
            placeholder="继承默认"
            @update:model-value="write(c => { c.fontFamily = $event })"
          />
        </div>
```

原实现的两个缺陷随之消失：`<select>` 上无效的 `placeholder` 属性（原生 `<select>` 不支持，之前一直没生效），以及缺少空选项导致**字体一旦设置就无法清除**。

并在 `<script setup>` 的组件 import 区加入 `import FontSelect from './FontSelect.vue'`。

- [x] **Step 7: 登记属性搜索项**

`packages/print-core/src/designer/utils/property-search.ts`，在 `group: 'appearance'` 的 `items` 数组中、`ap-font-size` **之前**插入（与面板中的视觉顺序一致）：

```ts
      { key: 'ap-font-family', keywords: ['字体', '字体名', '字体族', 'fontfamily'] },
```

未登记时，搜索态下该字段会被 `showItem` 隐藏——用户搜「字体」只能看到字号和粗细，看不到新增的字体下拉。

- [x] **Step 8: 跑测试确认通过**

```bash
npm run build -w @worm-vue3-print/core   # property-search 改动需重新构建
npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/FontSelect.spec.ts src/__tests__/TableSettingsGroup.spec.ts
```

预期：FontSelect 的 9 个用例 PASS；既有面板 spec 保持绿（回归验证）。

- [x] **Step 9: 提交**

```bash
git add packages/print-canvas/src/components/property/FontSelect.vue packages/print-canvas/src/composables/useFontCatalog.ts packages/print-canvas/src/components/property/AppearanceGroup.vue packages/print-canvas/src/components/property/TableCellGroup.vue packages/print-canvas/src/__tests__/FontSelect.spec.ts packages/print-core/src/designer/utils/property-search.ts
git commit -m "feat(canvas): 文本元素与单元格支持选择字体

新增共用 FontSelect 组件（可用范围标注、模板当前值兜底、未连接提示），
文本元素面板新增字体项并登记属性搜索，单元格面板替换硬编码选项；
顺带修复单元格字体设置后无法清除的缺陷。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: 缺失字体的字段级与汇总提示

「校验不阻断」策略的兑现点：字体在某个出图端缺失时**看得见**，但不拦下任何一次出图。

**Files:**
- Modify: `packages/print-canvas/src/components/property/FontSelect.vue`
- Modify: `packages/print-canvas/src/__tests__/FontSelect.spec.ts`
- Modify: `packages/print-canvas/src/components/StatusBar.vue`
- Create: `packages/print-canvas/src/__tests__/StatusBar.spec.ts`
- Modify: `packages/print-canvas/src/components/PrintDesigner.vue:104-111` 与 `:220-221` 附近

**Interfaces:**
- Consumes：Task 1 的 `findMissingFonts`、`MissingFont`、`FontSource`；Task 3 的 `useInjectedFontCatalog`；Task 4 的 `FontSelect`
- Produces：
  - `interface FontIssueSummary { family: string; sources: FontSource[]; targets: string[] }`（定义在 `useFontCatalog.ts`）
  - `StatusBar` 新增 prop `fontIssues: FontIssueSummary[]`（缺省 `[]`）
  - `FontSelect` 新增字段级缺失提示

**设计要点**

- 字段级提示与汇总提示回答的是**不同问题**：字段级告诉你「你刚选的这个字体在 X 端没有」，汇总告诉你「导入了一份别人的模板，里面有一堆字体这里没有」——后者不该逼设计者逐个元素点开。
- 提示文案必须点明后果与补救方向（「出图将回退到默认字体」），不能只说「缺失」——只说缺失，用户不知道该不该管。
- 该端 `available: false` 时**不产生**任何缺失项，这在 `findMissingFonts` 内已保证，UI 层无需再判。

- [x] **Step 1: 写失败测试**

在 `packages/print-canvas/src/__tests__/FontSelect.spec.ts` 末尾追加：

```ts
describe('FontSelect 缺失字体提示', () => {
  it('字体在服务端缺失时点明缺失端与后果', () => {
    const w = mountSelect(catalogOf([['SimSun', ['client']]]), 'SimSun')
    expect(w.text()).toContain('服务端无此字体，出图将回退到默认字体')
  })

  it('两端都有该字体时不提示缺失', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), 'SimSun')
    expect(w.text()).not.toContain('无此字体')
  })

  it('该端未上报时不判定缺失（未连接不等于没有）', () => {
    const w = mountSelect(
      catalogOf([['SimSun', ['server']]], { server: true, client: false }),
      'SimSun',
    )
    expect(w.text()).not.toContain('无此字体')
  })

  it('未设置字体时不提示', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server']]]))
    expect(w.text()).not.toContain('无此字体')
  })
})
```

创建 `packages/print-canvas/src/__tests__/StatusBar.spec.ts`：

```ts
// packages/print-canvas/src/__tests__/StatusBar.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBar from '../components/StatusBar.vue'

const baseProps = {
  coordinate: null,
  scale: 100,
  elementCount: 3,
  selectedCount: 0,
  paper: 'A4',
  dirty: false,
}

describe('StatusBar 字体缺失汇总', () => {
  it('无缺失时不出现汇总项', () => {
    const w = mount(StatusBar, { props: { ...baseProps, fontIssues: [] } })
    expect(w.text()).not.toContain('字体缺失')
  })

  it('有缺失时显示条数', () => {
    const w = mount(StatusBar, {
      props: {
        ...baseProps,
        fontIssues: [{ family: 'KaiTi', sources: ['server'], targets: ['txt-1'] }],
      },
    })
    expect(w.text()).toContain('1 项字体缺失')
  })

  it('点击后展开明细，标出缺失端', async () => {
    const w = mount(StatusBar, {
      props: {
        ...baseProps,
        fontIssues: [
          { family: 'KaiTi', sources: ['server'], targets: ['txt-1'] },
          { family: 'SimSun', sources: ['server', 'client'], targets: ['tbl-1#r0c0'] },
        ],
      },
    })
    await w.find('.status-font-warn').trigger('click')
    expect(w.text()).toContain('KaiTi')
    expect(w.text()).toContain('服务端')
    expect(w.text()).toContain('两端')
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/FontSelect.spec.ts src/__tests__/StatusBar.spec.ts
```

预期：FAIL——FontSelect 4 条找不到提示文案；StatusBar 3 条因 `fontIssues` prop 尚未定义而不符预期。

- [x] **Step 3: 给 `FontSelect` 加字段级缺失提示**

`packages/print-canvas/src/components/property/FontSelect.vue` 的 `<script setup>` 中，在 `hint` 之后追加：

```ts
/**
 * 当前字体在某个「已成功上报」的出图端不存在。
 * 未上报的端不参与判定——拿不到清单不等于没有这个字体。
 */
const missingHint = computed(() => {
  const current = props.modelValue?.trim()
  if (!current) return ''
  const sources = (['server', 'client'] as const).filter(s => catalog.value.available[s])
  if (!sources.length) return ''
  const candidate = findFontCandidate(catalog.value, current)
  const missing = sources.filter(s => !candidate?.sources.includes(s))
  if (!missing.length) return ''
  const labels = missing.map(s => (s === 'server' ? '服务端' : '本机'))
  return `${labels.join('、')}无此字体，出图将回退到默认字体`
})
```

模板中把提示行改为同时展示两条：

```vue
    <div v-if="missingHint" class="font-select-hint warn">{{ missingHint }}</div>
    <div v-if="hint" class="font-select-hint">{{ hint }}</div>
```

样式追加：

```css
.font-select-hint.warn {
  color: var(--pd-accent-secondary, #f56c6c);
}
```

- [x] **Step 4: 加汇总结构类型**

在 `packages/print-canvas/src/composables/useFontCatalog.ts` 末尾追加（`FontSource` 需并入顶部 core 类型 import）：

```ts
/** 单个字体在若干出图端缺失的汇总项 */
export interface FontIssueSummary {
  family: string
  /** 缺失的端（只含已成功上报的端） */
  sources: FontSource[]
  /** 引用该字体的元素/单元格位置标识 */
  targets: string[]
}
```

- [x] **Step 5: `StatusBar` 展示汇总**

`packages/print-canvas/src/components/StatusBar.vue`：在 `<span class="status-item">元素 ...` 之后插入汇总项与明细面板：

```vue
    <span
      v-if="fontIssues.length"
      class="status-item status-font-warn"
      title="点击查看缺失字体明细"
      @click="fontDetailVisible = !fontDetailVisible"
    >
      字体缺失 {{ fontIssues.length }} 项
    </span>
    <div v-if="fontDetailVisible && fontIssues.length" class="font-issue-panel">
      <div v-for="issue in fontIssues" :key="issue.family" class="font-issue-row">
        <span class="font-issue-family">{{ issue.family }}</span>
        <span class="font-issue-sources">{{ sourceLabel(issue.sources) }}缺失</span>
        <span class="font-issue-targets">{{ issue.targets.length }} 处引用</span>
      </div>
    </div>
```

`<script setup>` 中新增 prop、局部状态与文案函数（`fontIssues` 给默认值，保证既有调用点不受影响）：

```ts
import { ref } from 'vue'
import type { FontIssueSummary } from '../composables/useFontCatalog'

const props = withDefaults(defineProps<{
  coordinate: { x: number; y: number } | null
  scale: number
  elementCount: number
  selectedCount: number
  paper: string
  dirty: boolean
  /** 字体缺失汇总；空数组表示无缺失 */
  fontIssues?: FontIssueSummary[]
}>(), {
  fontIssues: () => [],
})

const fontDetailVisible = ref(false)

/** 缺失端文案：两端都缺时合并为「两端」 */
function sourceLabel(sources: FontIssueSummary['sources']): string {
  if (sources.length >= 2) return '两端'
  return sources[0] === 'server' ? '服务端' : '本机'
}
```

注意：原文件用 `defineProps<{...}>()` 而未接返回值，需改为 `const props = withDefaults(...)`；`props` 在模板中可直接按名使用，无需改动既有模板绑定。

样式追加：

```css
.status-font-warn {
  color: var(--pd-accent-secondary, #f56c6c);
  cursor: pointer;
}
.font-issue-panel {
  position: absolute;
  bottom: 34px;
  left: 16px;
  z-index: 20;
  max-height: 180px;
  overflow: auto;
  padding: 8px 10px;
  background: var(--pd-surface, #fff);
  border: 1px solid var(--pd-border-soft, #e9ecf2);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(23, 32, 60, .12);
  font-size: 11.5px;
}
.font-issue-row {
  display: flex;
  gap: 10px;
  white-space: nowrap;
}
.font-issue-sources {
  color: var(--pd-accent-secondary, #f56c6c);
}
.status-bar {
  position: relative;
}
```

（`.status-bar` 原本没有 `position`，明细面板需要它作为定位上下文；这条规则**并入既有的 `.status-bar` 规则块**，不要另开一条同名规则。）

- [x] **Step 6: `PrintDesigner` 计算汇总并传入**

`packages/print-canvas/src/components/PrintDesigner.vue`：

模板中给 `<StatusBar>` 追加一行绑定：

```vue
      :font-issues="fontIssues"
```

`<script setup>` 中，在 Task 3 建立的 `const { catalog: fontCatalog } = useFontCatalog(...)` 之后追加：

```ts
/** 字体缺失汇总：按端分别校验后合并——校验回答的是「这个出图端有没有」 */
const fontIssues = computed<FontIssueSummary[]>(() => {
  const catalog = fontCatalog.value
  const merged = new Map<string, FontIssueSummary>()
  for (const source of ['server', 'client'] as const) {
    for (const item of findMissingFonts(templateData.value as any, catalog, source)) {
      const key = item.family.trim().toLowerCase()
      const found = merged.get(key)
      if (found) {
        found.sources.push(source)
        found.targets.push(...item.targets)
      } else {
        merged.set(key, { family: item.family, sources: [source], targets: [...item.targets] })
      }
    }
  }
  return [...merged.values()]
})
```

顶部 import 区补上 `findMissingFonts`（自 `@worm-vue3-print/core`）与 `FontIssueSummary`（自 `../composables/useFontCatalog`）。

- [x] **Step 7: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/canvas vitest run -- src/__tests__/FontSelect.spec.ts src/__tests__/StatusBar.spec.ts
```

预期：FontSelect 累计 13 个用例、StatusBar 3 个用例全部 PASS。

- [x] **Step 8: 提交**

```bash
git add packages/print-canvas/src
git commit -m "feat(canvas): 缺失字体在字段与状态栏给出提示但不阻断

FontSelect 提示所选字体在哪个出图端缺失及回退后果；
StatusBar 汇总缺失字体并支持展开明细，未上报的端不参与判定。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: 系统字体清单的平台解析与服务端上报

两端（Linux 容器 / 桌面本机）都要把「这台机器有什么字体」变成一份字符串数组，且**采集失败必须与「一台字体都没有」区分开**。

**Files:**
- Create: `packages/print-core/src/print/system-fonts.ts`
- Create: `packages/print-core/tests/system-fonts.test.ts`
- Modify: `packages/print-core/src/print/index.ts`（Task 1 已追加过 `fonts.js`，这里再追加 `system-fonts.js`）
- Create: `services/print-render/src/font-service.ts`
- Create: `services/print-render/src/font-service.test.ts`
- Modify: `services/print-render/src/server.ts:52` 之后（`/health` 端点与 `/render/pdf` 之间）

**Interfaces:**
- Consumes：Task 1 的 `FontSourceReport`、`normalizeFontList`
- Produces：
  - `parseFcListOutput(stdout: string): string[]`
  - `parseSystemProfilerFonts(json: unknown): string[]`
  - `parseWindowsFontOutput(stdout: string): string[]`
  - `interface FontCommandResult { stdout: string }` 与 `type FontCommandRunner = (file: string, args: string[]) => Promise<FontCommandResult>`
  - `readSystemFonts(platform: NodeJS.Platform, run: FontCommandRunner): Promise<FontSourceReport>`
  - render 服务新增 `GET /fonts`（需 `x-render-key` 头），响应体即 `FontSourceReport`

**设计要点**

- 三个解析函数放 **core** 而不是各自的宿主包：桌面客户端与服务端都要解析同一份 `fc-list` 输出，写两份必然漂移；core 又是本仓库「平台推导逻辑唯一真实来源」的既定归属。
- 解析函数只负责**切分**，去重/排序/过滤 `.` 开头的系统隐藏字体统一交给 Task 1 的 `normalizeFontList`——保证两端产出的清单经过同一套归一化，否则两侧清单无法直接做并集比较。
- **采集失败返回 `available: false` 而不是空清单**：这是整套「不阻断」策略的地基。空清单会被下游解读为「这台机器什么字体都没有」，从而对每一个模板报出满屏的假缺失。
- `fc-list` 的 family 字段是**逗号分隔的多值**：`NotoSansCJK-Regular.ttc` 一个文件同时携带 JP/SC/TC/KR 多个 family，只取第一个会让「Noto Sans CJK SC」从清单里消失，而这个字体容器明明能渲染。必须整串切开。

- [x] **Step 1: 写失败测试**

```ts
// packages/print-core/tests/system-fonts.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseFcListOutput,
  parseSystemProfilerFonts,
  parseWindowsFontOutput,
  readSystemFonts,
} from '../src/print/system-fonts.js'

describe('parseFcListOutput', () => {
  it('按行切分并展开逗号分隔的多 family', () => {
    const stdout = [
      'Noto Sans CJK JP,Noto Sans CJK SC,Noto Sans CJK TC',
      'DejaVu Sans',
      '',
      'Liberation Serif',
    ].join('\n')
    expect(parseFcListOutput(stdout)).toEqual([
      'Noto Sans CJK JP',
      'Noto Sans CJK SC',
      'Noto Sans CJK TC',
      'DejaVu Sans',
      'Liberation Serif',
    ])
  })

  it('空输出返回空数组', () => {
    expect(parseFcListOutput('')).toEqual([])
  })
})

describe('parseSystemProfilerFonts', () => {
  it('从 typefaces 取 family，忽略文件级 _name', () => {
    const json = {
      SPFontsDataType: [
        {
          _name: 'Times New Roman Bold.ttf',
          typefaces: [{ family: 'Times New Roman' }, { family: 'Times New Roman Bold' }],
        },
      ],
    }
    expect(parseSystemProfilerFonts(json)).toEqual(['Times New Roman', 'Times New Roman Bold'])
  })

  it('结构不符时返回空数组而不抛异常', () => {
    expect(parseSystemProfilerFonts(null)).toEqual([])
    expect(parseSystemProfilerFonts({ SPFontsDataType: 'nope' })).toEqual([])
  })
})

describe('parseWindowsFontOutput', () => {
  it('按行切分，去掉空行与首尾空白', () => {
    expect(parseWindowsFontOutput('SimSun\r\n\r\nKaiTi\r\n')).toEqual(['SimSun', 'KaiTi'])
  })
})

describe('readSystemFonts', () => {
  const ok = (stdout: string) => async () => ({ stdout })

  it('linux 走 fc-list 并归一化', async () => {
    const report = await readSystemFonts('linux', ok('DejaVu Sans\nDejaVu Sans\n.Al Bayan PUA\n'))
    expect(report.available).toBe(true)
    expect(report.fonts).toEqual(['DejaVu Sans'])
  })

  it('darwin 走 system_profiler 并解析 JSON', async () => {
    const stdout = JSON.stringify({ SPFontsDataType: [{ typefaces: [{ family: 'PingFang SC' }] }] })
    const report = await readSystemFonts('darwin', ok(stdout))
    expect(report.fonts).toEqual(['PingFang SC'])
  })

  it('win32 走 PowerShell 并解析文本', async () => {
    const report = await readSystemFonts('win32', ok('SimSun\nKaiTi\n'))
    expect(report.fonts).toEqual(['KaiTi', 'SimSun'])
  })

  it('命令失败时返回 available:false 而非空清单', async () => {
    const fail = async () => {
      throw new Error('spawn fc-list ENOENT')
    }
    expect(await readSystemFonts('linux', fail)).toEqual({ available: false, fonts: [] })
  })

  it('输出不可解析时返回 available:false', async () => {
    const report = await readSystemFonts('darwin', ok('not json at all'))
    expect(report.available).toBe(false)
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
npm exec -w @worm-vue3-print/core vitest run -- tests/system-fonts.test.ts
```

预期：FAIL——`Failed to resolve import "../src/print/system-fonts.js"`。

- [x] **Step 3: 实现解析与采集**

```ts
// packages/print-core/src/print/system-fonts.ts
// 系统字体清单采集：把各平台的枚举输出解析为字体名数组。
// 只做切分，去重/排序/过滤交给 normalizeFontList，保证三端归一化口径一致。
import { normalizeFontList } from './fonts.js'
import type { FontSourceReport } from './fonts.js'

/** 命令执行结果；只取 stdout，stderr 与退出码由调用方在 run 内处理 */
export interface FontCommandResult {
  stdout: string
}

export type FontCommandRunner = (file: string, args: string[]) => Promise<FontCommandResult>

/**
 * 解析 `fc-list --format=%{family}\n` 输出。
 * family 字段是逗号分隔的多值（一个 .ttc 可携带多语言 family），必须整串展开。
 */
export function parseFcListOutput(stdout: string): string[] {
  const out: string[] = []
  for (const line of stdout.split('\n')) {
    for (const family of line.split(',')) {
      const name = family.trim()
      if (name) out.push(name)
    }
  }
  return out
}

/**
 * 解析 `system_profiler SPFontsDataType -json` 输出。
 * 每个条目是一个字体**文件**，_name 是文件名（"Times New Roman Bold.ttf"），
 * 真正的字体族在其 typefaces[].family —— 只取 _name 会得到一堆带后缀的假字体名。
 */
export function parseSystemProfilerFonts(json: unknown): string[] {
  const list = (json as { SPFontsDataType?: unknown } | null)?.SPFontsDataType
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const entry of list) {
    const typefaces = (entry as { typefaces?: unknown })?.typefaces
    if (!Array.isArray(typefaces)) continue
    for (const tf of typefaces) {
      const family = (tf as { family?: unknown })?.family
      if (typeof family === 'string' && family.trim()) out.push(family.trim())
    }
  }
  return out
}

/** 解析逐行输出的字体名（Windows InstalledFontCollection） */
export function parseWindowsFontOutput(stdout: string): string[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

/** Windows：PowerShell 调 GDI+ 枚举已安装字体族 */
const WIN_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  // 不设 OutputEncoding 会按控制台代码页输出，中文系统下「宋体」等名字会乱码
  '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;' +
    '[System.Drawing.Text.InstalledFontCollection]::new().Families | ForEach-Object { $_.Name }',
]

/**
 * 采集本机系统字体清单。
 * 命令执行失败或输出不可解析时返回 available:false —— 表示「未知」，
 * 不能退化成空清单，否则下游会把每一个模板都判成字体缺失。
 */
export async function readSystemFonts(
  platform: NodeJS.Platform,
  run: FontCommandRunner,
): Promise<FontSourceReport> {
  const unavailable: FontSourceReport = { available: false, fonts: [] }
  try {
    let raw: string[]
    if (platform === 'win32') {
      raw = parseWindowsFontOutput((await run('powershell', WIN_ARGS)).stdout)
    } else if (platform === 'darwin') {
      const { stdout } = await run('system_profiler', ['SPFontsDataType', '-json'])
      const parsed = parseSystemProfilerFonts(JSON.parse(stdout))
      // 解析出 0 条几乎只可能是输出格式变了，按「未知」处理
      if (!parsed.length) return unavailable
      raw = parsed
    } else {
      // \n 需保持反斜杠字面量交给 fc-list 解释；execFile 不走 shell，无需引号
      const { stdout } = await run('fc-list', ['--format=%{family}\\n'])
      raw = parseFcListOutput(stdout)
    }
    const fonts = normalizeFontList(raw)
    if (!fonts.length) return unavailable
    return { available: true, fonts }
  } catch {
    return unavailable
  }
}
```

在 `packages/print-core/src/print/index.ts` 中 `export * from './fonts.js'` 之后追加一行：

```ts
export * from './system-fonts.js'
```

- [x] **Step 4: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/core vitest run -- tests/system-fonts.test.ts
```

预期：11 个用例全部 PASS。

- [x] **Step 5: 写服务端 font-service 的失败测试**

```ts
// services/print-render/src/font-service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { makeFontService } from './font-service.js'

describe('render 服务字体清单', () => {
  it('返回 fc-list 解析结果且 available 为 true', async () => {
    const run = vi.fn(async () => ({ stdout: 'DejaVu Sans\nLiberation Serif\n' }))
    const report = await makeFontService(run).list()
    expect(report).toEqual({ available: true, fonts: ['DejaVu Sans', 'Liberation Serif'] })
    expect(run).toHaveBeenCalledWith('fc-list', ['--format=%{family}\\n'])
  })

  it('fc-list 缺失时返回 available:false', async () => {
    const run = async () => {
      throw new Error('spawn fc-list ENOENT')
    }
    expect(await makeFontService(run).list()).toEqual({ available: false, fonts: [] })
  })

  it('同一进程内只采集一次', async () => {
    const run = vi.fn(async () => ({ stdout: 'DejaVu Sans\n' }))
    const service = makeFontService(run)
    await service.list()
    await service.list()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
```

- [x] **Step 6: 实现服务端 font-service**

```ts
// services/print-render/src/font-service.ts
// 容器内系统字体清单：进进程采集一次并缓存（容器字体集在部署生命周期内不变）。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readSystemFonts, type FontCommandRunner, type FontSourceReport } from '@worm-vue3-print/core'

const execFileAsync = promisify(execFile)

/** 默认执行器：fc-list 输出可达数百 KB，放宽 maxBuffer */
const runCommand: FontCommandRunner = async (file, args) => {
  const { stdout } = await execFileAsync(file, args, { maxBuffer: 8 * 1024 * 1024 })
  return { stdout }
}

export interface FontService {
  list(): Promise<FontSourceReport>
}

export function makeFontService(run: FontCommandRunner = runCommand): FontService {
  let cached: FontSourceReport | null = null
  return {
    async list() {
      if (cached) return cached
      const report = await readSystemFonts(process.platform, run)
      // 只缓存成功结果：采集中途失败多半是暂时性的（进程/权限），不该钉死整个进程生命周期
      if (report.available) cached = report
      return report
    },
  }
}
```

- [x] **Step 7: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/render vitest run -- src/font-service.test.ts
```

预期：3 个用例全部 PASS。

- [x] **Step 8: 服务端开 `/fonts` 端点**

`services/print-render/src/server.ts`：

顶部 import 区追加：

```ts
import { makeFontService } from './font-service.js'
```

在 `app.get('/health', ...)` 整块之后插入：

```ts
// ─── 系统字体清单端点 ───

const fontService = makeFontService()

app.get('/fonts', authMiddleware, async (_req, res) => {
  try {
    res.json(await fontService.list())
  } catch (error) {
    console.error('Font enumeration failed:', error)
    res.status(500).json({ code: 'INTERNAL', message: 'Font enumeration failed' })
  }
})
```

- [x] **Step 9: 在容器内实证 `fc-list` 输出**

本地 macOS 没有 `fc-list`，`parseFcListOutput` 的多 family 行为来自文档推断，必须进容器实证一次（若本机无 Docker，此步留到有 Docker 的环境执行，并在 PR 描述中标注未实测）：

```bash
cd services/print-render && docker build -t worm-render:fonts .
docker run --rm worm-render:fonts fc-list --format='%{family}\n' | grep -i "noto sans cjk" | head -5
```

预期：输出中出现包含逗号的多 family 行，且含 `Noto Sans CJK SC`。若实际不含 SC，说明 `fonts-noto-cjk` 的打包方式与推断不符，需在 Dockerfile 中补装 `fonts-noto-cjk-extra` 或改用 `%{family[0]}` 之外的字段——**先改到实际相符再继续**。

- [x] **Step 10: 提交**

```bash
git add packages/print-core/src/print/system-fonts.ts packages/print-core/src/print/index.ts \
  packages/print-core/tests/system-fonts.test.ts \
  services/print-render/src/font-service.ts services/print-render/src/font-service.test.ts \
  services/print-render/src/server.ts
git commit -m "feat(core,render): 采集系统字体清单并新增 /fonts 端点

core 提供三平台枚举输出的纯解析函数与 readSystemFonts 采集入口，
采集失败一律返回 available:false 以区分「未知」与「没有字体」；
render 服务经 GET /fonts 上报容器内清单，进程内只采集一次。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: 桌面客户端经 WebSocket 上报本机字体

浏览器拿不到本机字体清单（Local Font Access API 仅 Chromium、需 HTTPS 与用户手势、且逐步收紧），所以本机清单只能由桌面客户端采集后经既有 WS 通道交给宿主页。

**Files:**
- Modify: `packages/print-client-sdk/src/protocol.ts:68-71` 与 `:146-151`
- Modify: `packages/print-client-sdk/src/print-client.ts:58`（`listPrinters` 之后）
- Modify: `packages/print-client-sdk/src/print-client.test.ts:31` 与 `:73`
- Create: `clients/print-client/src/main/font-service.ts`
- Create: `clients/print-client/src/main/font-service.test.ts`
- Modify: `clients/print-client/src/main/protocol-handler.ts:6-31`
- Modify: `clients/print-client/src/main/protocol-handler.test.ts:8-20` 与 `:37`
- Modify: `clients/print-client/src/main/index.ts:60` 与 `:65-71`

**Interfaces:**
- Consumes：Task 6 的 `readSystemFonts`、`FontCommandRunner`；core 的 `FontSourceReport`
- Produces：
  - `MESSAGE_TYPES.FONTS_LIST = 'fonts.list'`
  - `interface FontsListResponsePayload { available: boolean; fonts: string[] }`（协议层自定义，与 core 的 `FontSourceReport` 结构对齐，沿用本文件「松散耦合、不反向依赖 core 类型」的既有风格）
  - `PrintClient.listFonts(): Promise<FontsListResponsePayload>`
  - `makeFontService(run?: FontCommandRunner): FontService`，`FontService.list(): Promise<FontSourceReport>`

**设计要点**

- 消息命名沿用既有 `域.动作` 风格：`printers.list` → `fonts.list`。
- 采集失败**不作为协议错误抛出**，而是照常成功返回 `available: false`。若走 `error` 分支，宿主每次调用都得写 try/catch，而漏写的那次会把「枚举失败」显示成「该字体不存在」——正是本设计要杜绝的误判。把「未知」做成一个正常的返回值，宿主就没有走错的机会。
- 客户端必须缓存：macOS 的 `system_profiler` 枚举要 1–3 秒，设计器每次打开都重新采集会让 `/fonts` 明显卡顿。缓存放在**客户端进程**而不是 SDK，因为 SDK 每次页面刷新都是新实例。
- SDK 侧不做缓存——它在浏览器里跟着页面生命周期走，且宿主可能同时开多个页面。

- [x] **Step 1: 写 SDK 失败测试**

先给 `packages/print-client-sdk/src/print-client.test.ts` 的 `FakeWebSocket.send` 补一个分支，插在 `} else if (frame.type === MESSAGE_TYPES.PRINT_SUBMIT) {` 这一行之前：

```ts
      } else if (frame.type === MESSAGE_TYPES.FONTS_LIST) {
        this.emit({ id: frame.id, ok: true, payload: { available: true, fonts: ['KaiTi', 'SimSun'] } })
```

再在 `it('print 组装 print.submit payload 并返回 jobId', async () => {` 这一行之前插入用例：

```ts
  it('connect 后 listFonts 返回本机字体清单', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    await expect(client.listFonts()).resolves.toEqual({
      available: true,
      fonts: ['KaiTi', 'SimSun'],
    })
  })
```

- [x] **Step 2: 跑测试确认失败**

```bash
npm exec -w @worm-vue3-print/client vitest run -- src/print-client.test.ts
```

预期：FAIL——`MESSAGE_TYPES.FONTS_LIST` 为 `undefined`，`client.listFonts is not a function`。

- [x] **Step 3: 协议与 SDK 实现**

`packages/print-client-sdk/src/protocol.ts`，在 `PrintersListResponsePayload`（`:68-70`）之后插入：

```ts
/**
 * fonts.list 响应 payload。
 * available=false 表示「客户端无法给出清单」（枚举失败/平台不支持），
 * 与「这台机器一个字体都没有」是两回事，宿主不得据此判定字体缺失。
 */
export interface FontsListResponsePayload {
  available: boolean
  fonts: string[]
}
```

`MESSAGE_TYPES`（`:146-151`）中 `PRINTERS_LIST` 之后插入一行：

```ts
  FONTS_LIST: 'fonts.list',
```

`packages/print-client-sdk/src/print-client.ts`：import 列表中并入 `type FontsListResponsePayload,`（置于 `type PrintersListResponsePayload,` 之前，保持字母序），并在 `listPrinters()` 方法之后插入：

```ts
  /**
   * 枚举客户端所在机器的系统字体名。
   * available=false 时 fonts 为空，调用方应视为「未上报」而非「无此字体」。
   */
  listFonts(): Promise<FontsListResponsePayload> {
    return this.transport.request<FontsListResponsePayload>(MESSAGE_TYPES.FONTS_LIST, {})
  }
```

- [x] **Step 4: 跑 SDK 测试确认通过**

```bash
npm exec -w @worm-vue3-print/client vitest run -- src/print-client.test.ts
```

预期：全部 PASS（含新增 1 例）。

- [x] **Step 5: 写客户端 font-service 失败测试**

```ts
// clients/print-client/src/main/font-service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { makeFontService } from './font-service.js'

describe('FontService', () => {
  it('缓存命中时只采集一次', async () => {
    const run = vi.fn(async () => ({ stdout: 'SimSun\n' }))
    const service = makeFontService(run)
    await service.list()
    await service.list()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('采集成功返回 available:true 与归一化后的字体名', async () => {
    const run = async () => ({ stdout: 'SimSun\nKaiTi\nSimSun\n' })
    const report = await makeFontService(run).list()
    expect(report).toEqual({ available: true, fonts: ['KaiTi', 'SimSun'] })
  })

  it('采集失败不缓存，下次调用重试', async () => {
    const run = vi
      .fn<() => Promise<{ stdout: string }>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ stdout: 'SimSun\n' })
    const service = makeFontService(run)
    await expect(service.list()).resolves.toEqual({ available: false, fonts: [] })
    await expect(service.list()).resolves.toEqual({ available: true, fonts: ['SimSun'] })
    expect(run).toHaveBeenCalledTimes(2)
  })
})
```

- [x] **Step 6: 实现客户端 font-service**

```ts
// clients/print-client/src/main/font-service.ts
// 本机系统字体清单：采集一次并缓存整个进程生命周期。
// 采集走 core 的 readSystemFonts（平台差异集中在那里），此处只负责缓存策略。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readSystemFonts } from '@worm-vue3-print/core'
import type { FontCommandRunner, FontSourceReport } from '@worm-vue3-print/core'

const execFileAsync = promisify(execFile)

/** 默认执行器：system_profiler 的 JSON 输出可达数 MB，放宽 maxBuffer */
const runCommand: FontCommandRunner = async (file, args) => {
  const { stdout } = await execFileAsync(file, args, { maxBuffer: 16 * 1024 * 1024 })
  return { stdout }
}

export interface FontService {
  list(): Promise<FontSourceReport>
}

export function makeFontService(run: FontCommandRunner = runCommand): FontService {
  let cached: FontSourceReport | null = null
  return {
    async list() {
      if (cached) return cached
      const report = await readSystemFonts(process.platform, run)
      // 只缓存成功结果：失败多为暂时性的（进程未就绪、权限），不该被钉死
      if (report.available) cached = report
      return report
    },
  }
}
```

- [x] **Step 7: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/client vitest run -- src/main/font-service.test.ts
```

预期：3 个用例全部 PASS。

- [x] **Step 8: 接进消息分发**

`clients/print-client/src/main/protocol-handler.ts`：

```ts
import { MESSAGE_TYPES } from '@worm-vue3-print/client'
import type { PrinterService } from './printer-service.js'
import type { FontService } from './font-service.js'   // ← 新增
```

`MessageHandlerDeps` 中 `printerService` 之后加入：

```ts
  fontService: FontService
```

`switch` 中 `PRINTERS_LIST` 分支之后加入：

```ts
      case MESSAGE_TYPES.FONTS_LIST: {
        const report = await deps.fontService.list()
        return { available: report.available, fonts: [...report.fonts] }
      }
```

（协议层不反向依赖 core 类型，这里显式挑选字段而非直接返回 `report`，避免把 core 的内部结构漏进协议 payload。）

- [x] **Step 9: 补分发层测试**

`clients/print-client/src/main/protocol-handler.test.ts`：在 `makeDeps()` 的 `printerService` 之后加入依赖替身：

```ts
    fontService: {
      list: async () => ({ available: true, fonts: ['KaiTi', 'SimSun'] }),
    } as any,
```

在 `it('未知 type 返回 INVALID_REQUEST'` 这一行之前插入用例：

```ts
  it('fonts.list 返回本机字体清单', async () => {
    const h = makeDeps()
    await expect(h(MESSAGE_TYPES.FONTS_LIST, {})).resolves.toEqual({
      available: true,
      fonts: ['KaiTi', 'SimSun'],
    })
  })

  it('fonts.list 枚举失败返回 available:false 而非报错', async () => {
    const h = makeMessageHandler({
      appId: APP_ID,
      version: '0.1.0',
      getPort: () => 17521,
      printerService: { list: async () => [] } as any,
      printEngine: { submit: async () => ({ jobId: 'j' }), submitHtml: async () => ({ jobId: 'j' }) } as any,
      fontService: { list: async () => ({ available: false, fonts: [] }) } as any,
    })
    await expect(h(MESSAGE_TYPES.FONTS_LIST, {})).resolves.toEqual({ available: false, fonts: [] })
  })
```

- [x] **Step 10: 跑客户端测试确认通过**

```bash
npm exec -w @worm-vue3-print/print-client vitest run -- src/main/font-service.test.ts src/main/protocol-handler.test.ts
```

预期：全部 PASS（含新增 5 例）。

- [x] **Step 11: 在 index.ts 装配**

`clients/print-client/src/main/index.ts`：

import 区按既有风格加入 `import { makeFontService } from './font-service.js'`，在 `const printEngine = new PrintEngine({...})` 整块之后加入：

```ts
      const fontService = makeFontService()
```

`makeMessageHandler({ ... })` 中 `printerService,` 之后加入：

```ts
          fontService,
```

- [x] **Step 12: 类型检查**

```bash
npm run typecheck -w @worm-vue3-print/print-client
```

预期：无输出（通过）。

- [x] **Step 13: 在本机实证枚举**

macOS 与 Windows 的枚举命令需各实测一次（当前开发机为 macOS，Windows 分支需另一台机器或留待 CI/用户验收）：

```bash
system_profiler SPFontsDataType -json | head -40
```

预期：顶层为 `{"SPFontsDataType":[{"_name":"<文件名>.ttf","typefaces":[{"family":"<字体族>"}]}, ...]}`，`family` 为可直接用于 CSS 的字体族名（不含 `.ttf` 后缀）。

Windows 侧（有机器时执行）：

```bash
powershell -NoProfile -NonInteractive -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [System.Drawing.Text.InstalledFontCollection]::new().Families | ForEach-Object { $_.Name }" | Select-Object -First 20
```

预期：逐行输出字体族名，中文名（如 `宋体`）不乱码。**若 `宋体` 与 `SimSun` 只出现其一**，则说明两端清单比较下它会被误判为缺失——此时不要改解析，而是在 spec §13.2 记录该已知限制并在 Task 9 的宿主示例中提示用户按该平台实际名称选择。

- [x] **Step 14: 提交**

```bash
git add packages/print-client-sdk/src clients/print-client/src/main
git commit -m "feat(client,sdk): 桌面客户端经 WS 上报本机系统字体

新增 fonts.list 消息与 PrintClient.listFonts；客户端采集本机字体并
缓存于进程内，采集失败返回 available:false 而不报错，使「未知」与
「无此字体」在协议层可区分。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: 出图前的服务端与客户端告警

设计器里的提示只能覆盖「在设计器里看着」的场景。模板由后端定时任务、或由工位机直接提交时没有人看着设计器，缺字体必须落在**出图这一侧**的日志/响应上。

**Files:**
- Create: `services/print-render/src/font-warnings.ts`
- Create: `services/print-render/src/font-warnings.test.ts`
- Modify: `services/print-render/src/server.ts`（两条出图路由各一处）
- Create: `clients/print-client/src/main/font-warning.ts`
- Create: `clients/print-client/src/main/font-warning.test.ts`
- Modify: `clients/print-client/src/main/print-engine.ts:73-98`
- Modify: `clients/print-client/src/main/index.ts`（PrintEngine 装配处）

**Interfaces:**
- Consumes：Task 1 的 `findMissingFonts`、`mergeFontSources`、`UNAVAILABLE`、`MissingFont`、`FontSourceReport`；Task 6 的 `fontService`；Task 7 的 `FontService`
- Produces：
  - `buildFontWarningsHeader(templateJson: unknown, report: FontSourceReport): string | null`（render 服务）
  - `collectMissingFonts(templateJson: unknown, report: FontSourceReport): MissingFont[]`（客户端）
  - 出图响应新增可选响应头 `X-Font-Warnings`

**设计要点**

- **响应头而不是响应体**：`/render/pdf` 与 `/render/screenshot` 返回的是 `application/pdf` / `image/png` 二进制，响应体里塞不进 JSON。此处**修正 spec §8 的表述**（原文写「出图接口响应体新增可选字段」），改为可选响应头；消费者契约（`warnings` 数组的结构）保持不变，只换承载方式。新增响应头对既有消费者完全惰性，天然不破坏兼容。
- 响应头取值必须是 ASCII，故用 `encodeURIComponent(JSON.stringify(...))` 承载，并用 `decodeURIComponent` 还原——直接塞中文族名会被 Node 拒发或截断。
- 必须**限量**：一个引用了 200 个缺失单元格的模板会产生几十 KB 的头，超过 Node 默认的响应头上限。族名上限 32、每族 targets 上限 5，够定位问题。
- 客户端与 render 服务都各自只校验**自己这一端**（客户端用 `client` 清单、服务端用 `server` 清单），不做并集——校验回答的是「这次出图会不会回退」，并集答不了这个问题。
- 客户端的检查**绝不能导致打印失败**：字体枚举是尽力而为的诊断，包一层 try/catch，失败只记 debug 日志。

- [x] **Step 1: 写服务端失败测试**

```ts
// services/print-render/src/font-warnings.test.ts
import { describe, it, expect } from 'vitest'
import { buildFontWarningsHeader } from './font-warnings.js'

const report = { available: true, fonts: ['SimSun'] }

function tpl(fontFamily?: string) {
  return { elements: [{ id: 'txt-1', options: { fontFamily } }] }
}

describe('buildFontWarningsHeader', () => {
  it('有缺失时返回可解码的 warnings 头', () => {
    const header = buildFontWarningsHeader(tpl('KaiTi'), report)
    expect(header).toBeTruthy()
    expect(JSON.parse(decodeURIComponent(header!))).toEqual([
      { code: 'FONT_MISSING', family: 'KaiTi', targets: ['txt-1'] },
    ])
  })

  it('无缺失时返回 null', () => {
    expect(buildFontWarningsHeader(tpl('SimSun'), report)).toBeNull()
    expect(buildFontWarningsHeader(tpl(), report)).toBeNull()
  })

  it('该端未上报时跳过校验', () => {
    expect(buildFontWarningsHeader(tpl('KaiTi'), { available: false, fonts: [] })).toBeNull()
  })

  it('族名超过 32 个时截断', () => {
    const many = {
      elements: Array.from({ length: 40 }, (_, i) => ({
        id: `txt-${i}`,
        options: { fontFamily: `F${i}` },
      })),
    }
    const parsed = JSON.parse(decodeURIComponent(buildFontWarningsHeader(many, report)!))
    expect(parsed).toHaveLength(32)
  })

  it('同一族的 targets 超过 5 个时截断', () => {
    const many = {
      elements: Array.from({ length: 8 }, (_, i) => ({ id: `txt-${i}`, options: { fontFamily: 'KaiTi' } })),
    }
    const parsed = JSON.parse(decodeURIComponent(buildFontWarningsHeader(many, report)!))
    expect(parsed[0].targets).toEqual(['txt-0', 'txt-1', 'txt-2', 'txt-3', 'txt-4'])
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
npm exec -w @worm-vue3-print/render vitest run -- src/font-warnings.test.ts
```

预期：FAIL——`Failed to resolve import "./font-warnings.js"`。

- [x] **Step 3: 实现服务端告警头**

```ts
// services/print-render/src/font-warnings.ts
// 出图前的字体可用性告警：以响应头承载（PDF/PNG 响应体放不下 JSON）。
import { findMissingFonts, mergeFontSources, UNAVAILABLE } from '@worm-vue3-print/core'
import type { FontSourceReport, MissingFont } from '@worm-vue3-print/core'

/** 响应头名；新增头对既有消费者惰性 */
export const FONT_WARNINGS_HEADER = 'X-Font-Warnings'

/** 族名条数上限：避免大模板把头撑到 Node 的响应头上限 */
const MAX_FAMILIES = 32
/** 每族引用位置上限：定位问题够用即可 */
const MAX_TARGETS = 5

function cap(missing: MissingFont[]): MissingFont[] {
  return missing.slice(0, MAX_FAMILIES).map(m => ({
    ...m,
    targets: m.targets.slice(0, MAX_TARGETS),
  }))
}

/**
 * 生成字体缺失告警响应头；无缺失或本端清单不可用时返回 null（调用方不设置该头）。
 * 取值为 encodeURIComponent 后的 JSON —— 头值必须是 ASCII，中文族名不能直接放。
 */
export function buildFontWarningsHeader(
  templateJson: unknown,
  report: FontSourceReport,
): string | null {
  // 清单不可用 = 未知，跳过校验；否则会把每个模板都判成缺字体
  if (!report.available) return null
  const catalog = mergeFontSources({ server: report, client: UNAVAILABLE })
  const missing = findMissingFonts(templateJson as any, catalog, 'server')
  if (!missing.length) return null
  const warnings = cap(missing).map(m => ({
    code: 'FONT_MISSING' as const,
    family: m.family,
    targets: m.targets,
  }))
  return encodeURIComponent(JSON.stringify(warnings))
}
```

- [x] **Step 4: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/render vitest run -- src/font-warnings.test.ts
```

预期：5 个用例全部 PASS。

- [x] **Step 5: 接进两条出图路由**

`services/print-render/src/server.ts`：import 区加入

```ts
import { buildFontWarningsHeader, FONT_WARNINGS_HEADER } from './font-warnings.js'
```

在 `/render/pdf` 的 `const tpl = body.templateJson as TemplateData` 与 `if (!tpl.paperSize ...)` 校验通过之后、`const printDataError = ...` 之前插入：

```ts
  const warnings = buildFontWarningsHeader(tpl, await fontService.list())
  if (warnings) res.setHeader(FONT_WARNINGS_HEADER, warnings)
```

`/render/screenshot` 路由同样处理：在 `const body = req.body as RenderRequest` 与其后 `if (!body.templateJson)` 校验之后插入同一段（该路由未把 body 赋给 `tpl`，此处用 `body.templateJson`）：

```ts
  const warnings = buildFontWarningsHeader(body.templateJson, await fontService.list())
  if (warnings) res.setHeader(FONT_WARNINGS_HEADER, warnings)
```

（`fontService` 在 Task 6 已作为模块级常量定义在 `/fonts` 端点旁，此处直接复用。）

- [x] **Step 6: 写客户端失败测试**

```ts
// clients/print-client/src/main/font-warning.test.ts
import { describe, it, expect } from 'vitest'
import { collectMissingFonts } from './font-warning.js'

const report = { available: true, fonts: ['SimSun'] }

describe('collectMissingFonts', () => {
  it('元素的字体不在本机清单时报告缺失', () => {
    const tpl = { elements: [{ id: 'txt-1', options: { fontFamily: 'KaiTi' } }] }
    expect(collectMissingFonts(tpl, report)).toEqual([{ family: 'KaiTi', targets: ['txt-1'] }])
  })

  it('单元格的字体同样被覆盖', () => {
    const tpl = {
      elements: [
        {
          id: 'tbl-1',
          options: {
            tableRows: [{ cells: [{ fontFamily: 'KaiTi' }] }],
          },
        },
      ],
    }
    expect(collectMissingFonts(tpl, report)).toEqual([{ family: 'KaiTi', targets: ['tbl-1#r0c0'] }])
  })

  it('本机清单可用时不误报', () => {
    const tpl = { elements: [{ id: 'txt-1', options: { fontFamily: 'SimSun' } }] }
    expect(collectMissingFonts(tpl, report)).toEqual([])
  })

  it('枚举失败（available:false）时返回空数组', () => {
    const tpl = { elements: [{ id: 'txt-1', options: { fontFamily: 'KaiTi' } }] }
    expect(collectMissingFonts(tpl, { available: false, fonts: [] })).toEqual([])
  })

  it('模板结构畸形时不抛异常', () => {
    expect(collectMissingFonts(null, report)).toEqual([])
    expect(collectMissingFonts({ elements: 'nope' }, report)).toEqual([])
  })
})
```

- [x] **Step 7: 实现客户端告警采集**

```ts
// clients/print-client/src/main/font-warning.ts
// 出图前校验：模板所用字体在本机是否可用。只做诊断，不影响出图成败。
import { findMissingFonts, mergeFontSources, UNAVAILABLE } from '@worm-vue3-print/core'
import type { FontSourceReport, MissingFont } from '@worm-vue3-print/core'

/**
 * 收集模板中在本机缺失的字体。
 * 客户端只知道自己这一端，服务端清单传 UNAVAILABLE —— 按 client 校验时该入参不参与判定。
 * 本机清单不可用时返回空数组（未知 ≠ 缺失）。
 */
export function collectMissingFonts(
  templateJson: unknown,
  report: FontSourceReport,
): MissingFont[] {
  if (!report.available || typeof templateJson !== 'object' || templateJson === null) return []
  const catalog = mergeFontSources({ server: UNAVAILABLE, client: report })
  return findMissingFonts(templateJson as any, catalog, 'client')
}
```

- [x] **Step 8: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/print-client vitest run -- src/main/font-warning.test.ts
```

预期：5 个用例全部 PASS。

- [x] **Step 9: 接进打印引擎**

`clients/print-client/src/main/print-engine.ts`：

import 区加入：

```ts
import { collectMissingFonts } from './font-warning.js'
import type { FontService } from './font-service.js'
```

`PrintEngine` 构造器 deps 中 `logger` 之后加入（可选，既有测试无需改动）：

```ts
      /** 字体清单服务；缺省跳过出图前字体校验 */
      fontService?: FontService
```

在 `submit` 之前加入私有方法：

```ts
  /** 出图前字体校验：只记警告，绝不阻断——字体缺失时 Chromium 会自行回退 */
  private async warnMissingFonts(templateJson: unknown): Promise<void> {
    const { fontService, logger } = this.deps
    if (!fontService) return
    try {
      const missing = collectMissingFonts(templateJson, await fontService.list())
      if (!missing.length) return
      logger.warn('模板字体在本机缺失，将回退到默认字体', {
        families: missing.map(m => m.family),
      })
    } catch (error) {
      // 诊断能力失效不应影响打印
      logger.debug('字体校验失败', { error: String(error) })
    }
  }
```

`submit` 改为：

```ts
  /** 处理 print.submit 原始 payload（客户端内渲染）；成功在出纸后 resolve */
  submit(raw: unknown): Promise<{ jobId: string }> {
    return this.gate.run(async () => {
      const { spec, print, templateName } = parsePrintSubmit(raw)
      await this.warnMissingFonts(spec.templateJson)
      return this.runJob({
        name: readTemplateName(spec.templateJson, templateName),
        print,
        produce: () => this.produceFromTemplate(spec, print as PrintOptions),
      })
    })
  }
```

- [x] **Step 10: 装配并类型检查**

`clients/print-client/src/main/index.ts` 的 `new PrintEngine({ ... })` 中 `pdfOutput: resolvePdfPolicy,` 之后加入：

```ts
        fontService,
```

（`fontService` 在 Task 7 已定义在 `printerService` 之后，此处是同一实例。）

```bash
npm run typecheck -w @worm-vue3-print/print-client
```

预期：无输出（通过）。

- [x] **Step 11: 跑既有打印引擎测试确认无回归**

```bash
npm exec -w @worm-vue3-print/print-client vitest run -- src/main/print-engine.test.ts src/main/protocol-handler.test.ts
```

预期：全部 PASS（`fontService` 为可选依赖，既有用例不传即跳过校验）。

- [x] **Step 12: 提交**

```bash
git add services/print-render/src clients/print-client/src/main
git commit -m "feat(render,client): 出图前报告缺失字体但不阻断

render 服务在出图响应头 X-Font-Warnings 中返回缺失字体（PDF/PNG
响应体放不下 JSON，故改用响应头，消费者契约不变）；客户端在任务开始
时校验本机字体并记 warn 日志。两端清单不可用时一律跳过校验。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: demo 宿主取数示例

canvas 只认「注入进来的清单」，取数责任在宿主。demo 必须把两条取数链路都演出来，否则这个宿主契约就没有可运行的参考实现。

**Files:**
- Modify: `demo/src/render-client.ts`（`checkRenderHealth` 之后）
- Modify: `demo/src/components/PrintOutputDialog.vue:84`、`:173-197`
- Modify: `demo/src/App.vue:70`、`:95`、`:27`、`:65`

**Interfaces:**
- Consumes：Task 3 的 `PrintDesigner` 新增 props `serverFonts` / `clientFonts`；Task 6 的 `GET /fonts`；Task 7 的 `PrintClient.listFonts()`
- Produces：`demo/src/render-client.ts` 导出 `ServerFontReport` 与 `fetchServerFonts(signal?)`；`PrintOutputDialog` 新增事件 `client-fonts`

**设计要点**

- **服务端清单在 App.vue 取，客户端清单在打印弹窗取**，各归其位：服务端清单是设计器自己的依赖，一进页面就要；客户端清单只有连上了桌面客户端才有，而连接发生在打印弹窗里。
- 服务端取数**必须带 3s 超时**（spec §8 硬约束）：render 服务不通时不能让设计器首屏卡在等待上，超时即 `available: false`，下拉里照常显示字体名，只是不标注可用范围。
- 客户端清单通过事件回传 App.vue 而不是在弹窗内消费——`StatusBar` 的汇总在设计器里，清单必须落到 `PrintDesigner` 的 prop 上。
- 「连上了但枚举失败」与「没连上」在 demo 里都落到 `available: false`，UI 上同为「本机字体未知」，符合 spec §10.3 的语义要求。

- [x] **Step 1: 在 render-client.ts 增加服务端字体取数**

在 `demo/src/render-client.ts` 的 `checkRenderHealth` 函数之后插入：

```ts
/** 服务端容器字体清单（GET /fonts 响应体） */
export interface ServerFontReport {
  /** false 表示服务端未能给出清单（枚举失败/服务未就绪），不等于「没有字体」 */
  available: boolean
  fonts: string[]
}

/** 取数超时：字体清单绝不阻塞设计器首屏，超时按未上报处理 */
const FONT_FETCH_TIMEOUT_MS = 3000

/**
 * 拉取 render 服务容器内的系统字体清单。
 * 服务不可达或超时返回 { available: false, fonts: [] }，不抛错——调用方无需 try/catch。
 */
export async function fetchServerFonts(signal?: AbortSignal): Promise<ServerFontReport> {
  const unavailable: ServerFontReport = { available: false, fonts: [] }
  try {
    const res = await fetch(`${RENDER_API_PREFIX}/fonts`, {
      signal: signal ?? AbortSignal.timeout(FONT_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return unavailable
    const data = (await res.json()) as Partial<ServerFontReport>
    if (typeof data?.available !== 'boolean' || !Array.isArray(data.fonts)) return unavailable
    return { available: data.available, fonts: data.fonts }
  } catch {
    return unavailable
  }
}
```

- [x] **Step 2: 打印弹窗回传客户端清单**

`demo/src/components/PrintOutputDialog.vue`：

事件声明（`:84`）改为：

```ts
const emit = defineEmits<{
  close: []
  /** 本机字体清单；未连接或枚举失败时为 available:false */
  'client-fonts': [report: { available: boolean; fonts: string[] }]
}>()
```

`onStatusChange` 回调（`:180-189`）中，`disconnected` 分支改为：

```ts
      } else if (s === 'disconnected') {
        clientStatus.value = 'offline'
        clientStatusText.value = '打印客户端离线'
        // 掉线后本机字体不再可知，必须撤回清单，否则会残留过期的可用范围标注
        emit('client-fonts', { available: false, fonts: [] })
      }
```

`connectPrintClient()` 中 `await refreshClientPrinters()` 之后加入：

```ts
    await refreshClientFonts()
```

`catch {}` 分支中（`clientStatusText.value = '打印客户端离线'` 之后）加入：

```ts
    emit('client-fonts', { available: false, fonts: [] })
```

在 `refreshClientPrinters` 函数之后新增：

```ts
async function refreshClientFonts() {
  try {
    emit('client-fonts', await client.listFonts())
  } catch {
    emit('client-fonts', { available: false, fonts: [] })
  }
}
```

- [x] **Step 3: App.vue 接两端清单**

`demo/src/App.vue`：

import 行（`:70`）改为：

```ts
import { ref, computed, onMounted } from 'vue'
```

`render-client` 的 import（App.vue 中现有 `import { checkRenderHealth, requestServerPdf, openPdfBlob } from '../render-client'` 位于 `PrintOutputDialog.vue`，App.vue 需新增一行）：

```ts
import { fetchServerFonts, type ServerFontReport } from './render-client'
```

`const fields = ref<PrintBusinessField[]>(PURCHASE_RECEIPT_FIELDS)` 之后加入：

```ts
/** 服务端容器字体清单；未取到时为 undefined（下拉不标注可用范围） */
const serverFonts = ref<ServerFontReport | undefined>(undefined)
/** 本机（桌面客户端所在机器）字体清单；未连接时为 undefined */
const clientFonts = ref<ServerFontReport | undefined>(undefined)

onMounted(async () => {
  // 清单后到即填，不阻塞设计器挂载
  serverFonts.value = await fetchServerFonts()
})
```

`<PrintDesigner>` 上 `:upload-design-background="uploadDemoImage"` 之后加入两行：

```html
        :server-fonts="serverFonts"
        :client-fonts="clientFonts"
```

`<PrintOutputDialog>` 上 `@close="printDialogVisible = false"` 之后加入：

```html
      @client-fonts="clientFonts = $event"
```

- [x] **Step 4: 构建并手工验证**

```bash
npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/canvas
cd demo && npm run dev
```

验证（需 render 服务已启动；无 Docker 时可用 `npm run dev -w @worm-vue3-print/render` 本地起服务，其宿主平台为 macOS，走 `system_profiler` 分支）：

1. 打开设计器 → 选中文本元素 → 字体下拉展开，选项带可用范围标注；服务端不可用时下拉仍可用且**不标注**任何范围。
2. 点开「打印输出」弹窗 → 客户端在线后（无客户端时跳过）下拉标注出现「仅本机」项。
3. 关掉 render 服务后刷新页面 → 首屏 3 秒内正常出现，无卡顿，`serverFonts` 为 `available: false`。

- [x] **Step 5: 提交**

```bash
git add demo/src/render-client.ts demo/src/components/PrintOutputDialog.vue demo/src/App.vue
git commit -m "feat(demo): 演示服务端与本机字体清单的宿主取数

服务端清单在 App.vue 挂载后异步取（3s 超时，不阻塞首屏）；
客户端清单由打印弹窗在连接成功后回传，掉线时撤回。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

> ⚠️ `demo/src/App.vue` 在本计划开始前已有**未提交的本地改动**（一行删除，非本次任务产生）。提交前先 `git diff demo/src/App.vue` 确认，不要把该改动一并提交；如无法拆开，请先与用户确认其归属。

---

### Task 10: 文档与 CHANGELOG

**Files:**
- Modify: `docs/中文/CHANGELOG.md`（`## [Unreleased]` 段）
- Modify: `docs/en/CHANGELOG.en.md`（`## [Unreleased]` 段）
- Modify: `docs/中文/指南/三端渲染一致性方案.md:158-159` 附近

**Interfaces:**
- Consumes：Task 1–9 的全部产出
- Produces：无代码产出

**设计要点**

- 本次有**必须写进 CHANGELOG 的行为变更**：旧模板中单元格若已存有 `fontFamily`，此前被静默丢弃，本次之后会真正生效，同一份模板的呈现会变化。使用者需要知道这件事。
- **canvas 帮助弹窗的 CHANGELOG 本次不改**（修正 spec §9 的表述）：`packages/print-canvas/src/help-content/changelog.ts` 的条目按已发布版本号分节，本次功能尚未发版，提前写入会造成「帮助里写着 1.2.2 有这个功能、npm 上 1.2.2 却没有」的错配。改为在**发版时**随版本号一并补写（CLAUDE.md 的发版清单已含此项）。
- 字体清单语义（「未上报 ≠ 没有该字体」）是最容易被下游误用的一点，必须写进指南而不只是 CHANGELOG。

- [x] **Step 1: 中文 CHANGELOG**

`docs/中文/CHANGELOG.md` 的 `## [Unreleased]` 段内，在既有条目之后追加：

```markdown
- `@worm-vue3-print/core`：**行为变更** 表格单元格此前已存有 `fontFamily` 的模板，渲染时该字段被静默丢弃（`data-binder` 的字段映射表未收录）；本次修复后单元格字体会真正生效，**同一份旧模板的呈现会发生变化**。同时修复 `font-family` 输出未加引号、未带兜底栈的问题（含空格的族名如 `Microsoft YaHei` 此前不生效）。
- `@worm-vue3-print/canvas`：文本元素与表格单元格属性面板新增「字体」下拉，列出服务端与本机两端可用字体的并集并标注可用范围（「仅服务端」/「仅本机」）；清单之外的字体名照常展示并标注「（未知）」，不做静默清除。
- `@worm-vue3-print/canvas`：新增 `PrintDesigner` 的 `serverFonts` / `clientFonts` 两个可选 prop（`{ available: boolean; fonts: string[] }`），由宿主注入两端字体清单；不传则下拉退化为自由输入，功能不缺失。（**宿主契约**：`available: false` 表示「该端未能给出清单」，**不得**据此判定字体缺失。）
- `@worm-vue3-print/client`：新增协议消息 `fonts.list` 与 SDK 方法 `PrintClient.listFonts()`，返回桌面客户端所在机器的系统字体清单。
- `@worm-vue3-print/render`：新增 `GET /fonts` 上报容器内系统字体清单；`/render/pdf`、`/render/screenshot` 在存在缺失字体时返回响应头 `X-Font-Warnings`（值为 `encodeURIComponent` 后的 `Array<{ code: 'FONT_MISSING'; family: string; targets: string[] }>`），无缺失时不返回该头。
- 打印客户端：`print.submit` 在任务开始时校验模板字体在本机是否可用，缺失时记 `warn` 日志（**不阻断打印**，Chromium 自行回退）。
- 已知限制：不做跨语言字体别名归一（「宋体」与「SimSun」视为两个字体名），中文 Windows 与本机字体名不一致时可能产生**假阳性**提示；客户端清单只代表运行浏览器的工位机，不代表其他工位机。
```

- [x] **Step 2: 英文 CHANGELOG**

`docs/en/CHANGELOG.en.md` 的 `## [Unreleased]` 段内对应位置追加（与该文件既有条目风格一致）：

```markdown
- `@worm-vue3-print/core`: **Behavior change** Templates that already stored a `fontFamily`
  on table cells had that field silently dropped at render time (it was missing from the
  data-binder field map). Cell fonts now take effect, so **the output of such existing
  templates will change**. Also fixed `font-family` output missing quotes and the fallback
  stack (family names containing spaces, e.g. `Microsoft YaHei`, did not apply before).
- `@worm-vue3-print/canvas`: Added a font picker to the text-element and table-cell property
  panels. It lists the union of fonts available on the server and on the local machine and
  marks the available scope ("server only" / "local only"). Font names outside the list are
  still shown, marked "(unknown)", and never silently cleared.
- `@worm-vue3-print/canvas`: `PrintDesigner` accepts two new optional props, `serverFonts` and
  `clientFonts` (`{ available: boolean; fonts: string[] }`), supplied by the host. When omitted,
  the picker falls back to free-text entry. **Host contract**: `available: false` means "this
  end could not produce a list" and must NOT be read as "the font is missing".
- `@worm-vue3-print/client`: Added protocol message `fonts.list` and SDK method
  `PrintClient.listFonts()`, returning the system font list of the machine running the
  desktop client.
- `@worm-vue3-print/render`: Added `GET /fonts`, reporting the container's system fonts.
  `/render/pdf` and `/render/screenshot` now return an `X-Font-Warnings` response header when
  fonts are missing (value is `encodeURIComponent` of
  `Array<{ code: 'FONT_MISSING'; family: string; targets: string[] }>`); the header is omitted
  when nothing is missing.
- Desktop client: `print.submit` checks template fonts against the local machine at job start
  and logs a `warn` entry when fonts are missing. Printing is **never blocked**; Chromium falls
  back on its own.
- Known limitation: no cross-language font alias normalization ("宋体" and "SimSun" count as
  two names), which can produce **false positives** on Chinese Windows. The client font list
  describes only the workstation running the browser, not other workstations.
```

- [x] **Step 3: 指南补充**

`docs/中文/指南/三端渲染一致性方案.md` 中「字体同源的部署前提」相关段落（约 `:158-159`）之后追加：

```markdown
#### 检查某端到底装了哪些字体

字体清单由两端各自上报，模板本身不携带字体资产——**字体是否可用完全取决于出图那一端的系统装了没有**。

- **服务端（容器）**：`GET /fonts` 返回 `{ available, fonts }`；也可直接进容器核对：

  ```bash
  docker run --rm --entrypoint fc-list <镜像> --format='%{family}\n' | sort -u
  ```

  容器需在 `Dockerfile` 中安装模板所用字体（现有镜像已含 `fonts-noto-cjk`），字体缺失时 Chromium 静默回退，**不报错**。
- **本机（桌面客户端所在机器）**：经 WebSocket `fonts.list` 上报，SDK 侧为 `PrintClient.listFonts()`。清单代表**运行浏览器的这一台工位机**；若「设计机设计、多台工位机打印」，它对其他工位机没有预测力。
- **`available: false` 表示「未能给出清单」**（服务未就绪、枚举失败、客户端未连接），**不是「没有字体」**。下游一律不得据此判定字体缺失，否则会对每个模板报出满屏假告警。
- 设计器中的缺失字体提示**只提示、不阻断**：字体名不存在时 Chromium 回退到默认字体，出图继续。服务端出图的缺失清单见响应头 `X-Font-Warnings`。
```

- [x] **Step 4: 提交**

```bash
git add docs/中文/CHANGELOG.md docs/en/CHANGELOG.en.md docs/中文/指南/三端渲染一致性方案.md
git commit -m "docs: 补充字体设置与两端字体清单的变更说明

中文/英文 CHANGELOG 记录单元格字体从此生效的行为变更，指南补充
两端清单的核对方式与 available:false 的语义。canvas 帮助弹窗按版本号
分节，留待发版时随版本号补写。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [x] **Step 5: 收尾全量校验**

```bash
npm run build && npm test && npm run lint:print-architecture
```

预期：三段全绿。`lint:print-architecture` 必须通过——字体栈、兜底栈与 `findFontCandidate` 全部落在 core，render 服务与 Electron 客户端只做采集与上报，未引入 DOM 测量或出图参数硬编码。

---

## 完成标准

- [x] 文本元素与表格单元格均可在属性面板选择字体，且能自由填写清单外的字体名
- [x] 单元格字体在渲染 HTML 中真正生效（`<td>` 带 `font-family`），旧模板呈现变化已在 CHANGELOG 中声明
- [x] 服务端 `/fonts` 与本机 `fonts.list` 两端清单可注入设计器，下拉标注可用范围
- [x] 任一端未上报时**不产生**任何缺失提示；两端都上报时才给出字段级与汇总级提示
- [x] 缺失字体在任何链路上都不阻断出图
- [x] `npm run lint:print-architecture` 通过，core 仍是字体逻辑的唯一实现处
