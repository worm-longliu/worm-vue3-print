# AI 接入 · 第一阶段（模板契约层 + 本地 MCP 连接器）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把打印模板从「只有 TS 接口」升级为「机器可读的契约层」，并以本地 stdio MCP server 对外暴露 6 个工具，使宿主已有的 AI agent 能校验、体检、起草模板，而不需要本项目持有任何模型密钥。

**Architecture:** 新增两个工作区包。`@worm-vue3-print/contract`（zod）把 `TemplateData`/`ElementOptions`/表达式/版面几何判定收敛为单一契约来源；`@worm-vue3-print/mcp` 只做「SDK 传输壳 + 工具注册表」，所有实际逻辑调 contract 与 core 的既有纯函数，自身不调用任何模型、不读任何 key。画布实时驱动（宿主能力探测 + AI 面板 + 服务端 key 代理）属第二阶段，见末尾 Pending。

**Tech Stack:** TypeScript 5.4 ESM、tsup 8、vitest 1.6、zod 4.6.7、`@modelcontextprotocol/sdk` 1.32.2（镜像源已确认可装）。

**Spec:** 无独立 spec 文档；决策依据为本次会话的用户裁决（记录在下文 Global Constraints 第 10–13 条）与 [README.md:112](file:///Users/worm/worm/worm-vue3-print/README.md#L112) 的 MCP 待办。

## Global Constraints

1. 回复、注释、提交信息、文档一律简体中文；文件 UTF-8 无 BOM；单次写入 ≤500 行。
2. 依赖边界：`core`（纯逻辑）→ `contract` → `mcp`。`contract`、`mcp` 不得依赖 `canvas` / `common` / Vue。
3. **`core` 不新增运行时依赖**（zod 只进 `contract`）；`contract` 与 `mcp` 一律从 `@worm-vue3-print/core/designer` 或主入口 import 类型与函数，禁止复制类型定义。
4. 工作区依赖写法沿用仓内约定：`"@worm-vue3-print/core": "^1.4.4"`（见 [print-canvas/package.json:44](file:///Users/worm/worm/worm-vue3-print/packages/print-canvas/package.json#L44)）。
5. 新包版本与主线同号 `1.4.4`，`license` MIT，`author` 与 core 一致；本阶段**不**接入 `publish:npm`，仅本地/yalc 可用。
6. 长度单位口径：元素坐标与 `barHeight`/`maxWidth` 等为 **mm**（`unit:'mm'`），`fontSize`/`lineHeight`/`letterSpacing`/`shrinkMinFontSize`/`borderWidth`/单元格 `padding` 为 **pt**；`barWidth`/`barQuietZone`/`qrQuietZone`/`flowColumns` 为**模块或个数**，不是长度。
7. 表达式语法是 `{field}`，**不是** `${field}`（[template-parser.ts:12](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/template-parser.ts#L12)）。
8. 纯 Node 侧不得伪造排版：`paginate(template, new Map())` 对表格会得到空切片，因此本阶段的版面判定**只做不依赖测量的静态几何**，需要真实排版数字的一律走 `render_preview`（第二/九号任务，交给 print-render 服务）。
9. AI 写操作在本阶段只**产出草稿 JSON**，不直接改画布；任何落画布的路径留到第二阶段并保留 undo。
10. 【裁决】MCP 只做本地 stdio，不做远程 streamable HTTP、不做 OAuth。
11. 【裁决】BYOK 的 key 归属必须在服务端；因此 MCP server 与 contract 包**永不**读取/接收模型密钥，也不发起模型请求。
12. 【裁决】必须假设宿主已具备 AI 能力：本阶段交付物的定位是「把能力与工具契约暴露出去」，不是「再造一个 agent」。工具循环归宿主。
13. 存量兼容优先：`title`/`tableMode`/`fields` 等 `@deprecated` 字段必须能校验通过（只给警告），否则历史模板会被 AI 误判为非法。

## 文件结构

**新建 `packages/print-contract/`（`@worm-vue3-print/contract`）**

| 文件 | 职责 |
| --- | --- |
| `package.json` `tsconfig.json` `tsup.config.ts` `vitest.config.ts` | 包脚手架，配置镜像 core |
| `src/units.ts` | `OptionKind`（mm/pt/模块/颜色/枚举…）与 `normalizeLength` |
| `src/option-meta.ts` | `OPTION_META`：`ElementOptions` 每个键的元数据；编译期强制全键覆盖 |
| `src/schema/element.ts` | `tableCellSchema` `tableRowSchema` `printElementDataSchema` |
| `src/schema/template.ts` | `templateDataSchema` `multiPageTemplateDataSchema` |
| `src/validate.ts` | `validateTemplateJson()` → `{ok, issues, deprecatedHits}` |
| `src/expression.ts` | `checkExpression()`：解析 + 函数白名单 + 沙箱拒绝 |
| `src/inspect.ts` | `inspectTemplate()`：越界/重叠/零尺寸/列宽和/连续纸禁忌 |
| `src/draft.ts` | `draftTemplate()`：复用 core `element-factory` 生成合法草稿 |
| `src/kinds.ts` | `ELEMENT_KINDS`：13 种元素类型 + 各自必填/禁用键，供工具描述 |
| `src/index.ts` | 对外汇总导出 |

**新建 `packages/print-mcp/`（`@worm-vue3-print/mcp`）**

| 文件 | 职责 |
| --- | --- |
| `src/config.ts` | 只读两个变量：`PRINT_RENDER_BASE_URL` / `RENDER_API_KEY`（白名单由测试守着） |
| `src/tools.ts` | 6 个工具的 `name/description/inputSchema/handler`，handler 与 SDK 解耦以便单测 |
| `src/server.ts` | `Server` + `ListToolsRequestSchema`/`CallToolRequestSchema` 接线，stdio transport |
| `src/index.ts` | `#!/usr/bin/env node` 入口 |
| `src/__tests__/tools.test.ts` | 直接调 handler 的工具测试 |

**修改**：根 `package.json`（scripts）、`scripts/check-print-architecture.mjs`（TARGETS）、`README.md:112`（勾待办）、新增 `docs/中文/AI接入.md`。

---

### Task 1: print-contract 工作区脚手架

**Files:**
- Create: `packages/print-contract/package.json`
- Create: `packages/print-contract/tsconfig.json`
- Create: `packages/print-contract/tsup.config.ts`
- Create: `packages/print-contract/vitest.config.ts`
- Create: `packages/print-contract/src/index.ts`
- Create: `packages/print-contract/src/__tests__/smoke.test.ts`
- Modify: `package.json:28-29`（root `build` / `test` 串入新包）

**Interfaces:**
- Consumes: `@worm-vue3-print/core/designer` 的 `TemplateData`、`ElementOptions` 类型。
- Produces: 包名 `@worm-vue3-print/contract`，`npm run test -w @worm-vue3-print/contract` 可独立执行；后续任务的 import 路径为 `@worm-vue3-print/contract`（经 dist）与 `../src/*.js`（经 vitest）。

- [ ] **Step 1: 建目录与 package.json**

```json
{
  "name": "@worm-vue3-print/contract",
  "version": "1.4.4",
  "private": true,
  "type": "module",
  "description": "打印模板的机器可读契约层：zod schema、表达式校验、静态版面体检与草稿生成（供 MCP 连接器与宿主 AI 消费）",
  "license": "MIT",
  "author": "worm <liu_long_qqcom@qq.com>",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@worm-vue3-print/core": "^1.4.4",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 建 tsconfig / tsup / vitest 配置**

`tsconfig.json`（镜像 [print-core/tsconfig.json](file:///Users/worm/worm/worm-vue3-print/packages/print-core/tsconfig.json)，但 `include` 需带测试目录才能对 `OPTION_META` 做全键编译期检查）：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`tsup.config.ts`：

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  shims: true,
  external: ['@worm-vue3-print/core', '@worm-vue3-print/core/designer'],
})
```

`vitest.config.ts`（与 core 一致）：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { globals: true, environment: 'node' },
})
```

- [ ] **Step 3: 写占位入口与冒烟测试**

`src/index.ts`：

```ts
// @worm-vue3-print/contract
// 打印模板契约层：类型来自 core/designer，本包只补「机器可读」的校验与判定。
export const CONTRACT_VERSION = '1'
```

`src/__tests__/smoke.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { TemplateData, ElementOptions } from '@worm-vue3-print/core/designer'
import { CONTRACT_VERSION } from '../index.js'

describe('契约层脚手架', () => {
  it('能取到 core 的设计器类型（证明边界正确）', () => {
    const probe: Pick<ElementOptions, 'left' | 'top' | 'width' | 'height'> = {
      left: 0, top: 0, width: 40, height: 10,
    }
    const options = probe as ElementOptions
    const tpl: Pick<TemplateData, 'paperSize' | 'margins' | 'elements'> = {
      paperSize: 'A4', margins: { top: 10, right: 10, bottom: 10, left: 10 }, elements: [],
    }
    expect(options.width).toBe(40)
    expect(tpl.paperSize).toBe('A4')
    expect(CONTRACT_VERSION).toBe('1')
  })
})
```

- [ ] **Step 4: 安装依赖并跑测试**

Run: `npm install`（根目录，装 zod 与新 workspace）
Run: `npm run test -w @worm-vue3-print/contract`
Expected: 1 passed。若报 `Cannot find module '@worm-vue3-print/core/designer'`，先 `npm run build -w @worm-vue3-print/core` 产出 `dist/designer/index.d.ts`。

- [ ] **Step 5: 把新包串进根 build/test**

`package.json` 的 `build` 末尾 `&& npm run build -w @worm-vue3-print/print-client` 之前插入 `&& npm run build -w @worm-vue3-print/contract`；`test` 同理在 `@worm-vue3-print/core` 之后插入 `&& npm run test -w @worm-vue3-print/contract`。

Run: `npm run build -w @worm-vue3-print/contract && npm test`
Expected: 契约包构建出 `dist/index.js`/`.cjs`/`.d.ts`；全量测试相对改动前无新增红灯（已知基线红灯见项目记忆「门禁已知红灯」，不属本阶段）。

- [ ] **Step 6: 提交**

```bash
git add packages/print-contract package.json
git commit -m "chore(contract): 新增 @worm-vue3-print/contract 工作区包脚手架"
```

---

### Task 2: OPTION_META 全键元数据 + 编译期漂移闸门

**Files:**
- Create: `packages/print-contract/src/units.ts`
- Create: `packages/print-contract/src/option-meta.ts`
- Create: `packages/print-contract/src/__tests__/option-meta.test.ts`

**Interfaces:**
- Consumes: `ElementOptions`（[types.ts:271-407](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/designer/types.ts#L271)）。
- Produces:
  - `type OptionKind = 'mm' | 'pt' | 'count' | 'color' | 'bool' | 'text' | 'enum' | 'object'`
  - `interface OptionMeta { kind: OptionKind; min?: number; max?: number; deprecated?: boolean; enum?: readonly string[] }`
  - `const OPTION_META: Record<keyof ElementOptions, OptionMeta>`（**必填映射**：core 新增键而此处漏写 → `tsc` 直接报错，这就是漂移闸门）
  - `const DEPRECATED_OPTION_KEYS: readonly string[]`
  - `const OPTION_KEYS: readonly (keyof ElementOptions)[]`

- [ ] **Step 1: 写 units.ts（单位与区间判定单点）**

```ts
// 元素 option 的取值种类：mm/pt 是长度，count 是「模块数/列数」这类无量纲整数。
export type OptionKind = 'mm' | 'pt' | 'count' | 'color' | 'bool' | 'text' | 'enum' | 'object'

export interface OptionMeta {
  kind: OptionKind
  /** 数值下限（含）；长度类按各自单位 */
  min?: number
  /** 数值上限（含） */
  max?: number
  /** 已废弃但必须继续接受（存量模板），校验只降级为警告 */
  deprecated?: boolean
  /** kind='enum' 时的合法取值 */
  enum?: readonly string[]
}

export interface OptionIssue {
  path: string
  message: string
  level: 'error' | 'warning'
}
```

- [ ] **Step 2: 先写失败测试（全键覆盖 + 废弃键清单）**

`src/__tests__/option-meta.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { createDefaultOptions } from '@worm-vue3-print/core/designer'
import type { ElementType } from '@worm-vue3-print/core/designer'
import { OPTION_META, OPTION_KEYS, DEPRECATED_OPTION_KEYS } from '../option-meta.js'

const ALL_TYPES: ElementType[] = [
  'text', 'image', 'longText', 'table', 'flowList', 'hline', 'vline', 'rect', 'oval',
  'barcode', 'qrcode', 'html', 'pageNumber',
]

describe('OPTION_META', () => {
  it('覆盖 core 各元素类型实际产出的每一个键', () => {
    // 用 core 的元素工厂反查真实键名，比手抄类型定义更硬：新增键没登记元数据就会在这里红。
    // 反方向（core 加了键但没人用）由 `Record<keyof ElementOptions, OptionMeta>` 的编译期必填保证。
    const unknown = new Set<string>()
    for (const type of ALL_TYPES) {
      for (const key of Object.keys(createDefaultOptions(type))) {
        if (!OPTION_KEYS.includes(key as never)) unknown.add(key)
      }
    }
    expect([...unknown]).toEqual([])
  })

  it('长度类键的单位与区间符合口径', () => {
    expect(OPTION_META.left.kind).toBe('mm')
    expect(OPTION_META.barHeight.kind).toBe('mm')
    expect(OPTION_META.fontSize.kind).toBe('pt')
    expect(OPTION_META.borderWidth.kind).toBe('pt')
    // 条宽是「模块」而非 mm：误标成长度会让 AI 按 mm 换算，条宽直接错一个量级
    expect(OPTION_META.barWidth.kind).toBe('count')
    expect(OPTION_META.qrQuietZone.kind).toBe('count')
    expect(OPTION_META.flowColumns.kind).toBe('count')
    expect(OPTION_META.fitScale.min).toBe(100)
    expect(OPTION_META.fitScale.max).toBe(400)
    expect(OPTION_META.printerDpi.enum).toContain('203')
  })

  it('废弃键只降级为警告并被单独列出', () => {
    expect(OPTION_META.title.deprecated).toBe(true)
    expect(OPTION_META.tableMode.deprecated).toBe(true)
    expect(OPTION_META.fields.deprecated).toBe(true)
    expect([...DEPRECATED_OPTION_KEYS].sort()).toEqual(['fields', 'tableMode', 'title'])
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm run test -w @worm-vue3-print/contract -- option-meta`
Expected: FAIL，`Cannot find module '../option-meta.js'`。

- [ ] **Step 4: 实现 option-meta.ts**

`Record<keyof ElementOptions, OptionMeta>` 是**必填**映射，core 加键这里不写就编译不通过。

```ts
import type { ElementOptions } from '@worm-vue3-print/core/designer'
import type { OptionKind, OptionMeta } from './units.js'

type Meta = OptionMeta

/** 同种键成组声明，避免 72 行复制粘贴 */
function group(kind: OptionKind, keys: readonly string[], extra: Partial<Meta> = {}) {
  return Object.fromEntries(keys.map(k => [k, { kind, ...extra }])) as Record<string, Meta>
}

const mm = (...k: string[]) => group('mm', k)
const pt = (...k: string[]) => group('pt', k)
const count = (...k: string[]) => group('count', k)
const flag = (...k: string[]) => group('bool', k)
const text = (...k: string[]) => group('text', k)
const color = (...k: string[]) => group('color', k)
const obj = (...k: string[]) => group('object', k)

export const OPTION_META: Record<keyof ElementOptions, Meta> = {
  // 几何（mm）
  ...mm('left', 'top', 'width', 'height'),
  ...mm('barHeight', 'maxWidth', 'maxHeight', 'flowRowHeight', 'flowGapX'),
  ...mm('tableDefaultPadding'),
  ...mm('contentPaddingLeft', 'contentPaddingTop', 'contentPaddingRight', 'contentPaddingBottom'),
  // 字号行距（pt）
  ...pt('fontSize', 'lineHeight', 'letterSpacing', 'shrinkMinFontSize', 'borderWidth'),
  ...pt('tableDefaultFontSize'),
  // 无量纲整数
  ...count('barWidth', 'barQuietZone', 'qrQuietZone', 'flowColumns', 'flowMaxSpan'),
  ...flag('wordWrap', 'keepLineBreaks', 'fixed', 'locked', 'visible', 'hideTitle', 'draggable',
    'flowAutoSpan'),
  ...text('testData', 'fontFamily', 'fontWeight', 'borderStyle', 'textDecoration', 'textType',
    'barcodeType', 'barAutoWidth', 'src', 'objectPosition', 'axis', 'groupId', 'dataSource',
    'formatter', 'styler', 'rowStyler', 'tableDefaultFontFamily', 'tableDefaultColor'),
  ...color('color', 'backgroundColor', 'borderColor'),
  ...obj('borders', 'pagination', 'tablePagination', 'tableRows', 'tableColWidths'),
  textAlign: { kind: 'enum', enum: ['left', 'center', 'right', 'justify'] },
  verticalAlign: { kind: 'enum', enum: ['top', 'middle', 'bottom'] },
  textFit: { kind: 'enum', enum: ['clip', 'shrink', 'autoHeight'] },
  fit: { kind: 'enum', enum: ['contain', 'cover', 'fill', 'none', 'scale-down'] },
  qrCodeLevel: { kind: 'enum', enum: ['L', 'M', 'Q', 'H'] },
  printerDpi: { kind: 'enum', enum: ['203', '300', '600'] },
  rotate: { kind: 'count', min: 0, max: 360 },
  zIndex: { kind: 'count' },
  longTextIndent: { kind: 'count', min: 0 },
  fitScale: { kind: 'count', min: 100, max: 400 },
  tableMode: { kind: 'enum', enum: ['dynamic', 'static'], deprecated: true },
  title: { kind: 'text', deprecated: true },
  fields: { kind: 'object', deprecated: true },
}

export const OPTION_KEYS = Object.keys(OPTION_META) as (keyof ElementOptions)[]

export const DEPRECATED_OPTION_KEYS: readonly string[] = OPTION_KEYS.filter(
  k => OPTION_META[k].deprecated,
)
```

- [ ] **Step 5: 跑测试确认通过，并验证漂移闸门真的会红**

Run: `npm run test -w @worm-vue3-print/contract -- option-meta`
Expected: PASS（3 passed）。

闸门自检（临时改动，验完还原，不留进提交）：把 `title` 那一行删掉后 Run `npx tsc --noEmit -p packages/print-contract/tsconfig.json`，Expected: FAIL 且报 TS2741（`title` 在 `Record<keyof ElementOptions, Meta>` 中缺失）。验完把该行加回去（本任务尚未提交，用编辑器还原，禁止 `git checkout` 丢掉其他改动）。

- [ ] **Step 6: 提交**

```bash
git add packages/print-contract/src/units.ts packages/print-contract/src/option-meta.ts packages/print-contract/src/__tests__/option-meta.test.ts
git commit -m "feat(contract): 元素 option 全键元数据与编译期漂移闸门"
```

---

### Task 3: zod schema 与 `validateTemplateJson()`

**Files:**
- Create: `packages/print-contract/src/schema/element.ts`
- Create: `packages/print-contract/src/schema/template.ts`
- Create: `packages/print-contract/src/validate.ts`
- Create: `packages/print-contract/src/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: `OPTION_META` `OPTION_KEYS` `DEPRECATED_OPTION_KEYS`（Task 2）、`PaperSize`/`TemplateData`/`MultiPageTemplateData`/`PrintElementData` 类型（core）。
- Produces:
  - `const templateDataSchema`、`const multiPageTemplateDataSchema`、`const printElementDataSchema`
  - `validateTemplateJson(input: unknown): ValidationResult`，其中
    `interface ValidationResult { ok: boolean; issues: OptionIssue[]; deprecatedHits: string[]; unknownKeys: string[]; data?: TemplateData | MultiPageTemplateData }`
  - `OptionIssue.path` 形如 `elements[0].options.width`（工具输出直接可读）。

- [ ] **Step 1: 写失败测试**

`src/__tests__/validate.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { validateTemplateJson } from '../validate.js'

const textElement = {
  id: 'e1',
  type: 'text',
  options: { left: 10, top: 10, width: 60, height: 8, formatter: '{orderNo}', fontSize: 10.5 },
  printElementType: { type: 'text', title: '文本' },
}
const base = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  elements: [textElement],
}

describe('validateTemplateJson', () => {
  it('最小合法模板通过', () => {
    const r = validateTemplateJson(base)
    expect(r.ok).toBe(true)
    expect(r.issues.filter(i => i.level === 'error')).toEqual([])
  })

  it('非法纸张与负宽度给出带路径的 error', () => {
    const r = validateTemplateJson({
      ...base,
      paperSize: 'A6',
      elements: [{ ...textElement, options: { ...textElement.options, width: -5 } }],
    })
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.path === 'paperSize')).toBe(true)
    expect(r.issues.some(i => i.path === 'elements[0].options.width')).toBe(true)
  })

  it('废弃键只降级为 warning 且被点名', () => {
    const r = validateTemplateJson({
      ...base,
      elements: [{ ...textElement, options: { ...textElement.options, title: '旧标题' } }],
    })
    expect(r.ok).toBe(true)
    expect(r.deprecatedHits).toContain('elements[0].options.title')
    expect(r.issues.every(i => i.level === 'warning')).toBe(true)
  })

  it('未知 option 键不判失败但列进 unknownKeys（AI 幻觉键）', () => {
    const r = validateTemplateJson({
      ...base,
      elements: [{ ...textElement, options: { ...textElement.options, fontShadow: 3 } }],
    })
    expect(r.ok).toBe(true)
    expect(r.unknownKeys).toContain('elements[0].options.fontShadow')
  })

  it('缺 unit 的历史模板给 warning 而不是 error', () => {
    const r = validateTemplateJson({ ...base })
    expect(r.ok).toBe(true)
    expect(r.issues.some(i => i.path === 'unit' && i.level === 'warning')).toBe(true)
  })

  it('多页 wrapper 与拼版配置一并覆盖', () => {
    const r = validateTemplateJson({
      version: 1,
      pages: [{ ...base, tiling: { enabled: true, sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 }, gapX: 2, gapY: 2, columns: 0 } }],
    })
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.path.endsWith('tiling.columns'))).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -w @worm-vue3-print/contract -- validate`
Expected: FAIL，`Cannot find module '../validate.js'`。

- [ ] **Step 3: 实现 schema/element.ts**

option 的 zod shape 由 `OPTION_META` 推导，不重复声明 72 个字段——单位/区间口径因此只有一个来源。

```ts
import { z } from 'zod'
import type { ElementOptions, TableCell, TableRow } from '@worm-vue3-print/core/designer'
import { OPTION_META, OPTION_KEYS } from '../option-meta.js'
import type { OptionMeta } from '../units.js'

/** 按元数据推导单键 schema；长度类只校验「数值 + 区间」，不校验像素/毫米换算 */
function optionValueSchema(meta: OptionMeta): z.ZodTypeAny {
  switch (meta.kind) {
    case 'mm':
    case 'pt':
    case 'count': {
      let s: z.ZodNumber = z.number().finite()
      if (meta.min !== undefined) s = s.min(meta.min)
      if (meta.max !== undefined) s = s.max(meta.max)
      return s
    }
    case 'bool': return z.boolean()
    case 'color': return z.union([z.string(), z.number()])
    case 'text': return z.union([z.string(), z.number()])
    case 'enum': return z.enum((meta.enum ?? []) as [string, ...string[]])
    case 'object': return z.unknown()
  }
}

const optionalShape = Object.fromEntries(
  OPTION_KEYS.map(k => [k, optionValueSchema(OPTION_META[k]).optional()]),
)

/** 四个几何键是元素必填项，放最后展开以覆盖 optional() */
export const elementOptionsSchema = z.object({
  ...optionalShape,
  left: z.number().finite(),
  top: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
}).catchall(z.unknown())

export const tableCellSchema: z.ZodType<Partial<TableCell>> = z.object({
  id: z.string().optional(),
  formatter: z.string().optional(),
  cellType: z.enum(['text', 'barcode', 'qrcode', 'image']).optional(),
  rowspan: z.number().int().positive().optional(),
  colspan: z.number().int().positive().optional(),
  merged: z.boolean().optional(),
  mergeSameValue: z.boolean().optional(),
}).catchall(z.unknown()) as z.ZodType<Partial<TableCell>>

export const tableRowSchema: z.ZodType<Partial<TableRow>> = z.object({
  id: z.string().optional(),
  type: z.enum(['header', 'data', 'subtotal', 'summary']).optional(),
  height: z.number().finite().nonnegative(),
  repeatOnPage: z.boolean().optional(),
  cells: z.array(tableCellSchema),
}).catchall(z.unknown()) as z.ZodType<Partial<TableRow>>

export const printElementDataSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  options: elementOptionsSchema,
  printElementType: z.object({
    type: z.string(),
    title: z.string().optional(),
    editable: z.boolean().optional(),
    formatter: z.string().optional(),
    styler: z.string().optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown())

export const KNOWN_OPTION_KEYS = new Set<string>(OPTION_KEYS)
```

- [ ] **Step 4: 实现 schema/template.ts**

```ts
import { z } from 'zod'
import { elementOptionsSchema, printElementDataSchema } from './element.js'

export const paperSizeSchema = z.enum([
  'A4', 'A3', 'A5', 'Letter', 'Legal',
  'DOT_FULL', 'DOT_HALF', 'DOT_THIRD',
  'LABEL_80X60', 'LABEL_60X40', 'LABEL_40X30',
  'THERMAL_57', 'THERMAL_80', 'THERMAL_110',
  'CUSTOM', 'CONTINUOUS',
])

const mmBox = z.object({
  top: z.number().finite(), right: z.number().finite(),
  bottom: z.number().finite(), left: z.number().finite(),
})

const zone = z.object({
  height: z.number().finite().nonnegative(),
  elements: z.array(printElementDataSchema),
})

/** 拼版目标纸：与 core `Exclude<PaperSize,'CONTINUOUS'>` 同集合（连续纸不能拼版） */
export const sheetPaperSizeSchema = z.enum([
  'A4', 'A3', 'A5', 'Letter', 'Legal',
  'DOT_FULL', 'DOT_HALF', 'DOT_THIRD',
  'LABEL_80X60', 'LABEL_60X40', 'LABEL_40X30',
  'THERMAL_57', 'THERMAL_80', 'THERMAL_110',
  'CUSTOM',
])

/** 拼版：字段逐条对齐 core `print/tiling.ts:12`，enabled/sheetMargin/gapX/gapY/columns 必填 */
const tilingSchema = z.object({
  enabled: z.boolean(),
  sheetPaperSize: sheetPaperSizeSchema.optional(),
  sheetOrientation: z.enum(['portrait', 'landscape']).optional(),
  sheetCustomWidth: z.number().finite().positive().optional(),
  sheetCustomHeight: z.number().finite().positive().optional(),
  sheetMargin: mmBox,
  gapX: z.number().finite().nonnegative(),
  gapY: z.number().finite().nonnegative(),
  columns: z.number().int().positive(),
}).catchall(z.unknown())

const watermarkSchema = z.object({
  mode: z.enum(['fixed', 'binding']).optional(),
  content: z.string().optional(),
  binding: z.string().optional(),
  testData: z.string().optional(),
  rotate: z.number().finite().optional(),
  color: z.string().optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  timestamp: z.boolean().optional(),
  format: z.string().optional(),
  tileWidth: z.number().finite().min(140).optional(),
  tileHeight: z.number().finite().min(100).optional(),
}).catchall(z.unknown())

export const templateDataSchema = z.object({
  paperSize: paperSizeSchema,
  orientation: z.enum(['portrait', 'landscape']),
  outputRotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  margins: mmBox,
  header: zone.optional(),
  footer: zone.optional(),
  elements: z.array(printElementDataSchema),
  name: z.string().optional(),
  fonts: z.array(z.unknown()).optional(),
  tiling: tilingSchema.optional(),
  unit: z.enum(['pt', 'mm']).optional(),
  customWidth: z.number().finite().positive().optional(),
  customHeight: z.number().finite().positive().optional(),
  pageBackground: z.string().optional(),
  watermark: watermarkSchema.optional(),
  guides: z.array(z.object({
    type: z.enum(['vertical', 'horizontal']),
    position: z.number().finite(),
    id: z.string().optional(),
    color: z.string().optional(),
  }).catchall(z.unknown())).optional(),
  designBackground: z.object({
    src: z.string(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  }).catchall(z.unknown()).optional(),
}).catchall(z.unknown())

export const multiPageTemplateDataSchema = z.object({
  version: z.literal(1).optional(),
  pages: z.array(templateDataSchema).min(1),
}).catchall(z.unknown())
```

在 `src/schema/template.ts` 末尾加纸张双向对齐闸门（core 增删纸型而本包没跟，`tsc` 直接红）：

```ts
import type { PaperSize } from '@worm-vue3-print/core/designer'

// 方向一：本包枚举里不能有 core 不认的纸型
const _paperSchemaValues: readonly PaperSize[] = paperSizeSchema.options
// 方向二：core 的 PaperSize 不能有本包漏掉的纸型
type _PaperMissing = Exclude<PaperSize, (typeof paperSizeSchema.options)[number]>
const _paperFullCoverage: _PaperMissing extends never ? true : never = true
void _paperSchemaValues
void _paperFullCoverage
```

Run: `npx tsc --noEmit -p packages/print-contract/tsconfig.json`
Expected: 无错误。同理可给 `sheetPaperSizeSchema` 加 `Exclude<typeof _paperSchemaValues[number], 'CONTINUOUS'>` 的方向二检查，落地时一并写。

- [ ] **Step 5: 实现 validate.ts**

```ts
import type { TemplateData, MultiPageTemplateData } from '@worm-vue3-print/core/designer'
import type { OptionIssue } from './units.js'
import { DEPRECATED_OPTION_KEYS } from './option-meta.js'
import { KNOWN_OPTION_KEYS } from './schema/element.js'
import { templateDataSchema, multiPageTemplateDataSchema } from './schema/template.js'

export interface ValidationResult {
  ok: boolean
  issues: OptionIssue[]
  deprecatedHits: string[]
  unknownKeys: string[]
  data?: TemplateData | MultiPageTemplateData
}

/** zod 路径 → 可读路径：['elements',0,'options','width'] → elements[0].options.width */
function joinPath(path: readonly (string | number)[]): string {
  let out = ''
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`
    else out += out ? `.${seg}` : seg
  }
  return out
}

/** 递归扫 options 层：废弃键与未知键都只降级为 warning，不能把存量模板判死 */
function scanKeys(node: unknown, path: string, hits: string[], unknown: string[]) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => scanKeys(item, `${path}[${i}]`, hits, unknown))
    return
  }
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const child = path ? `${path}.${key}` : key
    const isOptionLevel = path === 'options' || path.endsWith('.options')
    if (isOptionLevel) {
      if (DEPRECATED_OPTION_KEYS.includes(key)) hits.push(child)
      else if (!KNOWN_OPTION_KEYS.has(key)) unknown.push(child)
    }
    scanKeys(value, child, hits, unknown)
  }
}

export function validateTemplateJson(input: unknown): ValidationResult {
  const isMultiPage = !Array.isArray(input) && !!input
    && Array.isArray((input as MultiPageTemplateData).pages)
  const schema = isMultiPage ? multiPageTemplateDataSchema : templateDataSchema
  const parsed = schema.safeParse(input)

  const issues: OptionIssue[] = []
  const deprecatedHits: string[] = []
  const unknownKeys: string[] = []

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        path: joinPath(issue.path),
        message: issue.message,
        level: 'error',
      })
    }
  }
  scanKeys(input, '', deprecatedHits, unknownKeys)
  for (const hit of deprecatedHits) {
    issues.push({ path: hit, message: '该键已废弃，读取兼容但新模板不应写入', level: 'warning' })
  }
  for (const key of unknownKeys) {
    issues.push({ path: key, message: '契约未知键：渲染端会忽略，疑似拼写错误或模型臆造', level: 'warning' })
  }

  const data = parsed.success ? (parsed.data as TemplateData | MultiPageTemplateData) : undefined
  if (data && !Array.isArray(data)) {
    const pages = 'pages' in data ? data.pages : [data]
    for (const page of pages) {
      if (!(page as { unit?: string }).unit) {
        issues.push({
          path: 'unit',
          message: '模板缺 unit，读取时按 pt 迁移（见 core designer/utils/migrate.ts）',
          level: 'warning',
        })
      }
    }
  }
  return { ok: issues.every(i => i.level !== 'error'), issues, deprecatedHits, unknownKeys, data }
}
```

`schema.safeParse` 的返回类型由 zod 推导；`templateDataSchema` 与 `multiPageTemplateDataSchema` 的推断类型不同，若 TS 报联合类型上取 `parsed.error` 不成立，给两个分支各写一次 `safeParse` 调用，不要加 `as any`。

- [ ] **Step 6: 跑测试确认通过**

Run: `npm run test -w @worm-vue3-print/contract -- validate`
Expected: 6 passed。

- [ ] **Step 7: 从 `src/index.ts` 汇总导出**

```ts
export * from './units.js'
export * from './option-meta.js'
export * from './schema/element.js'
export * from './schema/template.js'
export * from './validate.js'
```

Run: `npm run build -w @worm-vue3-print/contract`
Expected: 构建成功，`dist/index.d.ts` 导出 `validateTemplateJson`。

- [ ] **Step 8: 提交**

```bash
git add packages/print-contract/src packages/print-contract/src/__tests__/validate.test.ts
git commit -m "feat(contract): 模板 zod schema 与 validateTemplateJson 契约校验"
```

---

### Task 4: `checkExpression()` —— 复用 core 解析器与沙箱白名单

**Files:**
- Create: `packages/print-contract/src/expression.ts`
- Create: `packages/print-contract/src/__tests__/expression.test.ts`
- Modify: `packages/print-contract/src/index.ts`（追加导出）

**Interfaces:**
- Consumes: core 主入口 `parseTemplate`/`compileTemplate`（[template-parser.ts:12](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/template-parser.ts#L12)、`:84`）、`engine`（`@worm-vue3-print/core/designer` 的 `./utils/engine.js`）、`EXTENDED_FUNCTIONS`（`./utils/expression-eval.js`）。
- Produces:
  - `const EXPRESSION_FUNCTIONS: readonly string[]`（`EXTENDED_FUNCTIONS` 键名 + 聚合函数 `SUM/AVG/COUNT/MIN/MAX` + 系统变量说明）
  - `checkExpression(expr: string, knownFields?: string[]): ExpressionResult`
  - `interface ExpressionResult { ok: boolean; syntax: 'valid' | 'invalid'; functions: string[]; unknownFields: string[]; errors: string[] }`

- [ ] **Step 1: 写失败测试**

`src/__tests__/expression.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { checkExpression, EXPRESSION_FUNCTIONS } from '../expression.js'

describe('checkExpression', () => {
  it('普通字段与嵌套函数合法，并识别出用到的函数', () => {
    const r = checkExpression('金额：{MONEY(SUM(amount))}', ['amount'])
    expect(r.ok).toBe(true)
    expect(r.syntax).toBe('valid')
    expect(r.functions.sort()).toEqual(['MONEY', 'SUM'])
    expect(r.unknownFields).toEqual([])
  })

  it('未闭合花括号判语法错', () => {
    const r = checkExpression('{MONEY(amount', ['amount'])
    expect(r.ok).toBe(false)
    expect(r.syntax).toBe('invalid')
    expect(r.errors.join()).toContain('花括号未闭合')
  })

  it('空表达式判错', () => {
    const r = checkExpression('{}')
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toContain('空')
  })

  it('原型链探测被沙箱拒绝', () => {
    const r = checkExpression('{constructor.name}', [])
    expect(r.ok).toBe(false)
  })

  it('未知字段只警告，不判失败（宿主字典可能不全）', () => {
    const r = checkExpression('{notInDict}', ['amount'])
    expect(r.ok).toBe(true)
    expect(r.unknownFields).toEqual(['notInDict'])
  })

  it('函数清单来自 core 白名单，含聚合函数', () => {
    expect(EXPRESSION_FUNCTIONS).toContain('MONEY')
    expect(EXPRESSION_FUNCTIONS).toContain('IFEMPTY')
    expect(EXPRESSION_FUNCTIONS).toContain('SUM')
  })

  it('纯字面文本（无花括号）合法', () => {
    expect(checkExpression('合计').ok).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -w @worm-vue3-print/contract -- expression`
Expected: FAIL，`Cannot find module '../expression.js'`。

- [ ] **Step 3: 实现 expression.ts**

语法判定必须走 core 的解析器，不能在契约层重写一份 tokenizer——否则设计态与出纸态会出现两套合法性口径。

求值只能用 `@worm-vue3-print/core/designer` 暴露的 `engine` 单例：裸 `compileTemplate(t)(ctx)` 的 `functions` 参数默认空对象（[template-parser.ts:84](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/template-parser.ts#L84)），会把合法的 `{MONEY(x)}` 判成未知函数。`engine` 由 [designer/utils/engine.ts](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/designer/utils/engine.ts) 创建，`EXTENDED_FUNCTIONS` 在 `core/designer` 桶文件加载时注册完毕（[designer/index.ts:54](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/designer/index.ts#L54)）。

```ts
import { parseTemplate } from '@worm-vue3-print/core'
import { engine, EXTENDED_FUNCTIONS } from '@worm-vue3-print/core/designer'

/** 聚合函数由 evaluateTemplate 文本预处理，没注册进 engine（expression-eval.ts:59） */
export const AGGREGATE_FUNCTIONS = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'] as const

export const EXPRESSION_FUNCTIONS: readonly string[] = [
  ...Object.keys(EXTENDED_FUNCTIONS),
  ...AGGREGATE_FUNCTIONS,
]

/** 与 core evaluator 的 DANGEROUS_PROPS 同集合（evaluator.ts:18）；此处只做提前提示，判据仍在渲染端 */
export const PROBE_TOKENS = [
  'constructor', '__proto__', 'prototype',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
] as const

/** 求值期可用的系统变量并入上下文，避免被误报成未知字段 */
export const SYSTEM_VARIABLES = ['printDate', 'pageNo', 'pageCount', 'totalPage'] as const

export interface ExpressionResult {
  ok: boolean
  syntax: 'valid' | 'invalid'
  functions: string[]
  unknownFields: string[]
  errors: string[]
}

/** 抽出每个 {…} 表达式体；只做词法切分，不重做语法分析 */
function expressionBodies(text: string): string[] {
  const out: string[] = []
  const re = /\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[1])
  return out
}

function scanBody(body: string) {
  const functions = new Set<string>()
  const identifiers = new Set<string>()
  const keywords = new Set(['AND', 'OR', 'NOT', 'true', 'false', 'null', 'undefined'])
  const fnRe = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  const idRe = /[A-Za-z_][A-Za-z0-9_]*/g
  let m: RegExpExecArray | null
  while ((m = fnRe.exec(body))) functions.add(m[1].toUpperCase())
  // 函数名与属性访问（obj.prop 的 prop）不算字段：先抹掉函数名与 .prop 段
  const stripped = body
    .replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, '(')
    .replace(/\.\s*[A-Za-z_][A-Za-z0-9_]*/g, '')
  while ((m = idRe.exec(stripped))) {
    const name = m[1]
    if (!keywords.has(name)) identifiers.add(name)
  }
  return { functions: [...functions], identifiers: [...identifiers] }
}

export function checkExpression(expr: string, knownFields: string[] = []): ExpressionResult {
  const errors: string[] = []
  let syntax: 'valid' | 'invalid' = 'valid'
  const bodies = expressionBodies(expr)
  const functions = new Set<string>()

  for (const body of bodies) {
    // 1. 语法：交给 core 解析器（未闭合花括号 / 空表达式 / 语法错都在这里暴露）
    try {
      parseTemplate(`{${body}}`)
    } catch (e) {
      syntax = 'invalid'
      errors.push((e as Error).message)
      continue
    }
    const scan = scanBody(body)
    scan.functions.forEach(f => functions.add(f))
    // 2. 函数白名单：聚合函数不在 engine 里，只查名字合法性
    for (const fn of scan.functions) {
      if (!EXPRESSION_FUNCTIONS.includes(fn)) errors.push(`未知函数 ${fn}()`)
    }
    // 3. 原型链探测：词法级拒绝，不依赖 evaluator 是否从上下文里取到同名键
    for (const token of PROBE_TOKENS) {
      if (new RegExp(`\\b${token}\\b`).test(body)) errors.push(`表达式含 ${token}，渲染端沙箱会拒绝求值`)
    }
    // 4. 试求值：含聚合函数的表达式跳过（engine 未注册聚合函数，必然抛错）
    const hasAggregate = scan.functions.some(f =>
      (AGGREGATE_FUNCTIONS as readonly string[]).includes(f),
    )
    if (!hasAggregate) {
      const ctx: Record<string, unknown> = {}
      for (const v of SYSTEM_VARIABLES) ctx[v] = '1'
      for (const id of scan.identifiers) ctx[id] = 1
      try {
        engine.render(body, ctx)
      } catch (e) {
        errors.push((e as Error).message)
      }
    }
  }

  const dict = new Set(knownFields)
  const identifierPool = new Set<string>()
  for (const body of bodies) scanBody(body).identifiers.forEach(i => identifierPool.add(i))
  const unknownFields = dict.size
    ? [...identifierPool].filter(
        i => !dict.has(i)
          && !(EXPRESSION_FUNCTIONS as readonly string[]).includes(i)
          && !(SYSTEM_VARIABLES as readonly string[]).includes(i),
      )
    : []

  return {
    ok: syntax === 'valid' && errors.length === 0,
    syntax,
    functions: [...functions],
    unknownFields,
    errors,
  }
}
```

验收口径：
- `{constructor.name}` 由第 3 步的词法闸门判红（不依赖 evaluator 是否会从上下文取到同名键）；第 4 步的试求值负责暴露「白名单外的函数调用」「运算符类型不匹配」这类只在求值期显形的问题，两步都不能省。
- `PROBE_TOKENS` 与 core `DANGEROUS_PROPS` 是同集合的两份副本（后者未导出，运行时取不到），判据单点仍在渲染端；这个耦合点必须在 Task 10 的文档里显式登记，core 调整时人工同步。
- `knownFields` 为空时**不做**未知字段判定（返回 `[]`），避免把「宿主没传字典」误报成「表达式全错」。
- 试求值给每个标识符灌数字 `1`：`MONEY`/`CONCAT` 等对数字与字符串都能跑通，避免把类型偏好当成表达式非法。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -w @worm-vue3-print/contract -- expression`
Expected: 7 passed。若「原型链探测」一条红，打印实际错误信息并确认 core 抛的是异常而非静默返回——若是静默返回，本任务改为断言 `ok: true` 并追加 `errors` 含提示，同时在提交信息里说明沙箱行为与此断言。

- [ ] **Step 5: 导出并提交**

`src/index.ts` 追加：

```ts
export * from './expression.js'
```

```bash
git add packages/print-contract/src/expression.ts packages/print-contract/src/__tests__/expression.test.ts packages/print-contract/src/index.ts
git commit -m "feat(contract): 表达式校验复用 core 解析器与函数白名单"
```

---

### Task 5: `inspectTemplate()` —— 不依赖测量的静态版面体检

**Files:**
- Create: `packages/print-contract/src/inspect.ts`
- Create: `packages/print-contract/src/__tests__/inspect.test.ts`
- Modify: `packages/print-contract/src/index.ts`

**Interfaces:**
- Consumes: core 主入口 `getPaperDimensions` / `isContinuousPaper`（[index.ts:56-59](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/index.ts#L56)，实现在 `render/types.ts:338/414`）。
- Produces:
  - `type InspectCode = 'LEGACY_UNIT' | 'OUT_OF_CONTENT_AREA' | 'ZERO_SIZE_ELEMENT' | 'HEADER_TOO_TALL' | 'TABLE_COL_WIDTH_MISMATCH' | 'TABLE_MISSING_ROWS' | 'FLOW_MISSING_COLUMNS' | 'ELEMENT_OVERLAP' | 'CONTINUOUS_TOP_BEYOND_CANVAS'`
  - `interface InspectFinding { code: InspectCode; level: 'error' | 'warning'; path: string; message: string }`
  - `inspectTemplate(template: TemplateData, opts?: { toleranceMm?: number }): { ok: boolean; findings: InspectFinding[] }`（`ok = 无 error`）
- **口径边界（必须写进工具描述）**：本函数只看模板里写死的坐标，不做排版测量。表格行高、长文本换行、真实分页页数**不在**能力范围内——`paginate(template, new Map())` 对表格会给出空切片，严禁在这里冒充实测结果；要真实数字走 `render_preview`（Task 9）。

- [ ] **Step 1: 写失败测试**

`src/__tests__/inspect.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { TemplateData } from '@worm-vue3-print/core/designer'
import { inspectTemplate } from '../inspect.js'

const A4_CONTENT = { width: 210 - 20, height: 297 - 20 } // margins 各 10mm

function tpl(elements: TemplateData['elements'], extra: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    unit: 'mm',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements,
    ...extra,
  }
}
const el = (options: Record<string, unknown>) => ({
  id: 'e1', type: 'text' as const, options, printElementType: { type: 'text' as const },
})

describe('inspectTemplate', () => {
  it('合规模板无 finding', () => {
    const r = inspectTemplate(tpl([el({ left: 0, top: 0, width: 50, height: 8 })]))
    expect(r.ok).toBe(true)
    expect(r.findings).toEqual([])
  })

  it('越出可印区报 error 并带元素路径', () => {
    const r = inspectTemplate(tpl([el({ left: A4_CONTENT.width - 5, top: 0, width: 20, height: 8 })]))
    expect(r.ok).toBe(false)
    expect(r.findings[0].code).toBe('OUT_OF_CONTENT_AREA')
    expect(r.findings[0].path).toBe('elements[0]')
  })

  it('零宽高报 error，容差内的贴边不算越界', () => {
    const r = inspectTemplate(tpl([el({ left: 0, top: 0, width: 0, height: 8 })]))
    expect(r.findings.some(f => f.code === 'ZERO_SIZE_ELEMENT')).toBe(true)
    const edge = inspectTemplate(tpl([el({ left: 0, top: 0, width: A4_CONTENT.width, height: 8 })]))
    expect(edge.findings).toEqual([])
  })

  it('缺 unit 的历史模板先要求迁移，不做几何判定', () => {
    const legacy = { ...tpl([el({ left: 0, top: 0, width: 50, height: 8 })]), unit: undefined }
    const r = inspectTemplate(legacy as TemplateData)
    expect(r.findings.map(f => f.code)).toEqual(['LEGACY_UNIT'])
  })

  it('页眉高于内容区报 error', () => {
    const r = inspectTemplate(tpl([], { header: { height: A4_CONTENT.height + 5, elements: [] } }))
    expect(r.findings[0].code).toBe('HEADER_TOO_TALL')
  })

  it('表格列宽之和与元素宽不符报 warning', () => {
    const r = inspectTemplate(tpl([{
      id: 't1', type: 'table', printElementType: { type: 'table' },
      options: { left: 0, top: 0, width: 100, height: 40, tableColWidths: [40, 40] },
    }]))
    expect(r.findings.some(f => f.code === 'TABLE_COL_WIDTH_MISMATCH')).toBe(true)
  })

  it('表格缺 tableRows 与 flowList 缺 flowColumns 各报一条', () => {
    const r = inspectTemplate(tpl([
      { id: 't1', type: 'table', printElementType: { type: 'table' }, options: { left: 0, top: 0, width: 100, height: 40 } },
      { id: 'f1', type: 'flowList', printElementType: { type: 'flowList' }, options: { left: 0, top: 50, width: 100, height: 20 } },
    ]))
    expect(r.findings.map(f => f.code)).toEqual(['TABLE_MISSING_ROWS', 'FLOW_MISSING_COLUMNS'])
  })

  it('同区完全重叠报 warning', () => {
    const r = inspectTemplate(tpl([
      el({ left: 0, top: 0, width: 50, height: 8 }),
      { id: 'e2', type: 'rect', printElementType: { type: 'rect' }, options: { left: 5, top: 2, width: 20, height: 4 } },
    ]))
    expect(r.findings.some(f => f.code === 'ELEMENT_OVERLAP')).toBe(true)
  })

  it('连续纸按纸宽判定横向越界，不做纵向限制', () => {
    const r = inspectTemplate(tpl([el({ left: 70, top: 0, width: 20, height: 8 })], {
      paperSize: 'THERMAL_80', unit: 'mm',
    }))
    expect(r.findings.some(f => f.code === 'CONTINUOUS_TOP_BEYOND_CANVAS')).toBe(false)
    expect(r.findings.some(f => f.code === 'OUT_OF_CONTENT_AREA')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -w @worm-vue3-print/contract -- inspect`
Expected: FAIL，`Cannot find module '../inspect.js'`。

- [ ] **Step 3: 实现 inspect.ts**

```ts
import type { TemplateData, PrintElementData, ElementZone } from '@worm-vue3-print/core/designer'
import { getPaperDimensions, isContinuousPaper } from '@worm-vue3-print/core'

export type InspectCode =
  | 'LEGACY_UNIT' | 'OUT_OF_CONTENT_AREA' | 'ZERO_SIZE_ELEMENT' | 'HEADER_TOO_TALL'
  | 'TABLE_COL_WIDTH_MISMATCH' | 'TABLE_MISSING_ROWS' | 'FLOW_MISSING_COLUMNS'
  | 'ELEMENT_OVERLAP' | 'CONTINUOUS_TOP_BEYOND_CANVAS'

export interface InspectFinding {
  code: InspectCode
  level: 'error' | 'warning'
  path: string
  message: string
}

/** 线/矩形/椭圆属于装饰层，与文字重叠是常规用法，不参与重叠判定 */
const NON_OVERLAP_TYPES = new Set(['hline', 'vline', 'rect', 'oval'])

interface ZoneBox { left: number; top: number; width: number; height: number }

function rectOverlap(a: ZoneBox, b: ZoneBox, eps: number): boolean {
  return a.left < b.left + b.width - eps
    && b.left < a.left + a.width - eps
    && a.top < b.top + b.height - eps
    && b.top < a.top + a.height - eps
}

function zoneElements(tpl: TemplateData, zone: ElementZone): { list: PrintElementData[]; path: string } {
  if (zone === 'header') return { list: tpl.header?.elements ?? [], path: 'header.elements' }
  if (zone === 'footer') return { list: tpl.footer?.elements ?? [], path: 'footer.elements' }
  return { list: tpl.elements ?? [], path: 'elements' }
}

export function inspectTemplate(
  template: TemplateData,
  opts: { toleranceMm?: number } = {},
): { ok: boolean; findings: InspectFinding[] } {
  const tol = opts.toleranceMm ?? 0.2
  const findings: InspectFinding[] = []

  // 旧模板坐标是 pt（无 unit 字段），混算会整体偏 3.5 倍；先要求调用方迁移，不猜
  if (template.unit !== 'mm') {
    findings.push({
      code: 'LEGACY_UNIT', level: 'error', path: 'unit',
      message: '模板坐标不是 mm，请先经 core 的迁移（designer/utils/migrate.ts）归一后再体检',
    })
    return { ok: false, findings }
  }

  const paper = getPaperDimensions(template)
  const continuous = isContinuousPaper(template)
  const headerH = template.header?.height ?? 0
  const footerH = template.footer?.height ?? 0
  const contentHeight = paper.height - template.margins.top - template.margins.bottom - headerH - footerH

  if (headerH <= 0 && template.header?.elements?.length) {
    // 页眉有元素却零高，出纸时元素会挤进内容区
    findings.push({
      code: 'HEADER_TOO_TALL', level: 'warning', path: 'header.height',
      message: '页眉高度为 0 但存在页眉元素，实际出纸会与内容区抢高度',
    })
  }
  if (headerH + footerH > paper.height - template.margins.top - template.margins.bottom) {
    findings.push({
      code: 'HEADER_TOO_TALL', level: 'error', path: 'header.height',
      message: `页眉+页脚共 ${(headerH + footerH).toFixed(1)}mm，超过可印区`,
    })
  }

  for (const zone of ['content', 'header', 'footer'] as ElementZone[]) {
    const { list, path } = zoneElements(template, zone)

    list.forEach((element, i) => {
      const p = `${path}[${i}]`
      const o = element.options
      const isLine = element.type === 'hline' || element.type === 'vline'
      if ((o.width ?? 0) <= tol && !isLine) {
        findings.push({ code: 'ZERO_SIZE_ELEMENT', level: 'error', path: p,
          message: `宽度 ${o.width}mm 不足以落纸（线类元素除外）` })
      }
      if ((o.height ?? 0) <= tol && !isLine) {
        findings.push({ code: 'ZERO_SIZE_ELEMENT', level: 'error', path: p,
          message: `高度 ${o.height}mm 不足以落纸（线类元素除外）` })
      }
      if (o.left < -tol || o.top < -tol) {
        findings.push({ code: 'OUT_OF_CONTENT_AREA', level: 'error', path: p,
          message: `元素起点 (${o.left}, ${o.top}) 为负，落在区域外` })
      }
      // 页眉/页脚各自只有高度可用；内容区受分页后的净高约束
      const limitH = zone === 'content' ? contentHeight : (zone === 'header' ? headerH : footerH)
      if (continuous && zone === 'content') {
        if (o.left + o.width > paper.width + tol) {
          findings.push({ code: 'OUT_OF_CONTENT_AREA', level: 'error', path: p,
            message: `横向超出纸宽 ${paper.width}mm（连续纸只约束横向）` })
        }
      } else if (o.left + o.width > paper.width - template.margins.left + tol) {
        findings.push({ code: 'OUT_OF_CONTENT_AREA', level: 'error', path: p,
          message: `右边界 ${o.left + o.width}mm 超出可印区宽 ${paper.width - template.margins.left - template.margins.right}mm` })
      } else if (limitH > tol && o.top + o.height > limitH + tol) {
        findings.push({ code: zone === 'content' && !continuous ? 'OUT_OF_CONTENT_AREA' : 'CONTINUOUS_TOP_BEYOND_CANVAS',
          level: 'warning', path: p,
          message: `下边界 ${o.top + o.height}mm 超出${zone === 'content' ? '内容区' : '该区域'}净高 ${limitH.toFixed(1)}mm` })
      }

      if (element.type === 'table') {
        const rows = o.tableRows ?? []
        if (!rows.length) {
          findings.push({ code: 'TABLE_MISSING_ROWS', level: 'error', path: p,
            message: '表格没有 tableRows，出纸为空' })
        }
        const widths = o.tableColWidths ?? []
        if (widths.length) {
          const sum = widths.reduce((a, b) => a + b, 0)
          if (Math.abs(sum - (o.width ?? 0)) > tol) {
            findings.push({ code: 'TABLE_COL_WIDTH_MISMATCH', level: 'warning', path: `${p}.options.tableColWidths`,
              message: `列宽合计 ${sum.toFixed(2)}mm 与元素宽 ${o.width}mm 不符` })
          }
        }
      }
      if (element.type === 'flowList' && !(o.flowColumns ?? 0)) {
        findings.push({ code: 'FLOW_MISSING_COLUMNS', level: 'error', path: `${p}.options.flowColumns`,
          message: '流式列表必须显式给 flowColumns（列数不自动推导）' })
      }
    })

    // 重叠：同区内两两比，跳过线/形状类
    const boxes = list
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !NON_OVERLAP_TYPES.has(String(e.type)))
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a].e.options
        const B = boxes[b].e.options
        if (rectOverlap(
          { left: A.left, top: A.top, width: A.width, height: A.height },
          { left: B.left, top: B.top, width: B.width, height: B.height },
          tol,
        )) {
          findings.push({ code: 'ELEMENT_OVERLAP', level: 'warning',
            path: `${path}[${boxes[a].i}]`,
            message: `与 ${path}[${boxes[b].i}] 矩形交叠，落纸可能互相盖住` })
        }
      }
    }
  }

  return { ok: findings.every(f => f.level !== 'error'), findings }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -w @worm-vue3-print/contract -- inspect`
Expected: 9 passed。若「A4 可印区」数字与 `getPaperDimensions` 返回值不符（例如它已扣除边距），以 core 实现为准调整测试期望并在提交信息里记下实际口径——**不要**为了让测试变绿而在契约层重算纸型尺寸。

- [ ] **Step 5: 导出并提交**

`src/index.ts` 追加 `export * from './inspect.js'`

```bash
git add packages/print-contract/src/inspect.ts packages/print-contract/src/__tests__/inspect.test.ts packages/print-contract/src/index.ts
git commit -m "feat(contract): 静态版面体检 inspectTemplate"
```

---

### Task 6: `draftTemplate()` 与元素类型清单

**Files:**
- Create: `packages/print-contract/src/kinds.ts`
- Create: `packages/print-contract/src/draft.ts`
- Create: `packages/print-contract/src/__tests__/draft.test.ts`
- Modify: `packages/print-contract/src/index.ts`

**Interfaces:**
- Consumes: core/designer `createDefaultOptions` `createRuntimeElement` `generateId` `BLOCKED_ELEMENT_TYPES`（[element-factory.ts:9-75](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/designer/utils/element-factory.ts#L9)）、`validateTemplateJson`（Task 3）、`inspectTemplate`（Task 5）、`checkExpression`（Task 4）。
- Produces:
  - `const ELEMENT_KINDS: readonly ElementKindInfo[]`，`interface ElementKindInfo { type: ElementType; blocked: boolean; requiredOptionKeys: string[]; notes: string }`
  - `draftTemplate(spec: DraftSpec): DraftResult`，`DraftResult = { template: TemplateData; issues: OptionIssue[]; expressionErrors: string[] }`
  - `interface DraftSpec { paper?: Partial<Pick<TemplateData,'paperSize'|'orientation'|'margins'|'customWidth'|'customHeight'|'pageBackground'>>; elements: DraftElement[] }`，`DraftElement = { type: ElementType; options?: Partial<ElementOptions>; formatter?: string }`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { draftTemplate, ELEMENT_KINDS } from '../draft.js'
import { validateTemplateJson } from '../validate.js'

describe('draftTemplate', () => {
  it('产出可通过契约校验与体检的 A4 模板', () => {
    const r = draftTemplate({
      elements: [
        { type: 'text', options: { left: 10, top: 10, width: 60, height: 8 }, formatter: '{orderNo}' },
        { type: 'table', options: { left: 10, top: 20, width: 190, height: 80,
          tableColWidths: [90, 100],
          tableRows: [{ id: 'r1', type: 'data', height: 8,
            cells: [{ id: 'c1', formatter: '{name}' }, { id: 'c2', formatter: '{qty}' }] }] } },
      ],
    })
    expect(r.issues.filter(i => i.level === 'error')).toEqual([])
    expect(r.expressionErrors).toEqual([])
    expect(r.template.unit).toBe('mm')
    expect(r.template.elements).toHaveLength(2)
    expect(validateTemplateJson(r.template).ok).toBe(true)
  })

  it('拒绝 html 元素类型（core 的封禁清单）', () => {
    const r = draftTemplate({ elements: [{ type: 'html', options: { left: 0, top: 0, width: 50, height: 10 } }] })
    expect(r.issues.some(i => i.message.includes('html'))).toBe(true)
  })

  it('缺 left/top/width/height 时补齐为 0 并记 warning', () => {
    const r = draftTemplate({ elements: [{ type: 'text' }] })
    expect(r.template.elements[0].options.width).toBe(0)
    expect(r.issues.some(i => i.level === 'warning' && i.path.includes('width'))).toBe(true)
  })

  it('表达式非法时进 expressionErrors 而不是静默', () => {
    const r = draftTemplate({ elements: [{ type: 'text', formatter: '{MONEY(' }] })
    expect(r.expressionErrors.length).toBeGreaterThan(0)
  })

  it('元素类型清单不含被封禁类型以外的遗漏', () => {
    expect(ELEMENT_KINDS).toHaveLength(13)
    expect(ELEMENT_KINDS.find(k => k.type === 'html')?.blocked).toBe(true)
    expect(ELEMENT_KINDS.find(k => k.type === 'flowList')?.requiredOptionKeys).toContain('flowColumns')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -w @worm-vue3-print/contract -- draft`
Expected: FAIL，`Cannot find module '../draft.js'`。

- [ ] **Step 3: 实现 kinds.ts**

```ts
import type { ElementType } from '@worm-vue3-print/core/designer'
import { BLOCKED_ELEMENT_TYPES } from '@worm-vue3-print/core/designer'

export interface ElementKindInfo {
  type: ElementType
  /** core 封禁的元素类型（html 可注入任意标记，不进 AI 生成面） */
  blocked: boolean
  /** 该类型必须显式给出的 option 键，缺了会出空纸或排不进去 */
  requiredOptionKeys: string[]
  notes: string
}

const RAW: Array<Omit<ElementKindInfo, 'blocked'>> = [
  { type: 'text', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '单行/短文本；formatter 用 {字段} 或 {FUNC(...)}' },
  { type: 'longText', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '多行文本，默认 textFit=autoHeight 会撑高' },
  { type: 'table', requiredOptionKeys: ['left', 'top', 'width', 'height', 'tableRows', 'tableColWidths'], notes: '动态表格：data 行唯一，列宽合计须等于元素宽' },
  { type: 'flowList', requiredOptionKeys: ['left', 'top', 'width', 'height', 'flowColumns', 'dataSource'], notes: 'flowColumns 必填，不自动推导' },
  { type: 'image', requiredOptionKeys: ['left', 'top', 'width', 'height', 'src'], notes: 'src 为宿主可访问路径；fit 可选 contain/cover/fill/none/scale-down' },
  { type: 'barcode', requiredOptionKeys: ['left', 'top', 'width', 'height', 'formatter'], notes: '尺寸由条宽→dpi 结算，条宽优先、条高让位；printerDpi 建议 203/300/600' },
  { type: 'qrcode', requiredOptionKeys: ['left', 'top', 'width', 'height', 'formatter'], notes: 'qrCodeLevel L/M/Q/H；合规静区显式写 qrQuietZone=4' },
  { type: 'hline', requiredOptionKeys: ['left', 'top', 'width'], notes: '横线用 width 表达长度，height 不参与' },
  { type: 'vline', requiredOptionKeys: ['left', 'top', 'height'], notes: '竖线用 height 表达长度' },
  { type: 'rect', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '矩形/边框块' },
  { type: 'oval', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '椭圆' },
  { type: 'html', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '可注入任意标记，AI 生成面封禁' },
  { type: 'pageNumber', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '页码表达式延迟到最终趟求值，含 {pageNo}/{pageCount}' },
]

export const ELEMENT_KINDS: readonly ElementKindInfo[] = RAW.map(info => ({
  ...info,
  blocked: BLOCKED_ELEMENT_TYPES.includes(info.type),
}))
```

- [ ] **Step 4: 实现 draft.ts**

```ts
import type { ElementType, ElementOptions, PrintElementData, TemplateData } from '@worm-vue3-print/core/designer'
import { createRuntimeElement, BLOCKED_ELEMENT_TYPES } from '@worm-vue3-print/core/designer'
import type { OptionIssue } from './units.js'
import { ELEMENT_KINDS } from './kinds.js'
import { validateTemplateJson } from './validate.js'
import { inspectTemplate } from './inspect.js'
import { checkExpression } from './expression.js'

export interface DraftElement {
  type: ElementType
  options?: Partial<ElementOptions>
  /** 元素级绑定表达式；表格/列表请写在 tableRows[].cells[].formatter 里 */
  formatter?: string
}

export interface DraftSpec {
  paper?: Partial<Pick<TemplateData,
    'paperSize' | 'orientation' | 'margins' | 'customWidth' | 'customHeight' | 'pageBackground'>>
  elements: DraftElement[]
}

export interface DraftResult {
  template: TemplateData
  issues: OptionIssue[]
  expressionErrors: string[]
}

const GEOMETRY_KEYS = ['left', 'top', 'width', 'height'] as const

export function draftTemplate(spec: DraftSpec): DraftResult {
  const issues: OptionIssue[] = []
  const expressionErrors: string[] = []

  const elements: PrintElementData[] = (spec.elements ?? []).map((item, i) => {
    if (BLOCKED_ELEMENT_TYPES.includes(item.type)) {
      issues.push({ path: `elements[${i}].type`, level: 'error',
        message: `${item.type} 元素不开放给 AI 生成（core 封禁清单，防标记注入）` })
      return null as unknown as PrintElementData
    }
    const runtime = createRuntimeElement(item.type, item.options ?? {})
    const options = { ...runtime.options }
    // 几何缺省补 0：让体检报 ZERO_SIZE_ELEMENT，而不是在 draft 阶段静默造一个不可见元素
    for (const key of GEOMETRY_KEYS) {
      if (options[key] === undefined || options[key] === null) {
        (options as Record<string, unknown>)[key] = 0
        issues.push({ path: `elements[${i}].options.${key}`, level: 'warning',
          message: `未提供 ${key}，已补 0，请显式给值` })
      }
    }
    if (item.formatter) {
      options.formatter = item.formatter
      const checked = checkExpression(item.formatter)
      if (!checked.ok) expressionErrors.push(`elements[${i}].options.formatter: ${checked.errors.join('; ')}`)
    }
    // RuntimeElement 的 zone 是运行时字段，序列化时由设计器剥离，这里按 content 区域处理
    return { id: runtime.id, type: runtime.printElementType.type, options, printElementType: runtime.printElementType }
  }).filter(Boolean)

  const template: TemplateData = {
    paperSize: spec.paper?.paperSize ?? 'A4',
    orientation: spec.paper?.orientation ?? 'portrait',
    margins: spec.paper?.margins ?? { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements,
    unit: 'mm',
    ...(spec.paper?.customWidth !== undefined ? { customWidth: spec.paper.customWidth } : {}),
    ...(spec.paper?.customHeight !== undefined ? { customHeight: spec.paper.customHeight } : {}),
    ...(spec.paper?.pageBackground !== undefined ? { pageBackground: spec.paper.pageBackground } : {}),
  }

  const validated = validateTemplateJson(template)
  issues.push(...validated.issues)
  issues.push(...inspectTemplate(template).findings.map(f => ({
    path: f.path, level: f.level, message: `[${f.code}] ${f.message}`,
  })))
  return { template, issues, expressionErrors }
}

export { ELEMENT_KINDS }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -w @worm-vue3-print/contract -- draft`
Expected: 5 passed。若 `createRuntimeElement` 返回的 `options` 已自带 `left/top/width/height` 初值（多数类型如此），「补 0 并记 warning」那条测试改为断言 `r.template.elements[0].options.width` 等于 core 给的默认值且**没有** warning——以 [element-factory.ts:19](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/designer/utils/element-factory.ts#L19) 实际实现为准，不许反过来改 core。

- [ ] **Step 6: 导出、构建并提交**

`src/index.ts` 追加：

```ts
export * from './kinds.js'
export * from './draft.js'
```

Run: `npm run build -w @worm-vue3-print/contract && npm run test -w @worm-vue3-print/contract`
Expected: 构建通过、全绿。

```bash
git add packages/print-contract/src
git commit -m "feat(contract): 元素类型清单与 AI 模板草稿生成"
```

---

### Task 7: print-mcp 包脚手架与 stdio server

**Files:**
- Create: `packages/print-mcp/package.json`
- Create: `packages/print-mcp/tsconfig.json`
- Create: `packages/print-mcp/tsup.config.ts`
- Create: `packages/print-mcp/vitest.config.ts`
- Create: `packages/print-mcp/src/config.ts`
- Create: `packages/print-mcp/src/server.ts`
- Create: `packages/print-mcp/src/index.ts`
- Create: `packages/print-mcp/src/__tests__/server.test.ts`
- Modify: `package.json`（root `build` / `test` 串入）

**Interfaces:**
- Consumes: `@worm-vue3-print/contract`（Task 1–6 全部导出）、`@modelcontextprotocol/sdk` 1.32.2。
- Produces:
  - `createPrintMcpServer(): Server`（`server.ts`）
  - `readConfig(env: NodeJS.ProcessEnv): McpConfig`，`McpConfig = { renderBaseUrl: string | null; renderKey: string | null }`（`config.ts`）
  - 可执行名 `worm-vue3-print-mcp`（`bin`），stdio 通信。
- 硬约束：本包**不**读取任何模型密钥、**不**发起任何模型请求（裁决 11、12）。`config.ts` 只允许出现 `PRINT_RENDER_*` 三个变量名。

- [ ] **Step 1: package.json**

```json
{
  "name": "@worm-vue3-print/mcp",
  "version": "1.4.4",
  "private": true,
  "type": "module",
  "description": "本地 stdio MCP 连接器：把打印模板契约层（校验/体检/草稿/表达式）暴露给宿主已有的 AI agent。不调用模型、不持有模型密钥。",
  "license": "MIT",
  "author": "worm <liu_long_qqcom@qq.com>",
  "bin": { "worm-vue3-print-mcp": "./dist/index.js" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.32.2",
    "@worm-vue3-print/contract": "^1.4.4",
    "@worm-vue3-print/core": "^1.4.4"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

`tsconfig.json` 与 contract 同（`moduleResolution: "bundler"`、`strict`、`outDir: dist`、`rootDir: src`）。`vitest.config.ts` 同 contract。`tsup.config.ts`：

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  dts: true,
  clean: true,
  shims: true,
  // shebang 必须由 banner 落进产物首行，否则 npx 起不来
  banner: { js: '#!/usr/bin/env node' },
  external: ['@worm-vue3-print/core', '@worm-vue3-print/contract', '@modelcontextprotocol/sdk'],
})
```

- [ ] **Step 2: 写失败测试（config 白名单 + server 能力声明）**

`src/__tests__/server.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { readConfig } from '../config.js'
import { createPrintMcpServer } from '../server.js'

describe('readConfig', () => {
  it('未配置渲染服务时返回 null 而不是猜测地址', () => {
    expect(readConfig({})).toEqual({ renderBaseUrl: null, renderKey: null })
  })

  it('只接受 PRINT_RENDER_BASE_URL / RENDER_API_KEY 两个来源', () => {
    expect(readConfig({ PRINT_RENDER_BASE_URL: 'http://127.0.0.1:3001', RENDER_API_KEY: 'k' }))
      .toEqual({ renderBaseUrl: 'http://127.0.0.1:3001', renderKey: 'k' })
  })

  it('配置文件里不存在任何模型密钥相关读取', async () => {
    const source = await import('node:fs/promises').then(m => m.readFile(new URL('../config.ts', import.meta.url), 'utf8'))
    expect(source).not.toMatch(/OPENAI|ANTHROPIC|API_KEY(?!_)|sk-/i)
  })
})

describe('createPrintMcpServer', () => {
  it('声明 tools 能力且不声明任何 prompts/resources 之外的东西', async () => {
    const server = createPrintMcpServer()
    // Server 实例上不暴露 capabilities，用注册表断言代替
    const { TOOLS } = await import('../tools.js')
    expect(TOOLS.length).toBeGreaterThanOrEqual(5)
    expect(TOOLS.every(t => typeof t.name === 'string' && typeof t.handler === 'function')).toBe(true)
    expect(server).toBeDefined()
  })

  it('工具名唯一且为 snake_case', async () => {
    const { TOOLS } = await import('../tools.js')
    const names = TOOLS.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.every(n => /^[a-z][a-z0-9_]*$/.test(n))).toBe(true)
  })
})
```

Run: `npm install && npm run test -w @worm-vue3-print/mcp`
Expected: FAIL（`../config.js`、`../server.js`、`../tools.js` 均不存在）。

- [ ] **Step 3: 实现 config.ts**

```ts
export interface McpConfig {
  /** print-render 服务 base；未配置则 render_preview 工具降级为「仅提示」 */
  renderBaseUrl: string | null
  /** 渲染服务鉴权 key，与服务端 RENDER_API_KEY 同值（server.ts:29） */
  renderKey: string | null
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const base = env.PRINT_RENDER_BASE_URL?.trim()
  return {
    renderBaseUrl: base ? base.replace(/\/+$/, '') : null,
    renderKey: env.RENDER_API_KEY?.trim() || null,
  }
}
```

- [ ] **Step 4: 实现 server.ts**

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { TOOLS } from './tools.js'

export function createPrintMcpServer(): Server {
  const server = new Server(
    { name: 'worm-vue3-print', version: '1.4.4' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS.find(t => t.name === request.params.name)
    if (!tool) {
      return { content: [{ type: 'text' as const, text: `未知工具 ${request.params.name}` }], isError: true }
    }
    try {
      return await tool.handler(request.params.arguments ?? {})
    } catch (e) {
      // 工具内部异常不外泄堆栈：agent 需要的是可行动的文本
      return { content: [{ type: 'text' as const, text: `工具执行失败：${(e as Error).message}` }], isError: true }
    }
  })

  return server
}
```

- [ ] **Step 5: 实现 index.ts（stdio 入口）**

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createPrintMcpServer } from './server.js'

const server = createPrintMcpServer()
const transport = new StdioServerTransport()

server.connect(transport).catch((e) => {
  // stdio 被协议占用，诊断信息一律走 stderr
  console.error('worm-vue3-print MCP 启动失败:', e)
  process.exit(1)
})
```

- [ ] **Step 6: 建 tools.ts 空壳，让测试可跑通到「工具数不足」**

```ts
import type { ToolResult } from './tool-types.js'

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema（由 zod 4 的 z.toJSONSchema 生成） */
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
}

export const TOOLS: ToolDef[] = []
```

`src/tool-types.ts`：

```ts
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export function asText(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}
```

- [ ] **Step 7: 手工验证 server 真能被 stdio 唤起**

Run: `npm run build -w @worm-vue3-print/mcp && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node packages/print-mcp/dist/index.js`
Expected: 两行 JSON：initialize 回包带 `serverInfo.name: "worm-vue3-print"`；`tools/list` 回包 `tools: []`（Task 8 填完后再跑，应列出 6 个工具）。若报 `Cannot find module '@worm-vue3-print/contract'`，先 `npm run build -w @worm-vue3-print/contract`。

- [ ] **Step 8: 串进根脚本并提交**

根 `package.json`：`build` 在 `@worm-vue3-print/contract` 之后插入 `&& npm run build -w @worm-vue3-print/mcp`；`test` 同样插入 `&& npm run test -w @worm-vue3-print/mcp`。

Run: `npm run build && npm test`
Expected: 相对基线无新增红灯（基线已知红灯见项目记忆「门禁已知红灯」）。

```bash
git add packages/print-mcp package.json
git commit -m "feat(mcp): 新增本地 stdio MCP 连接器包骨架"
```

---

### Task 8: 六个契约工具落地

**Files:**
- Create: `packages/print-mcp/src/tools.ts`（替换 Task 7 的空壳）
- Create: `packages/print-mcp/src/__tests__/tools.test.ts`

**Interfaces:**
- Consumes: `validateTemplateJson` `checkExpression` `inspectTemplate` `draftTemplate` `ELEMENT_KINDS` `EXPRESSION_FUNCTIONS` `OPTION_META`（contract）、`asText`（`tool-types.ts`）、`readConfig`（`config.ts`，Task 9 用）。
- Produces: `TOOLS: ToolDef[]`，工具名固定为
  `print_element_kinds` / `print_validate_template` / `print_check_expression` / `print_inspect_layout` / `print_draft_template` / `print_render_preview`。

- [ ] **Step 1: 写失败测试**

`src/__tests__/tools.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { TOOLS } from '../tools.js'

const call = async (name: string, args: Record<string, unknown>) => {
  const tool = TOOLS.find(t => t.name === name)
  if (!tool) throw new Error(`工具 ${name} 未注册`)
  const r = await tool.handler(args)
  return { text: r.content[0].text, isError: !!r.isError }
}

const validTemplate = {
  paperSize: 'A4', orientation: 'portrait', unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [{ id: 'e1', type: 'text',
    options: { left: 10, top: 10, width: 60, height: 8, formatter: '{orderNo}' },
    printElementType: { type: 'text' } }],
}

describe('MCP 工具', () => {
  it('print_element_kinds 列出 13 类并标注封禁项', async () => {
    const { text } = await call('print_element_kinds', {})
    const data = JSON.parse(text)
    expect(data.kinds).toHaveLength(13)
    expect(data.kinds.find((k: { type: string }) => k.type === 'html').blocked).toBe(true)
    expect(data.functions).toContain('MONEY')
  })

  it('print_validate_template 对合法模板返回 ok', async () => {
    const { text, isError } = await call('print_validate_template', { templateJson: validTemplate })
    expect(isError).toBe(false)
    expect(JSON.parse(text).ok).toBe(true)
  })

  it('print_validate_template 对非法输入返回结构化 error 而不是抛异常', async () => {
    const { text } = await call('print_validate_template', { templateJson: { paperSize: 'A99' } })
    const data = JSON.parse(text)
    expect(data.ok).toBe(false)
    expect(data.issues[0].path).toBe('paperSize')
  })

  it('print_check_expression 区分语法错与未知字段', async () => {
    const bad = JSON.parse((await call('print_check_expression', { expression: '{MONEY(' })).text)
    expect(bad.syntax).toBe('invalid')
    const unknown = JSON.parse((await call('print_check_expression',
      { expression: '{amount}', knownFields: ['qty'] })).text)
    expect(unknown.unknownFields).toEqual(['amount'])
    expect(unknown.ok).toBe(true)
  })

  it('print_inspect_layout 对越界元素给出 finding', async () => {
    const data = JSON.parse((await call('print_inspect_layout', {
      templateJson: { ...validTemplate,
        elements: [{ ...validTemplate.elements[0], options: { ...validTemplate.elements[0].options, left: 250 } }] },
    })).text)
    expect(data.ok).toBe(false)
    expect(data.findings.some((f: { code: string }) => f.code === 'OUT_OF_CONTENT_AREA')).toBe(true)
  })

  it('print_draft_template 拒绝 html，且草稿自身可通过校验', async () => {
    const blocked = await call('print_draft_template', {
      spec: { elements: [{ type: 'html', options: { left: 0, top: 0, width: 10, height: 10 } }] },
    })
    expect(JSON.parse(blocked.text).issues.some((i: { level: string }) => i.level === 'error')).toBe(true)

    const draft = JSON.parse((await call('print_draft_template', {
      spec: { elements: [{ type: 'text', options: { left: 10, top: 10, width: 60, height: 8 }, formatter: '{a}' }] },
    })).text)
    expect(draft.expressionErrors).toEqual([])
    expect(draft.template.unit).toBe('mm')
  })

  it('本阶段工具数为 5（print_render_preview 属 Task 9）', async () => {
    expect(TOOLS.map(t => t.name).sort()).toEqual([
      'print_check_expression', 'print_draft_template', 'print_element_kinds',
      'print_inspect_layout', 'print_validate_template',
    ].sort())
  })
})
```

Run: `npm run test -w @worm-vue3-print/mcp`
Expected: FAIL（TOOLS 为空，全部「工具未注册」）。

- [ ] **Step 2: 实现 tools.ts**

```ts
import { z } from 'zod'
import {
  ELEMENT_KINDS, EXPRESSION_FUNCTIONS, checkExpression, draftTemplate,
  inspectTemplate, validateTemplateJson,
} from '@worm-vue3-print/contract'
import { readConfig } from './config.js'
import type { ToolDef, ToolResult } from './tool-types.js'
import { asText } from './tool-types.js'

const json = (v: unknown) => JSON.parse(JSON.stringify(v))

/** zod → JSON Schema（draft 2020-12）；MCP 的 inputSchema 要的是 JSON Schema 而非 zod 实例 */
function inputSchemaOf<T extends z.ZodTypeAny>(schema: T) {
  return z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>
}

const templateArg = z.object({ templateJson: z.unknown() }).required()

export const TOOLS: ToolDef[] = [
  {
    name: 'print_element_kinds',
    description: '列出 worm-vue3-print 支持的 13 种元素类型（含每种必填 option 键与打印注意事项）和表达式函数白名单。生成模板前必须先调用它。',
    inputSchema: inputSchemaOf(z.object({})),
    handler: async (): Promise<ToolResult> => asText({
      kinds: ELEMENT_KINDS,
      functions: EXPRESSION_FUNCTIONS,
      units: '元素坐标/宽高/行高为 mm；fontSize/lineHeight/borderWidth 为 pt；barWidth/qrQuietZone 为「模块」无量纲',
      expressionSyntax: '绑定用 {字段} 或 {FUNC(字段)}，不是 ${...}',
    }),
  },
  {
    name: 'print_validate_template',
    description: '校验一份打印模板 JSON 是否符合契约：返回 error（必须修）与 warning（废弃键/未知键/缺 unit）。不依赖浏览器，纯 Node。',
    inputSchema: inputSchemaOf(templateArg),
    handler: async (args) => {
      const r = validateTemplateJson((args as { templateJson: unknown }).templateJson)
      return asText({ ok: r.ok, issues: r.issues, deprecatedHits: r.deprecatedHits, unknownKeys: r.unknownKeys })
    },
  },
  {
    name: 'print_check_expression',
    description: '校验模板表达式：语法走 core 解析器，函数名走白名单，原型链探测走词法闸门。knownFields 传宿主字段字典时才会给未知字段。',
    inputSchema: inputSchemaOf(z.object({
      expression: z.string(),
      knownFields: z.array(z.string()).optional(),
    })),
    handler: async (args) => {
      const a = args as { expression: string; knownFields?: string[] }
      return asText(checkExpression(a.expression, a.knownFields ?? []))
    },
  },
  {
    name: 'print_inspect_layout',
    description: '静态版面体检：越界、零尺寸、列宽与元素宽不符、表格无行、flowList 无列数、同区元素交叠。**不做排版测量**，表格真实行高与页数需走 print_render_preview。',
    inputSchema: inputSchemaOf(z.object({
      templateJson: z.unknown(),
      toleranceMm: z.number().positive().max(5).optional(),
    })),
    handler: async (args) => {
      const a = args as { templateJson: { pages?: unknown[] } & Record<string, unknown>; toleranceMm?: number }
      const tpl = a.templateJson
      if (Array.isArray(tpl.pages)) {
        // 多页模板逐页体检，路径带页号，避免 agent 只知道「有一页有问题」
        const per = tpl.pages.map((page, i) => ({
          page: i, path: `pages[${i}]`,
          ...inspectTemplate(page as never, { toleranceMm: a.toleranceMm }),
        }))
        const findings = per.flatMap(p => p.findings.map(f => ({ ...f, path: `${p.path}.${f.path}` })))
        return asText({ ok: per.every(p => p.ok), findings })
      }
      return asText(inspectTemplate(tpl as never, { toleranceMm: a.toleranceMm }))
    },
  },
  {
    name: 'print_draft_template',
    description: '按结构化 spec 生成模板草稿（元素走 core 元素工厂，自动带设计器默认值），并当场回灌 validate + inspect + 表达式校验。html 类型被封禁。',
    inputSchema: inputSchemaOf(z.object({
      spec: z.object({
        paper: z.object({
          paperSize: z.string().optional(),
          orientation: z.enum(['portrait', 'landscape']).optional(),
          margins: z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() }).optional(),
          customWidth: z.number().positive().optional(),
          customHeight: z.number().positive().optional(),
          pageBackground: z.string().optional(),
        }).optional(),
        elements: z.array(z.object({
          type: z.string(),
          options: z.record(z.string(), z.unknown()).optional(),
          formatter: z.string().optional(),
        })),
      }),
    })),
    handler: async (args) => asText(draftTemplate((args as { spec: never }).spec)),
  },
]
```

`print_render_preview` 由 Task 9 追加进同一个 `TOOLS` 数组末尾，所以本任务结束时工具数必须是 5；Task 9 完成后为 6。**不要**在本任务里预留空壳工具。

- [ ] **Step 3: 跑测试**

Run: `npm run test -w @worm-vue3-print/mcp`
Expected: 除 `print_render_preview` 一条外全绿（`draftTemplate` 返回的 `issues` 是 `OptionIssue[]`，测试断言 `level === 'error'` 依赖 html 分支写的是 error 级）。

- [ ] **Step 4: 再跑一次 stdio 端到端**

Run: `npm run build -w @worm-vue3-print/mcp && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"print_element_kinds","arguments":{}}}' | node packages/print-mcp/dist/index.js`
Expected: `tools/list` 返回 5 个工具（Task 9 后为 6 个）；`tools/call` 回包里 `content[0].text` 含 `"html"` 且其 `blocked: true`。

- [ ] **Step 5: 提交**

```bash
git add packages/print-mcp/src
git commit -m "feat(mcp): 模板契约校验/表达式/版面体检/草稿四类 MCP 工具"
```

---

### Task 9: `print_render_preview` —— 唯一需要出机器的能力，转交渲染服务

**Files:**
- Modify: `packages/print-mcp/src/tools.ts`（数组末尾追加工具）
- Create: `packages/print-mcp/src/render-client.ts`
- Create: `packages/print-mcp/src/__tests__/render-client.test.ts`

**Interfaces:**
- Consumes: `readConfig()`（Task 7）、`services/print-render` 的 `POST /render/pdf`（[server.ts:56](file:///Users/worm/worm/worm-vue3-print/services/print-render/src/server.ts#L56)，鉴权头 `x-render-key`，服务端 key 取环境变量 `RENDER_API_KEY`，见 server.ts:29）、core 的 `RenderRequest` 类型（[render/types.ts:255](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/render/types.ts#L255)：`templateJson` / `printData` / `baseUrl` / `fontBaseUrl` / `paperOverride` / `paperHeightMm`）。
- Produces: `requestRenderPdf(cfg, body): Promise<{ ok: true; pdfPath: string } | { ok: false; message: string }>`（`render-client.ts`）。
- 设计约束：MCP **不自己实现排版**（约束 8 + 架构守卫精神）。真实分页数字只在渲染服务里产生；服务没起就把话说清楚，不返回半成品数字。

- [ ] **Step 1: 写 render-client 的失败测试**

`src/__tests__/render-client.test.ts`（用一次性 http server 顶替渲染服务，不依赖 Playwright）：

```ts
import { describe, it, expect } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requestRenderPdf } from '../render-client.js'

function stub(handler: (req: { headers: Record<string, string | undefined> }, res: import('node:http').ServerResponse) => void) {
  return new Promise<{ url: string; close: () => void }>(resolve => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve({
        url: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`,
        close: () => server.close(),
      })
    })
  })
}

describe('requestRenderPdf', () => {
  it('把 PDF 落到临时文件并回路径，鉴权头正确透传', async () => {
    let seenKey: string | undefined
    const stub_ = await stub((req, res) => {
      seenKey = req.headers['x-render-key']
      res.setHeader('content-type', 'application/pdf')
      res.end(Buffer.from('%PDF-1.4 fake'))
    })
    const dir = await mkdtemp(join(tmpdir(), 'mcp-render-'))
    const r = await requestRenderPdf(
      { renderBaseUrl: stub_.url, renderKey: 'k1' },
      { templateJson: { paperSize: 'A4' } },
      join(dir, 'preview.pdf'),
    )
    expect(r.ok).toBe(true)
    expect(seenKey).toBe('k1')
    if (r.ok) expect((await readFile(r.pdfPath)).subarray(0, 5).toString()).toBe('%PDF-')
    stub_.close()
  })

  it('401 与 504 都转成可读文案而不是抛栈', async () => {
    const stub_ = await stub((_req, res) => { res.writeHead(401); res.end('{"code":"UNAUTHORIZED"}') })
    const r = await requestRenderPdf({ renderBaseUrl: stub_.url, renderKey: 'bad' }, {}, '/tmp/x.pdf')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('鉴权失败')
    stub_.close()
  })
})
```

Run: `npm run test -w @worm-vue3-print/mcp -- render-client`
Expected: FAIL，`Cannot find module '../render-client.js'`。

- [ ] **Step 2: 实现 render-client.ts**

```ts
import { writeFile } from 'node:fs/promises'
import type { McpConfig } from './config.js'

const RENDER_TIMEOUT_MS = 35_000 // 服务端单请求 30s 超时（server.ts:31），客户端多留 5s

export type RenderOutcome = { ok: true; pdfPath: string } | { ok: false; message: string }

export async function requestRenderPdf(
  cfg: McpConfig,
  body: Record<string, unknown>,
  pdfPath: string,
): Promise<RenderOutcome> {
  if (!cfg.renderBaseUrl) {
    return { ok: false, message: '未设置 PRINT_RENDER_BASE_URL，无法取得真实分页与 PDF' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS)
  try {
    const res = await fetch(`${cfg.renderBaseUrl}/render/pdf`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-render-key': cfg.renderKey ?? '',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (res.status === 401) return { ok: false, message: '鉴权失败：客户端 RENDER_API_KEY 与服务端 RENDER_API_KEY 不一致' }
    if (res.status === 400) return { ok: false, message: `渲染服务判定请求非法：${await res.text()}` }
    if (res.status === 504) return { ok: false, message: '渲染超时（服务端 30s 上限）' }
    if (!res.ok) return { ok: false, message: `渲染服务返回 ${res.status}` }
    await writeFile(pdfPath, Buffer.from(await res.arrayBuffer()))
    return { ok: true, pdfPath }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? '渲染超时' : (e as Error).message
    return { ok: false, message: `无法访问渲染服务 ${cfg.renderBaseUrl}：${msg}`}
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 3: 追加工具到 `tools.ts` 的 `TOOLS` 末尾**

```ts
import { requestRenderPdf } from './render-client.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

{
  name: 'print_render_preview',
  description: '调用 print-render 渲染服务出真实 PDF（真分页/真实行高），返回本地 PDF 路径与页数提示。需要环境变量 PRINT_RENDER_BASE_URL（如 http://127.0.0.1:3001）与 RENDER_API_KEY；未配置时直接返回降级说明。',
  inputSchema: inputSchemaOf(z.object({
    templateJson: z.unknown(),
    printData: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))]).optional(),
    baseUrl: z.string().optional(),
    fontBaseUrl: z.string().optional(),
    paperHeightMm: z.number().positive().optional(),
  })),
  handler: async (args) => {
    const a = args as { templateJson: unknown; printData?: unknown; baseUrl?: string; fontBaseUrl?: string; paperHeightMm?: number }
    const cfg = readConfig()
    const precheck = validateTemplateJson(a.templateJson)
    if (!precheck.ok) {
      return asText({ stage: 'validate', ok: false, issues: precheck.issues })
    }
    const pdfPath = join(tmpdir(), `worm-print-preview-${Date.now()}.pdf`)
    const r = await requestRenderPdf(cfg, {
      templateJson: a.templateJson,
      ...(a.printData !== undefined ? { printData: a.printData } : {}),
      ...(a.baseUrl ? { baseUrl: a.baseUrl } : {}),
      ...(a.fontBaseUrl ? { fontBaseUrl: a.fontBaseUrl } : {}),
      ...(a.paperHeightMm ? { paperHeightMm: a.paperHeightMm } : {}),
    }, pdfPath)
    if (!r.ok) return { content: [{ type: 'text', text: r.message }], isError: true }
    return asText({ ok: true, pdfPath, hint: '用 PDF 页数与目视结果核对分页；本工具不重复实现排版' })
  },
}
```

- [ ] **Step 4: 补一条工具级降级断言并跑全量**

在 `src/__tests__/tools.test.ts` 末尾追加（`print_render_preview` 此时已注册）：

```ts
  it('print_render_preview 在未配置服务时降级为可读提示（不静默失败）', async () => {
    const { text, isError } = await call('print_render_preview', { templateJson: validTemplate })
    expect(isError).toBe(true)
    expect(text).toContain('PRINT_RENDER_BASE_URL')
    expect(TOOLS).toHaveLength(6)
  })
```

Run: `npm run test -w @worm-vue3-print/mcp`
Expected: 全绿（render-client 两条 + 工具级全部）。注意本条依赖 `vitest` 进程内没有 `PRINT_RENDER_BASE_URL`；若开发机上恰好设了该变量，用 `vi.stubEnv('PRINT_RENDER_BASE_URL', '')` 显式清空后再断言。

带服务联通验证（一次性，不入库）：
`npm run dev -w @worm-vue3-print/render`（另开终端）+ `PRINT_RENDER_BASE_URL=http://127.0.0.1:3001 RENDER_API_KEY=dev-render-key node packages/print-mcp/dist/index.js`，用 Step 4 of Task 8 的 `tools/call` 报文把 `name` 换成 `print_render_preview`。
Expected: 回包 `pdfPath` 指向的文件存在且首 5 字节是 `%PDF-`。

- [ ] **Step 5: 提交**

```bash
git add packages/print-mcp/src
git commit -m "feat(mcp): render_preview 工具转交渲染服务出真实 PDF"
```

---

### Task 10: 边界守卫、文档与待办勾销

**Files:**
- Modify: `scripts/check-print-architecture.mjs:5`（TARGETS）
- Modify: `README.md:112`
- Create: `docs/中文/AI接入.md`
- Create: `docs/英文/AI接入.md`（如英文目录另有命名惯例，以其为准）

- [ ] **Step 1: 把 MCP 包纳入架构守卫**

`scripts/check-print-architecture.mjs` 的 `TARGETS` 改为：

```js
const TARGETS = ['services/print-render/src', 'clients/print-client/src', 'packages/print-mcp/src']
```

守卫语义正好适用：MCP 是第四个「端」，同样禁止自带 `getBoundingClientRect` / 码制渲染 / 出图参数。`FORBIDDEN` 规则不动。

Run: `npm run lint:print-architecture`
Expected: `打印架构守卫通过：三端未出现重复的测量/纸高/出图/码制实现`（文案里的「三端」现在实际覆盖四处，落地时把该 `console.log` 文案改为「各端」，一并改 `TARGETS` 上方注释）。

- [ ] **Step 2: 勾销 README 待办**

`README.md:112` 由 `- [ ] 实现 MCP 连接器功能` 改为已实现描述并指向文档：

```markdown
- [x] 本地 MCP 连接器（`@worm-vue3-print/mcp`）：模板契约校验、表达式校验、静态版面体检、草稿生成与渲染预览；详见 [AI 接入](docs/中文/AI接入.md)
```

- [ ] **Step 3: 写 `docs/中文/AI接入.md`**

必须包含（逐节实写，不留空标题）：
1. **定位**：本项目只出「模板契约 + 工具」，工具循环归宿主（裁决 12）；MCP server 不调模型、不持 key（裁决 11）。
2. **接入**：`npm run build` → MCP 客户端配置示例（Claude Desktop / Cursor / Qoder 的 `command: node`、`args: [packages/print-mcp/dist/index.js]`、`env` 两项）；stdio-only，明确不支持远程连接与 OAuth。
3. **工具表**：6 个工具的名字、入参、返回、能力边界（`print_inspect_layout` 不做排版测量这一条必须写在表里）。
4. **耦合点登记**：`PROBE_TOKENS` 是 core `evaluator.ts:18 DANGEROUS_PROPS` 的第二份副本（后者未导出），core 调整时需人工同步；纸张集合与 `OPTION_META` 由编译期闸门守着。
5. **第二阶段预告**：画布内 AI 面板 + 宿主能力探测（endpoint / agent / none 三态）+ 服务端 key 代理，尚未实现，接口待定。

- [ ] **Step 4: 全量验收**

Run: `npm run build && npm test && npm run lint:print-architecture`
Expected: 三者相对基线无新增红灯；已知基线红灯（common store.spec 3 条等）保持原样，不得顺手修或忽略不报。

- [ ] **Step 5: 提交**

```bash
git add scripts/check-print-architecture.mjs README.md docs
git commit -m "docs(mcp): 本地 MCP 连接器文档、待办勾销与架构守卫扩围"
```

---

## Pending：第二阶段（本计划不含，需先拍一项）

裁决 11/12 合起来的必然后果：**画布永不拥有模型调用**。第二阶段要做的是一张宿主能力契约，按宿主已有东西分三态：

| 态 | 宿主已有 | 我们出什么 | 谁跑工具循环 |
| --- | --- | --- | --- |
| `agent` | 已有自己的 AI agent/会话 | 只出工具契约（MCP 或宿主可直接调的 JS bridge） | 宿主 |
| `endpoint` | 只有服务端模型代理（key 在服务端） | 面板 + 我们的工具循环，走注入式 transport 调宿主代理 | 我们 |
| `none` | 什么都没有 | 面板 + 参考代理实现（与 print-render 同形态 Docker 交付） | 我们 |

挂载时先探测 bridge（约定 props 回调或 postMessage 通道），存在就不自己发请求——这就是「不重复浪费」的落地。

**待你拍一项**：`endpoint`/`none` 两态的服务端 key 代理，由我们出可部署的参考实现（多一个 `services/print-ai-proxy` 包与镜像），还是只出接口规范、由宿主自己实现？前者完整度高、维护面也大一档；后者把 key 归属彻底留在宿主侧，但每个宿主都要写一遍胶水。

## 自检记录（写完后回看）

- 覆盖：契约（Task 2/3）、表达式（4）、版面（5）、草稿（6）、传输与工具（7/8）、真实排版出口（9）、边界与文档（10）。裁决 10/11/12 分别落在 Task 7 的 stdio-only 与「不读模型密钥」白名单测试、约束 3/11、以及 Pending 的三态表。
- 已知不确定项，实现时必须以实际代码为准、不许改 core 迁就测试：Task 5 Step 4 的 A4 可印区数字（`getPaperDimensions` 是否已扣边距）、Task 6 Step 5 的 `createDefaultOptions` 默认几何值、Task 3/8 的 zod 4 API 细节（`toJSONSchema` 的 `target` 取值、`.catchall()` 行为）。
- 未做：画布内面板、宿主 bridge、远程 MCP、JSON Schema 对外发布（`z.toJSONSchema` 已可用，可作为第二阶段顺手导出 `contract.json` 的入口）。
