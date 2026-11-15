# 图表插件多 kind 化与 ECharts 十类元素 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `@worm-vue3-print/echarts` 从「单个 `chart` 元素 + 图形化类型下拉」改造成「一个插件注册 10 个独立图表元素」，同时让 core 元素插件注册表支持「一个插件多 kind」，并把素材卡与图层图标统一迁移到 lucide。

**Architecture:** core 注册表从「插件描述符只含单个 `kind`」改为「插件级 `id/version` + `kinds[]`」，插件级共享 `binding`/`render`/`designer`，kind 级可覆盖；打印链路仍按元素 `type` 查插件并分派。模板侧数据契约不变：每个图表元素仍是 `chartOption` + `chartDataSource`/`chartCategoryField`/`chartValueFields`/`chartSeriesField`，10 个类型的差异由 kind 级 `bind`（雷达/仪表盘/漏斗/散点）与出图前的「形态归一」解释。echarts 包注册 10 个 kind，共用一份 SVG 渲染器、一份页面执行器与一份图形化属性面板（面板按 kind 声明的字段清单渲染）。canvas 素材卡与图层面板图标从字形字符迁到 lucide，print-common 零框架 shell 用 `gen-icons`/`gen-styles` 派生保持同构。

**Tech Stack:** TypeScript（strict）、Vue 3.5（原生控件，无 UI 库）、ECharts 6.1（SVGRenderer、按需 `echarts.use`）、lucide-vue-next、Vitest、npm workspaces。

**设计依据（已确认决策，来自 2026-11-15 质询）:**

| # | 决策 | 定稿 |
|---|---|---|
| 1 | 元素粒度 | 独立元素类型，一个插件注册 10 个 kind |
| 2 | 元素清单 | `barChart`、`barHChart`、`lineChart`、`areaChart`、`pieChart`、`doughnutChart`、`scatterChart`、`radarChart`、`funnelChart`、`gaugeChart` |
| 3 | 直方图 / 气泡图 | 不做直方图；气泡图并入 `scatterChart`（开关） |
| 4 | 旧 `chart` | 直接删除（未上线），demo 样例同步改造 |
| 5 | 多 kind 形态 | 插件级 `id/version` + `kinds: ElementPluginKind[]`；kind 可覆盖 `binding/render/designer`；单 kind 旧形态直接移除 |
| 6 | 模板清单与配置 | `plugins` 只写插件 id；strict 校验按 id 展开全部 kind；`configurePlugin(id, config)` 与 executor bundle 按 id 一份；type 冲突后注册覆盖 |
| 7 | 数据契约 | `chartOption` + 五个 `chart*` 字段；雷达（数值字段=维度、每行=系列）、仪表盘（首行首值，min/max 可配）、漏斗（类目+首数值降序）、散点（类目=x、首数值=y、气泡用第二数值）走 kind 级 bind |
| 8 | 形态归一 | 出图前按 kind 做最小归一（`series[].type`、轴方向、`areaStyle`、饼/环半径、漏斗排序、雷达 indicator），其余自定义字段保留 |
| 9 | 属性面板 | 一份共享面板由 10 个 kind 共用、按 kind 声明的字段渲染；只图形化，不暴露 JSON 编辑器；模板 JSON 契约层仍允许手写 `chartOption` |
| 10 | 配置收敛 | `configureChartPlugin` 删 `defaultChartType`/`defaultChartOption`；保留尺寸（kind 可覆盖）、配色、组件、示例类目 |
| 11 | 图标 | 统一 lucide SVG；插件 `icon` 字段承载 lucide 图标名；canvas 素材卡/图层面板/属性台页签按名渲染；内置 11 元素一并迁移；print-common 派生同步 |
| 12 | 跨类型转换 | 本轮不做 |
| 13 | 旧 API | 删 `ChartSpec`/`chartRenderer`/`renderCharts`/`chartBundle`/`loadChartExecutorBundle`/chart 专属 `legacyAliases` 映射、四份兼容基线测试与基线资产；保留通用 `legacyAliases` 机制与 `collectExecutorBundles()` |
| 14 | 交付 | 1.5.0 一次交付；demo 模板显式写 `plugins` 清单作为 strict 用法样例 |

## Global Constraints

- 全程简体中文；在 `master` 直接开发，不建工作树；文件写入 UTF-8 无 BOM，单次写入不超过 500 行。
- **工作区已有未提交改动**（素材台两列栅格：`packages/print-canvas/src/components/LeftPanel.vue`、`packages/print-common/src/shell/panels.ts`、`packages/print-core/src/designer/utils/material-label.ts` 及其测试、`TODO.md`、两处 CHANGELOG）。其中两列栅格是「10 张图表卡」排版的前提：**Task 0 先验收并提交这批栅格改动**，之后每个任务的提交只暂存本任务 hunks（`git add -p`），提交前 `git diff --cached` 审查，不得把无关 hunks、`.cache/`、`.workbuddy/` 带入。
- 图表包与插件体系均**未发布**：不写迁移工具、不保留旧 `chart` 元素、不保留单 kind 兼容形态；版本统一 `1.5.0`（Task 10 统一同步）。
- 模板数据契约不变：所有图表元素用 `chartOption` + `chartDataSource`/`chartCategoryField`/`chartValueFields`/`chartSeriesField`；属性台只提供图形化配置，不提供 JSON 编辑器；模板 JSON 仍允许手写 `chartOption`。
- 10 个元素类型固定为：`barChart`、`barHChart`、`lineChart`、`areaChart`、`pieChart`、`doughnutChart`、`scatterChart`、`radarChart`、`funnelChart`、`gaugeChart`；标签分别为柱状图、条形图、折线图、面积图、饼图、环形图、散点图、雷达图、漏斗图、仪表盘。
- 打印链路必须保持包边界：core/canvas/common 不得依赖 `echarts`；`scripts/check-print-architecture.mjs` 必须保持通过；出图端只通过插件注册表收集渲染能力。
- 测试必须**逐 workspace 独占**运行；`print-echarts` 只收集 `*.test.ts`、`print-canvas` 只收集 `*.spec.ts`；改动 core 源码后先重建 core dist 再跑依赖包测试。每个任务先写失败测试，再写最小实现；不得删除或放宽既有断言，本计划明确删除的旧 chart 兼容断言除外。
- 图标统一 lucide：静态具名 `import ... from 'lucide-vue-next'`（`gen-icons.mjs` 只识别这种写法），改 canvas 样式或图标后必须重跑 `gen-icons`/`gen-styles`，canvas 与 print-common 两侧视觉与断言同构。

## 文件结构

- `packages/print-core/src/designer/element-plugin-registry.ts`：多 kind 描述符、注册/查询/配置/别名桥的唯一实现。
- `packages/print-core/src/designer/types.ts`、`designer/index.ts`：类型扩展点与导出面（`PluginElementTypeMap`、`ElementOptions`）。
- `packages/print-core/src/designer/utils/element-factory.ts`、`utils/property-search.ts`、`utils/material-label.ts`：按 kind 取默认选项/属性搜索；图标与标签判据。
- `packages/print-core/src/render/data-binder.ts`、`render/html-generator.ts`、`render/types.ts`：按元素 type 解析插件的 bind/render 分派。
- `packages/print-core/src/print/assets.ts`、`ports.ts`、`driver.ts`、`dom-host-runtime.ts`、`pipeline.ts`：通用资产/执行器协议，删除 chart 专属端口与别名。
- `packages/print-core/src/browser/driver-iframe.ts`、`browser-pagination.ts`、`browser-runtime.ts`：页面执行器分派去 chart 特判。
- `packages/print-contract/src/schema/element.ts`、`schema/template.ts`、`validate.ts`、`kinds.ts`、`option-meta.ts`：多 kind 校验与动态 kinds。
- `packages/print-mcp/src/tools.ts`、`server.ts`：`print_element_kinds`/`print_draft_template` 跟随注册态。
- `packages/print-canvas/src/composables/useElementExtensionRegistry.ts`：多 kind → 素材卡/画布/属性 tab 映射。
- `packages/print-canvas/src/components/LeftPanel.vue`、`LayerPanel.vue`、`PropertyPanel.vue`、`components/ElementIcon.vue`（新建）、`help-content/features.ts`：图标渲染与插件元素入口。
- `packages/print-canvas/src/components/PrintHtmlPreview.vue`、`PrintDesigner.vue`：去掉 `chartRenderer` 旧 prop，仅留通用 `renderers`。
- `packages/print-echarts/src/`：`plugin.ts`（多 kind 描述符）、`kinds.ts`（新建：10 个 kind 定义与字段声明）、`defaults.ts`（新建：各类型出厂 option）、`normalize.ts`（新建：形态归一）、`bind.ts`（新建：kind 级绑定）、`renderer.ts`/`echarts.ts`、`config.ts`（配置收敛）、`designer/ChartElement.vue`、`designer/ChartPropertyGroup.vue`、`designer/index.ts`、`type-augmentation.ts`、`index.ts`、`node.ts`、`browser/executor.iife.ts`。
- `packages/print-common/scripts/gen-icons.mjs`、`src/core/icons.ts`、`src/shell/panels.ts`、`help-content/features.ts`：零框架 shell 图标与素材/图层同构。
- `demo/src/samples/`、`demo/src/App.vue`、`demo/src/browser-render.ts`：十个类型样例与 strict `plugins` 清单。
- `examples/custom-element-plugin/`、`docs/中文/指南/*.md`、`docs/en/*.md`、`skills/`、四份 CHANGELOG：多 kind 与十元素文档同步。

---

### Task 0: 前置——素材台两列栅格改动验收与提交

**Files:**
- 已修改（未提交）：`packages/print-canvas/src/components/LeftPanel.vue`、`packages/print-canvas/src/components/PropertyPanel.vue`、`packages/print-canvas/src/__tests__/ElementExtension.spec.ts`、`packages/print-canvas/src/__tests__/custom-property-tab.spec.ts`、`packages/print-canvas/src/__tests__/useElementExtensionRegistry.spec.ts`、`packages/print-common/src/shell/panels.ts`、`packages/print-common/src/shell/__tests__/flow-list.spec.ts`、`packages/print-core/src/designer/index.ts`、`TODO.md`、`docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md`
- 已新增（未提交）：`packages/print-core/src/designer/utils/material-label.ts`、`packages/print-core/src/designer/utils/material-label.test.ts`、`packages/print-canvas/src/__tests__/LeftPanelTwoColumn.spec.ts`、`packages/print-common/src/__tests__/material-grid.spec.ts`

**Interfaces:**
- Produces: `isWideMaterialLabel(label: string): boolean`（从 `@worm-vue3-print/core/designer` 导出），供 canvas `LeftPanel.vue` 与 common `panels.ts` 共用。
- Produces: 素材台两列栅格 DOM 契约（`.material-grid`、`.material-card--wide`），后续 10 张图表卡直接复用。

- [ ] **Step 1: 跑受影响的既有测试，确认这批改动自身是绿的**

```bash
cd /Users/worm/worm/worm-vue3-print
npm exec -w @worm-vue3-print/core vitest run -- src/designer/utils/material-label.test.ts
npm run build -w @worm-vue3-print/core
cd packages/print-canvas && npx vitest run src/__tests__/LeftPanelTwoColumn.spec.ts src/__tests__/ElementExtension.spec.ts src/__tests__/useElementExtensionRegistry.spec.ts src/__tests__/custom-property-tab.spec.ts
cd ../print-common && npx vitest run src/__tests__/material-grid.spec.ts src/shell/__tests__/flow-list.spec.ts
```

Expected: 全部 PASS；若 `print-common` 因 `icons.ts`/`styles` 陈旧报错，先跑 `npm run styles -w @worm-vue3-print/common`。

- [ ] **Step 2: 审查 diff，确认不含图表改造内容**

```bash
git diff -- packages/print-canvas/src/components/LeftPanel.vue packages/print-common/src/shell/panels.ts packages/print-core/src/designer/utils/material-label.ts
git status --short
```

Expected: 只有两列栅格、宽标签判据、HTML 素材入口移除与 CHANGELOG「未发布」段，无 `chart`/`echarts` 相关改动。

- [ ] **Step 3: 分两笔提交（栅格改动与文档各自独立）**

```bash
git add packages/print-core/src/designer/utils/material-label.ts packages/print-core/src/designer/utils/material-label.test.ts packages/print-core/src/designer/index.ts packages/print-canvas/src/components/LeftPanel.vue packages/print-canvas/src/__tests__/LeftPanelTwoColumn.spec.ts packages/print-canvas/src/__tests__/ElementExtension.spec.ts packages/print-canvas/src/__tests__/useElementExtensionRegistry.spec.ts packages/print-canvas/src/__tests__/custom-property-tab.spec.ts packages/print-canvas/src/components/PropertyPanel.vue packages/print-common/src/shell/panels.ts packages/print-common/src/__tests__/material-grid.spec.ts packages/print-common/src/shell/__tests__/flow-list.spec.ts
git commit -m "feat(canvas): 素材台两列栅格与宽标签判据"
git add TODO.md docs/中文/CHANGELOG.md docs/en/CHANGELOG.en.md
git commit -m "docs: 登记未发布变更并重置 TODO 方向"
```

Expected: `git status` 仅剩本计划文件（若已写入）与 `.workbuddy/`、`.agents/` 等忽略项；记录 `BASE_SHA=$(git rev-parse HEAD)` 供后续任务引用。

---

### Task 1: core 注册表多 kind 化（插件级 id/version + kinds[]）

**Files:**
- Modify: `packages/print-core/src/designer/element-plugin-registry.ts`
- Modify: `packages/print-core/src/designer/index.ts`（若新增类型需逐名导出）
- Modify: `packages/print-core/src/index.ts:133-158`（导出面同步）
- Test: `packages/print-core/src/designer/element-plugin-registry.test.ts`

**Interfaces:**
- Produces: `ElementPluginKind`（去掉 `id/version`，新增可选 `binding?`/`render?`/`designer?` 覆盖）。
- Produces: `PrintElementPlugin { id: string; version: string; kinds: readonly ElementPluginKind[]; legacyAliases?; binding?; render?; designer? }`。
- Produces: `ResolvedElementPlugin extends PrintElementPlugin { kind: ElementPluginKind }`，其中 `binding/render/designer` 已按 `kind` 覆盖合并。
- Produces: `getElementPlugin(type): ResolvedElementPlugin | undefined`（消费方沿用 `plugin.kind.*`、`plugin.binding/render/designer` 写法）。
- Produces: `getElementPluginKinds(): ReadonlyArray<{ plugin: PrintElementPlugin; kind: ElementPluginKind }>`（按注册顺序展开，供 contract/canvas/assets 遍历）。
- Produces: `getElementPluginTypes(): string[]` 改为 `getElementPluginKinds().map(({ kind }) => kind.type)`。
- Produces: `ElementPluginPropertyTab` 增加可选 `searchKeywords?: readonly string[]`（旧 canvas 注册通道是搜索关键词的唯一来源，多 kind 后由插件描述符直接提供，避免属性搜索退化）。

- [ ] **Step 1: 写多 kind 注册表的失败测试**

```ts
// packages/print-core/src/designer/element-plugin-registry.test.ts（追加/改写）
import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearElementPlugins, defineElementPlugin, getElementPlugin, getElementPluginById,
  getElementPluginKinds, getElementPluginTypes, registerElementPlugin,
} from '../element-plugin-registry.js'

function demoPlugin(): ReturnType<typeof defineElementPlugin> {
  return defineElementPlugin({
    id: '@acme/charts', version: '2',
    kinds: [
      { type: 'barChart', label: '柱状图', icon: 'ChartColumn', defaultOptions: () => ({ width: 100, height: 60 }) },
      { type: 'pieChart', label: '饼图', icon: 'ChartPie', binding: { bind: () => ({ _kindLevel: true }) } },
    ],
    binding: { bind: () => ({ _pluginLevel: true }) },
    render: { html: () => '<svg data-acme="1"></svg>' },
  })
}

beforeEach(() => clearElementPlugins())

it('一个插件注册多个 kind，按 type 解析出该 kind 的合并视图', () => {
  registerElementPlugin(demoPlugin())
  expect(getElementPlugin('barChart')?.kind.label).toBe('柱状图')
  expect(getElementPlugin('pieChart')?.kind.label).toBe('饼图')
  // kind 级 binding 覆盖插件级；未覆盖的 kind 回落插件级
  expect(getElementPlugin('pieChart')?.binding?.bind({}, {})).toEqual({ _kindLevel: true })
  expect(getElementPlugin('barChart')?.binding?.bind({}, {})).toEqual({ _pluginLevel: true })
  expect(getElementPlugin('barChart')?.render?.html?.({ type: 'barChart' })).toContain('acme')
  expect(getElementPluginTypes()).toEqual(['barChart', 'pieChart'])
  expect(getElementPluginKinds().map(({ kind }) => kind.type)).toEqual(['barChart', 'pieChart'])
})

it('同插件内 type 重复、插件缺 id/version、kinds 为空都报错', () => {
  expect(() => defineElementPlugin({ id: 'a', version: '1', kinds: [] })).toThrow(/kinds/)
  expect(() => defineElementPlugin({ id: 'a', version: '1', kinds: [{ type: 'x', label: 'X' }, { type: 'x', label: 'Y' }] })).toThrow(/重复/)
  expect(() => defineElementPlugin({ id: '', version: '1', kinds: [{ type: 'x', label: 'X' }] })).toThrow(/id/)
})

it('注销一个 kind 插件会摘掉它全部 type 索引，且不影响后来覆盖同 type 的插件', () => {
  const first = demoPlugin()
  const dispose = registerElementPlugin(first)
  const second = defineElementPlugin({ id: '@acme/charts-pro', version: '1', kinds: [{ type: 'barChart', label: '柱状图 Pro' }] })
  registerElementPlugin(second)
  expect(getElementPlugin('barChart')?.kind.label).toBe('柱状图 Pro')
  dispose() // 旧插件注销不得删掉被新插件占用的 type
  expect(getElementPlugin('barChart')?.kind.label).toBe('柱状图 Pro')
  expect(getElementPlugin('pieChart')).toBeUndefined()
})

it('同 id 重新注册时替换旧描述符，旧 type 索引被清理', () => {
  registerElementPlugin(demoPlugin())
  registerElementPlugin(defineElementPlugin({
    id: '@acme/charts', version: '3',
    kinds: [{ type: 'lineChart', label: '折线图' }],
  }))
  expect(getElementPluginById('@acme/charts')?.version).toBe('3')
  expect(getElementPlugin('barChart')).toBeUndefined()
  expect(getElementPlugin('lineChart')?.kind.label).toBe('折线图')
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/worm/worm/worm-vue3-print
npm exec -w @worm-vue3-print/core vitest run -- src/designer/element-plugin-registry.test.ts
```

Expected: FAIL —— `kinds` 不被识别、`plugin.kind` 为 undefined。

- [ ] **Step 3: 实现多 kind 注册表**

```ts
// element-plugin-registry.ts 关键改动（其余函数保持原样）
export interface ElementPluginKind {
  type: string
  label: string
  icon?: string
  fixedHeight?: boolean
  blocked?: boolean
  requiredOptionKeys?: readonly string[]
  defaultOptions?: (partial?: Partial<ElementOptions>) => Partial<ElementOptions>
  optionMeta?: Readonly<Record<string, PluginOptionMeta>>
  notes?: string
  /** kind 级覆盖：缺省回落插件级 */
  binding?: ElementPluginBinding
  render?: ElementPluginRender
  designer?: ElementPluginDesigner
}

export interface PrintElementPlugin {
  id: string
  version: string
  kinds: readonly ElementPluginKind[]
  legacyAliases?: Readonly<Record<string, string>>
  binding?: ElementPluginBinding
  render?: ElementPluginRender
  designer?: ElementPluginDesigner
}

// 属性台 tab 描述符新增搜索关键词（旧 canvas 注册通道是唯一来源，多 kind 后由插件自带）
export interface ElementPluginPropertyTab {
  id: string
  label: string
  icon?: string
  component: unknown
  hasProperties?: (element: unknown) => boolean
  searchKeywords?: readonly string[]
}

export interface ResolvedElementPlugin extends PrintElementPlugin {
  /** 按 type 命中的那个 kind */
  kind: ElementPluginKind
}

interface RegistryState {
  plugins: Map<string, PrintElementPlugin>
  typeIndex: Map<string, { plugin: PrintElementPlugin; kind: ElementPluginKind }>
  configs: Map<string, PluginConfig>
  legacyAliases: Map<string, string>
}

function assertPlugin(plugin: PrintElementPlugin): void {
  if (!plugin?.id || typeof plugin.id !== 'string') throw new Error('defineElementPlugin: id 必须是非空字符串')
  if (!plugin.version || typeof plugin.version !== 'string') throw new Error('defineElementPlugin: version 必须是非空字符串')
  if (!Array.isArray(plugin.kinds) || plugin.kinds.length === 0) throw new Error('defineElementPlugin: kinds 必须是非空数组')
  const seen = new Set<string>()
  for (const kind of plugin.kinds) {
    if (!kind?.type || typeof kind.type !== 'string') throw new Error('defineElementPlugin: kinds[].type 必须是非空字符串')
    if (seen.has(kind.type)) throw new Error(`defineElementPlugin: kinds 内 type 重复「${kind.type}」`)
    seen.add(kind.type)
  }
}

/** 把插件解析成「带命中 kind 与合并覆盖」的视图，消费方写法不变 */
function resolve(plugin: PrintElementPlugin, kind: ElementPluginKind): ResolvedElementPlugin {
  return {
    ...plugin,
    kind,
    binding: kind.binding ?? plugin.binding,
    render: kind.render ?? plugin.render,
    designer: kind.designer ?? plugin.designer,
  }
}

export function registerElementPlugin(plugin: PrintElementPlugin): () => void {
  assertPlugin(plugin)
  const s = state()
  // 同 id 重注册：先摘掉旧描述符占用的 type，避免新旧 kind 并存
  for (const [type, entry] of s.typeIndex) {
    if (entry.plugin.id === plugin.id && entry.plugin !== plugin) s.typeIndex.delete(type)
  }
  s.plugins.set(plugin.id, plugin)
  for (const kind of plugin.kinds) s.typeIndex.set(kind.type, { plugin, kind })
  for (const [from, to] of Object.entries(plugin.legacyAliases ?? {})) s.legacyAliases.set(from, to)
  return () => {
    if (s.plugins.get(plugin.id) !== plugin) return
    s.plugins.delete(plugin.id)
    for (const [type, entry] of [...s.typeIndex]) {
      if (entry.plugin === plugin) s.typeIndex.delete(type)
    }
  }
}

export function getElementPlugin(type: string): ResolvedElementPlugin | undefined {
  const entry = state().typeIndex.get(type)
  return entry ? resolve(entry.plugin, entry.kind) : undefined
}

export function getElementPluginKinds(): ReadonlyArray<{ plugin: PrintElementPlugin; kind: ElementPluginKind }> {
  return getElementPlugins().flatMap(plugin => plugin.kinds.map(kind => ({ plugin, kind })))
}

export function getElementPluginTypes(): string[] {
  return [...new Set(getElementPluginKinds().map(({ kind }) => kind.type))]
}
```

同时：`getElementPluginById`/`getElementPlugins`/`configurePlugin`/`getPluginConfig`/`legacyAliases` 三件/`clearElementPlugins`/globalThis 单例保持不变；`clearElementPlugins` 的 `typeIndex` 现在存对象，清空逻辑不变。

- [ ] **Step 4: 跑测试确认通过**

```bash
npm exec -w @worm-vue3-print/core vitest run -- src/designer/element-plugin-registry.test.ts
```

Expected: PASS（含既有的惰性配置、别名、globalThis 单例用例）。

- [ ] **Step 5: 重建 core 并对下游做一次「预期失败」扫描（确认单 kind 消费点全部暴露）**

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build -w @worm-vue3-print/core
npm exec -w @worm-vue3-print/contract vitest run -- src/__tests__/kinds-dynamic.test.ts
```

Expected: core 构建 PASS；contract 测试 FAIL（`plugin.kind` 已不存在）——这是 Task 4 的输入，先记录失败点，不在此任务修复。

- [ ] **Step 6: 提交**

```bash
git add packages/print-core/src/designer/element-plugin-registry.ts packages/print-core/src/designer/element-plugin-registry.test.ts packages/print-core/src/designer/index.ts packages/print-core/src/index.ts
git commit -m "feat(core): 元素插件注册表支持一插件多 kind"
```

---

### Task 2: core 删除旧图表端口与 chart 管线，通用通道收口

**Files:**
- Modify: `packages/print-core/src/render/types.ts`（删 `ChartSpec`/`ChartRenderer`，保留 `ElementRenderSpec`/`ElementRenderer`/`ElementRenderers`）
- Delete: `packages/print-core/src/render/chart-spec.ts`、`packages/print-core/src/print/charts.ts`
- Modify: `packages/print-core/src/print/ports.ts`（删 `renderCharts` 与 `ChartSpec` import）
- Modify: `packages/print-core/src/print/driver.ts`（删 `'renderCharts'` 目标与 `renderCharts: 'none'`）
- Modify: `packages/print-core/src/print/dom-host-runtime.ts`（删第三参 `chartBundle`、`ensureChartExecutor`、`renderCharts` 会话方法、兼容桥）
- Modify: `packages/print-core/src/print/pipeline.ts`（删 `chartRenderer`/`chartRenderers`/`chartBaseMap`/`extraCharts` 全链路）
- Modify: `packages/print-core/src/print/types.ts:82-85`（`PrintJob` 删 `chartRenderer?`）
- Modify: `packages/print-core/src/print/batch-compose.ts`、`tile-compose.ts`、`multi-template.ts`（删 `chartRenderer(s)` 字段与透传）
- Modify: `packages/print-core/src/render/html-generator.ts`（删 `RenderCtx.chartRenderer`/`GenerateOptions.chartRenderer`/`chartRenderer` 赋值）
- Modify: `packages/print-core/src/browser/browser-pagination.ts`（删 `chartRenderer` 字段与透传）
- Modify: `packages/print-core/src/print/assets.ts`（类型清单与 executor bundle 收集改为遍历 `getElementPluginKinds()`）
- Modify: `packages/print-core/src/print/index.ts`、`packages/print-core/src/index.ts`（删 `charts`/`chartSpecKey`/`ChartSpec`/`ChartRenderer` 导出）
- Modify: `packages/print-core/src/browser/dom-executor.ts`（若导出了 `renderCharts` 则删除；`EXECUTOR_TARGETS` 在 driver.ts）

**Interfaces:**
- Produces: `createDomHostRuntime(factory, coreBundle?, bundles: readonly ExecutorBundle[] = [])`（原第三参 `chartBundle` 删除，原第四参上移）。
- Produces: `PrintSession.renderAssets(specs: ElementRenderSpec[]): Promise<Map<string, string>>` 成为扩展元素出图唯一通道。
- Produces: `PrintJob.renderers?: ElementRenderers` 成为宿主覆盖扩展元素渲染的唯一入口。

- [ ] **Step 1: 先删类型与端口，让 TypeScript 暴露全部残留**

```bash
cd /Users/worm/worm/worm-vue3-print
rm packages/print-core/src/render/chart-spec.ts packages/print-core/src/print/charts.ts
npm exec -w @worm-vue3-print/core -- tsc -p tsconfig.json --noEmit 2>&1 | head -40
```

Expected: 编译错误清单即本任务的改动列表（`ChartSpec`/`ChartRenderer`/`renderCharts`/`chartRenderer`/`chartMap`/`chartSpecKey` 等），逐条按下面 3 步消除。

- [ ] **Step 2: 改 dom-host-runtime 与 ports/driver**

```ts
// dom-host-runtime.ts
export function createDomHostRuntime(
  factory: DriverFactory,
  bundle?: ExecutorBundle,
  bundles: readonly ExecutorBundle[] = [],
): PrintRuntime {
  // 删除 chartInjected / ensureChartExecutor；renderAssets 内不再调用 ensureChartExecutor，
  // 也不再判断 bundles.length === 0：
  //   await ensureExecutor()
  //   await ensurePluginBundles()
  //   const method = resolveExecutorMethod('renderAssets') as ExecutorMethod
}
// ports.ts：PrintSession 只保留 renderCodes / renderAssets? / measure / probeContentBottom / toPdf
// driver.ts：ExecutorTargets 删 renderCharts，保留 renderAssets: 'none'
```

```ts
// 三端调用点同步（后续 Task 11 还要清理装配行，这里只保证编译）
// services/print-render/src/pdf-render.ts:
//   createDomHostRuntime(factory, loadExecutorBundle(), undefined, collectExecutorBundles())
//   → createDomHostRuntime(factory, loadExecutorBundle(), collectExecutorBundles())
// clients/print-client/src/main/print-engine.ts:
//   同样把第三参 undefined 去掉，第四参 collectExecutorBundles() 前移为第三参
```

- [ ] **Step 3: 改 pipeline（删除 chart 两趟通道）**

```ts
// pipeline.ts 只保留 code + asset 两条收集通道：
// - buildHtmlWithAssets 入参与出参删除 chartBaseMap/chartMap/chartRenderer
// - 单趟早退条件改为：if (job.codeRenderer && (assetTypes.length === 0 || hostRenderers))
// - 删除 chartCollector / chartRendererInput / extraCharts / renderedCharts / mergeChartMaps / createMapChartRenderer
// - 删除 MultiPageCopyInput.chartRenderers 与 prepareMultiCopy 中的 chartRenderers 数组
// 最终返回：
return { html, codeRenderer, renderers, codeMap, assetMap }
```

```ts
// assets.ts 多 kind 遍历（本任务唯一需要新写逻辑的地方）
function renderablePluginTypes(): string[] {
  return getElementPluginKinds()
    .filter(({ plugin, kind }) => {
      const render = kind.render ?? plugin.render
      return !!(render?.createRenderer || render?.html)
    })
    .map(({ kind }) => kind.type)
}

function assetPluginTypes(): string[] {
  return getElementPluginKinds()
    .filter(({ plugin, kind }) => {
      const render = kind.render ?? plugin.render
      return !!(render?.createRenderer || render?.executorBundle)
    })
    .map(({ kind }) => kind.type)
}

export function collectExecutorBundles(): ExecutorBundle[] {
  const seen = new Set<string>()
  const out: ExecutorBundle[] = []
  for (const { plugin, kind } of getElementPluginKinds()) {
    const render = kind.render ?? plugin.render
    const extra = render?.executorBundle?.()
    if (!extra) continue
    if (seen.has(extra.version)) continue
    seen.add(extra.version)
    out.push({ source: extra.code, version: extra.version })
  }
  return out
}
```

- [ ] **Step 4: 清理导出与内联商品代码**

```ts
// packages/print-core/src/index.ts：删除 ChartRenderer/ChartSpec 导出与 chartSpecKey 行
// packages/print-core/src/print/index.ts：删除 charts.ts 的导出块
// html-generator.ts：RenderCtx / GenerateOptions 删 chartRenderer，:122 赋值删除，
//   default 分支只保留 ctx.renderers[type] 与 plugin.render.html（来自 resolve 视图）
// browser-pagination.ts：BrowserRenderOptions 删 chartRenderer 字段与生成选项透传
```

- [ ] **Step 5: 编译 + 关键测试（预期部分测试红，Task 3 修）**

```bash
npm exec -w @worm-vue3-print/core -- tsc -p tsconfig.json --noEmit
npm exec -w @worm-vue3-print/core vitest run -- src/print/__tests__/pipeline.spec.ts src/print/__tests__/dom-host-runtime.spec.ts
```

Expected: `tsc` 零错误；两个测试 PASS（它们不含 chart 引用）。其余 chart 相关测试失败，进入 Task 3。

- [ ] **Step 6: 提交**

```bash
git add -A packages/print-core/src
git commit -m "refactor(core): 删除图表专属端口与管线，统一走通用扩展元素通道"
```

---

### Task 3: core 测试夹具与基线改造

**Files:**
- Create: `packages/print-core/src/print/__tests__/generic-plugin-stub.ts`（替代 `chart-plugin-stub.ts`，删除旧文件）
- Modify: `packages/print-core/src/print/__tests__/fake-driver.ts`（`chartMap`→`assetMap`，`renderCharts`→`renderAssets`）
- Delete: `packages/print-core/src/print/__tests__/chart-pipeline.spec.ts`
- Rewrite: `packages/print-core/src/print/__tests__/three-end-baseline.spec.ts`（改为通用插件三端路由，不再读历史 chart 模板）
- Modify: `packages/print-core/src/print/__tests__/generic-assets.spec.ts`
- Modify: `packages/print-core/src/browser/__tests__/dom-executor.spec.ts:226-236`
- 同步调用点：`grep -rn "chart-plugin-stub\|registerChartPluginStub\|chartMap\|renderCharts" packages/print-core/src`

**Interfaces:**
- Produces: `registerGenericPluginStub(): () => void`，注册两个 kind（`testBox` 走进程内 `createRenderer`、`testSvg` 只登记 `executorBundle` 强制两趟收集），两者共享插件级 `render`，`testSvg` 用 kind 级 `binding` 覆盖。
- Produces: `FakeDriverOptions.assetMap?: Record<string, string>`。

- [ ] **Step 1: 写通用多 kind 插件夹具**

```ts
// packages/print-core/src/print/__tests__/generic-plugin-stub.ts
import { defineElementPlugin, registerElementPlugin } from '../../designer/element-plugin-registry.js'

export const GENERIC_STUB_ID = 'test.generic-stub'

export function registerGenericPluginStub(): () => void {
  return registerElementPlugin(defineElementPlugin({
    id: GENERIC_STUB_ID,
    version: '2',
    kinds: [
      { type: 'testBox', label: '测试盒', optionMeta: { tile: { kind: 'text' } } },
      {
        type: 'testSvg',
        label: '测试图',
        binding: { bind: options => ({ _svgOption: options.chartOption ?? {} }) },
      },
    ],
    binding: { bind: () => ({ _shared: true }) },
    render: {
      html: spec => `<svg data-generic="${spec.type}" viewBox="0 0 100 60"></svg>`,
      createRenderer: () => ({ render: spec => `<svg data-generic="${spec.type}" viewBox="0 0 100 60"></svg>` }),
      executorBundle: () => ({ name: GENERIC_STUB_ID, version: 'generic-stub-executor', code: '/* stub */' }),
    },
  }))
}
```

- [ ] **Step 2: 改 fake-driver**

```ts
// fake-driver.ts：FakeDriverOptions.chartMap → assetMap；evaluate 分支：
if (method === 'renderAssets') {
  const specs = (args?.[0] ?? []) as Array<{ key: string }>
  const map: Record<string, string> = {}
  for (const spec of specs) map[spec.key] = options.assetMap?.[spec.key] ?? '<svg data-asset="fake" viewBox="0 0 100 60"></svg>'
  return map as T
}
// 删除 renderCharts 分支与 chartMap 字段
```

- [ ] **Step 3: 重写三端基线与通用资产测试**

```ts
// three-end-baseline.spec.ts 顶部的关键改造：
// - 删除 CHART_BUNDLE / loadChartExecutorBundle / 历史 baseline JSON 读取
// - registerGenericPluginStub() 后按内联模板构造含 testSvg 元素的 TemplateData
// - 断言从 evaluate:renderCharts 改为 evaluate:renderAssets，数量与注入版本不变
const BUNDLE = { source: '/* generic stub */', version: 'generic-stub-executor' }
// generic-assets.spec.ts 同步：stubChartRenderer → stubAssetRenderer，
// _chartOption → _svgOption，chartBundle → bundles，两趟用例断言 createRenderer 未被调用、executorBundle 被注入 1 次
```

- [ ] **Step 4: 改浏览器执行器目标断言**

```ts
// browser/__tests__/dom-executor.spec.ts:230-235
const optionalMethods = ['renderAssets']
const methods = [...Object.keys(domExecutor).filter(k => k !== 'version'), ...optionalMethods].sort()
expect(Object.keys(EXECUTOR_TARGETS).sort()).toEqual(methods)
expect(EXECUTOR_TARGETS.renderAssets).toBe('none')
```

- [ ] **Step 5: 跑 core 全量测试**

```bash
cd /Users/worm/worm/worm-vue3-print
npm exec -w @worm-vue3-print/core vitest run 2>&1 | tail -20
```

Expected: PASS（core 当前 95 文件左右；若出现 `chart-pipeline.spec.ts` 残留引用，确认已删除并从 import 图清理）。

- [ ] **Step 6: 提交**

```bash
git add -A packages/print-core/src
git commit -m "test(core): 用通用多 kind 插件夹具替换图表基线"
```

---

### Task 4: print-contract 多 kind 校验与动态 kinds

**Files:**
- Modify: `packages/print-contract/src/kinds.ts:47-63`
- Modify: `packages/print-contract/src/validate.ts:67-81,207-226`
- Test: `packages/print-contract/src/__tests__/kinds-dynamic.test.ts`
- Test: `packages/print-contract/src/__tests__/plugin-validation.test.ts`

**Interfaces:**
- Consumes: `PrintElementPlugin { id, version, kinds }`、`getElementPluginKinds()`（Task 1）。
- Produces: `getElementKinds()` 每个插件产出 `kinds.length` 条，`pluginId` 为插件级 id；同 type 冲突时**后注册者覆盖**（与注册表分派一致），内置类型不可被插件覆盖。
- Produces: strict 模式放行集合 = 内置 ∪ **已注册插件**全部 kind（沿用现状语义，本轮不新增「已注册未声明」错误）；`plugins` 清单只做存在性与版本校验。

- [ ] **Step 1: 改写测试夹具并补多 kind 用例**

```ts
// kinds-dynamic.test.ts
const sealPlugin: PrintElementPlugin = {
  id: '@acme/seal',
  version: '0.4.0',
  kinds: [{
    type: 'seal', label: '电子印章', blocked: true,
    requiredOptionKeys: ['left', 'top', 'width', 'height', 'sealId'],
    notes: '印章图片来自宿主服务',
  }],
}
const chartsPlugin: PrintElementPlugin = {
  id: '@acme/charts', version: '2',
  kinds: [{ type: 'barChart', label: '柱状图' }, { type: 'pieChart', label: '饼图' }],
  render: { html: () => '<svg/>' },
}

it('一个插件注册多个 kind 时，kinds 与类型清单按 kind 数量展开', () => {
  registerElementPlugin(chartsPlugin)
  const kinds = getElementKinds()
  expect(kinds).toHaveLength(ELEMENT_KINDS.length + 2)
  expect(kinds.filter(k => k.pluginId === '@acme/charts').map(k => k.type)).toEqual(['barChart', 'pieChart'])
  expect(getElementKindTypes()).toEqual(expect.arrayContaining(['barChart', 'pieChart']))
})

it('同 type 的插件后注册者覆盖，内置类型不被覆盖', () => {
  registerElementPlugin(chartsPlugin)
  registerElementPlugin({ id: '@acme/charts-pro', version: '1', kinds: [{ type: 'barChart', label: '柱状图 Pro' }] })
  const bar = getElementKinds().find(k => k.type === 'barChart')
  expect(bar?.pluginId).toBe('@acme/charts-pro')
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/worm/worm/worm-vue3-print
npm exec -w @worm-vue3-print/core vitest run -- src/designer/element-plugin-registry.test.ts
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build -w @worm-vue3-print/core
npm exec -w @worm-vue3-print/contract vitest run -- src/__tests__/kinds-dynamic.test.ts
```

Expected: FAIL —— `plugin.kind` 不存在、多 kind 未展开。

- [ ] **Step 3: 实现 kinds 展开与校验放行**

```ts
// kinds.ts
export function getElementKinds(): ElementKindInfo[] {
  // 内置优先，插件不得覆盖内置语义；插件之间同 type 后注册者覆盖（与注册表分派一致）
  const builtinTypes = new Set(ELEMENT_KINDS.map(k => k.type))
  const pluginKinds = new Map<string, ElementKindInfo>()
  for (const plugin of getElementPlugins()) {
    for (const kind of plugin.kinds) {
      if (!kind.type || builtinTypes.has(kind.type)) continue
      pluginKinds.set(kind.type, {
        type: kind.type,
        blocked: kind.blocked ?? blocked(kind.type),
        requiredOptionKeys: [...(kind.requiredOptionKeys ?? ['left', 'top', 'width', 'height'])],
        notes: kind.notes ?? `${kind.label}（插件 ${plugin.id}@${plugin.version} 提供的自定义元素；专属属性见插件 optionMeta）`,
        pluginId: plugin.id,
      })
    }
  }
  return [...ELEMENT_KINDS, ...pluginKinds.values()]
}
```

```ts
// validate.ts（import 增加 getElementPluginKinds）
function allowedElementTypes(): string[] {
  return [...new Set<string>([
    ...(elementTypeSchema.options as readonly string[]),
    ...getElementPluginKinds().map(({ kind }) => kind.type),
  ])]
}

function pluginOptionKeys(): Set<string> {
  const keys = new Set<string>()
  for (const { kind } of getElementPluginKinds()) {
    for (const key of Object.keys(kind.optionMeta ?? {})) keys.add(key)
  }
  return keys
}

// scanPluginDeclarations：版本比对改为插件级
if (decl.version && plugin.version !== decl.version) {
  issues.push({ path: 'plugins', level: 'error', message: `PLUGIN_VERSION_MISMATCH：插件「${decl.id}」模板声明 ${decl.version}，当前进程注册的是 ${plugin.version}；请升级宿主依赖或重新导出模板` })
}
```

- [ ] **Step 4: 改写 plugin-validation 夹具并删除旧 chart 基线用例**

```ts
// plugin-validation.test.ts：signaturePlugin 改为插件级 id/version + 单 kind
const signaturePlugin: PrintElementPlugin = {
  id: '@acme/signature',
  version: '1.2.0',
  kinds: [{
    type: 'signature', label: '手写签名',
    requiredOptionKeys: ['left', 'top', 'width', 'height', 'signerName'],
    optionMeta: { signerName: { kind: 'text', label: '签名人' }, strokeColor: { kind: 'color', default: '#000' } },
  }],
}
// 删除「两份真实历史 chart 模板的校验结果与 P0 基线完全一致」整条用例与其 baseline 读取；
// 新增：strict 模式声明一个 10-kind 插件后，其中任意 kind 元素都通过校验
it('strict 模式按插件 id 展开该插件的全部 kind', () => {
  registerElementPlugin({
    id: '@acme/charts', version: '2',
    kinds: [{ type: 'barChart', label: '柱状图' }, { type: 'pieChart', label: '饼图' }],
  })
  const tpl = template([element('pieChart')], { plugins: [{ id: '@acme/charts', version: '2' }] })
  expect(validateTemplateJson(tpl).ok).toBe(true)
})
```

- [ ] **Step 5: 跑 contract 全量测试**

```bash
npm exec -w @worm-vue3-print/contract vitest run
```

Expected: PASS；若 `plugin-validation.test.ts` 仍有 baseline 文件引用，确认整条用例已删除（文件本体在 Task 11 删除）。

- [ ] **Step 6: 提交**

```bash
git add packages/print-contract/src
git commit -m "feat(contract): 元素种类与校验按插件多 kind 展开"
```

---

### Task 5: print-mcp 跟随多 kind（源码零改动，测试改写）

**Files:**
- Test: `packages/print-mcp/src/__tests__/dynamic-kinds.test.ts`
- 只读确认：`packages/print-mcp/src/tools.ts:38-39,61-62,78-97`、`server.ts:27-36`

**Interfaces:**
- Consumes: `getElementKinds()` / `getElementKindTypes()`（Task 4）。
- Produces: `print_element_kinds` 与 `print_draft_template` 的 enum 自动包含 10 个图表 kind，无需改 MCP 源码。

- [ ] **Step 1: 改写测试夹具与数量断言**

```ts
const sealPlugin: PrintElementPlugin = {
  id: '@acme/seal', version: '0.4.0',
  kinds: [{ type: 'seal', label: '电子印章', blocked: true, requiredOptionKeys: ['left', 'top', 'width', 'height', 'sealId'], notes: '印章图片来自宿主服务' }],
}
const chartsPlugin: PrintElementPlugin = {
  id: '@worm-vue3-print/echarts', version: '2',
  kinds: [
    { type: 'barChart', label: '柱状图', requiredOptionKeys: ['left', 'top', 'width', 'height', 'chartOption'] },
    { type: 'pieChart', label: '饼图', requiredOptionKeys: ['left', 'top', 'width', 'height', 'chartOption'] },
  ],
  render: { html: () => '<svg/>' },
}

it('多 kind 插件注册后 kinds 与 draft enum 同时按 kind 数量增长', () => {
  const before = draftTypeEnum(draftTool.getInputSchema!())
  registerElementPlugin(chartsPlugin)
  const after = draftTypeEnum(draftTool.getInputSchema!())
  expect(after).toHaveLength(before.length + chartsPlugin.kinds.length)
  expect(after).toEqual(expect.arrayContaining(['barChart', 'pieChart']))
  expect(after).toEqual(getElementKinds().map(k => k.type))
})
```

- [ ] **Step 2: 跑 MCP 测试**

```bash
cd /Users/worm/worm/worm-vue3-print
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build -w @worm-vue3-print/contract
npm exec -w @worm-vue3-print/mcp vitest run
```

Expected: PASS（`tools.ts`/`server.ts` 无需改动；若 draft enum 未跟随，检查它是否绕过了 `getElementKindTypes()`）。

- [ ] **Step 3: 提交**

```bash
git add packages/print-mcp/src
git commit -m "test(mcp): 动态 kinds 与 draft 枚举跟随多 kind 插件"
```

---

### Task 6: print-canvas 多 kind 映射与 lucide 图标体系

**Files:**
- Create: `packages/print-canvas/src/components/ElementIcon.vue`
- Modify: `packages/print-canvas/src/composables/useElementExtensionRegistry.ts`
- Modify: `packages/print-canvas/src/components/LeftPanel.vue`
- Modify: `packages/print-canvas/src/components/LayerPanel.vue`
- Modify: `packages/print-canvas/src/components/PropertyPanel.vue`
- Test: `packages/print-canvas/src/__tests__/ElementExtension.spec.ts`、`useElementExtensionRegistry.spec.ts`、`custom-property-tab.spec.ts`、`LayerPanelIcon.spec.ts`、`PropertyPanel-collapsed.spec.ts`

**Interfaces:**
- Produces: `ElementIcon.vue` props `{ name: string; size?: number }`，静态具名 import 全部元素/页签图标（`gen-icons.mjs` 只能识别静态具名 import）；未知名字回落为文本。
- Produces: `ElementExtension.icon` 语义改为 **lucide 图标名**（缺省 `Shapes`）；`label` 以 `kind.label` 为准，`materialCard` 只承载 `group`（`label/icon` 仅作单 kind 插件兜底）。
- Produces: 所有元素图标节点带 `data-icon="<lucide 名>"`，供测试断言而不依赖 SVG path。

- [ ] **Step 1: 新建 ElementIcon 组件（图标名 → lucide 组件）**

```vue
<!-- packages/print-canvas/src/components/ElementIcon.vue -->
<template>
  <component :is="resolved" v-if="resolved" :size="size" :data-icon="name" />
  <span v-else class="element-icon-fallback" :data-icon="name">{{ name }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Type, Text, Table, Table2, List, ListTree, Image, Barcode, QrCode, Minus, SeparatorVertical,
  Square, Circle, Code, Shapes, Layers, ChevronsLeft, ChevronsRight, FileText,
  ChartColumn, ChartBar, ChartLine, ChartArea, ChartPie, Donut, ChartScatter, Radar, Funnel, Gauge,
} from 'lucide-vue-next'

const ICONS = {
  Type, Text, Table, Table2, List, ListTree, Image, Barcode, QrCode, Minus, SeparatorVertical,
  Square, Circle, Code, Shapes, Layers, ChevronsLeft, ChevronsRight, FileText,
  ChartColumn, ChartBar, ChartLine, ChartArea, ChartPie, Donut, ChartScatter, Radar, Funnel, Gauge,
} as const

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 14 })
const resolved = computed(() => ICONS[props.name as keyof typeof ICONS])
</script>
```

- [ ] **Step 2: 改扩展注册表映射（多 kind → 多素材卡）**

```ts
// useElementExtensionRegistry.ts
import { getElementPluginKinds, getElementPlugin, getElementPlugins } from '@worm-vue3-print/core/designer'

function coreExtensions(): ElementExtension[] {
  const out: ElementExtension[] = []
  for (const { plugin, kind } of getElementPluginKinds()) {
    const designer = kind.designer ?? plugin.designer
    if (!designer?.canvasComponent) continue
    const card = designer.materialCard as { label?: string; icon?: string; group?: string } | undefined
    const tab = designer.propertyTab
    out.push({
      type: kind.type,
      label: kind.label,
      icon: kind.icon ?? card?.icon ?? 'Shapes',
      group: card?.group,
      canvasComponent: designer.canvasComponent as Component,
      propertyComponent: tab?.component as Component | undefined,
      propertyTab: tab
        ? {
            label: tab.label,
            icon: tab.icon ?? kind.icon ?? 'Shapes',
            component: tab.component as Component,
            hasProperties: tab.hasProperties as ((element: RuntimeElement) => boolean) | undefined,
            searchKeywords: tab.searchKeywords ? [...tab.searchKeywords] : undefined,
          }
        : undefined,
      defaultOptions: kind.defaultOptions,
    })
  }
  return out
}
```

- [ ] **Step 3: 改素材台 / 图层 / 属性台三处图标渲染**

```vue
<!-- LeftPanel.vue -->
<span class="material-icon"><ElementIcon :name="item.icon" :size="14" /></span>
<!-- 折叠态按钮同样换 lucide（避免同一面板混排字形与 SVG） -->
<button class="lc-btn" title="展开素材台" @click="expandTab(activeTab)"><ElementIcon name="ChevronsRight" :size="14" /></button>
<button class="lc-btn" ...><ElementIcon name="Table2" :size="14" /></button>
<button class="lc-btn" ...><ElementIcon name="ListTree" :size="14" /></button>
<button class="lc-btn" ...><ElementIcon name="Layers" :size="14" /></button>
<!-- 脚本内 builtinElementTypes 的 icon 改为 lucide 名：Type/Barcode/QrCode/Image/Table/Text/List/Minus/SeparatorVertical/Square/Circle -->
```

```vue
<!-- LayerPanel.vue -->
<span class="layer-icon"><ElementIcon :name="layerIcon(layer)" :size="13" /></span>
<!-- elementIconMap 改为 lucide 名；GENERIC_LAYER_ICON = 'Shapes'；html → 'Code' -->
```

```vue
<!-- PropertyPanel.vue：tabs 的 icon 改为 lucide 名，折叠/展开按钮同样走 ElementIcon -->
<!-- custom tab 图标来自扩展（插件给 lucide 名）；内置页签：element → 'Table2'、page → 'FileText'、收起 → 'ChevronsLeft' -->
```

```css
/* LeftPanel.vue 的 .material-icon 只需保留 30×24 盒与 dashed 边框，去掉 font-size 依赖 */
.material-icon { display: inline-flex; align-items: center; justify-content: center; color: var(--pd-accent, #165DFF); }
.layer-icon { display: inline-flex; align-items: center; justify-content: center; color: var(--pd-text-muted); }
```

- [ ] **Step 4: 改写图标与扩展测试**

```ts
// LayerPanelIcon.spec.ts
const EXPECTED: Record<string, string> = {
  text: 'Type', longText: 'Text', table: 'Table', flowList: 'List', image: 'Image', barcode: 'Barcode',
  qrcode: 'QrCode', hline: 'Minus', vline: 'SeparatorVertical', rect: 'Square', oval: 'Circle', html: 'Code',
}
const icons = w.findAll('.layer-icon').map(n => n.find('[data-icon]').attributes('data-icon'))
expect(icons).toEqual(Object.values(EXPECTED))
expect(icons).not.toContain(undefined)

// ElementExtension.spec.ts / useElementExtensionRegistry.spec.ts / custom-property-tab.spec.ts：
// - 插件夹具从 { kind: {...} } 改为 { id, version, kinds: [{...}] }
// - 图标断言从 .text() 改为 [data-icon] 属性；要素卡/图层/属性台三处的样例图标统一用 'ChartColumn'
// - 多 kind 用例：注册 2 个 kind 的插件应出现 2 张素材卡、2 条图层图标映射、按 type 各自解析属性 tab
```

- [ ] **Step 5: 跑 canvas 测试（必须独占，避免 worker 超时）**

```bash
cd /Users/worm/worm/worm-vue3-print
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build -w @worm-vue3-print/core
npm run build -w @worm-vue3-print/canvas
npm run test -w @worm-vue3-print/canvas 2>&1 | tail -20
```

Expected: PASS（`pretest` 的 `vue-tsc --noEmit` 与 82 个 spec 全绿；若 `LeftPanelTwoColumn.spec.ts` 断言卡数，按内置 11 项口径确认未受图标影响）。

- [ ] **Step 6: 提交**

```bash
git add -A packages/print-canvas/src
git commit -m "feat(canvas): 多 kind 扩展映射与 lucide 图标体系"
```

---

### Task 7: print-common 图标同构（零框架 shell）

**Files:**
- Modify: `packages/print-common/src/shell/panels.ts:9-27,80-94,179`
- Regenerate: `packages/print-common/src/core/icons.ts`（由脚本生成，不手改）
- Test: `packages/print-common/src/shell/__tests__/flow-list.spec.ts:347-375`、`packages/print-common/src/__tests__/material-grid.spec.ts:51-60`

**Interfaces:**
- Consumes: canvas 侧 `ElementIcon.vue` 的静态 lucide import（`gen-icons.mjs` 扫描 `print-canvas/src`）。
- Produces: `ELEMENT_TYPES` / `LAYER_ICON` 的值改为 lucide 名；素材卡与图层图标用 `iconSvg(name, size)` 渲染，未知名回落 `iconSvg('Shapes')`。
- 边界：零框架 shell **不消费插件注册表**，10 个图表元素在 common 版设计器中不出现（属本次范围外，注释说明）。

- [ ] **Step 1: 改图标渲染与名称表**

```ts
// panels.ts
import { iconSvg } from '../core/icons'

export const ELEMENT_TYPES: { type: ElementType; label: string; icon: string }[] = [
  { type: 'text', label: '文本', icon: 'Type' },
  { type: 'barcode', label: '条形码', icon: 'Barcode' },
  { type: 'qrcode', label: '二维码', icon: 'QrCode' },
  { type: 'image', label: '图片', icon: 'Image' },
  { type: 'table', label: '表格', icon: 'Table' },
  { type: 'longText', label: '长文', icon: 'Text' },
  { type: 'flowList', label: '流式列表', icon: 'List' },
  { type: 'hline', label: '横线', icon: 'Minus' },
  { type: 'vline', label: '竖线', icon: 'SeparatorVertical' },
  { type: 'rect', label: '矩形', icon: 'Square' },
  { type: 'oval', label: '椭圆', icon: 'Circle' },
]
const LAYER_ICON: Record<string, string> = Object.fromEntries(ELEMENT_TYPES.map(item => [item.type, item.icon]))
const iconMarkup = (name: string | undefined, size = 14): string => iconSvg(name ?? 'Shapes', size) || iconSvg('Shapes', size)

// 素材卡（原 :92）：iconSvg
h('span', { class: 'material-icon', html: iconMarkup(item.icon, 14) })
// 图层（原 :179）：iconSvg，兜底与 canvas 统一为 Shapes，不再用 '?'
h('span', { class: 'layer-icon', html: iconMarkup(LAYER_ICON[type], 12) })
```

- [ ] **Step 2: 重建 canvas 并重新派生图标与样式**

```bash
cd /Users/worm/worm/worm-vue3-print
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build -w @worm-vue3-print/canvas
npm run styles -w @worm-vue3-print/common
git diff --stat packages/print-common/src/core/icons.ts
```

Expected: `icons.ts` 新增 Type/Text/Table/List/Image/Barcode/QrCode/Minus/SeparatorVertical/Square/Circle/Code/Shapes/Layers… 等条目；stderr 无 `missing` 警告；canvas.css 派生后 `.material-icon`/`.layer-icon` 的 flex 居中在 common 侧同构。

- [ ] **Step 3: 改 common 图标断言**

```ts
// flow-list.spec.ts:347-375
const LAYER_ICONS: Record<string, string> = {
  text: 'Type', longText: 'Text', table: 'Table', flowList: 'List', image: 'Image', barcode: 'Barcode',
  qrcode: 'QrCode', hline: 'Minus', vline: 'SeparatorVertical', rect: 'Square', oval: 'Circle', html: 'Code',
}
const icons = w.findAll('.layer-icon')
expect(icons).toHaveLength(Object.keys(LAYER_ICONS).length)
for (const node of icons) expect(node.element.innerHTML).toContain('<svg')
// 不再断言 textContent，也不断言 path
```

- [ ] **Step 4: 跑 common 测试**

```bash
npm exec -w @worm-vue3-print/common vitest run -- src/shell/__tests__/flow-list.spec.ts src/__tests__/material-grid.spec.ts
```

Expected: PASS；素材卡数与两列 wide 断言不变（common 仍是内置 11 项）。

- [ ] **Step 5: 提交**

```bash
git add packages/print-common
git commit -m "feat(common): 素材与图层图标改为 lucide 派生，与 canvas 同构"
```

---

### Task 8: echarts 种类定义、出厂 option、形态归一与配置收敛

**Files:**
- Create: `packages/print-echarts/src/kinds.ts`
- Create: `packages/print-echarts/src/defaults.ts`
- Create: `packages/print-echarts/src/normalize.ts`
- Rewrite: `packages/print-echarts/src/constants.ts`（只留插件 id、配色、样例类目；删 `CHART_TYPES`/labels/`createDefaultChartOption`）
- Modify: `packages/print-echarts/src/config.ts`（删 `defaultChartType`/`defaultChartOption`，`chartFactoryDefaults` 按 kind）
- Modify: `packages/print-echarts/src/type-augmentation.ts`（10 个 type + `chartBubble`）
- Test: `packages/print-echarts/src/__tests__/kinds.test.ts`（新建）、`normalize.test.ts`（新建）、`defaults.test.ts`（新建）
- Test: `packages/print-echarts/src/__tests__/designer-option.test.ts`（删 `readChartType`/`withChartType` 两段）

**Interfaces:**
- Produces: `ChartFieldKey = 'dataSource' | 'categoryField' | 'valueFields' | 'seriesField' | 'title' | 'legend' | 'palette' | 'stack' | 'bubble' | 'innerRadius' | 'gaugeRange'`。
- Produces: `ChartKindDefinition { type; label; icon; seriesType: 'bar'|'line'|'pie'|'scatter'|'radar'|'funnel'|'gauge'; orientation?: 'vertical'|'horizontal'; fields: readonly ChartFieldKey[]; requiredOptionKeys: readonly string[]; notes: string; defaultWidth: number; defaultHeight: number }`。
- Produces: `CHART_KIND_DEFINITIONS: readonly ChartKindDefinition[]`、`CHART_KINDS: readonly string[]`、`getChartKindDefinition(type): ChartKindDefinition | undefined`。
- Produces: `createDefaultChartOption(type: string): Record<string, unknown>`、`normalizeChartOption(type: string, option: Record<string, unknown>): Record<string, unknown>`。
- Produces: `chartFactoryDefaults(type: string, partial?: Record<string, unknown>): Record<string, unknown>`。

- [ ] **Step 1: 写 10 种类定义**

```ts
// src/kinds.ts
import { CHART_PLUGIN_ID } from './constants.js'

export type ChartFieldKey =
  | 'dataSource' | 'categoryField' | 'valueFields' | 'seriesField'
  | 'title' | 'legend' | 'palette' | 'stack' | 'bubble' | 'innerRadius' | 'gaugeRange'

export interface ChartKindDefinition {
  type: string
  label: string
  /** lucide 图标名（canvas 的 ElementIcon 解析） */
  icon: string
  seriesType: 'bar' | 'line' | 'pie' | 'scatter' | 'radar' | 'funnel' | 'gauge'
  orientation?: 'vertical' | 'horizontal'
  fields: readonly ChartFieldKey[]
  requiredOptionKeys: readonly string[]
  notes: string
  defaultWidth: number
  defaultHeight: number
}

const BASE_REQUIRED = ['left', 'top', 'width', 'height', 'chartOption'] as const
const DATA_FIELDS: readonly ChartFieldKey[] = ['dataSource', 'categoryField', 'valueFields', 'seriesField']
const STYLE_FIELDS: readonly ChartFieldKey[] = ['title', 'legend', 'palette']

export const CHART_KIND_DEFINITIONS: readonly ChartKindDefinition[] = [
  { type: 'barChart', label: '柱状图', icon: 'ChartColumn', seriesType: 'bar', orientation: 'vertical',
    fields: [...DATA_FIELDS, ...STYLE_FIELDS, 'stack'], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 100, defaultHeight: 60,
    notes: '柱状图：类目 + 多个数值字段，每字段一个 series；series[].data 写 $data 占位；固定高，禁止 autoHeight' },
  { type: 'barHChart', label: '条形图', icon: 'ChartBar', seriesType: 'bar', orientation: 'horizontal',
    fields: [...DATA_FIELDS, ...STYLE_FIELDS, 'stack'], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 100, defaultHeight: 60,
    notes: '横向条形图：xAxis 为数值、yAxis 为类目；类目写 yAxis.data 的 $data 占位' },
  { type: 'lineChart', label: '折线图', icon: 'ChartLine', seriesType: 'line',
    fields: [...DATA_FIELDS, ...STYLE_FIELDS, 'stack'], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 100, defaultHeight: 60,
    notes: '折线图：类目 + 多个数值字段；不写 areaStyle' },
  { type: 'areaChart', label: '面积图', icon: 'ChartArea', seriesType: 'line',
    fields: [...DATA_FIELDS, ...STYLE_FIELDS, 'stack'], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 100, defaultHeight: 60,
    notes: '面积图：折线 + series[].areaStyle；其余同折线图' },
  { type: 'pieChart', label: '饼图', icon: 'ChartPie', seriesType: 'pie',
    fields: ['dataSource', 'categoryField', 'valueFields', ...STYLE_FIELDS], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 60, defaultHeight: 60,
    notes: '饼图：类目 + 首个数值字段生成 { name, value }；只需一个数值字段' },
  { type: 'doughnutChart', label: '环形图', icon: 'Donut', seriesType: 'pie',
    fields: ['dataSource', 'categoryField', 'valueFields', ...STYLE_FIELDS, 'innerRadius'], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 60, defaultHeight: 60,
    notes: '环形图：饼图 + radius:[内径,外径]；内径由面板配置' },
  { type: 'scatterChart', label: '散点图', icon: 'ChartScatter', seriesType: 'scatter',
    fields: ['dataSource', 'categoryField', 'valueFields', ...STYLE_FIELDS, 'bubble'], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 80, defaultHeight: 60,
    notes: '散点图：类目字段作 x、首个数值字段作 y；chartBubble 开启时用第二个数值字段作点大小' },
  { type: 'radarChart', label: '雷达图', icon: 'Radar', seriesType: 'radar',
    fields: ['dataSource', 'categoryField', 'valueFields', ...STYLE_FIELDS], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 70, defaultHeight: 60,
    notes: '雷达图：每个数值字段是一个维度（radar.indicator），每行数据是一个系列（类目字段作系列名）' },
  { type: 'funnelChart', label: '漏斗图', icon: 'Funnel', seriesType: 'funnel',
    fields: ['dataSource', 'categoryField', 'valueFields', ...STYLE_FIELDS], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 60, defaultHeight: 60,
    notes: '漏斗图：类目 + 首个数值字段，按数值降序；只需一个数值字段' },
  { type: 'gaugeChart', label: '仪表盘', icon: 'Gauge', seriesType: 'gauge',
    fields: ['dataSource', 'valueFields', ...STYLE_FIELDS, 'gaugeRange'], requiredOptionKeys: BASE_REQUIRED, defaultWidth: 60, defaultHeight: 60,
    notes: '仪表盘：取首行数据的首个数值字段作指针值；min/max 由面板写入 series[0].min/max' },
]

export const CHART_KINDS: readonly string[] = CHART_KIND_DEFINITIONS.map(def => def.type)

export function getChartKindDefinition(type: string): ChartKindDefinition | undefined {
  return CHART_KIND_DEFINITIONS.find(def => def.type === type)
}

export { CHART_PLUGIN_ID }
```

- [ ] **Step 2: 写出厂 option 与形态归一**

```ts
// src/defaults.ts
import { getChartKindDefinition } from './kinds.js'

const GRID = { left: '8%', right: '8%', bottom: '12%', top: '18%', containLabel: true }

export function createDefaultChartOption(type: string): Record<string, unknown> {
  const def = getChartKindDefinition(type)
  const title = { text: '' }
  switch (def?.seriesType) {
    case 'pie':
      return {
        title, tooltip: { trigger: 'item' },
        series: [{ type: 'pie', name: '数量', data: ['$data'], radius: type === 'doughnutChart' ? ['40%', '70%'] : '62%' }],
      }
    case 'scatter':
      return { title, grid: GRID, tooltip: { trigger: 'axis' },
        xAxis: { type: 'value' }, yAxis: { type: 'value' },
        series: [{ type: 'scatter', name: '数量', data: ['$data'], symbolSize: 8 }] }
    case 'radar':
      return { title, tooltip: { trigger: 'item' }, radar: { indicator: [] },
        series: [{ type: 'radar', name: '数量', data: ['$data'] }] }
    case 'funnel':
      return { title, tooltip: { trigger: 'item' }, legend: { show: false },
        series: [{ type: 'funnel', name: '数量', data: ['$data'], sort: 'descending' }] }
    case 'gauge':
      return { title, tooltip: { trigger: 'item' },
        series: [{ type: 'gauge', name: '数量', min: 0, max: 100, data: [{ value: 0, name: '数量' }] }] }
    default: {
      const horizontal = def?.orientation === 'horizontal'
      return {
        title, grid: GRID, tooltip: { trigger: 'axis' },
        xAxis: horizontal ? { type: 'value' } : { type: 'category', data: ['$data'] },
        yAxis: horizontal ? { type: 'category', data: ['$data'] } : { type: 'value' },
        series: [{ type: type === 'areaChart' ? 'line' : 'bar', name: '数量', data: ['$data'],
          ...(type === 'areaChart' ? { areaStyle: {} } : {}) }],
      }
    }
  }
}
```

```ts
// src/normalize.ts：出图前按 kind 收敛形态，只动形态相关键
export function normalizeChartOption(type: string, option: Record<string, unknown>): Record<string, unknown> {
  const def = getChartKindDefinition(type)
  if (!def) return option
  const next = structuredClone(option) as Record<string, any>
  const series: Record<string, any>[] = Array.isArray(next.series) ? next.series : []
  if (series.length === 0) return next
  if (def.seriesType === 'pie') {
    next.series = series.map(item => ({ ...item, type: 'pie' }))
    delete next.xAxis; delete next.yAxis
    if (type === 'doughnutChart') next.series = next.series.map(item => ({ ...item, radius: item.radius ?? ['40%', '70%'] }))
    return next
  }
  if (def.seriesType === 'scatter') {
    next.series = series.map(item => ({ ...item, type: 'scatter' }))
    next.xAxis = { ...(next.xAxis ?? {}), type: 'value' }
    next.yAxis = { ...(next.yAxis ?? {}), type: 'value' }
    return next
  }
  if (def.seriesType === 'radar') return { ...next, series: series.map(item => ({ ...item, type: 'radar' })) }
  if (def.seriesType === 'funnel') return { ...next, series: series.map(item => ({ ...item, type: 'funnel', sort: 'descending' })) }
  if (def.seriesType === 'gauge') return { ...next, series: series.map(item => ({ ...item, type: 'gauge' })) }
  // 直角坐标系：柱/条/折线/面积
  const horizontal = def.orientation === 'horizontal'
  next.xAxis = { ...(next.xAxis ?? {}), type: horizontal ? 'value' : 'category' }
  next.yAxis = { ...(next.yAxis ?? {}), type: horizontal ? 'category' : 'value' }
  if (!horizontal && !Array.isArray(next.xAxis.data)) next.xAxis.data = ['$data']
  if (horizontal && !Array.isArray(next.yAxis.data)) next.yAxis.data = ['$data']
  next.series = series.map(item => {
    const shape = { ...item, type: type === 'areaChart' ? 'line' : 'bar' }
    if (type === 'areaChart') shape.areaStyle = item.areaStyle ?? {}
    else delete shape.areaStyle
    if (type === 'lineChart') delete shape.areaStyle
    return shape
  })
  return next
}
```

- [ ] **Step 3: 收敛配置与类型声明**

```ts
// src/config.ts
export interface ChartPluginConfig {
  defaultWidth?: number
  defaultHeight?: number
  palettes?: Readonly<Record<string, ChartPaletteDefinition>>
  components?: readonly unknown[]
  sampleCategories?: readonly string[]
}
// chartFactoryDefaults(type, partial?)：尺寸优先 config → kind 默认；chartOption 用 createDefaultChartOption(type)
// 其余 chart* 字段默认值不变（chartDataSource ''、chartCategoryField 'name'、chartValueFields ['value']、chartSeriesField ''）
```

```ts
// src/type-augmentation.ts
declare module '@worm-vue3-print/core/designer' {
  interface PluginElementTypeMap {
    barChart: true
    barHChart: true
    lineChart: true
    areaChart: true
    pieChart: true
    doughnutChart: true
    scatterChart: true
    radarChart: true
    funnelChart: true
    gaugeChart: true
  }
  interface ElementOptions {
    chartOption?: Record<string, unknown>
    chartDataSource?: string
    chartCategoryField?: string
    chartValueFields?: string[]
    chartSeriesField?: string
    /** 散点图气泡开关：开启时 chartValueFields[1] 作点大小 */
    chartBubble?: boolean
  }
}
// 编译期自校验改为逐 type 推导（10 条）
```

- [ ] **Step 4: 写单测**

```ts
// kinds.test.ts
it('10 个 kind 的 type/label/图标/seriesType 齐全且唯一', () => {
  expect(CHART_KIND_DEFINITIONS).toHaveLength(10)
  expect(new Set(CHART_KINDS).size).toBe(10)
  expect(CHART_KIND_DEFINITIONS.map(d => d.type)).toEqual([
    'barChart', 'barHChart', 'lineChart', 'areaChart', 'pieChart',
    'doughnutChart', 'scatterChart', 'radarChart', 'funnelChart', 'gaugeChart',
  ])
  for (const def of CHART_KIND_DEFINITIONS) {
    expect(def.icon).toMatch(/^[A-Z]/)
    expect(def.fields.length).toBeGreaterThan(2)
  }
})

// normalize.test.ts
it('条形图归一为横向轴，系列类型与 kind 一致', () => {
  const out = normalizeChartOption('barHChart', { series: [{ type: 'bar', data: ['$data'] }] })
  expect(out.xAxis).toMatchObject({ type: 'value' })
  expect(out.yAxis).toMatchObject({ type: 'category', data: ['$data'] })
  expect((out.series as any[])[0].type).toBe('bar')
})
it('面积图补 areaStyle，折线图不补', () => {
  expect(((normalizeChartOption('areaChart', { series: [{ type: 'line', data: ['$data'] }] }).series as any[])[0]).areaStyle).toEqual({})
  expect(((normalizeChartOption('lineChart', { series: [{ type: 'line', data: ['$data'], areaStyle: {} }] }).series as any[])[0]).areaStyle).toBeUndefined()
})
it('环形图补 radius，饼图保留单半径', () => {
  expect(((normalizeChartOption('doughnutChart', { series: [{ type: 'pie', data: ['$data'] }] }).series as any[])[0]).radius).toEqual(['40%', '70%'])
})
```

- [ ] **Step 5: 跑 echarts 单测与类型检查**

```bash
cd /Users/worm/worm/worm-vue3-print/packages/print-echarts
npm exec -- vitest run src/__tests__/kinds.test.ts src/__tests__/normalize.test.ts src/__tests__/defaults.test.ts
npm exec -- vue-tsc -p tsconfig.build.json --noEmit
```

Expected: PASS；`designer-option.test.ts` 因 `withChartType` 被删而失败，随 Task 10 改写（本任务先删该文件中的两段用例）。

- [ ] **Step 6: 提交**

```bash
git add packages/print-echarts/src
git commit -m "feat(echarts): 十类图表 kind 定义、出厂 option 与形态归一"
```

---

### Task 9: echarts 数据绑定、渲染器与页面执行器

**Files:**
- Create: `packages/print-echarts/src/bind.ts`
- Rewrite: `packages/print-echarts/src/renderer.ts`
- Rewrite: `packages/print-echarts/src/browser/executor.iife.ts`
- Rewrite: `packages/print-echarts/src/plugin.ts`
- Modify: `packages/print-echarts/src/echarts.ts`（追加 `RadarChart`/`FunnelChart`/`GaugeChart`）
- Modify: `packages/print-echarts/src/version.ts`（`CHART_EXECUTOR_VERSION = '2'`）
- Test: `plugin-binding.test.ts`、`plugin-render.test.ts`、`renderer.test.ts`、`executor.test.ts`（改写）
- Delete: `packages/print-echarts/src/__tests__/legacy-baseline.test.ts`

**Interfaces:**
- Produces: `ChartRenderSpec { key: string; type: string; option: Record<string, unknown>; widthMm: number; heightMm: number; fontFamily?: string }`。
- Produces: `bindChartData(type: string, options: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown>`，返回 `{ _chartOption: option }`。
- Produces: `renderChartToSvg(spec: ChartRenderSpec): string`（根节点归一，宽度/高度 100%、viewBox）。
- Produces: `renderChartElement(spec: ElementRenderSpec): string`（在 `renderer.ts`，内部调用 `normalizeChartOption(String(spec.type), …)`；无 option 或渲染失败回落 `<span>{title}</span>` 占位，`escapeHtml` 一并落在该文件）。
- Produces: 页面执行器全局方法 `__wormDom.renderAssets(specs: ChartRenderSpec[])`（方法名必须与 core 的 `EXECUTOR_TARGETS.renderAssets` 一致）。

- [ ] **Step 1: 写绑定失败测试（逐语义）**

```ts
// plugin-binding.test.ts（保留原文件骨架，逐 kind 展开）
const data = { trend: [{ name: '一月', sales: 120, profit: 40 }, { name: '二月', sales: 168, profit: 62 }] }
const bound = (type: string, patch: Record<string, unknown> = {}) => bindChartData(type, {
  chartOption: createDefaultChartOption(type), chartDataSource: 'trend',
  chartCategoryField: 'name', chartValueFields: ['sales'], ...patch,
}, data)._chartOption as any

it('直角坐标系：类目与多值多系列', () => {
  expect(bound('barChart').series[0].data).toEqual([120, 168])
  expect(bound('barChart').xAxis.data).toEqual(['一月', '二月'])
  expect(bound('lineChart', { chartValueFields: ['sales', 'profit'] }).series[1].data).toEqual([40, 62])
})

it('条形图把类目写进 yAxis', () => {
  const opt = bound('barHChart')
  expect(opt.yAxis.data).toEqual(['一月', '二月'])
  expect(opt.series[0].data).toEqual([120, 168])
})

it('饼图/环形图生成 { name, value }，漏斗按数值降序', () => {
  expect(bound('pieChart').series[0].data).toEqual([{ name: '一月', value: 120 }, { name: '二月', value: 168 }])
  const funnel = bindChartData('funnelChart', {
    chartOption: createDefaultChartOption('funnelChart'), chartDataSource: 'trend',
    chartCategoryField: 'name', chartValueFields: ['sales'],
  }, data)._chartOption as any
  expect(funnel.series[0].data.map((d: any) => d.value)).toEqual([168, 120])
})

it('散点/气泡：类目作 x、首值作 y、开启气泡时第二值作 symbolSize', () => {
  const scatter = bindChartData('scatterChart', {
    chartOption: createDefaultChartOption('scatterChart'), chartDataSource: 'trend',
    chartCategoryField: 'sales', chartValueFields: ['sales', 'profit'], chartBubble: true,
  }, data)._chartOption as any
  expect(scatter.series[0].data[0]).toMatchObject({ value: [120, 120], symbolSize: expect.any(Number) })
})

it('雷达：数值字段作维度、每行一个系列', () => {
  const radar = bindChartData('radarChart', {
    chartOption: createDefaultChartOption('radarChart'), chartDataSource: 'trend',
    chartCategoryField: 'name', chartValueFields: ['sales', 'profit'],
  }, data)._chartOption as any
  expect(radar.radar.indicator.map((i: any) => i.name)).toEqual(['sales', 'profit'])
  expect(radar.series[0].data).toEqual([{ name: '一月', value: [120, 40] }, { name: '二月', value: [168, 62] }])
})

it('仪表盘：首行首值，min/max 沿用 option', () => {
  const gauge = bindChartData('gaugeChart', {
    chartOption: { ...createDefaultChartOption('gaugeChart'), series: [{ type: 'gauge', min: 0, max: 200, data: [] }] },
    chartDataSource: 'trend', chartValueFields: ['sales'],
  }, data)._chartOption as any
  expect(gauge.series[0].data).toEqual([{ value: 120, name: 'sales' }])
  expect(gauge.series[0]).toMatchObject({ min: 0, max: 200 })
})
```

- [ ] **Step 2: 实现 bind.ts**

```ts
// src/bind.ts（从旧 plugin.ts 迁入 evaluateChartOption/chartNumber/resolveListSource，并补 kind 分支）
export function bindChartData(type, options, data): Record<string, unknown> {
  const def = getChartKindDefinition(type)
  const raw = options.chartOption
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const option = evaluateChartOption(raw, data) as Record<string, any>
  const valueFields = asStringArray(options.chartValueFields)
  const categoryField = asString(options.chartCategoryField)
  const list = resolveListSource({ ...options, dataSource: options.chartDataSource ?? options.dataSource }, data)
  if (list.length === 0 || valueFields.length === 0) return { _chartOption: option }
  const value = (row: Record<string, unknown>, field: string | undefined) => chartNumber(row[field ?? ''])
  switch (def?.seriesType) {
    case 'radar': return { _chartOption: applyRadar(option, list, categoryField, valueFields) }
    case 'gauge': return { _chartOption: applyGauge(option, list, valueFields[0]) }
    case 'funnel': return { _chartOption: applyPieLike(option, list, categoryField, valueFields[0], true) }
    case 'pie': return { _chartOption: applyPieLike(option, list, categoryField, valueFields[0], false) }
    case 'scatter': return { _chartOption: applyScatter(option, list, categoryField, valueFields, options.chartBubble === true) }
    default: return { _chartOption: applyCartesian(option, list, categoryField, valueFields, options.chartSeriesField, def?.orientation === 'horizontal') }
  }
}
// applyCartesian：series 循环填数值；categories 写到「含 $data 的那根类目轴」（x 或 y）；
// chartSeriesField 存在时沿用旧分组逻辑（每个分组一个 series，类目去重）
// applyPieLike/funnel：{ name, value }；funnel 再按 value 降序
// applyScatter：[[x, y]] 或气泡时 { value: [x, y], symbolSize: 归一化到 4..28 }
// applyRadar：radar.indicator = valueFields.map(name => ({ name, max: niceMax(全列最大值) }))；
//   series[0].data = list.map(row => ({ name: categoryField ? row[categoryField] : '', value: valueFields.map(f => value(row, f)) }))
// applyGauge：series[0].data = [{ value: value(list[0], valueFields[0]), name: valueFields[0] }]，保留 min/max
```

- [ ] **Step 3: 改渲染器与执行器**

```ts
// src/renderer.ts：删除 createChartRenderer；入参改为本地 ChartRenderSpec
export function renderChartToSvg(spec: ChartRenderSpec): string {
  const option = normalizeChartOption(spec.type, spec.option)
  // 与原实现一致：mm→px（96dpi 取整）、echarts SSR 出 SVG、fitSvgRoot 归一为 100% + viewBox
}
```

```ts
// src/browser/executor.iife.ts
import { renderChartToSvg } from '../renderer.js'
import { normalizeChartOption } from '../normalize.js'
import { CHART_EXECUTOR_VERSION } from '../version.js'

export function renderAssets(specs: Array<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const spec of specs) {
    const key = String(spec.key ?? '')
    try {
      out[key] = renderChartToSvg({
        key, type: String(spec.type ?? ''),
        option: (spec._chartOption ?? spec.chartOption ?? {}) as Record<string, unknown>,
        widthMm: Number(spec.widthMm ?? 0), heightMm: Number(spec.heightMm ?? 0),
        fontFamily: typeof spec.fontFamily === 'string' ? spec.fontFamily : undefined,
      })
    } catch { /* 单图失败跳过，与旧行为一致 */ }
  }
  return out
}

const holder = (globalThis as any).__wormDom ?? {}
holder.renderAssets = renderAssets
holder.chartExecutorVersion = CHART_EXECUTOR_VERSION
;(globalThis as any).__wormDom = holder
```

- [ ] **Step 4: 重写 plugin.ts 为多 kind 描述符**

```ts
// src/plugin.ts（escapeHtml/evaluateChartOption 等迁入 bind.ts 与 renderer.ts；本文件只留描述符与注册，
// 并 import { renderChartElement } from './renderer.js'）
export const CHART_PLUGIN: PrintElementPlugin = defineElementPlugin({
  id: CHART_PLUGIN_ID,
  version: CHART_EXECUTOR_VERSION,
  kinds: CHART_KIND_DEFINITIONS.map(def => ({
    type: def.type,
    label: def.label,
    icon: def.icon,
    fixedHeight: true,
    requiredOptionKeys: def.requiredOptionKeys,
    notes: def.notes,
    optionMeta: {
      chartOption: { kind: 'object', label: '图表 option' },
      chartDataSource: { kind: 'text', label: '数据源' },
      chartCategoryField: { kind: 'text', label: '类目字段' },
      chartValueFields: { kind: 'object', label: '数值字段' },
      chartSeriesField: { kind: 'text', label: '系列拆分字段' },
      ...(def.type === 'scatterChart' ? { chartBubble: { kind: 'bool', label: '气泡大小' } } : {}),
    },
    defaultOptions: partial => chartFactoryDefaults(def.type, partial as Record<string, unknown> | undefined),
    binding: { bind: (options, data) => bindChartData(def.type, options, data) },
  })),
  render: {
    html: spec => renderChartElement(spec),
    createRenderer: () => ({ render: spec => renderChartElement(spec) }),
  },
})
// registerChartPlugin(designer?, extraRender?) 保留：按 id 取 current 合并 designer/render；
// uninstallChartPlugin() 保留；模块底部自动注册一次
```

```ts
// src/echarts.ts
import { BarChart, LineChart, PieChart, ScatterChart, RadarChart, FunnelChart, GaugeChart } from 'echarts/charts'
echarts.use([BarChart, LineChart, PieChart, ScatterChart, RadarChart, FunnelChart, GaugeChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, SVGRenderer])
```

- [ ] **Step 5: 改写渲染/执行器/绑定测试**

```ts
// renderer.test.ts：入参改 ChartRenderSpec（type + option）
expect(renderChartToSvg({ key: 'k', type: 'barChart', option: createDefaultChartOption('barChart'), widthMm: 100, heightMm: 60 })).toContain('viewBox')
// 十类型覆盖：each CHART_KINDS → renderChartToSvg 输出以 <svg 开头且含 viewBox
// executor.test.ts：renderCharts → renderAssets；specs 带 type；失败单个不中断
// plugin-render.test.ts：getElementPlugin('barChart') / 占位标题用 kind.label
```

- [ ] **Step 6: 跑 echarts 单测**

```bash
cd /Users/worm/worm/worm-vue3-print/packages/print-echarts
npm exec -- vitest run src/__tests__/plugin-binding.test.ts src/__tests__/plugin-render.test.ts src/__tests__/renderer.test.ts src/__tests__/executor.test.ts
```

Expected: PASS；`plugin-lifecycle.test.ts` 仍红（Task 10 改写）。

- [ ] **Step 7: 提交**

```bash
git add packages/print-echarts/src
git commit -m "feat(echarts): 十类图表的绑定、SVG 渲染与页面执行器"
```

---

### Task 10: echarts 图形化属性面板、设计器入口与配置收敛

**Files:**
- Rewrite: `packages/print-echarts/src/designer/ChartPropertyGroup.vue`
- Modify: `packages/print-echarts/src/designer/ChartElement.vue`（按元素 type 归一预览）
- Modify: `packages/print-echarts/src/designer/option-utils.ts`（删 `readChartType`/`withChartType`）
- Rewrite: `packages/print-echarts/src/designer/index.ts`（多 kind 注册 + 共享组件）
- Modify: `packages/print-echarts/src/index.ts`、`src/node.ts`（导出面收敛、删兼容 API）
- Test: `plugin-lifecycle.test.ts`（改写）、`designer-option.test.ts`（改写）
- Test: `packages/print-echarts/src/__tests__/chart-property-fields.test.ts`（新建，测纯函数字段映射）

**Interfaces:**
- Produces: `resolveChartPanelFields(type): readonly ChartFieldKey[]`（面板按此渲染控件；纯函数便于单测）。
- Produces: 设计器注册对象 `{ canvasComponent: ChartElement, materialCard: { group: '图表' }, propertyTab: { id, label, icon, component, hasProperties, searchKeywords } }`。
- Produces: 导出面：`CHART_PLUGIN`/`CHART_PLUGIN_ID`/`CHART_KIND_DEFINITIONS`/`CHART_KINDS`/`CHART_PALETTES`/`createDefaultChartOption`/`normalizeChartOption`/`chartFactoryDefaults`/`configureChartPlugin`/`getChartPluginConfig`/`getChartPalettes`/`getSampleCategories`/`renderChartToSvg`/`fitSvgRoot`/`mmToChartPx`/`renderChartElement`/`bindChartData`/`registerChartPlugin`/`uninstallChartPlugin`；删除 `createChartRenderer`/`installEchartsDesignerExtension`/`uninstallEchartsDesignerExtension`/`CHART_LEGACY_ALIASES`/`CHART_TYPES`/`CHART_TYPE_LABELS`/`CHART_PLUGIN_TYPE`/`registerChartDesigner`/`registerChartExecutorBundle`/`loadChartExecutorBundle`。

- [ ] **Step 1: 写字段映射失败测试**

```ts
// chart-property-fields.test.ts
it('面板字段按 kind 裁剪', () => {
  expect(resolveChartPanelFields('barChart')).toEqual(expect.arrayContaining(['dataSource', 'categoryField', 'valueFields', 'stack', 'palette']))
  expect(resolveChartPanelFields('pieChart')).not.toContain('stack')
  expect(resolveChartPanelFields('doughnutChart')).toContain('innerRadius')
  expect(resolveChartPanelFields('gaugeChart')).toContain('gaugeRange')
  expect(resolveChartPanelFields('gaugeChart')).not.toContain('categoryField')
})
```

- [ ] **Step 2: 重写面板为「字段驱动 + 仅图形化」**

```vue
<!-- ChartPropertyGroup.vue 结构（删掉 JSON 表单、类型下拉、mode 切换） -->
<template>
  <div class="echarts-property">
    <form class="pd-form" @submit.prevent>
      <div v-if="has('dataSource')" class="pd-field">数据源（datalist 候选 + 输入）</div>
      <div v-if="has('categoryField')" class="pd-field">类目字段</div>
      <div v-if="has('valueFields')" class="pd-field">数值字段（可增删，按 kind 限制最大条数：饼/环/漏/仪表盘=1）</div>
      <div v-if="has('seriesField')" class="pd-field">系列拆分字段</div>
      <div v-if="has('title')" class="pd-field">图表标题</div>
      <div v-if="has('legend')" class="pd-field">显示图例</div>
      <div v-if="has('palette')" class="pd-field">配色</div>
      <div v-if="has('stack')" class="pd-field">堆叠显示</div>
      <div v-if="has('bubble')" class="pd-field">气泡大小（chartBubble）</div>
      <div v-if="has('innerRadius')" class="pd-field">内径（写 series[0].radius）</div>
      <div v-if="has('gaugeRange')" class="pd-field">最小/最大值（写 series[0].min/max）</div>
    </form>
  </div>
</template>
```

```ts
// designer/option-utils.ts 新增纯函数（面板与单测共用；从 src/index.ts 导出）
export function resolveChartPanelFields(type: string): readonly ChartFieldKey[] {
  return getChartKindDefinition(type)?.fields ?? []
}
```

```ts
// 脚本关键点
const definition = computed(() => getChartKindDefinition(props.element.printElementType?.type ?? ''))
const has = (field: ChartFieldKey): boolean => definition.value?.fields.includes(field) ?? false
const option = computed(() => props.element.options.chartOption as Record<string, any> | undefined)
function commitOption(next: Record<string, unknown>, patch: Partial<ElementOptions> = {}): void {
  props.element.options.chartOption = normalizeChartOption(definition.value!.type, next)
  Object.assign(props.element.options, patch)
  emit('update:options', { chartOption: props.element.options.chartOption, ...patch })
  emit('change')
}
// 每个 onXxx 只改自己那一段（标题/图例/配色/堆叠/内径/min-max/气泡），
// 不重写 series.data 与 chart* 映射；数值字段条数按 kind 限制
```

- [ ] **Step 3: 注册 10 个 kind 并删除旧兼容层**

```ts
// designer/index.ts
const SEARCH_KEYWORDS = ['图表', 'echarts', 'option', '配置', '数据源', '类目', '数值', '系列', '柱状', '条形', '折线', '面积', '饼', '环形', '散点', '雷达', '漏斗', '仪表']

function chartHasProperties(element: unknown): boolean {
  const opts = (element as { options?: Record<string, unknown> } | null)?.options
  if (!opts || typeof opts !== 'object') return false
  return CHART_OPTION_KEYS.some(key => opts[key] !== undefined)
}

export function installChartDesigner(): () => void {
  return registerChartPlugin({
    canvasComponent: ChartElement,
    materialCard: { group: '图表' },
    propertyTab: {
      id: 'chart-properties', label: '自定义属性', icon: 'ChartColumn',
      component: ChartPropertyGroup, hasProperties: chartHasProperties, searchKeywords: SEARCH_KEYWORDS,
    },
  })
}
// 模块 import 时自动执行一次（与旧版一致：宿主 import 包入口即生效）
```

```ts
// src/index.ts / src/node.ts 收敛
// index.ts：导出面见 Interfaces；底部安装设计器
// node.ts：保留惰性 IIFE bundle 读取并 registerChartPlugin(undefined, { executorBundle })，删除 loadChartExecutorBundle 导出
// 版本：src/version.ts 的 CHART_EXECUTOR_VERSION 改 '2'（执行器协议随 renderAssets 变化）
```

- [ ] **Step 4: 改写生命周期与 option 工具测试**

```ts
// plugin-lifecycle.test.ts
it('包入口自注册后 10 个 kind 都能按 type 查到时拿到同一插件', () => {
  for (const type of CHART_KINDS) {
    expect(getElementPlugin(type)?.id).toBe(CHART_PLUGIN_ID)
    expect(getElementPlugin(type)?.kind.type).toBe(type)
  }
})
it('配置惰性生效：defaultWidth/Height 与 palettes 影响新建默认', () => {
  configureChartPlugin({ defaultWidth: 120, defaultHeight: 70, palettes: { brand: { label: '品牌色', colors: ['#F2704E'] } } })
  expect(chartFactoryDefaults('barChart')).toMatchObject({ width: 120, height: 70 })
  expect(getChartPalettes().some(p => p.key === 'brand')).toBe(true)
})
it('卸载后 10 个 type 全部回落', () => {
  const dispose = installChartDesigner()
  dispose()
  for (const type of CHART_KINDS) expect(getElementPlugin(type)?.designer).toBeUndefined()
})
// designer-option.test.ts：删除 withChartType/readChartType 用例，保留 preview $data、readPaletteKey；
// syncSeriesCount 用例改为「饼图最多 1 个数值字段」口径
```

- [ ] **Step 5: 跑 echarts 全量测试与构建**

```bash
cd /Users/worm/worm/worm-vue3-print/packages/print-echarts
npm exec -- vitest run
npm run build
```

Expected: 测试 PASS；`build` 通过 `vite + tsup + vue-tsc`，生成 `dist/index.*`、`dist/node.*`、`dist/executor.iife.global.js`。

- [ ] **Step 6: 提交**

```bash
git add packages/print-echarts
git commit -m "feat(echarts): 图形化属性面板与十类元素设计器入口"
```

---

### Task 11: 三端装配收尾、兼容基线与旧端口清理

**Files:**
- Modify: `services/print-render/src/pdf-render.ts:27-30`（三参装配）
- Modify: `clients/print-client/src/main/print-engine.ts:69-76`（三参装配）
- Delete: `services/print-render/src/chart-pdf.baseline.test.ts`、`services/print-render/vitest.baseline.config.ts`、`clients/print-client/src/main/chart-print.baseline.test.ts`
- Modify: `services/print-render/vitest.config.ts:9-11`（删 baseline exclude）、`services/print-render/package.json:17`（删 `test:baseline`）
- Modify: `packages/print-canvas/src/components/PrintHtmlPreview.vue:40,66-71,136,169`（删 `chartRenderer` prop/import/透传/watch）
- Delete: `docs/superpowers/specs/baseline/` 整目录 6 个文件（`*.legacy.json`、`*.validate-baseline.json`、`*.html-baseline.html`）
- Modify: `scripts/check-print-architecture.mjs:49-51`（自检样例去掉 `loadChartExecutorBundle`/`createChartRenderer`）
- Modify: `packages/print-canvas/src/help-content/features.ts:21`、`packages/print-common/src/shell/help-content/features.ts:22`（帮助文案改为「插件元素（如 ECharts 十类图表）」且两份逐字一致）
- 只读确认：`grep -rn "chartRenderer\|renderCharts\|ChartSpec\|chartBundle\|loadChartExecutorBundle\|createChartRenderer" packages services clients demo --include="*.ts" --include="*.vue" | grep -v /dist/ | grep -v node_modules`

**Interfaces:**
- Consumes: `createDomHostRuntime(factory, coreBundle?, bundles?)`（Task 2）、`collectExecutorBundles()`（Task 2）。
- Produces: 三端装配只剩「core 执行器 + 插件执行器列表」两段，无图专属参数。

- [ ] **Step 1: 收缩三端装配与预览组件**

```ts
// services/print-render/src/pdf-render.ts 与 clients/print-client/src/main/print-engine.ts
createDomHostRuntime(factory, loadExecutorBundle(), collectExecutorBundles())
// 删除第三参 undefined 与「§4.3 旧 chartBundle 兼容位」注释；部署白名单 side-effect import 保留
```

```ts
// packages/print-canvas/src/components/PrintHtmlPreview.vue
// 删除 import type { ChartRenderer }、chartRenderer prop、watch 依赖项与 renderHtmlPages 透传；
// 保留 renderers?: ElementRenderers（宿主覆盖扩展元素渲染的唯一入口）
```

- [ ] **Step 2: 删除兼容基线与配置**

```bash
cd /Users/worm/worm/worm-vue3-print
rm -f services/print-render/src/chart-pdf.baseline.test.ts services/print-render/vitest.baseline.config.ts clients/print-client/src/main/chart-print.baseline.test.ts
rm -rf docs/superpowers/specs/baseline
# 从 services/print-render/package.json 删掉 "test:baseline" 脚本
# 从 services/print-render/vitest.config.ts 删掉 '**/*.baseline.test.ts' exclude 与注释
grep -rn "baseline" services/print-render clients/print-client packages --include="*.ts" --include="*.json" | grep -v node_modules | grep -v /dist/
```

Expected: 除本计划与历史设计文档外无 baseline 引用；`print-core` 的 `three-end-baseline.spec.ts` 已在 Task 3 改为内联夹具（文件名可保留，不再读 baseline 目录）。

- [ ] **Step 3: 更新架构守卫自检样例**

```js
// scripts/check-print-architecture.mjs 自检样本
const selfCheckOk = [
  "import 'echarts'",
  "import 'echarts/core'",
  "import zrender from 'zrender'",
  "import { init } from 'zrender/lib/core/env'",
]
const selfCheckDenied = [
  "import '@worm-vue3-print/echarts/node'",
  "import '@worm-vue3-print/echarts'",
  "import { createDomHostRuntime } from '@worm-vue3-print/core'",
  "import { collectExecutorBundles } from '@worm-vue3-print/core'",
]
```

- [ ] **Step 4: 跑渲染服务与客户端测试**

```bash
cd /Users/worm/worm/worm-vue3-print
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build -w @worm-vue3-print/core
npm run build -w @worm-vue3-print/echarts
npm run test -w @worm-vue3-print/render 2>&1 | tail -15
npm run test -w @worm-vue3-print/print-client 2>&1 | tail -15
```

Expected: render 真实 Chromium 集成测试全绿；print-client 全绿；无 `test:baseline` 脚本残留。

- [ ] **Step 5: 提交**

```bash
git add -A services/print-render clients/print-client packages/print-canvas/src scripts/check-print-architecture.mjs docs/superpowers/specs
git commit -m "refactor: 三端装配去掉图表兼容位并清理旧基线"
```

---

### Task 12: demo 十个类型样例与 strict `plugins` 清单

**Files:**
- Modify: `demo/src/samples/element-helper.ts:13-28`（`TYPE_TITLES` 覆盖 10 个 kind）
- Rewrite: `demo/src/samples/sales-chart.ts`（业务样例：柱状图 + 环形图 + 折线图）
- Rewrite: `demo/src/samples/echarts-test-case.ts`（覆盖 10 个 kind）
- Modify: `demo/src/samples/index.ts`（如样例名/注释变化则同步）
- Modify: `demo/src/App.vue:185-188`（注释去掉旧 API 名）

**Interfaces:**
- Consumes: `@worm-vue3-print/echarts` 包入口（副作用自注册）、10 个 `ElementType`（声明合并）。
- Produces: 模板顶层 `plugins: [{ id: '@worm-vue3-print/echarts', version: '2' }]`（version 取 `CHART_EXECUTOR_VERSION`，与严格校验比对口径一致）。

- [ ] **Step 1: 改类型标题表（编译期穷尽检查）**

```ts
// demo/src/samples/element-helper.ts
import type {} from '@worm-vue3-print/echarts' // 让声明合并可见（或沿用 App.vue 的副作用 import 所在模块）
const TYPE_TITLES: Record<ElementType, string> = {
  text: '文本', barcode: '条形码', qrcode: '二维码', image: '图片', table: '表格',
  longText: '长文', flowList: '流式列表', hline: '横线', vline: '竖线', rect: '矩形', oval: '椭圆',
  barChart: '柱状图', barHChart: '条形图', lineChart: '折线图', areaChart: '面积图', pieChart: '饼图',
  doughnutChart: '环形图', scatterChart: '散点图', radarChart: '雷达图', funnelChart: '漏斗图', gaugeChart: '仪表盘',
}
```

- [ ] **Step 2: 重写业务样例（保留销售趋势语义）**

```ts
// demo/src/samples/sales-chart.ts
const template: TemplateData = {
  unit: 'mm', paperSize: 'A4', orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
  plugins: [{ id: '@worm-vue3-print/echarts', version: '2' }],
  elements: [
    el('text', { left: 45, top: 10, width: 100, height: 8, fontSize: 14, fontWeight: 'bold', textAlign: 'center', formatter: '{title}' } as any),
    el('barChart', { left: 45, top: 22, width: 100, height: 60, chartDataSource: 'trend', chartCategoryField: 'name', chartValueFields: ['sales'] } as any),
    el('doughnutChart', { left: 45, top: 92, width: 60, height: 60, chartDataSource: 'trend', chartCategoryField: 'name', chartValueFields: ['sales'] } as any),
    el('lineChart', { left: 115, top: 92, width: 60, height: 60, chartDataSource: 'trend', chartCategoryField: 'name', chartValueFields: ['sales', 'profit'] } as any),
  ],
}
```

- [ ] **Step 3: 重写测试样例覆盖 10 个 kind**

```ts
// demo/src/samples/echarts-test-case.ts：2 列 × 5 行网格，逐 kind 一个元素
const KINDS = ['barChart', 'barHChart', 'lineChart', 'areaChart', 'pieChart',
  'doughnutChart', 'scatterChart', 'radarChart', 'funnelChart', 'gaugeChart'] as const
// 每个元素只需 chartDataSource/chartCategoryField/chartValueFields，
// chartOption 可用 `createDefaultChartOption(kind)`（demo 直接 import 该函数），
// 散点用 scatter 数据源、雷达用 trend 的多数值字段、仪表盘用单值字段
```

- [ ] **Step 4: 构建 demo**

```bash
cd /Users/worm/worm/worm-vue3-print
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build -w @worm-vue3-print/core
npm run build -w @worm-vue3-print/canvas
npm run build -w @worm-vue3-print/echarts
cd demo && npm run build 2>&1 | tail -10
```

Expected: demo 构建 exit 0；若 `TYPE_TITLES` 有遗漏，`vue-tsc` 报 TS2741/TS2353，补齐后再构建。

- [ ] **Step 5: 提交**

```bash
git add demo/src
git commit -m "chore(demo): 十个图表元素样例与 strict 插件清单"
```

---

### Task 13: 文档、示例脚手架、CHANGELOG 与版本号同步

**Files:**
- Modify: `docs/中文/指南/模板设计器.md:132-138`、`docs/中文/指南/自定义元素插件开发.md`（多 kind 描述符、`kinds[]`、10 kind、删除兼容 API 段、验收口径改 10 kind）、`docs/中文/指南/AI接入.md:50,70-73`、`docs/中文/指南/使用指南.md:29-30`、`docs/en/Overview.md:116`、`docs/中文/接口/API文档.md:106`（三参签名）
- Modify: `README.md:82,102,163,475`、`packages/print-echarts/README.md`（10 kind、无 JSON 模式、无兼容 API、无 zrender 基线段落、配置收敛）
- Modify: `packages/print-common/PARITY.md:59`（图标表改 lucide 名）
- Modify: `skills/worm-vue3-print-mcp/references/template-schema.md:61-69`（示例改新 kind）
- Rewrite: `examples/custom-element-plugin/`（`plugin.ts`/`index.ts`/`node.ts`/`type-augmentation.ts`/`README.md` 改为「一个插件两个 kind」示例）
- Modify: `docs/superpowers/specs/2026-11-14-custom-element-plugin-design.md:366-372,149,489,496,512-513`（标注兼容基线与单 kind 形态已作废，指向本计划）
- CHANGELOG 四处：`docs/中文/CHANGELOG.md:5`、`docs/en/CHANGELOG.en.md:7`、`packages/print-canvas/src/help-content/changelog.ts:5`、`packages/print-common/src/shell/help-content/changelog.ts:6`
- 版本号：10 个 `package.json`（根、print-core、print-canvas、print-common、print-contract、print-echarts、print-mcp、print-skills、demo、clients/print-client）+ 6 处内部 `^1.5.0` 引用 + `packages/print-mcp/src/version.ts:2` + 根/demo 两个 lock + README 当前版本

**Interfaces:**
- Produces: 全仓版本 `1.5.0`；CHANGELOG 未发布段与帮助弹窗同源；插件开发文档以 `kinds[]` 为准。

- [ ] **Step 1: 改文档与示例脚手架**

```ts
// examples/custom-element-plugin/src/plugin.ts（多 kind 示例骨架）
export const SIGNATURE_PLUGIN: PrintElementPlugin = defineElementPlugin({
  id: '@acme/signature',
  version: '1.0.0',
  kinds: [
    { type: 'signature', label: '手写签名', icon: 'PenTool', requiredOptionKeys: [...], optionMeta: {...}, defaultOptions: ... },
    { type: 'signatureStamp', label: '签章', icon: 'Stamp', requiredOptionKeys: [...], optionMeta: {...},
      binding: { bind: (options, data) => ({ ... }) } },
  ],
  render: { html: spec => `<svg data-signature="${spec.type}"></svg>`, createRenderer: () => ({ render: spec => ... }) },
})
```

- [ ] **Step 2: 同步 CHANGELOG 四处（只写用户可见行为）**

```md
## 未发布
### 新增
- 图表元素拆分为 10 个独立元素：柱状图 / 条形图 / 折线图 / 面积图 / 饼图 / 环形图 / 散点图 / 雷达图 / 漏斗图 / 仪表盘；新元素在素材台「图表」分组，属性台只提供图形化配置。
- 支持自定义元素插件一次注册多个元素类型（一个 `kinds` 数组），模板可按插件声明启用强校验。
### 变更
- 素材台与图层面板图标统一为矢量图标；图表属性台不再提供 JSON 编辑器（复杂样式仍可在模板 JSON 中手写 `chartOption`）。
```

```bash
# canvas 与 common 两份 help-content/changelog.ts 必须逐字一致（生成方式：以 canvas 为基准重写 common 首行注释后的内容）
{ head -1 packages/print-common/src/shell/help-content/changelog.ts; cat packages/print-canvas/src/help-content/changelog.ts; } > /tmp/common-changelog.ts
mv /tmp/common-changelog.ts packages/print-common/src/shell/help-content/changelog.ts
```

- [ ] **Step 3: 版本号统一到 1.5.0**

```bash
cd /Users/worm/worm/worm-vue3-print
node -e "
const fs = require('node:fs')
const files = ['package.json','packages/print-core/package.json','packages/print-canvas/package.json','packages/print-common/package.json','packages/print-contract/package.json','packages/print-echarts/package.json','packages/print-mcp/package.json','packages/print-skills/package.json','demo/package.json','clients/print-client/package.json']
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'))
  j.version = '1.5.0'
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n')
}
const v = 'packages/print-mcp/src/version.ts'
fs.writeFileSync(v, fs.readFileSync(v, 'utf8').replace(/'1\.4\.8'/, \"'1.5.0'\"))
// 内部依赖/peer 的 ^1.4.8 同步替换（canvas/common/contract/mcp/print-client/echarts/render 各自 package.json 内）
"
npm install --package-lock-only
npm install --prefix demo --package-lock-only
grep -rn "1\.4\.8" package.json packages/*/package.json clients/*/package.json services/*/package.json demo/package.json | head
```

Expected: 除历史 CHANGELOG/文档版本号与 `demo-common/` 独立版本外，无 `1.4.8` 残留；`npm ci --dry-run` 显示 up to date。

- [ ] **Step 4: 技能与文档校验**

```bash
npm run test:skills
node scripts/check-skills.mjs skills/worm-vue3-print-integration skills/worm-vue3-print-common skills/worm-vue3-print-mcp
```

Expected: PASS；文档链接与引用检查通过。

- [ ] **Step 5: 提交**

```bash
git add -A docs README.md packages/print-echarts/README.md packages/print-common/PARITY.md skills examples package.json packages clients demo/package.json
git commit -m "docs: 图表十元素与多 kind 插件文档、CHANGELOG 与 1.5.0 版本同步"
```

---

### Task 14: 全量验收与回归门禁

**Files:**（只读验收，必要时修复前序任务的遗漏）
- `scripts/check-print-architecture.mjs`
- 各 workspace `vitest.config.ts` / `package.json`

**Interfaces:**
- Produces: 验收证据（命令、退出码、用例数），写入本计划末尾「验收记录」。

- [ ] **Step 1: 包边界与残留扫描**

```bash
cd /Users/worm/worm/worm-vue3-print
grep -rn "renderCharts\|chartRenderer\|ChartSpec\|CHART_TYPES\|defaultChartType\|CHART_LEGACY_ALIASES\|loadChartExecutorBundle\|createChartRenderer" packages services clients demo --include="*.ts" --include="*.vue" | grep -v node_modules | grep -v /dist/ | grep -v "docs/"
grep -rln "echarts\|zrender" packages/print-core/src packages/print-canvas/src packages/print-common/src | grep -v __tests__
```

Expected: 两条命令均无输出（`print-echarts` 自身除外，README/注释提及不算）。

- [ ] **Step 2: 逐 workspace 独占测试（顺序不可并行）**

```bash
npm exec -w @worm-vue3-print/core vitest run 2>&1 | tail -5
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build -w @worm-vue3-print/core
npm exec -w @worm-vue3-print/contract vitest run 2>&1 | tail -5
npm exec -w @worm-vue3-print/mcp vitest run 2>&1 | tail -5
npm run build -w @worm-vue3-print/contract && npm run build -w @worm-vue3-print/mcp
npm run test -w @worm-vue3-print/canvas 2>&1 | tail -5
npm run build -w @worm-vue3-print/canvas
npm run test -w @worm-vue3-print/echarts 2>&1 | tail -5
npm run test -w @worm-vue3-print/common 2>&1 | tail -5
npm run test -w @worm-vue3-print/print-client 2>&1 | tail -5
npm run test -w @worm-vue3-print/render 2>&1 | tail -5
npm run test:skills 2>&1 | tail -5
```

Expected: 全部 exit 0；canvas 若出现 `Timeout waiting for worker to respond`，确认是独占运行而非并行。

- [ ] **Step 3: 全量构建与架构守卫**

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build 2>&1 | tail -10
npm run lint:print-architecture
git diff --check
cd demo && npm run build 2>&1 | tail -5
```

Expected: 全绿；架构守卫无违规。

- [ ] **Step 4: 可选三端一致性**

```bash
npm run parity:cross-end 2>&1 | tail -10
```

Expected: 通过；若环境未装 Playwright/Chromium，记录未执行原因，不冒充通过。

- [ ] **Step 5: 记录验收结果并最终提交（如有修复）**

```bash
git log --oneline $(git merge-base HEAD origin/master)..HEAD
git status --short
```

把每条命令的退出码与用例数补到本计划末尾「验收记录」；若有遗漏修复，单独提交 `fix: 验收回归修复`。

---

## 执行交接

计划已保存到 `docs/superpowers/plans/2026-11-15-echarts-multi-kind-elements.md`。两种执行方式：

1. **Subagent-Driven（推荐）**：每个任务派一个全新 subagent 执行，任务之间由我复核（两段式 review），迭代快、上下文干净。
2. **Inline Execution**：在本会话内按任务批量执行，在任务边界设检查点。

选择哪种？

---

## 验收记录（2026-11-15 执行）

执行方式：Inline（`executing-plans`），按任务提交；中途折入三份评审的阻塞项（PrintHtmlPreview 清理前移、缺执行器明确报错、bundle provider 去重、strict 语义钉住、lucide 可派生图标替换、normalize 补轴/数组轴、demo typecheck 等）。

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 全量构建 | `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build` | exit 0（core → contract → mcp → canvas → echarts → render → common → print-client → skills） |
| core | `npx vitest run`（print-core） | 91 文件 / 1383 用例全绿 |
| contract | `npx vitest run`（print-contract） | 10 文件 / 105 用例全绿 |
| mcp | `npx vitest run`（print-mcp） | 8 文件 / 97 用例全绿 |
| canvas | `npm run test -w @worm-vue3-print/canvas`（含 pretest vue-tsc） | 84 文件 / 824 用例全绿 |
| echarts | `npm run test -w @worm-vue3-print/echarts` | 10 文件 / 49 用例全绿（含真实 echarts 端到端 `plugin-e2e.test.ts`：十 kind 走 prepareDocument/renderPdf 全部出 SVG） |
| common | `npm run test -w @worm-vue3-print/common` | 37 文件 / 389 用例全绿 |
| print-client | `npx vitest run`（print-client） | 25 文件 / 209 用例全绿 |
| render（真实 Chromium） | `npm run test -w @worm-vue3-print/render` | 13 文件 / 48 用例全绿 |
| 架构守卫 | `npm run lint:print-architecture` | 通过 |
| 技能校验 | `npm run test:skills` | 三个技能全部通过 |
| demo | `cd demo && npm run build` + `npm run typecheck` | 均 exit 0 |
| 包边界扫描 | core/canvas/common 源码 import `echarts` | 无命中 |
| 旧 API 扫描 | `renderCharts`/`chartRenderer`/`ChartSpec`/`CHART_TYPES`/`defaultChartType`/`legacy` 旧段 | 产品源码无命中（仅测试夹具与注释历史说明） |
| 版本 | 10 个 `package.json` + 10 处内部 `^1.5.0` + `print-mcp/src/version.ts` + 两个 lock | `npm install --package-lock-only` up to date；manifests 无 1.4.8 残留 |

已确认的边界：`@worm-vue3-print/common` 零框架外壳不消费插件注册表，十个图表元素只在 `canvas` 设计器一侧出现；
`@worm-vue3-print/echarts` 仍未发布到 npm；客户端安装包与 README 下载直链未按 1.5.0 重打（发版步骤另行执行）。

