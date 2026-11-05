# 自由画布元素四向外边距 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有绝对定位元素增加兼容的四向外边距，保留自由拖拽与重叠，并让画布、交互、分页和三端出纸使用同一几何口径。

**Architecture:** 保留 `left/top/width/height` 和绝对定位，以原生 CSS margin 偏移实际边框盒；core 新增纯几何模块统一计算外边距盒 `M` 与实际边框盒 `B`。交互按 `M` 对齐和吸附，可见重叠按 `B` 判定，分页按 `M` 记账，旋转按偏移后的 `B` 求外接盒。

**Tech Stack:** TypeScript、Vue 3、Custom Elements、Vitest、Playwright、Chromium、pdfjs、npm workspaces。

**Spec:** `docs/superpowers/specs/2026-11-05-element-outer-margins-design.md`

## Global Constraints

- 全程使用简体中文；代码标识符、命令和报错原文可保留英文。
- 在 `master` 直接开发，不创建工作树；每次写入使用 UTF-8 无 BOM，单次写入不超过 500 行。
- 不引入 `position:relative` 文档流，不新增 `layoutMode`，不实现自动推挤、约束图或重叠阻断。
- 四字段为 `marginTop/marginRight/marginBottom/marginLeft`，单位 mm，缺省零，允许任意有限负数。
- `left/top` 是外边距盒坐标，`width/height` 是不含外边距的实际边框盒尺寸。
- 未配置新字段时，不出新 CSS 声明，既有分页 section、页数、告警和 HTML 必须保持不变。
- 当前 `types.ts`、`pagination-engine.ts`、分页/render 测试和模板 schema 已有未提交的每页重复改动。提交本计划任务时必须用 `git add -p` 仅暂存外边距 hunks，并在提交前审查 `git diff --cached`；不得把既有 hunks、`.cache/`、`.workbuddy/` 或其他计划文件带入。
- 功能任务先写失败测试，再写最小实现；Task 7 是这些 RED 场景的端到端验收，可在功能完成后直接通过。不得删除或放宽既有断言，涉及渲染管线时运行 render 工作区测试。
- 不读取或判认图片；真实验收使用 DOM、计算样式、PDF 文本坐标与页尺寸。

## 文件结构

- `render/element-margin.ts`：四边距归一化、CSS 声明、`B/M` 纯几何。
- `designer/types.ts`、`utils/migrate.ts`、`utils/property-search.ts`：公开字段、单位迁移和属性注册。
- `print-contract`：由 `OPTION_META` 驱动的新字段校验。
- `print-canvas`、`print-common`：根元素样式、属性输入、拖拽吸附和对齐。
- `render/html-generator.ts`、`render/css-builder.ts`：同构出纸定位。
- `render/pagination-engine.ts`：普通元素、编组、旋转、切片、重复区和跟随区结算。
- `browser/dom-executor.ts`：连续纸底边的外边距补算。
- `services/print-render`：真实 PDF 几何验收。

---

### Task 1: core 外边距契约、纯几何与单位迁移

**Files:**
- Create: `packages/print-core/src/render/element-margin.ts`
- Create: `packages/print-core/src/render/element-margin.test.ts`
- Modify: `packages/print-core/src/designer/types.ts`
- Modify: `packages/print-core/src/designer/index.ts`
- Modify: `packages/print-core/src/designer/utils/migrate.ts`
- Test: `packages/print-core/src/designer/utils/__tests__/migrate.spec.ts`
- Modify: `packages/print-core/src/designer/utils/property-search.ts`
- Modify: `packages/print-contract/src/option-meta.ts`
- Test: `packages/print-contract/src/__tests__/option-meta.test.ts`
- Test: `packages/print-contract/src/__tests__/validate.test.ts`

**Interfaces:**
- Produces: `ElementMarginOptions`、`ElementMargins`、`ElementBox`、`ElementLayoutBoxes`。
- Produces: `resolveElementMargins(options?: ElementMarginOptions | null): ElementMargins`。
- Produces: `elementMarginCss(options?: ElementMarginOptions | null): string`，顺序 top/right/bottom/left，无尾分号，全零返回 `''`。
- Produces: `resolveElementBoxes(input?: ElementBoxInput, effectiveHeight?: number): ElementLayoutBoxes`，返回 `{ border, margin }`。
- Produces: `ElementOptions.marginTop/marginRight/marginBottom/marginLeft?: number`。

- [ ] **Step 1: 写几何、迁移和契约失败测试**

```ts
it('正边距分别得到实际边框盒和外边距盒', () => {
  const { border, margin } = resolveElementBoxes({
    left: 10, top: 20, width: 40, height: 8,
    marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4,
  })
  expect(border).toEqual({ left: 14, top: 21, right: 54, bottom: 29, width: 40, height: 8 })
  expect(margin).toEqual({ left: 10, top: 20, right: 56, bottom: 32, width: 46, height: 12 })
})

it('缺省不输出声明，负值保留，极端负值只钳占用跨度', () => {
  expect(elementMarginCss({})).toBe('')
  expect(elementMarginCss({ marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4 }))
    .toBe('margin-top:1mm;margin-right:2mm;margin-bottom:3mm;margin-left:4mm')
  expect(resolveElementMargins({ marginLeft: -5, marginTop: Number.NaN }))
    .toEqual({ top: 0, right: 0, bottom: 0, left: -5 })
  expect(resolveElementBoxes({ left: 10, top: 0, width: 40, height: 8, marginLeft: -50, marginRight: -10 }).margin.width).toBe(0)
})

it('旧 pt 模板换算四边距，mm 模板幂等', () => {
  const tpl = { elements: [{ id: 'e', options: {
    left: 72, top: 72, width: 72, height: 72,
    marginTop: 36, marginRight: -36, marginBottom: 72, marginLeft: 18,
  } }] } as any
  const out = normalizeTemplateUnits(tpl)
  expect(out.elements[0].options).toMatchObject({
    marginTop: 12.7, marginRight: -12.7, marginBottom: 25.4, marginLeft: 6.35,
  })
  expect(normalizeTemplateUnits(out)).toEqual(out)
})
```

在 `validate.test.ts` 增加一个含四个合法负/正边距的模板并断言 `ok === true`；再把 `marginTop: Number.POSITIVE_INFINITY` 的输入断言为 `error`，路径为 `elements[0].options.marginTop`。

- [ ] **Step 2: 验证测试因函数和字段不存在而失败**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/element-margin.test.ts src/designer/utils/__tests__/migrate.spec.ts && npm test -w @worm-vue3-print/contract -- --run src/__tests__/option-meta.test.ts src/__tests__/validate.test.ts`
Expected: FAIL，提示 `element-margin.js` 不存在、四字段断言不成立；不能是测试夹具语法错误。

- [ ] **Step 3: 实现最小纯几何和契约登记**

```ts
export interface ElementMarginOptions {
  marginTop?: unknown
  marginRight?: unknown
  marginBottom?: unknown
  marginLeft?: unknown
}
export interface ElementMargins { top: number; right: number; bottom: number; left: number }
export interface ElementBox { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface ElementBoxInput extends ElementMarginOptions { left?: number; top?: number; width?: number; height?: number }
export interface ElementLayoutBoxes { border: ElementBox; margin: ElementBox }

const finite = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? v : 0
export function resolveElementMargins(o?: ElementMarginOptions | null): ElementMargins {
  const v = o ?? {}
  return { top: finite(v.marginTop), right: finite(v.marginRight), bottom: finite(v.marginBottom), left: finite(v.marginLeft) }
}
export function elementMarginCss(o?: ElementMarginOptions | null): string {
  const m = resolveElementMargins(o)
  return (['top', 'right', 'bottom', 'left'] as const)
    .filter(k => m[k] !== 0).map(k => `margin-${k}:${m[k]}mm`).join(';')
}
export function resolveElementBoxes(i: ElementBoxInput = {}, effectiveHeight = i.height ?? 0): ElementLayoutBoxes {
  const m = resolveElementMargins(i)
  const L = i.left ?? 0, T = i.top ?? 0, W = i.width ?? 100, H = effectiveHeight
  const border = { left: L + m.left, top: T + m.top, right: L + m.left + W, bottom: T + m.top + H, width: W, height: H }
  const margin = { left: L, top: T, right: L + m.left + W + m.right, bottom: T + m.top + H + m.bottom,
    width: Math.max(0, m.left + W + m.right), height: Math.max(0, m.top + H + m.bottom) }
  return { border, margin }
}
```

把四字段加入 `ElementOptions` 与 `PT_KEYS`，在 `/designer` 导出模块，在 `OPTION_META` 的 mm 组登记四字段，并在位置分组注册 `ps-margin-top/right/bottom/left`，关键词包含“外边距”和对应英文键，`default: 0`、`defaultUnit: 'mm'`。

- [ ] **Step 4: 运行定向测试与类型检查**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/element-margin.test.ts src/designer/utils/__tests__/migrate.spec.ts && npm test -w @worm-vue3-print/contract -- --run src/__tests__/option-meta.test.ts src/__tests__/validate.test.ts && npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/contract`
Expected: PASS；`OPTION_META` 全键映射无类型漂移。

- [ ] **Step 5: 按 hunk 提交**

```bash
git add -- packages/print-core/src/render/element-margin.ts packages/print-core/src/render/element-margin.test.ts
git add -p -- packages/print-core/src/designer/types.ts packages/print-core/src/designer/index.ts packages/print-core/src/designer/utils/migrate.ts packages/print-core/src/designer/utils/__tests__/migrate.spec.ts packages/print-core/src/designer/utils/property-search.ts packages/print-contract/src/option-meta.ts packages/print-contract/src/__tests__/option-meta.test.ts packages/print-contract/src/__tests__/validate.test.ts
git diff --cached --check
git commit -m "feat(core): 增加元素四向外边距几何契约"
```

---

### Task 2: 两套设计器根元素样式与四输入框

**Files:**
- Modify: `packages/print-canvas/src/components/elements/BaseElement.vue`
- Modify: `packages/print-canvas/src/components/property/PositionSizeGroup.vue`
- Create: `packages/print-canvas/src/__tests__/element-margin.spec.ts`
- Modify: `packages/print-common/src/shell/elements.ts`
- Modify: `packages/print-common/src/shell/property-panel.ts`
- Create: `packages/print-common/src/shell/__tests__/element-margin.spec.ts`
- Test: `packages/print-common/src/shell/__tests__/property-search.spec.ts`
- Test: `packages/print-common/src/shell/__tests__/property-panel-reset.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `resolveElementMargins` 与 `ps-margin-*` 注册键。
- Produces: 两套设计器一致的 `marginTop/marginRight/marginBottom/marginLeft` 根样式和可重置属性输入。

- [ ] **Step 1: 写样式、负值和属性面板失败测试**

```ts
const makeEl = (options: Partial<RuntimeElement['options']>): RuntimeElement => ({
  id: 'e', options: { left: 10, top: 20, width: 40, height: 8, ...options },
  printElementType: { type: 'text', title: '文本' },
})

it('根元素只偏移边框盒，不改 left/top/width/height', () => {
  const style = elementStyle(makeEl({
    left: 10, top: 20, width: 40, height: 8,
    marginTop: 2, marginRight: 3, marginBottom: 4, marginLeft: 5,
  }))
  expect(style).toMatchObject({
    position: 'absolute', left: '10mm', top: '20mm', width: '40mm', height: '8mm',
    marginTop: '2mm', marginRight: '3mm', marginBottom: '4mm', marginLeft: '5mm',
  })
  expect(elementStyle(makeEl({ left: 10, top: 20, width: 40, height: 8 }))).not.toHaveProperty('marginTop')
})
```

canvas 挂载 `BaseElement` 后断言同样的四条内联样式；属性面板搜索“外边距”只显示 `ps-margin-*` 四项。对 `marginTop` 点恢复默认后断言字段为 `undefined`，对 `marginLeft:-3` 的输入断言原样保留。

- [ ] **Step 2: 验证测试失败**

Run: `npm test -w @worm-vue3-print/canvas -- --run src/__tests__/element-margin.spec.ts && npm test -w @worm-vue3-print/common -- --run src/shell/__tests__/element-margin.spec.ts src/shell/__tests__/property-search.spec.ts src/shell/__tests__/property-panel-reset.spec.ts`
Expected: FAIL，根样式缺少 margin，属性项不存在。

- [ ] **Step 3: 实现同源样式和四向输入**

两套 `elementStyle` 都先取 `const margin = resolveElementMargins(o)`，仅对非零边追加样式，零值不产生键：

```ts
const marginStyle = {
  ...(margin.top !== 0 ? { marginTop: `${margin.top}mm` } : {}),
  ...(margin.right !== 0 ? { marginRight: `${margin.right}mm` } : {}),
  ...(margin.bottom !== 0 ? { marginBottom: `${margin.bottom}mm` } : {}),
  ...(margin.left !== 0 ? { marginLeft: `${margin.left}mm` } : {}),
}
// 展开到既有 position/left/top/width/height 后，旋转声明前
```

canvas 在现有 `position-grid` 后增加“外边距 (mm)”四输入框，`v-model` 分别绑定四个可选字段，不设置 `min`。common 用 `numField` 同序创建四项，`onCommit` 以 `v === 0 ? undefined : v` 写回，并各挂 `reset('marginTop', 'ps-margin-top')` 等重置按钮。X/Y/W/H 提示分别补“外边距盒坐标”和“不含外边距”。

- [ ] **Step 4: 运行两套设计器定向测试**

Run: `npm test -w @worm-vue3-print/canvas -- --run src/__tests__/element-margin.spec.ts src/__tests__/PropertyResetGroups.spec.ts && npm test -w @worm-vue3-print/common -- --run src/shell/__tests__/element-margin.spec.ts src/shell/__tests__/property-search.spec.ts src/shell/__tests__/property-panel-reset.spec.ts`
Expected: PASS；缺省样式无新增键，负边距和重置均通过。

- [ ] **Step 5: 提交**

```bash
git add -- packages/print-canvas/src/components/elements/BaseElement.vue packages/print-canvas/src/components/property/PositionSizeGroup.vue packages/print-canvas/src/__tests__/element-margin.spec.ts packages/print-common/src/shell/elements.ts packages/print-common/src/shell/property-panel.ts packages/print-common/src/shell/__tests__/element-margin.spec.ts packages/print-common/src/shell/__tests__/property-search.spec.ts packages/print-common/src/shell/__tests__/property-panel-reset.spec.ts
git diff --cached --check
git commit -m "feat(canvas): 增加元素外边距样式与属性输入"
```

---

### Task 3: 按外边距盒完成对齐、分布与拖拽吸附

**Files:**
- Modify: `packages/print-core/src/designer/interactions/useAlign.ts`
- Test: `packages/print-core/src/designer/interactions/__tests__/useAlign.spec.ts`
- Modify: `packages/print-canvas/src/components/elements/BaseElement.vue`
- Modify: `packages/print-canvas/src/composables/useAdsorbManager.ts`
- Test: `packages/print-canvas/src/__tests__/element-margin.spec.ts`
- Test: `packages/print-canvas/src/__tests__/useDrag.spec.ts`
- Modify: `packages/print-common/src/print-designer.ts`
- Test: `packages/print-common/src/__tests__/adsorb-drag.spec.ts`

**Interfaces:**
- Consumes: `resolveElementBoxes(...).margin`。
- Produces: `useAlign` 对所有模式按 `M` 计算；吸附管理器输入/输出仍为 `ElementRect(left,top,width,height)`，其中宽高为 `M.width/M.height`。

- [ ] **Step 1: 写对齐与吸附失败测试**

```ts
it('右对齐按外边距盒右缘，不回写或压缩边距', () => {
  const a = makeEl('a', 10, 0, 40, 20)
  a.options.marginLeft = 2; a.options.marginRight = 3 // M.width=45
  const b = makeEl('b', 80, 0, 50, 20)
  b.options.marginLeft = 4; b.options.marginRight = 1 // M.right=135, M.width=55
  useAlign().align([a, b], 'right')
  expect(a.options.left).toBe(90)
  expect(b.options.left).toBe(80)
  expect(a.options).toMatchObject({ marginLeft: 2, marginRight: 3, width: 40 })
})

it('拖拽吸附把其他元素外边距盒作为候选，返回值仍直接写 left/top', () => {
  const moving = { id: 'a', left: 20.5, top: 0, width: 20, height: 10 }
  const other = makeEl('b', 20, 0, 40, 10)
  other.options.marginLeft = 2; other.options.marginRight = 3 // M.width=45
  const { requestAdsorb } = useAdsorbManager({
    getElements: () => [other], getPaperSize: () => ({ width: 200, height: 200 }),
    config: { adsorbMin: 1, showAdsorbLine: false },
  })
  expect(requestAdsorb(moving).left).toBe(20)
})
```

补一个根元素带 `marginLeft:5mm; marginTop:4mm` 的拖拽回归：从 `(10,20)` 拖到 `(30,40)` 后只写 `left=30/top=40`，两个 margin 不变，不出现二次 `+5/+4`。

- [ ] **Step 2: 验证旧对齐和吸附断言失败**

Run: `npm test -w @worm-vue3-print/core -- --run src/designer/interactions/__tests__/useAlign.spec.ts && npm test -w @worm-vue3-print/canvas -- --run src/__tests__/element-margin.spec.ts src/__tests__/useDrag.spec.ts && npm test -w @worm-vue3-print/common -- --run src/__tests__/adsorb-drag.spec.ts`
Expected: 新增用例 FAIL，原无边距用例保持通过。

- [ ] **Step 3: 用 M 替换交互几何输入**

`useAlign` 开始时构造平行数组，后续所有 bounds、排序、总跨度和间隙只读 `boxes[i].margin`，写回只改 `options.left/top`：

```ts
const boxes = elements.map(e => resolveElementBoxes(e.options).margin)
const bounds = {
  minLeft: Math.min(...boxes.map(b => b.left)),
  maxRight: Math.max(...boxes.map(b => b.right)),
  minTop: Math.min(...boxes.map(b => b.top)),
  maxBottom: Math.max(...boxes.map(b => b.bottom)),
}
// right: elements.forEach((e, i) => { e.options.left = bounds.maxRight - boxes[i].width })
// distributeHor: totalW = boxes.reduce((s, b) => s + b.width, 0)，x 步进同样加 boxes[i].width
```

canvas `onAdsorb` 用当前元素的 `M.width/M.height` 构造 moving rect；`useAdsorbManager` 将每个候选元素映射为 `M`。common `print-designer.ts` 的 moving/others 两处映射做同样替换。不要把 `B.left/B.top` 写入 `left/top`，避免拖拽回写双重偏移。

- [ ] **Step 4: 跑交互回归**

Run: `npm test -w @worm-vue3-print/core -- --run src/designer/interactions/__tests__/useAlign.spec.ts && npm test -w @worm-vue3-print/canvas -- --run src/__tests__/element-margin.spec.ts src/__tests__/useAdsorb.spec.ts src/__tests__/useDrag.spec.ts && npm test -w @worm-vue3-print/common -- --run src/__tests__/adsorb-drag.spec.ts src/__tests__/store.spec.ts`
Expected: PASS；复制、编组移动、键盘移动和既有无边距对齐结果不变。

- [ ] **Step 5: 提交**

```bash
git add -- packages/print-core/src/designer/interactions/useAlign.ts packages/print-core/src/designer/interactions/__tests__/useAlign.spec.ts packages/print-canvas/src/components/elements/BaseElement.vue packages/print-canvas/src/composables/useAdsorbManager.ts packages/print-canvas/src/__tests__/element-margin.spec.ts packages/print-canvas/src/__tests__/useDrag.spec.ts packages/print-common/src/print-designer.ts packages/print-common/src/__tests__/adsorb-drag.spec.ts
git diff --cached --check
git commit -m "feat(designer): 按外边距盒对齐和吸附"
```

---

### Task 4: 同构 HTML 定位与连续纸底边探针

**Files:**
- Modify: `packages/print-core/src/render/css-builder.ts`
- Modify: `packages/print-core/src/render/html-generator.ts`
- Test: `packages/print-core/src/render/html-generator.test.ts`
- Modify: `packages/print-core/src/browser/dom-executor.ts`
- Test: `packages/print-core/src/browser/__tests__/dom-executor.spec.ts`

**Interfaces:**
- Consumes: `elementMarginCss`、`resolveElementMargins`。
- Produces: `elementPositionStyle(left, top, width, height?, zIndex?, margins?: ElementMarginOptions)`；第六个可选参数不改既有五参调用。
- Produces: 普通元素、区域元素、独立表格/动态列表切片的根样式；`flow-group` 留到 Task 6 处理。
- Produces: `readContentBottom(doc)` 对 `.print-element` 根盒补自身下外边距。

- [ ] **Step 1: 写 HTML 字节兼容与连续纸失败测试**

```ts
it('普通元素输出四边距，缺省模板 HTML 不含新声明', () => {
  const sections = pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 0 }])
  const t = makeTemplate({ left: 2, top: 17, width: 80, marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4 })
  const html = generateHtml(t, sections)
  expect(html).toContain('position:absolute;left:2mm;top:17mm;width:80mm;')
  expect(html).toContain('margin-top:1mm;margin-right:2mm;margin-bottom:3mm;margin-left:4mm')
  const legacy = generateHtml(makeTemplate({ left: 2, top: 17, width: 80 }), sections)
  expect(legacy).not.toMatch(/margin-(top|right|bottom|left):/)
})

it('连续纸底边只补元素根盒 marginBottom', () => {
  document.body.innerHTML = `<section class="print-page"><div class="content-area">
    <div id="root" class="print-element" style="margin-bottom:7px"><div id="child" style="margin-bottom:20px"></div></div>
  </div></section>`
  const page = document.querySelector('.print-page') as HTMLElement
  const root = document.querySelector('#root') as HTMLElement
  const child = document.querySelector('#child') as HTMLElement
  Object.defineProperty(page, 'getBoundingClientRect', { value: () => ({ top: 10, bottom: 200 }) })
  Object.defineProperty(root, 'getBoundingClientRect', { value: () => ({ top: 100, bottom: 130, height: 30 }) })
  Object.defineProperty(child, 'getBoundingClientRect', { value: () => ({ top: 100, bottom: 120, height: 20 }) })
  // 根盒 130-10+7=127；若错误给 child 也补 20，会得到 130。
  expect(readContentBottom(document)).toBe(127)
})
```

连续纸测试用 `Object.defineProperty` 分别 stub page、area、根元素和内部子节点的 `getBoundingClientRect`；根节点设置 `class=print-element` 与 `margin-bottom:7px`，子节点设置更大的 `margin-bottom:20px`，证明只对根盒补一次。

- [ ] **Step 2: 验证定位与探针失败**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/html-generator.test.ts src/browser/__tests__/dom-executor.spec.ts`
Expected: 新增 margin 声明与 `127` 底边断言 FAIL；既有 HTML 用例不因签名扩展失败。

- [ ] **Step 3: 实现可选定位参数和根盒补算**

```ts
export function elementPositionStyle(
  left: number, top: number, width: number, height?: number,
  zIndex?: number, margins?: ElementMarginOptions,
): string {
  const parts = [`position:absolute`, `left:${mm(left)}`, `top:${mm(top)}`, `width:${mm(width)}`]
  if (height !== undefined && height > 0) parts.push(`height:${mm(height)}`)
  if (zIndex !== undefined) parts.push(`z-index:${zIndex}`)
  const margin = elementMarginCss(margins)
  if (margin) parts.push(margin)
  return parts.join(';') + ';'
}
```

把 `renderElement`、表格切片和动态列表独立切片的最后一个实参改为 `opts.zIndex, opts`，保持旧调用逐字输出。`readContentBottom` 保留现有后代可视底边扫描，再单独遍历 `.print-element`：

```ts
// 通用后代扫描先跳过 .print-element，根盒统一在下一循环结算，负 marginBottom 才能缩小纸高。
area.querySelectorAll<HTMLElement>('.print-element').forEach(node => {
  const rect = node.getBoundingClientRect()
  const marginBottom = Number.parseFloat(doc.defaultView?.getComputedStyle(node).marginBottom ?? '0') || 0
  if (rect.height > 0) maxBottom = Math.max(maxBottom, rect.bottom - pageTop + marginBottom)
})
```

现有通用后代扫描遇到 `.print-element` 时跳过，根盒统一在上一段循环中加自身 `marginBottom`；其他内部后代仍保留可视底边扫描。不给所有后代补 margin，不把 margin 混入 `readMeasurements` 的元素/行高。

- [ ] **Step 4: 跑 HTML、浏览器执行器和连续纸回归**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/html-generator.test.ts src/browser/__tests__/dom-executor.spec.ts src/render/__tests__/continuous-paper.test.ts && npm run build -w @worm-vue3-print/core`
Expected: PASS；存量 HTML 快照/字符串断言不新增 margin。

- [ ] **Step 5: 提交**

```bash
git add -- packages/print-core/src/render/css-builder.ts packages/print-core/src/render/html-generator.ts packages/print-core/src/render/html-generator.test.ts packages/print-core/src/browser/dom-executor.ts packages/print-core/src/browser/__tests__/dom-executor.spec.ts
git diff --cached --check
git commit -m "feat(core): 出纸管线输出元素外边距"
```

---

### Task 5: 普通元素、编组、旋转与每页重复区分页结算

**Files:**
- Modify: `packages/print-core/src/render/pagination-engine.ts`
- Test: `packages/print-core/src/render/pagination-engine.test.ts`
- Test: `packages/print-core/src/render/pagination-engine.2d.test.ts`
- Test: `packages/print-core/src/render/pagination-rotation.test.ts`

**Interfaces:**
- Consumes: `resolveElementBoxes` 与 `resolveElementMargins`。
- Produces: 内部 `Settlement = { height, shift, top, rot, outerTop, outerBottom, outerHeight }`。
- Produces: `marginXRange(el)` 用于预算，`borderXRange(el)` 用于可见重叠；vline 保留既有中心线半宽与 `0.05mm` 余量。
- Produces: 首页设计坐标不变、续页光标包含上下外边距的普通/编组/旋转分页。

- [ ] **Step 1: 写跨页、重叠聚类和重复区失败测试**

```ts
it('续页光标保留上下外边距，首页坐标不自动推挤', () => {
  const tpl = customPaper(100, 100, [
    el('a', 'text', 0, 0, 100, 60, { marginTop: 5, marginBottom: 5 }),
    el('b', 'text', 0, 70, 100, 10, { marginTop: 2, marginBottom: 3 }),
  ])
  const pages = paginate(tpl, heightMap([['a', 60], ['b', 10]]))
  expect(pages).toHaveLength(2)
  expect(pages[0].sections[0]).toMatchObject({ elementId: 'a', renderTop: 0 })
  expect(pages[1].sections[0]).toMatchObject({ elementId: 'b', renderTop: 0 })
  // b 的 CSS border top 为 2mm，分页占用为 2+10+3=15mm。
})

it('外边距盒相交但边框盒分离时不组成隐式重叠单元', () => {
  const tpl = customPaper(100, 100, [
    el('a', 'text', 0, 0, 100, 60, { marginBottom: 10 }),
    el('b', 'text', 0, 65, 100, 20),
  ])
  expect(paginate(tpl, heightMap([['a', 60], ['b', 20]]))).toHaveLength(2)
})

it('每页重复区底边包含旋转后底边和 marginBottom', () => {
  const fixed = freeEl('fixed', 10, 20, { fixed: true, marginTop: 2, marginBottom: 3 })
  const body = freeEl('body', 0, 10)
  const pages = paginate(makeFreeTemplate([fixed, body]), measureFree([['fixed', 20], ['body', 10]]))
  expect(pages[0].sections.find(s => s.elementId === 'body')!.renderTop).toBe(35)
})
```

旋转用例把旋转元素挤到第二页，先由 `B=getRotatedAabb` 的输入盒 `{ left, top + marginTop, width, height }` 求 `A`，再断言 `renderTop === B.top - A.top`；另测 `marginBottom` 增大后下一同列元素的页内落点或页数同步变化。

- [ ] **Step 2: 验证旧分页失败且既有基线不失效**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/pagination-engine.test.ts src/render/pagination-engine.2d.test.ts src/render/pagination-rotation.test.ts`
Expected: 新增用例 FAIL；记录当前每页重复未提交改动的测试仍按现语义运行，不回退其断言。

- [ ] **Step 3: 实现统一 Settlement 与双区间**

```ts
const settle = rotatedSettlement(el, measured)
// B 来自 resolveElementBoxes；无旋转时 A=B。
// height=A.height；top=A.top；shift=B.top-A.top。
// outerTop=A.top-m.top；outerBottom=A.top+A.height+m.bottom；
// outerHeight=Math.max(0, m.top+A.height+m.bottom)。
```

普通元素用 `settle.outerHeight` 做 `remainingIn`、`keepWithNext` 和 `occupy`；`noteOverflow` 使用 `settle.outerBottom + (renderTop - designTop)`。`renderTop` 公式仍是首页 `T`、续页 `pageCursor + shift`，不预加 `marginTop`。

`repeatBottom` 改为所有重复元素 `settle.outerBottom` 的最大非负值。显式/隐式单元以成员最小 `outerTop` 和最大 `outerBottom` 计算整体平移及占用，成员 `renderTop` 仍从各自原始 `T` 加同一 offset。

预算横向区间取 `M`；隐式重叠扫描取 `B`，不能复用同一 `xRange`。vline 以 `left-halfW`、宽 `2*halfW` 构造几何输入，保持旧中心线口径。真实左右裁切告警使用偏移后的 `B/A`，透明外边距不伪报油墨裁切。

- [ ] **Step 4: 跑 core 分页与几何告警回归**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/pagination-engine.test.ts src/render/pagination-engine.2d.test.ts src/render/pagination-rotation.test.ts src/print/__tests__/geometry-warnings.spec.ts`
Expected: PASS；所有未配置外边距的既有 section 和 warning 断言不变。

- [ ] **Step 5: 按 hunk 提交**

```bash
git add -p -- packages/print-core/src/render/pagination-engine.ts packages/print-core/src/render/pagination-engine.test.ts
git add -- packages/print-core/src/render/pagination-engine.2d.test.ts packages/print-core/src/render/pagination-rotation.test.ts
git diff --cached --check
git commit -m "feat(core): 分页结算纳入元素外边距"
```

---

### Task 6: 表格、动态列表与跟随区的外边距闭环

**Files:**
- Modify: `packages/print-core/src/render/pagination-engine.ts`
- Modify: `packages/print-core/src/render/html-generator.ts`
- Test: `packages/print-core/src/render/pagination-engine.test.ts`
- Test: `packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts`
- Test: `packages/print-core/src/render/html-generator.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `Settlement`、双横向区间和外边距占位公式。
- Produces: 表格/动态列表每片 `chromeVertical = marginTop + marginBottom + 既有内边距边框开销`。
- Produces: `tableDesignBottom/splittableDesignBottom` 返回含 `marginTop` 的实际边框底边，不含 `marginBottom`。
- Produces: `flow-group` 锚点切片与跟随成员分别消费自身 margin，组容器不重复消费锚点 margin。

- [ ] **Step 1: 写切片容量和跟随区双重偏移失败测试**

```ts
it('12 行表格每片扣除上下外边距和重复表头', () => {
  const table = makeTable(12, 1)
  table.options = { ...table.options, marginTop: 30, marginBottom: 20 }
  const pages = paginate(makeFreeTemplate([table]), measure(Array(12).fill(50), 1))
  // A4 预算 275；12×50，重复表头 50，marginTop=30、marginBottom=20。
  // 首页 4 行；续页各 3 行，区间必须为 [0,4)/[4,7)/[7,10)/[10,12)。
  expect(pages.map(p => p.sections.filter(s => s.elementId === 'tbl-1')
    .map(s => [s.startRow, s.endRow]))).toEqual([
      [[0, 4]], [[4, 7]], [[7, 10]], [[10, 12]],
    ])
})

it('跟随组不重复套锚点边距，成员坐标和高度包含自身边距', () => {
  const t = makeTemplate({ ...flowGroupOptions(), left: 10, top: 20, width: 100, height: 30,
    marginTop: 3, marginBottom: 4, marginLeft: 2 })
  t.elements.push({ id: 'follow-1', type: 'text', options: { left: 15, top: 58, width: 80, height: 8,
    marginTop: 5, marginBottom: 2, marginLeft: 1, formatter: '跟随备注' } } as any)
  const html = generateHtml(t, pageWith([{ elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 1,
    followElementIds: ['follow-1'], groupTop: 20 }]))
  // 锚点 L10/T20/H30，mL2/mT3/mB4 => B.bottom=53。
  // 锚点含下外边距的底边 F=57；成员相对 left=5/top=1，follow 高=73-57=16。
  expect(html).toMatch(/flow-slice" style="[^"]*margin-top:3mm[^"]*margin-left:2mm/)
  expect(html).toMatch(/position:absolute;left:5mm;top:1mm;[^"]*margin-top:5mm[^"]*margin-left:1mm/)
  expect(html).toMatch(/class="flow-follow" style="[^"]*height:16mm/)
  expect(html).not.toMatch(/flow-group" style="[^"]*margin-top/)
})
```

动态列表增加以下用例：无 margin 时 `132×2 + 上下 padding 4 = 268mm`，单片；再加上下 margin 10mm 后为 278mm，必须拆成两片，且传入测量行高不被改写。

```ts
const rows = flowRows(['一', '二'])
const build = (margin: Record<string, number>) => template({
  top: 0, flowLayoutMode: 'dynamic', flowColumns: 1,
  flowPaddingTop: 2, flowPaddingBottom: 2, _flowRows: rows, ...margin,
})
const rowHeights = measured('fl', [132, 132])
expect(flowSlices(paginate(build({}), rowHeights))).toEqual([
  { pageIndex: 0, startFlowRow: 0, endFlowRow: 2, renderTop: 0 },
])
expect(flowSlices(paginate(build({ marginTop: 6, marginBottom: 4 }), rowHeights))).toEqual([
  { pageIndex: 0, startFlowRow: 0, endFlowRow: 1, renderTop: 0 },
  { pageIndex: 1, startFlowRow: 1, endFlowRow: 2, renderTop: 0 },
])
expect(rowHeights.get('fl')!.measuredFlowRowHeights).toEqual([132, 132])
```

- [ ] **Step 2: 验证表格、列表和跟随区测试失败**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/pagination-engine.test.ts src/render/__tests__/flow-list-pagination.spec.ts src/render/html-generator.test.ts`
Expected: 切片区间、flow-follow 高度和 margin 声明 FAIL；既有 fixed 每页重复测试继续通过。

- [ ] **Step 3: 实现切片 chrome 与跟随几何**

表格每个新片以 `marginTop + marginBottom` 初始化 `sliceUsed`，重复表头仍另加一次；`pushSlice` 用 `Math.max(0, sliceUsed)` 记账。未启用分页和空行汇总片也把同一 chrome 加进 `totalNeed`。汇总附在既有末片时不重复加 chrome，单独移页形成新片时计入一次。

动态列表把 `m.top + m.bottom` 加入现有 `chromeVertical`，其 padding、border 和行高算法不改。所有 `tb` 使用 `marginXRange`。

`tableDesignBottom` 改为 `T + m.top + max(options.height, 行高和)`。跟随归属要求成员 `M.top >= 锚点 B.bottom + 锚点 m.bottom`，横向仍按 `M` 交集；令 `F = anchor B.bottom + anchor marginBottom`，跟随高度取 `max(member M.bottom) - F`，钳到零。

HTML 中锚点 `.flow-slice` / 动态切片追加 `elementMarginCss(opts)`，跟随成员的 `flowStyle` 追加 `elementMarginCss(m.options)`；相对 left 仍是 `m.left-anchor.left`，相对 top 改为 `m.top-F`，避免锚点 `marginBottom` 在切片文档流和成员相对坐标中各算一次。`flow-group` 根样式不输出锚点 margin。

- [ ] **Step 4: 跑切片、跟随和连续纸回归**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/pagination-engine.test.ts src/render/__tests__/flow-list-pagination.spec.ts src/render/html-generator.test.ts src/render/__tests__/continuous-paper.test.ts && npm run build -w @worm-vue3-print/core`
Expected: PASS；无 margin 的切片行区间、flow-group HTML 和固定重复语义不变。

- [ ] **Step 5: 按 hunk 提交**

```bash
git add -p -- packages/print-core/src/render/pagination-engine.ts packages/print-core/src/render/pagination-engine.test.ts packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts
git add -- packages/print-core/src/render/html-generator.ts packages/print-core/src/render/html-generator.test.ts
git diff --cached --check
git commit -m "feat(core): 闭合切片与跟随区外边距"
```

---

### Task 7: 真实 PDF 几何验收与公开文档

**Files:**
- Create: `services/print-render/src/element-margin.integration.test.ts`
- Modify: `skills/worm-vue3-print-mcp/references/template-schema.md`
- Modify: `docs/中文/指南/模板设计器.md`
- Modify: `docs/en/Overview.md`

**Interfaces:**
- Consumes: 完整 core 管线、两套设计器已写入的公开模板字段。
- Produces: Chromium + pdfjs 对普通/旋转文本、重叠、连续纸、表格跟随区的几何证据，以及公开字段说明。

- [ ] **Step 1: 写真实几何验收测试**

复用 `fixed-repeat.integration.test.ts` 的 runtime 与 pdfjs 读取方式。`textTemplate` 与 `pdfTextItem` 直接使用以下实现：

```ts
function textTemplate(margin: Record<string, number>, rotate = 0): PrintTemplateData {
  return { paperSize: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] }, elements: [
      { id: 'text', type: 'text', options: { left: 10, top: 20, width: 40, height: 8,
        formatter: 'MARGIN-TEXT', rotate, ...margin } },
    ] } as PrintTemplateData
}
async function pdfTextItem(pdf: Uint8Array, text: string): Promise<any> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false })
  const doc = await task.promise
  const content = await (await doc.getPage(1)).getTextContent()
  const item = content.items.find((it: any) => 'str' in it && it.str.includes(text))
  await task.destroy()
  if (!item) throw new Error(`PDF 缺少文本 ${text}`)
  return item
}
```

普通文本用同一模板跑 baseline、四边距、仅右下边距三份 PDF，并分别用 `pdfTextItem(result.pdf, 'MARGIN-TEXT')` 取得 `baseItem/allItem/rightBottomItem`：

```ts
const base = await renderPdf({ templateJson: textTemplate({}), printData: {} }, runtime)
const all = await renderPdf({ templateJson: textTemplate({
  marginTop: 4, marginRight: 7, marginBottom: 9, marginLeft: 5,
}), printData: {} }, runtime)
const rightBottom = await renderPdf({ templateJson: textTemplate({
  marginRight: 7, marginBottom: 9,
}), printData: {} }, runtime)

expect((allItem.transform[4] - baseItem.transform[4]) / PT_PER_MM).toBeCloseTo(5, 1)
expect((allItem.transform[5] - baseItem.transform[5]) / PT_PER_MM).toBeCloseTo(-4, 1)
expect(rightBottomItem.transform[4]).toBeCloseTo(baseItem.transform[4], 1)
expect(rightBottomItem.transform[5]).toBeCloseTo(baseItem.transform[5], 1)
expect(all.prepared.html).toContain('width:40mm')
expect(all.prepared.html).toContain('height:8mm')
```

`textTemplate` 固定 A4、模板边距 10mm、单个 `left:10/top:20/width:40/height:8/formatter:'MARGIN-TEXT'` 文本。旋转测试复用同一比较法，但元素加 `rotate:90`，仍断言左移 5mm、顶部下移 4mm，容差 0.2mm。

连续纸测试使用以下两份模板调用 `prepareDocument`，允许 0.02mm 舍入误差：

```ts
const continuous = textTemplate({})
continuous.paperSize = 'CONTINUOUS'
continuous.customWidth = 80
continuous.margins = { top: 2, right: 2, bottom: 2, left: 2 }
const withBottom = structuredClone(continuous)
withBottom.elements[0].options.marginBottom = 9
const baseline = await prepareDocument({ templateJson: continuous, printData: {} }, runtime)
const withMargin = await prepareDocument({ templateJson: withBottom, printData: {} }, runtime)
expect(withMargin.paperMm.height - baseline.paperMm.height).toBeCloseTo(9, 2)
```

重叠测试放两个同坐标文本，其中一个加 `marginLeft:-8/marginTop:-2`，断言 PDF 文本区间相交且 `prepared.html` 保留各自 `z-index`。表格跟随测试复用 Task 6 的 12 行表格和带 margin 的“跟随备注”，在 PDF 最后一页同时找到“商品12”和“跟随备注”，断言备注顶坐标大于商品12顶坐标，且页数与 core `PageLayout[]` 一致。

- [ ] **Step 2: 构建 core 并运行真实几何验收**

Run: `npm run build -w @worm-vue3-print/core && npm run test -w @worm-vue3-print/render -- --run src/element-margin.integration.test.ts`
Expected: 若 Task 4～6 已完成则本步骤应直接 PASS，作为端到端验收；若任何几何断言 FAIL，返回对应功能任务修复，不能改坐标断言或只检查文本存在。

- [ ] **Step 3: 同步公开契约文档**

在模板 schema 的几何行后增加：

```md
| `marginTop` `marginRight` `marginBottom` `marginLeft` | 元素四向外边距（mm，缺省 0，允许有限负数）。`left/top` 定位外边距盒；左/上边距移动实际边框盒，右/下边距只扩大外部占位；W/H 不含边距。元素不会自动推挤，坐标和负边距可形成重叠，`zIndex` 控制层序。 |
```

中文设计器指南补属性输入、吸附/对齐/分布按外边距盒、可见重叠按边框盒、分页与连续纸计边距。英文 Overview 增加同一字段组及“absolute positioning remains; no automatic reflow”的简短说明。文档不得把四字段写成 padding 或自动流式布局。

- [ ] **Step 4: 运行 render 定向与全量测试**

Run: `npm run test -w @worm-vue3-print/render -- --run src/element-margin.integration.test.ts src/fixed-repeat.integration.test.ts src/follow-region.integration.test.ts src/continuous.integration.test.ts && npm run test -w @worm-vue3-print/render`
Expected: PASS；真实 PDF 普通/旋转坐标、重叠、连续纸高度和跟随区全部满足断言。

- [ ] **Step 5: 按 hunk 提交**

```bash
git add -- services/print-render/src/element-margin.integration.test.ts docs/中文/指南/模板设计器.md docs/en/Overview.md
git add -p -- skills/worm-vue3-print-mcp/references/template-schema.md
git diff --cached --check
git commit -m "test(render): 验收元素外边距真实出纸几何"
```

---

### Task 8: 全量门禁与差异审查

**Files:**
- 只审查本计划 Tasks 1～7 列出的文件；本任务不新增功能改动。

**Interfaces:**
- Consumes: 前面任务的提交与全部测试产物。
- Produces: 可发布的全量构建、测试和差异证据。

- [ ] **Step 1: 审查工作区与提交边界**

Run: `git status --short && git log --oneline -7 && git diff HEAD~7..HEAD --stat && git diff HEAD~7..HEAD --check`
Expected: 仅本计划七个提交及用户已有工作；没有把 `.cache/`、`.workbuddy/`、其他计划或 fixed 既有 hunks 混入外边距提交。若基线提交数变化，以七次功能提交的实际 hash 范围替代 `HEAD~7`。

- [ ] **Step 2: 运行仓库门禁**

```bash
npm run lint:print-architecture
npm run build
npm test
npm run test -w @worm-vue3-print/render
git diff --check
```

Expected: 全部退出码为 0。任何失败先定位到所属任务修复，再重跑该任务定向测试和本步骤；不得跳过测试或放宽断言。

- [ ] **Step 3: 做兼容性最终审查**

逐项检查：

1. 未配置四字段时 `elementMarginCss` 返回空，HTML 和分页基线测试通过。
2. 两套设计器未把 margin 二次加入 `left/top`，拖拽/对齐只回写外边距盒坐标。
3. 可见重叠使用 `B`，分页占用使用 `M`，旋转使用偏移后的 `B/A`。
4. 表格和动态列表每片只计一次上下 margin，跟随组没有整组重复套 margin。
5. 连续纸只补根盒 `marginBottom`，真实 PDF 证据齐全；Electron 真机未提供时明确记录未覆盖。

- [ ] **Step 4: 记录验证结果**

在最终交付说明中列出实际通过的命令、七个提交 hash、真实 PDF 覆盖项和未覆盖项。若工作区仍有用户原有未提交改动，明确保留原状，不擅自提交或清理。
