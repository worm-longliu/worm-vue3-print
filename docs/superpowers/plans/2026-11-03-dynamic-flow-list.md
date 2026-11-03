# 动态流式列表容器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 `flowList` 增加向后兼容的动态高度、四边内边距、按行分页、每页闭合边框和下方跟随区能力。

**Architecture:** 在 core 现有“绑定 → Chromium 测量 → 分页 → HTML”管线中保留流式行结构并增加 `flow-list-slice`，固定模式继续走原普通元素路径。两个设计器外壳只消费 core 解析函数并增加画布实测，不在画布实现分页或第二套跨列算法。

**Tech Stack:** TypeScript、Vue 3、Vitest、Playwright、npm workspaces、opencode CLI、qoder CLI。

**Spec:** `docs/superpowers/specs/2026-11-03-dynamic-flow-list-design.md`

## Global Constraints

- 全程使用简体中文；代码标识符和命令保留英文。
- 在 `master` 直接开发，不创建工作树，不使用 `git reset --hard`、`git clean` 或覆盖用户既有改动。
- 每次写入使用 UTF-8 无 BOM，单次写入不超过 500 行；修改保持外科手术式。
- 缺省 `flowLayoutMode='fixed'`；固定模式的 HTML、裁切与分页行为必须保持不变。
- 本期块内只支持文本，不新增公开元素类型，不引入通用嵌套容器。
- 自动跨列只使用 core `layoutFlowList`；设计画布不预演跨列、不运行分页引擎。
- 不读取或判认截图；真实渲染验证只使用 DOM、计算样式与几何数据。
- 每个任务先写失败测试，再写最小实现；外部 agent 只改本任务 Files 列出的文件。
- 主 agent 在每个任务后审查 `git diff`、复跑测试并提交，外部 agent 不自行提交。

## 执行 Agent 路由（每个任务均适用）

1. 主 agent 为本任务生成独立提示词，要求执行者阅读 `AGENTS.md`、规格、本计划和包内相似实现，严格按 TDD 修改并列出自测结果。
2. 首选以下 opencode 免费模型，按顺序尝试；只有命令不可用、认证/配额失败、模型不可用或进程异常时才切换下一个：

```bash
opencode run --dir "$PWD" --auto --format json -m opencode/glm-5.3-flash-free "$(cat "$TASK_PROMPT")"
opencode run --dir "$PWD" --auto --format json -m opencode/deepseek-v4.1-flash-free "$(cat "$TASK_PROMPT")"
opencode run --dir "$PWD" --auto --format json -m opencode/beam-free "$(cat "$TASK_PROMPT")"
```

3. opencode 免费模型全部不可用后，仅尝试 qoder 的免费体验档 `Efficient`；不得改用 `Ultimate`、`Sonus`、`Qwen3.8-Max` 等计费档。若 `qoder --list-models` 不含 `Efficient`，直接由主 agent 兜底：

```bash
qoder --cwd "$PWD" -p -m Efficient --permission-mode bypass_permissions "$(cat "$TASK_PROMPT")"
```

4. qoder 也不可用时，主 agent 按同一提示词完成该任务。代码审查失败不视为工具不可用：先让当前执行者根据审查意见修复，基础设施失败才切换路由。
5. 每次外部执行结束，主 agent 检查退出码、实际改动文件和测试输出；不得只凭 agent 的成功声明进入下一任务。

## 文件结构

- `render/flow-list.ts`：布局模式、内边距、内容宽度和既有排布纯逻辑。
- `render/data-binder.ts`：生成动态模式 `_flowRows`。
- `browser/dom-executor.ts`、`print/measure.ts`：读取并规范化逐行实测高度。
- `render/pagination-engine.ts`：动态列表切片与跟随区归属。
- `render/html-generator.ts`：测量行、完整列表和分页切片 HTML。
- `print-canvas`、`print-common`：属性面板和画布动态高度自愈。
- `services/print-render`：真实 Chromium 端到端验证。

---

### Task 1: core 模板字段与纯解析函数

**Files:**
- Modify: `packages/print-core/src/designer/types.ts`
- Modify: `packages/print-core/src/designer/utils/element-factory.ts`
- Modify: `packages/print-core/src/designer/utils/property-search.ts`
- Modify: `packages/print-core/src/render/flow-list.ts`
- Test: `packages/print-core/src/render/__tests__/flow-list.spec.ts`
- Test: `packages/print-core/src/designer/utils/__tests__/element-factory.spec.ts`

**Interfaces:**
- Produces: `FlowLayoutMode`、`FlowPadding`、`resolveFlowLayoutMode(value: unknown)`、`resolveFlowPadding(options: Record<string, unknown>)`、`flowContentWidthMm(width: number, padding: FlowPadding)`。
- Produces: `ElementOptions.flowLayoutMode` 与四个 `flowPadding*` 字段；`designer/index.ts` 现有 `export *` 自动导出新函数。

- [x] **Step 1: 写失败测试**

```ts
it('动态布局缺省保持 fixed，非法值不触发分页', () => {
  expect(resolveFlowLayoutMode(undefined)).toBe('fixed')
  expect(resolveFlowLayoutMode('dynamic')).toBe('dynamic')
  expect(resolveFlowLayoutMode('unknown')).toBe('fixed')
})

it('四边内边距独立解析，负值和非有限值归零', () => {
  expect(resolveFlowPadding({
    flowPaddingTop: 2, flowPaddingRight: -1,
    flowPaddingBottom: Number.NaN, flowPaddingLeft: 4,
  })).toEqual({ top: 2, right: 0, bottom: 0, left: 4 })
  expect(flowContentWidthMm(100, { top: 2, right: 3, bottom: 2, left: 4 })).toBe(93)
  expect(flowContentWidthMm(5, { top: 0, right: 4, bottom: 0, left: 4 })).toBe(0)
})

it('工厂默认固定模式且四边内边距为零', () => {
  expect(createDefaultOptions('flowList')).toMatchObject({
    flowLayoutMode: 'fixed', flowPaddingTop: 0, flowPaddingRight: 0,
    flowPaddingBottom: 0, flowPaddingLeft: 0,
  })
})
```

- [x] **Step 2: 验证测试因缺少导出和字段而失败**

Run: `npm test -w @worm-vue3-print/core -- src/render/__tests__/flow-list.spec.ts src/designer/utils/__tests__/element-factory.spec.ts`
Expected: FAIL，提示新函数未导出或断言不成立。

- [x] **Step 3: 最小实现字段与解析函数**

```ts
export type FlowLayoutMode = 'fixed' | 'dynamic'
export interface FlowPadding { top: number; right: number; bottom: number; left: number }

export function resolveFlowLayoutMode(value: unknown): FlowLayoutMode {
  return value === 'dynamic' ? 'dynamic' : 'fixed'
}

export function resolveFlowPadding(o: Record<string, unknown>): FlowPadding {
  const read = (key: string) => {
    const value = o[key]
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  }
  return {
    top: read('flowPaddingTop'), right: read('flowPaddingRight'),
    bottom: read('flowPaddingBottom'), left: read('flowPaddingLeft'),
  }
}

export function flowContentWidthMm(width: number, padding: FlowPadding): number {
  return Math.max(0, width - padding.left - padding.right)
}
```

在 `ElementOptions` 增加同名可选字段，在工厂写入固定模式和四个零值；属性注册增加 `fl-layout-mode`、`fl-padding-top/right/bottom/left`，单位与中文说明和字段含义一致。

- [x] **Step 4: 回归纯逻辑与工厂测试**

Run: `npm test -w @worm-vue3-print/core -- src/render/__tests__/flow-list.spec.ts src/designer/utils/__tests__/element-factory.spec.ts src/designer/utils/__tests__/reset-default-factory.spec.ts`
Expected: PASS。

- [x] **Step 5: 主 agent 审查并提交**

```bash
git add packages/print-core/src/designer/types.ts packages/print-core/src/designer/utils/element-factory.ts packages/print-core/src/designer/utils/property-search.ts packages/print-core/src/render/flow-list.ts packages/print-core/src/render/__tests__/flow-list.spec.ts packages/print-core/src/designer/utils/__tests__/element-factory.spec.ts
git commit -m "feat: 添加流式列表动态布局配置"
```

---

### Task 2: 动态行绑定与真实高度测量

**Files:**
- Modify: `packages/print-core/src/render/types.ts`
- Modify: `packages/print-core/src/print/types.ts`
- Modify: `packages/print-core/src/render/data-binder.ts`
- Modify: `packages/print-core/src/render/html-generator.ts`
- Modify: `packages/print-core/src/browser/dom-executor.ts`
- Modify: `packages/print-core/src/print/measure.ts`
- Test: `packages/print-core/src/render/__tests__/flow-list-render.spec.ts`
- Test: `packages/print-core/src/print/__tests__/measure.spec.ts`
- Test: `packages/print-core/src/browser/__tests__/dom-executor.spec.ts`

**Interfaces:**
- Consumes: Task 1 的模式、内边距和 `layoutFlowList`。
- Produces: 动态元素 `options._flowRows: FlowRow[]`；`.print-flow-row[data-flow-row-index]`；`MeasuredElement.measuredFlowRowHeights?: number[]`。
- Preserves: `_flowItems`、表格 `measuredRowHeights`、固定模式现有 HTML。

- [x] **Step 1: 写动态绑定、DOM 标记和测量失败测试**

```ts
it('动态模式保留排布行，固定模式不写内部行结构', () => {
  const dynamic = bindData(template({
    flowLayoutMode: 'dynamic', formatter: '{name}', dataSource: 'drugs',
    flowColumns: 2, flowAutoSpan: true, flowMaxSpan: 2,
  }), drugs)
  expect(dynamic.elements[0]!.options._flowRows.length).toBeGreaterThan(1)
  const fixed = bindData(template({ formatter: '{name}', dataSource: 'drugs' }), drugs)
  expect(fixed.elements[0]!.options._flowRows).toBeUndefined()
})

it('动态测量趟逐行输出标记，容器不写死高度', () => {
  const html = render({ flowLayoutMode: 'dynamic', formatter: '{name}', dataSource: 'drugs' }, drugs)
  expect(html).toContain('class="print-flow-row"')
  expect(html).toContain('data-flow-row-index="0"')
  expect(elementDecls(html)).not.toContain('height:24mm')
})

it('动态列表的 rowHeightsPx 写入 measuredFlowRowHeights', () => {
  const map = normalizeMeasurements([{ id: 'f', heightPx: 114, rowHeightsPx: [38, 76] }], flowTemplate)
  expect(map.get('f')?.measuredFlowRowHeights).toEqual([38 / PX_PER_MM, 76 / PX_PER_MM])
  expect(map.get('f')?.measuredRowHeights).toBeUndefined()
})
```

DOM executor 测试构造一个含两个 `.print-flow-row` 的 `[data-measure-id]` 容器，断言 `rowHeightsPx` 按行序返回；既有表格选择器测试保持不变。

- [x] **Step 2: 验证新增测试失败**

Run: `npm test -w @worm-vue3-print/core -- src/render/__tests__/flow-list-render.spec.ts src/print/__tests__/measure.spec.ts src/browser/__tests__/dom-executor.spec.ts`
Expected: FAIL，动态行和 `measuredFlowRowHeights` 尚不存在。

- [x] **Step 3: 最小实现绑定与测量**

绑定时用扣除左右内边距的宽度调用现有排布函数：

```ts
const padding = resolveFlowPadding(el.options)
el.options._flowRows = layoutFlowList(items, {
  width: flowContentWidthMm(el.options.width ?? 0, padding),
  columns: resolveFlowColumns(el.options.flowColumns),
  gapX: resolveFlowGapX(el.options.flowGapX),
  fontSizePt: el.options.fontSize ?? 12,
  autoSpan: el.options.flowAutoSpan === true,
  maxSpan: resolveFlowMaxSpan(el.options.flowMaxSpan, el.options.flowColumns),
})
```

动态测量 HTML 每行使用 `display:grid;grid-template-columns:repeat(N,minmax(0,1fr));column-gap:Xmm;min-height:Ymm`，行内单元继续写 `grid-column:span`。容器写四边 `padding`、`height:auto`、`overflow:visible`；固定分支保留原扁平 CSS Grid。

`readMeasurements` 在没有表格时读取 `.print-flow-row[data-flow-row-index]`，返回同一个 `rowHeightsPx` 通道。`normalizeMeasurements` 仅对动态 `flowList` 写 `measuredFlowRowHeights`，表格仍写 `measuredRowHeights`。

- [x] **Step 4: 回归绑定、测量和既有固定输出**

Run: `npm test -w @worm-vue3-print/core -- src/render/__tests__/flow-list-render.spec.ts src/print/__tests__/measure.spec.ts src/browser/__tests__/dom-executor.spec.ts src/render/__tests__/flow-list.spec.ts`
Expected: PASS，既有固定模式用例不修改断言。

- [x] **Step 5: 主 agent 审查并提交**

```bash
git add packages/print-core/src/render/types.ts packages/print-core/src/print/types.ts packages/print-core/src/render/data-binder.ts packages/print-core/src/render/html-generator.ts packages/print-core/src/browser/dom-executor.ts packages/print-core/src/print/measure.ts packages/print-core/src/render/__tests__/flow-list-render.spec.ts packages/print-core/src/print/__tests__/measure.spec.ts packages/print-core/src/browser/__tests__/dom-executor.spec.ts
git commit -m "feat: 测量动态流式列表真实行高"
```

---

### Task 3: 动态列表分页切片与闭合容器

**Files:**
- Modify: `packages/print-core/src/render/types.ts`
- Modify: `packages/print-core/src/render/pagination-engine.ts`
- Modify: `packages/print-core/src/render/html-generator.ts`
- Create: `packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts`
- Test: `packages/print-core/src/render/pagination-engine.test.ts`
- Test: `packages/print-core/src/render/__tests__/flow-list-render.spec.ts`

**Interfaces:**
- Consumes: `_flowRows`、`measuredFlowRowHeights`。
- Produces: `PageSection.type='flow-list-slice'`、`startFlowRow?: number`、`endFlowRow?: number`。
- Produces: 每片 `.print-flowlist-slice` 独立容器；续片 `renderTop=0`。

- [x] **Step 1: 写分页区间、内边距预算和超高行失败测试**

构造 A4、上下页边距 10mm、列表 `top=260`、三行实测高度均为 8mm、上下内边距各 2mm 的模板。首片只能放一行，续页放余下两行：

```ts
expect(flowSlices(paginate(tpl, measured))).toEqual([
  { pageIndex: 0, startFlowRow: 0, endFlowRow: 1, renderTop: 260 },
  { pageIndex: 1, startFlowRow: 1, endFlowRow: 3, renderTop: 0 },
])
```

另写三组断言：
- 一行 300mm 超过整页时只有一片且 `pages.some(p => p.overflow)` 为真，不出现前置空页。
- 连续纸三行都在同一片，`endFlowRow=3`。
- `generateHtml` 的每个 `.print-flowlist-slice` 都有四边 padding、元素边框和本片对应文本，下一片不包含上一片文本。

- [x] **Step 2: 验证分页测试失败**

Run: `npm test -w @worm-vue3-print/core -- src/render/__tests__/flow-list-pagination.spec.ts`
Expected: FAIL，动态列表仍按普通元素整体分页。

- [x] **Step 3: 实现按行切片**

在分页主分派中，将动态 `flowList` 路由到 `paginateFlowList`，其记账方式与表格行切片一致，但不处理表头、小计或汇总：

```ts
const chromeVertical = padding.top + padding.bottom + borderTopMm + borderBottomMm
if (rowHeight + chromeVertical <= remaining()) {
  sliceUsed += rowHeight
  continue
}
if (rowIndex > sliceStart) pushFlowSlice(rowIndex)
finishPage()
sliceTop = 0
sliceUsed = rowHeight // 单行超高由现有 overflow 口径收口
```

边框毫米值从 `resolveElementBorder` 读取，pt 按 `25.4 / 72` 换算；上下分边分别计算。`pushFlowSlice` 写入半开区间并只对行高、内边距和边框记账一次。连续纸直接产生 `[0, rowCount)`。

- [x] **Step 4: 实现切片 HTML 并回归**

`renderSection` 对 `flow-list-slice` 调 `renderFlowListSlice`，从 `_flowRows.slice(startFlowRow, endFlowRow)` 生成行；外容器复用元素定位、边框、背景、文字样式与四边 padding，但不写固定 `height` 和 `overflow:hidden`。动态测量完整列表与最终切片共用行 HTML 助手，避免跨列输出分叉。

Run: `npm test -w @worm-vue3-print/core -- src/render/__tests__/flow-list-pagination.spec.ts src/render/__tests__/flow-list-render.spec.ts src/render/pagination-engine.test.ts src/render/pagination-engine.edge.test.ts src/render/pagination-engine.2d.test.ts`
Expected: PASS，表格测试无回归。

- [x] **Step 5: 主 agent 审查并提交**

```bash
git add packages/print-core/src/render/types.ts packages/print-core/src/render/pagination-engine.ts packages/print-core/src/render/html-generator.ts packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts packages/print-core/src/render/__tests__/flow-list-render.spec.ts
git commit -m "feat: 实现动态流式列表按行分页"
```

---

### Task 4: 泛化跟随区并承接列表末片

**Files:**
- Modify: `packages/print-core/src/render/pagination-engine.ts`
- Modify: `packages/print-core/src/render/html-generator.ts`
- Test: `packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts`
- Test: `packages/print-core/src/render/pagination-engine.test.ts`
- Test: `packages/print-core/src/render/html-generator.test.ts`

**Interfaces:**
- Consumes: Task 3 的列表切片和 `renderTop`。
- Produces: 动态列表与表格共用 `followElementIds`、`groupTop` 和 `flow-group`。
- Preserves: 对外已有 `tableDesignBottom`、`collectFollowMemberIds` 签名和表格输出。

- [x] **Step 1: 写列表跟随区失败测试**

创建两页动态列表，并在其设计底部下方放置同宽文本。分别用短跟随文本和小页高构造两种场景：

```ts
expect(lastSection).toMatchObject({
  type: 'flow-group', elementId: 'fl', followElementIds: ['after'],
})
expect(pages.flatMap(p => p.sections)
  .filter(s => s.type === 'flow-group' && s.elementId === 'fl')).toHaveLength(1)
```

第一组断言跟随文本位于末片容器之后；第二组断言跟随区整体移到新页且 `groupTop=0`。再断言中间页没有 `after`，无横向交集或设计上位于列表顶部的元素不进入跟随区。

- [x] **Step 2: 验证新跟随测试失败**

Run: `npm test -w @worm-vue3-print/core -- src/render/__tests__/flow-list-pagination.spec.ts`
Expected: FAIL，动态列表被当普通成员或跟随区未生成。

- [x] **Step 3: 泛化归属和末片处理**

在分页引擎内部增加 `isSplittableElement`：表格或动态 `flowList`。归属遍历时只把这两类作为跟随区锚点，普通动态列表不再被归入其他锚点。保留现有 `tableDesignBottom` 导出，新增内部 `splittableDesignBottom`：表格走原算法，动态列表使用画布回写高度和配置高度中的可靠值。

将 `applyFollowGroup` 的“最后一个 table-slice”判断扩展为同一锚点的 `table-slice` 或 `flow-list-slice`，生成 `flow-group` 时保留该末片的行区间和 `renderTop`。跟随高度、横向交集、显式编组排除和换页逻辑不得复制出新规则。

- [x] **Step 4: 泛化 group HTML 并跑表格回归**

`renderFlowGroup` 先按锚点类型渲染 `table-slice` 或 `flow-list-slice`，再渲染原 `.flow-follow`。动态列表末片必须使用切片自己的高度占位，后续成员相对偏移继续按现有公式计算。

Run: `npm test -w @worm-vue3-print/core -- src/render/__tests__/flow-list-pagination.spec.ts src/render/pagination-engine.test.ts src/render/html-generator.test.ts src/render/table-merge-pagination.test.ts`
Expected: PASS。

- [x] **Step 5: 主 agent 审查并提交**

```bash
git add packages/print-core/src/render/pagination-engine.ts packages/print-core/src/render/html-generator.ts packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts packages/print-core/src/render/html-generator.test.ts
git commit -m "feat: 动态流式列表支持下方跟随区"
```

---

### Task 5: Vue 3 设计器属性与动态高度

**Files:**
- Modify: `packages/print-canvas/src/components/elements/FlowListElement.vue`
- Modify: `packages/print-canvas/src/components/property/FlowListGroup.vue`
- Test: `packages/print-canvas/src/__tests__/FlowListElement.spec.ts`
- Test: `packages/print-canvas/src/__tests__/FlowListGroup.spec.ts`

**Interfaces:**
- Consumes: core `resolveFlowLayoutMode`、`resolveFlowPadding`。
- Produces: 固定高度／动态分页模式字段和动态模式四边内边距；动态模式回写 `options.height`。
- Preserves: 固定模式网格样式、设计态不预演跨列和演示数据。

- [x] **Step 1: 写属性联动与高度失败测试**

```ts
it('动态模式显示四边内边距，固定模式隐藏', async () => {
  const wrapper = mountGroup({ flowLayoutMode: 'dynamic' })
  expect(wrapper.text()).toContain('上内边距')
  expect(wrapper.text()).toContain('左内边距')
  await wrapper.find('[data-test="flow-layout-mode"]').setValue('fixed')
  expect(wrapper.text()).not.toContain('上内边距')
})

it('动态内容实测后回写毫米高度', async () => {
  const wrapper = mountFlowList({ flowLayoutMode: 'dynamic' }, { designMode: true })
  const root = wrapper.find('.print-flowlist')
  Object.defineProperty(root.element, 'offsetHeight', { configurable: true, value: 76 })
  await flushMeasurement()
  expect(wrapper.props('element').options.height).toBeCloseTo(76 / 3.7795275591, 1)
})
```

同时断言动态根样式含四边 padding、`height:auto`、`overflow:visible`，固定根仍为 `height:100%` 和 `overflow:hidden`。

- [x] **Step 2: 验证测试失败**

Run: `npm test -w @worm-vue3-print/canvas -- src/__tests__/FlowListElement.spec.ts src/__tests__/FlowListGroup.spec.ts`
Expected: FAIL，新模式字段和测量尚不存在。

- [x] **Step 3: 最小实现面板和画布测量**

属性组增加原生模式选择框，值为 `fixed/dynamic`；动态时显示四个 `StepperInput`，提交字段分别为 `flowPaddingTop/Right/Bottom/Left`。属性搜索 key 使用 Task 1 注册值。

`FlowListElement` 增加根 ref，动态样式写 `padding`、`height:auto`、`overflow:visible`。参照 `TableElement.vue` 的 `onMounted + watch + nextTick` 实测：根 `offsetHeight` 加父元素上下边框像素，再除以 `3.7795275591`，与模型差超过 `0.1mm` 才回写并保留两位小数。隐藏或零高度时不写，固定模式不启动测量。

- [x] **Step 4: 运行 Vue 类型检查与相关测试**

Run: `npm test -w @worm-vue3-print/canvas -- src/__tests__/FlowListElement.spec.ts src/__tests__/FlowListGroup.spec.ts src/__tests__/element-dblclick-expression.spec.ts`
Expected: PASS，`pretest` 的 `vue-tsc --noEmit` 也通过。

- [x] **Step 5: 主 agent 审查并提交**

```bash
git add packages/print-canvas/src/components/elements/FlowListElement.vue packages/print-canvas/src/components/property/FlowListGroup.vue packages/print-canvas/src/__tests__/FlowListElement.spec.ts packages/print-canvas/src/__tests__/FlowListGroup.spec.ts
git commit -m "feat: Vue 设计器支持动态流式列表"
```

---

### Task 6: 零框架设计器属性与动态高度

**Files:**
- Modify: `packages/print-common/src/shell/flow-list.ts`
- Modify: `packages/print-common/src/shell/elements.ts`
- Modify: `packages/print-common/src/shell/property-panel.ts`
- Modify: `packages/print-common/PARITY.md`
- Test: `packages/print-common/src/shell/__tests__/flow-list.spec.ts`

**Interfaces:**
- Consumes: 与 Task 5 相同的 core 解析函数和字段。
- Produces: 零框架外壳相同模式、内边距和高度自愈；不改变公开组件 API。

- [x] **Step 1: 写面板、样式和实测失败测试**

扩展现有 `flow-list.spec.ts`：切到动态模式后四个内边距字段可见，提交 `2/3/4/5` 后模型逐字段相等；固定模式字段隐藏。动态元素样式包含 `padding:2mm 3mm 4mm 5mm`、`height:auto`、`overflow:visible`，且不出现 `grid-column:span`。

参照表格测试，为动态列表挂载探针并 mock 根 `offsetHeight=76`，等待两帧后断言 `options.height≈20.1mm`；再次等待不重复触发 store 重绘。

- [x] **Step 2: 验证测试失败**

Run: `npm test -w @worm-vue3-print/common -- src/shell/__tests__/flow-list.spec.ts`
Expected: FAIL，模式属性与测量探针尚不存在。

- [x] **Step 3: 最小实现外壳能力**

`renderFlowListElement` 按模式生成与 Vue 外壳相同的根样式。属性台复用现有 `fieldHelp`、`stepper`、`switchField` 或原生 select 助手，字段 key 与 Vue 端一致。

参照 `shell/table.ts` 的 `measureProbe`：动态列表末尾插入注释探针，下一帧从父节点找到 `.print-flowlist`，读取内容高度和上下边框，量化到 `0.1mm` 后写回真实元素并 `store.emit(false)`。固定模式不插入探针；探针未连接或高度为零时直接返回。

- [x] **Step 4: 回归零框架测试并登记一致性**

Run: `npm test -w @worm-vue3-print/common -- src/shell/__tests__/flow-list.spec.ts src/shell/__tests__/property-panel-reset.spec.ts src/__tests__/expression-dblclick.spec.ts`
Expected: PASS。`PARITY.md` 的流式列表条目补充动态模式、四边内边距和高度自愈。

- [x] **Step 5: 主 agent 审查并提交**

```bash
git add packages/print-common/src/shell/flow-list.ts packages/print-common/src/shell/elements.ts packages/print-common/src/shell/property-panel.ts packages/print-common/PARITY.md packages/print-common/src/shell/__tests__/flow-list.spec.ts
git commit -m "feat: 零框架设计器支持动态流式列表"
```

---

### Task 7: Chromium 端到端分页与边框验证

**Files:**
- Create: `services/print-render/src/flow-list-dynamic.integration.test.ts`
- Test: `services/print-render/src/follow-region.integration.test.ts`

**Interfaces:**
- Consumes: core 完整 `prepareDocument` 和 `BrowserPool`。
- Produces: 固定纸多页、完整边框、跨列不拆行、跟随区和连续纸的真实浏览器回归。

- [x] **Step 1: 写真实 Chromium 管线回归测试**

构造 A4 动态列表：40 条数据、4 列、自动跨列上限 2、四边内边距 `2/3/4/5mm`、完整边框，列表下方放合计文本。通过现有运行时执行：

```ts
const prepared = await prepareDocument({ templateJson: tpl, printData: data }, runtime)
expect(prepared.pageCount).toBeGreaterThan(1)
const slices = prepared.pageLayouts.flatMap(p => p.sections)
  .filter(s => s.type === 'flow-list-slice')
expect(slices[0]).toMatchObject({ startFlowRow: 0 })
expect(slices.at(-1)?.endFlowRow).toBeGreaterThan(slices[0]?.endFlowRow ?? 0)
```

使用 `BrowserPool.acquire()` 加载 `prepared.html`，在 `page.evaluate` 中对每页 `.print-flowlist-slice` 读取 `getComputedStyle`：四个 border style 均为 `solid`、宽度均大于 0，四个 padding 与配置像素换算一致；每页行文本拼接后与原顺序完全一致且无重复。断言 `.flow-follow` 只出现一次并位于最后一个切片所在页。

连续纸用同一绑定数据断言只有一个列表切片。全程不断言截图，不生成或读取图片。

- [x] **Step 2: 运行真实管线并核对几何结果**

Run: `npm test -w @worm-vue3-print/render -- src/flow-list-dynamic.integration.test.ts`
Expected: PASS。若发现真实管线缺陷，先记录失败几何数据，再回到对应 core 文件做最小修复并补 core 单测，禁止只放宽集成断言。

- [x] **Step 3: 跑渲染服务完整回归**

Run: `npm test -w @worm-vue3-print/render`
Expected: PASS，包括既有 `follow-region.integration.test.ts`。

- [x] **Step 4: 主 agent 审查并提交**

```bash
git add services/print-render/src/flow-list-dynamic.integration.test.ts
git commit -m "test: 验证动态流式列表真实分页"
```

---

### Task 8: 文档同步与全量验收

**Files:**
- Modify: `docs/中文/指南/模板设计器.md`
- Modify: `docs/中文/CHANGELOG.md`
- Modify: `docs/en/CHANGELOG.en.md`
- Modify: `docs/en/Overview.md`
- Modify: `skills/print-template-json/references/template-schema.md`
- Modify: `docs/superpowers/specs/2026-10-22-flow-list-element-design.md`
- Modify: `docs/superpowers/specs/2026-11-03-dynamic-flow-list-design.md`

**Interfaces:**
- Consumes: 已实施的字段名、缺省值、分页和跟随行为。
- Produces: 中文用户文档、英文变更记录、模板技能 schema 与最终实施状态。

- [x] **Step 1: 更新文档并检查契约一致性**

中文指南的流式列表小节明确：默认固定高度；动态分页按行换页；四边内边距只在动态模式生效；每页边框闭合；下方跟随元素复用表格规则；块内暂只支持文本。`docs/en/Overview.md` 增加对应的英文功能说明，中英 CHANGELOG 使用同一事实，不宣称支持图片或任意嵌套。

schema 增加 `flowLayoutMode` 和四个 `flowPadding*` 字段、单位、缺省值与适用条件。旧规格添加指向新规格的兼容扩展说明，新规格状态改为已实施并记录验证结果。

- [x] **Step 2: 审查最终差异和敏感边界**

```bash
git diff --check
git diff --stat
git status --short
npm run lint:print-architecture
```

主 agent 逐文件确认：没有修改用户已有工作区文件，没有新增 UI 依赖，没有 SDK → canvas 反向依赖，没有改变 fixed 默认，没有付费模型调用。

- [x] **Step 3: 全量测试与构建**

```bash
npm test
npm run test -w @worm-vue3-print/render
npm run build
```

Expected: 全部 PASS。若失败，区分本功能回归与用户既有改动导致的问题；本功能问题必须修复后重跑，非本功能问题保留现场并如实报告，不能声称全量通过。

- [x] **Step 4: 提交文档和最终验收记录**

```bash
git add docs/中文/指南/模板设计器.md docs/中文/CHANGELOG.md docs/en/CHANGELOG.en.md docs/en/Overview.md skills/print-template-json/references/template-schema.md docs/superpowers/specs/2026-10-22-flow-list-element-design.md docs/superpowers/specs/2026-11-03-dynamic-flow-list-design.md
git commit -m "docs: 记录动态流式列表容器能力"
```
