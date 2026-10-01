# 移除「首页专属」「叠层对比」与服务端截图能力 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 整链删除设计器的「首页专属」（core `firstPageOverlay` schema 与渲染管线）与「叠层对比」（含 core `renderScreenshot` 与 print-render `/render/screenshot` 端点），并把三个已发布包定级为破坏性版本 2.0.0。

**Architecture:** 删除按「引用方先于被引用方」推进，保证每个任务收尾时全仓构建与测试都是绿的——先摘 UI 与宿主契约（canvas 权威 → common 镜像），再摘 core 渲染读取点与服务端点，最后删 core 类型字段与迁移分支并由 TS 报错证明零残留，收尾同步文档、模板资产与版本记录。旧模板兼容由 `normalizeTemplateUnits` 无条件剥离废弃字段承担，不留空壳。

**Tech Stack:** TypeScript 5.4、Vue 3（`<script setup>`）+ vitest 1.6 + @vue/test-utils、原生自定义元素 + happy-dom、tsup（core 构建）、Vite（canvas/common 构建）、Playwright（print-render）、npm workspaces。

**Spec:** `docs/superpowers/specs/2026-10-01-remove-first-page-overlay-and-screenshot-compare-design.md`

## Global Constraints

- 回复、提交信息、CHANGELOG、代码注释一律简体中文；标识符/包名/报错原文可保留英文。
- 文件编码 UTF-8 无 BOM；单次写入不超过 500 行。
- 包边界：`core`（纯逻辑）→ `canvas`（设计器 UI）→ 宿主；`render` / `print-client` / SDK 只依赖 `core`。删除不得越界把 UI 逻辑塞进 core。
- canvas 为权威实现，common 只做镜像；两侧类名、文案、取值域逐字一致，以 `PARITY.md` 收口。
- **每个任务收尾必须 `npm run build` 与相关测试全绿后才提交**；跨包类型删除一律放在其引用方之后。
- 术语防撞：`firstPageOverlay / 首页专属 / 首页叠加 / .zone-overlay` 属功能 A；`overlayVisible / toggle-overlay / .overlay-layer / 叠层对比 / requestScreenshot / setOverlay` 属功能 B。两组在 4 组相邻行并存（`DesignerToolbar.vue:78/79`、`shell/toolbar.ts:53/54`、`print-designer.ts:648/649`、`shell/canvas.ts:96/207-211`），删除时不得连坐。`.pd-dialog-overlay`、`.ruler-overlay`、Playwright 自身的 `page.screenshot()` 与本计划无关，禁动。
- 批量改写一律逐处 Edit，不用跨跨度正则批量替换；同一文件内多个 Edit 必须串行执行（并行会吞掉属性）。
- 版本号：`@worm-vue3-print/core`、`@worm-vue3-print/canvas`、`@worm-vue3-print/common` 由 `1.3.5` → `2.0.0`；`@worm-vue3-print/render`（1.0.0, private）、`@worm-vue3-print/print-client`（0.1.0, private）、`@worm-vue3-print/demo` 不动。
- 产物目录（各包 `dist/`、`demo-common/apps/*/dist/`、`demo-common/apps/*/public/vendor/`、`demo/video/out/`）禁止手改，由构建与 `npm run styles:demo-common`、`npm run samples:demo-common` 重生成。
- 历史存档不改：`docs/superpowers/{specs,plans}` 既成记述、`.workbuddy/`、`docs/中文/CHANGELOG.md:105-116` 与 `docs/en/CHANGELOG.en.md:125/136` 的旧版本条目、`demo/video/` 剧本与成品。
- 定向测试命令形态：`npm run test -w <包名> -- <文件路径>`（canvas 的 `.vue` spec 必须走 workspace 形式，根目录 `npx vitest` 会缺 vue 插件）。
- 计划中的行号一律是**删除前的基线坐标**。同一文件被前序任务改动后行号会漂移（例如 Task 1 回退 common 的 A 方案 hunk 会让 `print-designer.ts` 之后行号整体前移；Task 2 删 canvas 工具栏两行会让 Task 3 引用的 `79/151/181` 上移）。执行时**以任务里引用的代码块内容定位**，行号只作辅助，不按行号盲改。
- `demo` 与 `demo-common` 不在根 `npm run build` 范围内：`demo/src/samples/*.ts` 是类型化的，`firstPageOverlay` 从类型里删除（Task 10）到模板资产剥离（Task 11）之间必然出现 demo 类型检查缺口，属预期，统一在 Task 11 用 `npm run typecheck --prefix demo` 收口。

## File Structure（改动面与职责）

| 文件/目录 | 职责与本次改动 |
| --- | --- |
| `packages/print-canvas/src/{components,composables,styles}` | Vue 设计器权威侧：删两组按钮/状态/占位带/props 契约 |
| `packages/print-common/src/{shell,core,styles}` | 零框架镜像：跟随 canvas 同口径删除，样式由 `gen-styles.mjs` 派生 |
| `packages/print-common/PARITY.md` | canvas↔common 对齐台账：逐项收口，删除失配声明 |
| `packages/print-core/src/render/{css-builder,pagination-engine,html-generator,data-binder,types}.ts`、`src/print/apply-text-fit.ts` | 渲染管线：删首页叠加的读取点 |
| `packages/print-core/src/render/__fixtures__/build-page-css.json` | golden CSS 台账：4 键按新实现重录 |
| `packages/print-core/src/print/{pipeline,pdf-spec,types,ports,driver,dom-host-runtime}.ts` | 同构截图管线与宿主原语：整链删除 |
| `packages/print-core/src/designer/{types.ts,utils/migrate.ts}` | schema 与迁移：删字段、改为剥离废弃键（最后一步） |
| `services/print-render/src/{server,pdf-render,driver-playwright}.ts`、`.github/workflows/ci.yml` | 删 `/render/screenshot` 端点与 CI 步骤 |
| `skills/print-template-json/{scripts/build_template.py,assets/templates,references}` | 模板生成器与资产：停止产出废弃字段 |
| `docs/**`、`README.md`、三包 `README.md`、两侧 `help-content/{faq,changelog}.ts` | 对外文案同步与 2.0.0 破坏性记录 |

---

## Task 1: 工作区清障（保住无关的吸附修复）

**Files:**
- Modify: `packages/print-common/src/print-designer.ts:714-727`（回退 A 方案 hunk）
- Modify: `packages/print-canvas/src/components/PrintDesigner.vue:436-442`（回退 A 方案 hunk）
- Modify: `packages/print-common/PARITY.md:73`（回退该行到 HEAD 文案）
- Delete: `packages/print-canvas/src/__tests__/first-page-overlay-default.spec.ts`、`packages/print-common/src/__tests__/first-page-overlay-default.spec.ts`、`docs/superpowers/plans/2026-10-01-first-page-overlay-editable.md`
- Keep: `packages/print-common/src/print-designer.ts:1140-1150`（拖拽吸附修复）、`packages/print-common/src/__tests__/adsorb-drag.spec.ts`

**Interfaces:**
- Consumes: 无
- Produces: 干净的 `master` 基线 + 一条独立的「吸附修复」提交；后续任务不再携带 A 方案残留

- [ ] **Step 1: 回退 common 侧 A 方案改动（只回退叠加高度，保留吸附修复）**

`packages/print-common/src/print-designer.ts` 内，把当前：

```ts
    const overlay = this.store.templateData.firstPageOverlay
    this.store.updateTemplateData({
      firstPageOverlay: {
        // 与 canvas 同口径：占位区显示条件是 height>0，高度为 0 时补默认 10mm，已有高度不覆盖
        height: overlay.height > 0 ? overlay.height : 10,
        elements: [...overlay.elements, {
```

改回 HEAD 形态：

```ts
    const overlay = this.store.templateData.firstPageOverlay
    this.store.updateTemplateData({
      firstPageOverlay: {
        ...overlay,
        elements: [...overlay.elements, {
```

- [ ] **Step 2: 回退 canvas 侧 A 方案改动**

`packages/print-canvas/src/components/PrintDesigner.vue` 内，把当前：

```ts
  templateData.value = {
    ...templateData.value,
    // 画布占位区显示条件是 height>0：高度为 0 时补默认 10mm，否则点击后画布零反馈
    firstPageOverlay: {
      height: overlay.height > 0 ? overlay.height : 10,
      elements: [...overlay.elements, newEl],
    },
  }
```

改回 HEAD 形态：

```ts
  templateData.value = {
    ...templateData.value,
    firstPageOverlay: { ...overlay, elements: [...overlay.elements, newEl] },
  }
```

- [ ] **Step 3: 回退 PARITY.md 第 73 行**

删除该行中的「；height 为 0 时两侧同补默认 10mm——画布占位区显示条件是 `height>0`，不补则点击零反馈，已有高度不覆盖」整段，使该行恢复 HEAD 文案（结尾仍为「差别只在会多一条可撤销历史（见 §八.3）」）。

- [ ] **Step 4: 删除三份作废文件**

```bash
rm packages/print-canvas/src/__tests__/first-page-overlay-default.spec.ts \
   packages/print-common/src/__tests__/first-page-overlay-default.spec.ts \
   docs/superpowers/plans/2026-10-01-first-page-overlay-editable.md
```

- [ ] **Step 5: 验证工作区只剩吸附修复**

Run: `git status --short && git diff --stat && git diff`
Expected: `git diff --stat` 只有 `packages/print-common/src/print-designer.ts` 一处改动，且 diff 内容仅含拖拽位移段（`const base = first ? this.drag.origin.get(first.id) : undefined` 与 `offsetX/offsetY` 三行）。若 diff 里还出现 `firstPageOverlay`，回 Step 1 修净。

- [ ] **Step 6: 跑吸附回归确认绿**

Run: `npm run test -w @worm-vue3-print/common -- src/__tests__/adsorb-drag.spec.ts`
Expected: PASS，无用例失败

- [ ] **Step 7: 提交吸附修复**

```bash
git add packages/print-common/src/print-designer.ts packages/print-common/src/__tests__/adsorb-drag.spec.ts
git commit -m "$(cat <<'EOF'
修复 Common 侧开启吸附后元素拖不动：位移口径对齐 canvas useDrag.computePos

canvas 的 useDrag 直接取吸附后的绝对坐标（newLeft = result.left），位移是「修正后坐标 - 起始坐标」；Common 此前写成 snapped - rect，只剩吸附修正量、丢掉 dx，元素被钉死在原位。现改为以 drag.origin 的起始坐标为基线，并新增 adsorb-drag.spec.ts 覆盖吸附开/关两种位移序列。
EOF
)"
```

- [ ] **Step 8: 验证提交不含叠加改动**

Run: `git show --stat HEAD`
Expected: 文件清单只有上述两个文件；`git show HEAD | grep firstPageOverlay` 无输出

---

## Task 2: print-canvas — 拆「首页专属」（权威侧）

**Files:**
- Modify: `packages/print-canvas/src/components/DesignerToolbar.vue:77-78`、`184`
- Modify: `packages/print-canvas/src/components/PrintDesigner.vue:32`、`430-444`
- Modify: `packages/print-canvas/src/components/PropertyPanel.vue:153`、`160-162`、`360`、`477-482`
- Modify: `packages/print-canvas/src/components/CanvasPaper.vue:119-126`、`545-555`
- Modify: `packages/print-canvas/src/components/elements/BaseElement.vue:81`、`353-356`
- Modify: `packages/print-canvas/src/composables/useDesignerState.ts:42`、`69-72`、`108-114`、`214`、`551`
- Modify: `packages/print-canvas/src/composables/useHistory.ts:76`
- Test: `packages/print-canvas/src/__tests__/DesignerToolbar.spec.ts:52-58` 与 13 份 spec 的 `firstPageOverlay` 夹具行

**Interfaces:**
- Consumes: 现有 core `TemplateData`（此任务时 `firstPageOverlay` 字段仍存在，只是不再被画布读写）
- Produces: `DesignerToolbar` 不再 emit `add-overlay-element`；`BaseElement` 的 `zone` prop 类型为 `'content' | 'header' | 'footer'`；画布无 `.zone-overlay` 占位带；页面属性分区标题为「页眉/页脚高度 (mm)」。**Task 4 的 common 镜像以本任务结果为唯一参照**

- [ ] **Step 1: 先把工具栏用例改成只断言叠层对比（防止连带删错）**

`packages/print-canvas/src/__tests__/DesignerToolbar.spec.ts` 第 52-58 行替换为：

```ts
  it('叠层对比收入视图下拉', async () => {
    const w = await mountViewOpened()
    await w.findAll('button').find(b => b.text().includes('叠层对比'))!.trigger('click')
    expect(w.emitted('toggle-overlay')).toHaveLength(1)
  })
```

Run: `npm run test -w @worm-vue3-print/canvas -- src/__tests__/DesignerToolbar.spec.ts`
Expected: PASS —— 这条是基线检查：本任务后它仍绿，Task 3 才把它删掉，证明两个功能没被连坐。

- [ ] **Step 2: 删工具栏按钮与事件声明**

`packages/print-canvas/src/components/DesignerToolbar.vue` 删除第 77-78 行（分隔线一并移除，避免视图下拉尾部留孤立 `<span class="tb-menu-sep" />`）：

```html
          <span class="tb-menu-sep" />
          <button class="tb-btn tb-menu-row" data-tip="添加一个仅在首页叠加显示的页眉/页脚元素" @click="$emit('add-overlay-element')">首页专属</button>
```

并删除第 184 行 emit 声明：`  'add-overlay-element': []`

- [ ] **Step 3: 删 PrintDesigner 的绑定与处理函数**

`packages/print-canvas/src/components/PrintDesigner.vue`：删除第 32 行 `      @add-overlay-element="onAddOverlayElement"`；删除第 430-444 行整块 `function onAddOverlayElement() { ... }`（连同其后空行，保留第 446 行起的分组注释与 `onSelectElement`）。

- [ ] **Step 4: 删属性面板的叠加高度字段并改分区标题**

`packages/print-canvas/src/components/PropertyPanel.vue`：

1. 第 153 行改为：

```html
          <h3 class="pd-divider">页眉/页脚高度 (mm)</h3>
```

2. 删除第 160-162 行整块：

```html
          <div class="pd-field"><span class="pd-label">首页叠加高度</span>
            <StepperInput :model-value="overlayHeight" :min="0" :max="200" @update:model-value="onOverlayHeightChange" />
          </div>
```

3. 删除第 360 行 `const overlayHeight = computed(() => props.templateData?.firstPageOverlay.height ?? 0)`
4. 删除第 477-482 行整块 `function onOverlayHeightChange(v: number | undefined) { ... }`

- [ ] **Step 5: 删画布占位带与两处样式**

`packages/print-canvas/src/components/CanvasPaper.vue` 删除第 119-126 行：

```html
        <!-- 首页叠加占位（本次不可编辑） -->
        <div
          v-if="designMode && templateData.firstPageOverlay.height > 0"
          class="zone-overlay"
          :style="{ height: templateData.firstPageOverlay.height + 'mm' }"
        >
          <span class="zone-label">首页叠加</span>
        </div>
```

删除第 545-555 行规则块 `.zone-overlay { ... }`（其下方 `.zone-label` 仍被页眉/页脚标签使用，保留）。

`packages/print-canvas/src/components/elements/BaseElement.vue`：第 81 行改为

```ts
  zone?: 'content' | 'header' | 'footer'
```

删除第 353-356 行：

```css
/* 首页叠加区域元素：青色虚线 */
.print-element.design-mode.zone-overlay {
  outline: 1px dashed #06B6D4;
}
```

- [ ] **Step 6: 删状态层的五处读写点**

`packages/print-canvas/src/composables/useDesignerState.ts`：

1. 第 42 行删除 `    firstPageOverlay: { height: 0, elements: [] },`
2. 删除第 69-72 行整块（`loadTemplate` 归一化）：

```ts
    firstPageOverlay: {
      height: data.firstPageOverlay?.height ?? 0,
      elements: [...(data.firstPageOverlay?.elements ?? [])],
    },
```

3. 删除第 108-114 行整块（`serializePage`）：

```ts
    firstPageOverlay: {
      ...page.firstPageOverlay,
      elements: (page.firstPageOverlay?.elements ?? []).map(e => ({
        id: e.id || generateId(), type: e.printElementType?.type || 'text',
        options: { ...e.options }, printElementType: { ...e.printElementType },
      })),
    },
```

4. 第 214 行删除 `        firstPageOverlay: { height: templateData.value.firstPageOverlay.height, elements: [] },`
5. 第 551 行删除 `cp.firstPageOverlay = ...` 整行（`duplicatePage` 第 550 行已重建 `cp.elements`，叠加元素不再存在）

`packages/print-canvas/src/composables/useHistory.ts` 第 76 行删除 `        firstPageOverlay: { height: td.firstPageOverlay.height, elements: [] },`

- [ ] **Step 7: 清 canvas 各 spec 的夹具行**

逐文件删除整行 `firstPageOverlay: { height: 0, elements: [] },`：`CanvasPaperGuide.spec.ts:13`、`CanvasPaperWatermark.spec.ts:18`、`CanvasPaperDesignBackground.spec.ts:13`、`CanvasAreaRuler.spec.ts:16`、`CanvasAreaWatermark.spec.ts:15`、`CanvasAreaContextMenu.spec.ts:18`、`useGuides.spec.ts:12`、`useDesignerState-multipage.spec.ts:11`、`PropertyPanel-multipage.spec.ts:11`、`print-designer-tiling.spec.ts:26`、`TilingConfig.spec.ts:21`、`paper-preset-select.spec.ts:16`、`CodeGroup.spec.ts:159`

- [ ] **Step 8: 验证 canvas 绿并确认无残留**

Run: `npm run test -w @worm-vue3-print/canvas && npm run build -w @worm-vue3-print/canvas`
Expected: PASS（含 `vue-tsc`）

Run: `grep -rn -E "firstPageOverlay|zone-overlay|add-overlay-element|首页叠加" packages/print-canvas/src | grep -v "help-content/changelog.ts" | wc -l`
Expected: `0`（`help-content/changelog.ts` 的 v1.3.x 历史条目提到「首页叠加」，属既成记录，按 Global Constraints 保留）

- [ ] **Step 9: 提交**

```bash
git add packages/print-canvas/src
git commit -m "$(cat <<'EOF'
canvas 拆除首页专属：工具栏入口、属性面板叠加高度、画布占位带与状态层读写全删

移除 add-overlay-element 事件与 onAddOverlayElement；页面属性分区改名「页眉/页脚高度 (mm)」；删 CanvasPaper 的 .zone-overlay 占位与 BaseElement 从未启用的 zone='overlay' 联合成员及样式；useDesignerState 的默认值/载入/序列化/历史快照/复制页五处读写点与 useHistory 同步收口。视图下拉尾部不再留孤立分隔线。
EOF
)"
```

---

## Task 3: print-canvas — 拆「叠层对比」与宿主截图契约

**Files:**
- Modify: `packages/print-canvas/src/components/DesignerToolbar.vue:79`、`151`、`181`
- Modify: `packages/print-canvas/src/components/PrintDesigner.vue:14`、`29`、`84-86`、`154`、`165`、`192-193`、`300-332`
- Modify: `packages/print-canvas/src/components/CanvasArea.vue:37-40`、`138-140`、`653-664`
- Modify: `packages/print-canvas/src/index.ts:2`、`14`
- Modify: `packages/print-canvas/src/help-content/faq.ts:87`
- Modify: `packages/print-canvas/README.md:92`
- Test: `packages/print-canvas/src/__tests__/DesignerToolbar.spec.ts`（Task 2 Step 1 重写的那条）

**Interfaces:**
- Consumes: Task 2 完成后的 `DesignerToolbar`（视图下拉仅剩标尺/网格/虚框/吸附）
- Produces: `PrintDesigner` props 去掉 `requestScreenshot`；`CanvasArea` props 去掉 `overlayVisible/screenshotUrl/overlayOpacity`；`DesignerToolbar` 不再 emit `toggle-overlay`、不再有 `overlayVisible` prop。**Task 4 与 Task 9 依赖该收敛**

- [ ] **Step 1: 删工具栏用例、按钮与 prop**

`packages/print-canvas/src/__tests__/DesignerToolbar.spec.ts`：删除整条 `it('叠层对比收入视图下拉', ...)`（Task 2 Step 1 写入）。

Run: `npm run test -w @worm-vue3-print/canvas -- src/__tests__/DesignerToolbar.spec.ts`
Expected: PASS —— 该 describe 其余用例（标尺/网格开关态）仍在，证明只摘掉这一条

`packages/print-canvas/src/components/DesignerToolbar.vue`：删除第 79 行按钮、第 151 行 `  overlayVisible?: boolean`、第 181 行 `  'toggle-overlay': []`。

- [ ] **Step 2: 删 PrintDesigner 的模板绑定与状态逻辑**

`packages/print-canvas/src/components/PrintDesigner.vue`：

1. 删除第 14 行 `      :overlay-visible="overlayVisible"`、第 29 行 `      @toggle-overlay="toggleOverlay"`、第 84-86 行：

```html
        :overlay-visible="overlayVisible"
        :screenshot-url="screenshotUrl"
        :overlay-opacity="overlayOpacity"
```

2. 删除第 300-332 行整块（`// 叠层对比模式` 注释 + 三个 ref + `async function toggleOverlay()`）
3. 第 154 行 type import 去掉 `RequestScreenshotFn,`
4. 删除第 165 行 `import { DEFAULT_DEMO_DATA } from '@worm-vue3-print/core/designer'`
5. 删除 props 声明第 192-193 行：

```ts
  /** 截图适配器（叠层对比）：未注入时该功能不可用 */
  requestScreenshot?: RequestScreenshotFn
```

- [ ] **Step 3: 删 CanvasArea 图层与样式**

`packages/print-canvas/src/components/CanvasArea.vue`：删除第 37-40 行、第 138-140 行三个 props、第 653-664 行样式块：

```css
/* 叠层对比 */
.overlay-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 100;
}
.overlay-image {
  width: 100%;
  display: block;
}
```

（第 44 行起的 `.ruler-overlay` / `.ruler-corner` 属标尺，禁动。）

- [ ] **Step 4: 入口注释与用户可见文案**

`packages/print-canvas/src/index.ts`：第 2 行改为

```ts
// 开源核心不含 Element Plus 与宿主业务逻辑；保存/字段/上传/业务字典由宿主注入。
```

第 14 行注释去掉 `ScreenshotRequest/RequestScreenshotFn/`，保留其余标识符与 `export type * from '@worm-vue3-print/core/designer'`（第 15 行不动）。

`packages/print-canvas/src/help-content/faq.ts`：删除第 87 行 `  <li>可通过"叠层对比"功能对比设计稿与截图</li>`。
`packages/print-canvas/README.md`：删除第 92 行 `requestScreenshot({ templateJson, printData }) => Promise<Blob>`：叠层对比截图。` 条目。

- [ ] **Step 5: 验证**

Run: `npm run test -w @worm-vue3-print/canvas && npm run build -w @worm-vue3-print/canvas`
Expected: PASS

Run: `grep -rn -E "overlayVisible|toggle-overlay|requestScreenshot|overlay-layer|overlay-image|DEFAULT_DEMO_DATA|screenshotUrl" packages/print-canvas/src packages/print-canvas/README.md | grep -v "pd-dialog-overlay" | wc -l`
Expected: `0`。若 `DEFAULT_DEMO_DATA` 仍命中，说明该标识符另有用途，回 Step 2 第 4 小步保留 import 并如实报告。

- [ ] **Step 6: 提交**

```bash
git add packages/print-canvas
git commit -m "$(cat <<'EOF'
canvas 移除叠层对比与 requestScreenshot 宿主契约

删工具栏「叠层对比」按钮、PrintDesigner 的 overlayVisible/screenshotUrl/overlayOpacity 与 toggleOverlay、CanvasArea 的 .overlay-layer 图层与样式；props 去掉 requestScreenshot，入口注释、FAQ 与 README 同步。属 2.0.0 破坏性变更：宿主无需再注入截图适配器。
EOF
)"
```

---

## Task 4: print-common — 镜像同步两项删除

**Files:**
- Modify: `packages/print-common/src/shell/toolbar.ts:52-54`
- Modify: `packages/print-common/src/shell/property-panel.ts:278`、`281`
- Modify: `packages/print-common/src/shell/canvas.ts:17-19`、`94-99`、`207-211`
- Modify: `packages/print-common/src/print-designer.ts:5`、`10`、`108`、`132-133`、`305-341`、`491-493`、`648-649`、`714-727`
- Modify: `packages/print-common/src/core/store.ts:44`、`65-71`、`src/core/default-template.ts:12`
- Modify: `packages/print-common/src/shell/help-content/faq.ts:88`、`packages/print-common/PARITY.md:52`、`69`、`73`、`75`、`122`、`135`、`140`、`143`、`163`
- Regenerate: `packages/print-common/src/styles/designer.css`
- Test: `packages/print-common/src/__tests__/store.spec.ts:39`

**Interfaces:**
- Consumes: Task 2/3 的最终 canvas 形态（唯一参照）
- Produces: `<print-designer>` 视图下拉仅剩标尺/网格/虚框/吸附；无 `setOverlay()` 公开方法；`PARITY.md` 不再声称支持这两项

- [ ] **Step 1: 删视图下拉两行与尾部分隔线**

`packages/print-common/src/shell/toolbar.ts` 删除第 52-54 行：

```ts
      h('span', { class: 'tb-menu-sep' }),
      menuRow('首页专属', false, 'add-overlay-element', '添加一个仅在首页叠加显示的页眉/页脚元素'),
      menuRow('叠层对比', false, 'toggle-overlay', '叠加显示渲染截图，与设计稿对比效果'),
```

使 `menuRow('吸附', ...)`（第 51 行）成为视图下拉末项，与 canvas Task 2/3 结果逐字一致。

- [ ] **Step 2: 删属性面板字段并改分区标题**

`packages/print-common/src/shell/property-panel.ts`：第 278 行 `divider('三区高度 (mm)')` 改为 `divider('页眉/页脚高度 (mm)')`；删除第 281 行 `numField(ctx, '首页叠加高度', ...)`。

- [ ] **Step 3: 删画布叠加占位与截图层**

`packages/print-common/src/shell/canvas.ts`：

1. 删除 `CanvasUI` 第 17-19 行三个字段（`overlayVisible`、`overlayUrl`、`overlayOpacity`）
2. 删除第 94-99 行整块（含收尾大括号）：

```ts
  if (zone === 'content' && (s.templateData.firstPageOverlay?.height ?? 0) > 0) {
    children.push(h('div', {
      class: 'zone-overlay',
      style: { height: `${s.templateData.firstPageOverlay!.height}mm` },
    }, [h('span', { class: 'zone-label', text: '首页叠加' })]))
  }
```

3. 删除第 207-211 行的截图层三元节点（`overlay-layer` / `overlay-image`），保留 `[paperEl]` 与其后 `.filter(Boolean)`）

- [ ] **Step 4: 删 print-designer 的状态、公开方法与 action 分支**

`packages/print-common/src/print-designer.ts`：

1. 第 5 行 import 去掉 `DEFAULT_DEMO_DATA,`；第 10 行 type import 去掉 `RequestScreenshotFn,`
2. 删除第 108 行 `  private overlay = { visible: false, url: null as string | null, opacity: 0.5 }`
3. 删除第 132-133 行（宿主注入截图的注释 + `requestScreenshot?: RequestScreenshotFn`）
4. 删除第 305-310 行 `setOverlay(url)`（含 JSDoc）与第 312-341 行 `private async toggleOverlay()`（含 JSDoc）
5. 删除第 491-493 行三个 ui 字段（`overlayVisible/overlayUrl/overlayOpacity`）
6. 删除第 648 行 `case 'toggle-overlay': void this.toggleOverlay(); break` 与第 649 行 `case 'add-overlay-element': this.addOverlayElement(); break`
7. 删除第 714-727 行 `private addOverlayElement()` 整块（含 JSDoc）

- [ ] **Step 5: 删 store 与默认模板读写点、FAQ 行**

`packages/print-common/src/core/store.ts`：删除第 44 行整行；删除第 65-71 行整块（`serializePage` 的 `firstPageOverlay: { ... }`）。
`packages/print-common/src/core/default-template.ts`：删除第 12 行。
`packages/print-common/src/__tests__/store.spec.ts`：删除第 39 行夹具行。
`packages/print-common/src/shell/help-content/faq.ts`：删除第 88 行「可通过"叠层对比"功能对比设计稿与截图」。

- [ ] **Step 6: 重派生样式并核对**

Run: `npm run styles -w @worm-vue3-print/common`
Expected: `scripts/gen-styles.mjs` + `gen-icons.mjs` 成功退出

Run: `grep -c -E "zone-overlay|overlay-layer|overlay-image" packages/print-common/src/styles/designer.css`
Expected: `0`。若仍命中，说明派生脚本白名单硬编码了这两个类名，需在 `packages/print-common/scripts/gen-styles.mjs` 内移除对应条目后重跑本步。

- [ ] **Step 7: PARITY.md 九处收口**

- 第 52 行 → `| 视图下拉：标尺/网格/虚框/吸附 | ✅ | 2.0.0 起不再有「首页专属」与「叠层对比」 |`
- 第 69 行 → `| 三区（页眉/内容/页脚） | ✅ | 区域矩形算法与 \`CanvasPaper.zoneRectsMM\` 一致 |`
- 第 73 行：删去「工具栏「添加叠加元素」按 canvas `onAddOverlayElement` 同串（… `'title:'首页叠加'`）」整段，只保留落点默认尺寸口径与「（见 §八.3）」引用
- 第 75 行整行删除（`| 首页叠加区 | ✅ | … |`）
- 第 122 行：「三区高度 (mm)」改「页眉/页脚高度 (mm)」，并删去「+ **首页叠加高度**（0–200，写 `firstPageOverlay.height`）」
- 第 135 行整行删除（`setOverlay(url)` 叠层对比）
- 第 140 行整行删除（`requestScreenshot(req)`）
- 第 143 行：「本包的预览口径是派发 `preview` 事件 + `requestScreenshot`，宿主自行渲染」改为「本包的预览口径是派发 `preview` 事件，宿主自行渲染」
- 第 163 行：删去「、直接给 `templateData.firstPageOverlay` 追加叠加元素」

- [ ] **Step 8: 验证**

Run: `npm run test -w @worm-vue3-print/common && npm run build -w @worm-vue3-print/common`
Expected: PASS

Run: `grep -rn -E "firstPageOverlay|首页专属|首页叠加|叠层对比|overlayVisible|toggle-overlay|requestScreenshot|setOverlay|add-overlay-element" packages/print-common/src | grep -v "pd-dialog-overlay" | grep -v "help-content/changelog.ts" | wc -l`
Expected: `0`（`shell/help-content/changelog.ts` 的 v1.3.x 历史条目除外）

- [ ] **Step 9: 提交**

```bash
git add packages/print-common
git commit -m "$(cat <<'EOF'
Common 镜像同步：首页专属与叠层对比全链摘除，PARITY 九处收口

视图下拉两行与尾部分隔线、属性面板叠加高度字段（分区改名「页眉/页脚高度 (mm)」）、画布 .zone-overlay 占位与 .overlay-layer 截图层、print-designer 的 overlay 状态与 setOverlay/toggleOverlay/addOverlayElement 及两个 action 分支、store 与默认模板读写点全部删除；样式由 gen-styles 从 canvas 重派生，FAQ 同步。
EOF
)"
```

---

## Task 5: print-core — 叠加 CSS 块与 golden 夹具重录

**Files:**
- Modify: `packages/print-core/src/render/css-builder.ts:211`、`240-245`
- Modify: `packages/print-core/src/render/__fixtures__/build-page-css.json`（4 键重录）
- Test: `packages/print-core/src/render/css-builder.test.ts:19`、`95`、`111`、`117`、`123`、`146`、`158`

**Interfaces:**
- Consumes: 现有 core `TemplateData`（字段仍在，本任务只停读）
- Produces: `buildPageCss` / `buildPageGeometryCss` / `buildBasePageCss` 输出不再含 `.first-page-overlay`；`__fixtures__/build-page-css.json` 与实现同源

- [ ] **Step 1: 先改测试夹具与断言（预期红）**

`packages/print-core/src/render/css-builder.test.ts`：

1. 删除 6 处 `firstPageOverlay: { height: N, elements: [] },` 整行 —— 第 19 行（`tpl()`）、95 行（`fixture()`）、111 行（`t2`，height 20）、117 行（`t3`，height 10）、123 行（`t4`）、146 行（作用域用例，height 20）。删后 `t2`/`t3`/作用域用例只覆盖 `paperSize`、`orientation`、`margins`、`header`、`footer`。
2. 第 158 行由 `expect(css).toContain('.mt-1 .first-page-overlay {')` 改为：

```ts
    expect(css).not.toContain('.first-page-overlay')
```

Run: `npm run test -w @worm-vue3-print/core -- src/render/css-builder.test.ts`
Expected: FAIL —— 第 105-138 行 4 条逐字比对用例与新的 `not.toContain` 全红（实现仍输出该块）

- [ ] **Step 2: 删实现里的 overlayH 与规则块**

`packages/print-core/src/render/css-builder.ts`：删除第 211 行 `  const overlayH = template.firstPageOverlay?.height ?? 0`；删除第 240-245 行整块（含上方注释与空行），使 `areaGeometryBlock` 的模板串在 `.content-area` 块后直接收尾：

```ts
/* ── 首页叠加区域 ── */
${desc}.first-page-overlay {
  width: ${mm(contentWidth)};
  height: ${mm(overlayH)};
  position: relative;
}
```

- [ ] **Step 3: 重录 golden CSS（仓内已无 dump 脚本，用 dist 产物现算）**

```bash
npm run build -w @worm-vue3-print/core && node -e '
const fs = require("node:fs");
const { buildPageCss } = require("./packages/print-core/dist/index.cjs");
const base = {
  paperSize: "A4", orientation: "portrait",
  margins: { top: 10, right: 12, bottom: 8, left: 14 },
  header: { height: 15, elements: [] }, footer: { height: 12, elements: [] },
};
const t1 = { ...base, pageBackground: "#f5f5f5" };
const t2 = { ...base, orientation: "landscape", margins: { top: 5, right: 5, bottom: 5, left: 5 }, header: { height: 0, elements: [] }, footer: { height: 0, elements: [] } };
const t3 = { ...base, paperSize: "CUSTOM", customWidth: 120, customHeight: 80, margins: { top: 3, right: 4, bottom: 5, left: 6 }, header: { height: 8, elements: [] }, footer: { height: 6, elements: [] } };
const t4 = { ...base, paperSize: "CONTINUOUS", customWidth: 80, margins: { top: 2, right: 2, bottom: 10, left: 2 }, header: { height: 5, elements: [] }, footer: { height: 8, elements: [] } };
const out = { a4Portrait: buildPageCss(t1), a4Landscape: buildPageCss(t2), custom: buildPageCss(t3), continuous: buildPageCss(t4, 123.45) };
fs.writeFileSync("./packages/print-core/src/render/__fixtures__/build-page-css.json", JSON.stringify(out, null, 2));
console.log("re-recorded:", Object.keys(out).join(", "));
'
```

- [ ] **Step 4: 复核重录只动了叠加块**

Run: `git diff --numstat packages/print-core/src/render/__fixtures__/build-page-css.json`
Expected: `4 4`（4 个键各一行，删=增=4）。再跑
`git diff packages/print-core/src/render/__fixtures__/build-page-css.json | grep -c "first-page-overlay"`
Expected: 非 0（删除侧含该选择器），且 `grep -c "\.page-header {"` 在 `+` 侧与 `-` 侧数量相同（其余几何块未漂移）。若 numstat 不是 `4 4`，先 `npm run build -w @worm-vue3-print/core` 重跑再复核——产物过期是常见误因。

- [ ] **Step 5: 跑 CSS 测试与 core 全量**

Run: `npm run test -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/core`
Expected: PASS（分页/HTML 仍带 `firstPageOverlay` 读取，但字段未删，编译不红）

- [ ] **Step 6: 提交**

```bash
git add packages/print-core/src/render/css-builder.ts packages/print-core/src/render/css-builder.test.ts packages/print-core/src/render/__fixtures__/build-page-css.json
git commit -m "$(cat <<'EOF'
CSS 构建去掉首页叠加规则块并重录 golden 夹具

areaGeometryBlock 不再输出 .first-page-overlay 几何块；build-page-css.json 四个键按新实现现算重录（仓内已无 dump 脚本，改用 core dist 产物 node 现算）。作用域几何用例改为断言不再出现该选择器。
EOF
)"
```

---

## Task 6: print-core — 分页引擎去掉首页预算扣减

**Files:**
- Modify: `packages/print-core/src/render/pagination-engine.ts:205`、`216`、`274-275`、`284-298`、`336`
- Test: `packages/print-core/src/render/pagination-engine.test.ts:43`、`129`、`147`、`208`、`325`、`353`、`379`、`469`、`492`
- Test: `packages/print-core/src/render/pagination-engine.edge.test.ts:16`、`28`
- Test: `packages/print-core/src/render/__tests__/continuous-paper.test.ts:15`、`54-63`

**Interfaces:**
- Consumes: Task 5 的 CSS 输出
- Produces: `paginate()` 首页与后续页同预算 `contentHeight - SAFETY_MARGIN`；`PageLayout` 结构不变

- [ ] **Step 1: 先加「首页不额外扣减」的语义锁定用例**

`packages/print-core/src/render/pagination-engine.test.ts`，在第 497 行 `describe('堆叠元素：纵向重叠按并集计高，不重复扣高', ...)` 之前插入（沿用该文件 463-478 行的既有助手 `makeCustomPaperTemplate`、`freeEl`、`measureFree`）：

```ts
describe('首页预算与后续页一致（2.0.0 起无首页叠加扣减）', () => {
  it('自定义纸 100×100、边距 10 → 内容高 80、可用 78，三段共 65mm 全落首页', () => {
    const tpl = makeCustomPaperTemplate(100, 100, [
      freeEl('e0', 0, 22), freeEl('e1', 22, 22), freeEl('e2', 44, 21),
    ])
    const pages = paginate(tpl, measureFree([['e0', 22], ['e1', 22], ['e2', 21]]))
    expect(pages).toHaveLength(1)
    expect(pages[0].sections.map(s => s.elementId)).toEqual(['e0', 'e1', 'e2'])
  })
})
```

Run: `npm run test -w @worm-vue3-print/core -- src/render/pagination-engine.test.ts`
Expected: PASS（改动前后皆然，本用例锁定语义，防后续误改）

- [ ] **Step 2: 删 overlayH 与首页分支**

`packages/print-core/src/render/pagination-engine.ts`：

1. 删除第 216 行 `  const overlayH = template.firstPageOverlay?.height ?? 0`
2. 第 274 行改为 `  let remaining = contentHeight - SAFETY_MARGIN`
3. 删除第 275 行 `  let isFirstPage = true`
4. 第 284-298 行的 `fullPageHeight` 改为：

```ts
  /** 当前页完整可用高度（2.0.0 起首页与后续页同预算） */
  function fullPageHeight(): number {
    return contentHeight - SAFETY_MARGIN
  }
```

5. 删除第 336 行 `    isFirstPage = false`
6. 第 205 行注释改为 ` * 4. 处理 keepWithNext、单行超高、表格跟随等边界`

- [ ] **Step 3: 清测试夹具并改连续纸数字**

- `pagination-engine.test.ts` 删除 9 处 `firstPageOverlay: { height: 0, elements: [] },` 整行：43、129、147、208、325、353、379、469、492
- `pagination-engine.edge.test.ts` 删除第 16、28 行同名整行
- `render/__tests__/continuous-paper.test.ts` 删除第 15 行夹具整行；第 54-63 行的用例（原本 `firstPageOverlay: { height: 4, ... }` 参与底边）改为：

```ts
  it('composeContinuousHeight：探针底边 + footer + mb（探针底边已含 mt/header/内容偏移）', () => {
    const t = continuousTemplate({
      margins: { top: 5, right: 5, bottom: 3, left: 5 },
      header: { height: 8, elements: [] },
      footer: { height: 6, elements: [] },
    })
    // 探针测得内容区最大底边相对纸顶 = mt5 + header8 + 内容底80 = 93
    expect(composeContinuousHeight(t, 93)).toBe(102)
  })
```

- [ ] **Step 4: 验证**

Run: `npm run test -w @worm-vue3-print/core -- src/render/pagination-engine.test.ts src/render/pagination-engine.edge.test.ts src/render/__tests__/continuous-paper.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/print-core/src/render
git commit -m "$(cat <<'EOF'
分页引擎去掉首页叠加预算：首页与后续页同可用高度

删除 overlayH 扣减与 fullPageHeight 的首页分支；isFirstPage 收敛后只剩写入无读取，一并移除；连续纸夹具用例的探针底边同步扣掉 4mm 叠加高度（97→93、结果 106→102）。
EOF
)"
```

---

## Task 7: print-core — HTML 生成、数据绑定与字号回写

**Files:**
- Modify: `packages/print-core/src/render/html-generator.ts:121`、`133`、`247-250`、`260`、`264`、`301`、`310`
- Modify: `packages/print-core/src/render/data-binder.ts:36-38`
- Modify: `packages/print-core/src/print/apply-text-fit.ts:35`
- Modify: `packages/print-core/src/print/pipeline.ts:242`（注释）、`packages/print-core/src/render/continuous-paper.ts:3`（注释）
- Test: `packages/print-core/src/print/__tests__/multi-template.spec.ts:156-186`、`src/print/__tests__/apply-text-fit.spec.ts:60`

**Interfaces:**
- Consumes: Task 5/6 的 CSS 与分页结果
- Produces: 页面 HTML 结构为「水印 + `.page-header` + `.content-area` + `.page-footer`」，测量趟与最终趟均无叠加层

- [ ] **Step 1: 删行为用例（其存在前提就是本功能）**

`packages/print-core/src/print/__tests__/multi-template.spec.ts` 删除第 156-186 行整块 `it('首页叠加仅在各模板自身首页出现', ...)`（从 `it(` 行到其收尾 `  })`，含中间 `firstPageOverlay` 构造与 5 条断言）。

Run: `npm run test -w @worm-vue3-print/core -- src/print/__tests__/multi-template.spec.ts`
Expected: 其余用例 PASS（证明摘的是一条独立用例，没伤及邻近 describe）

- [ ] **Step 2: 改 html-generator**

`packages/print-core/src/render/html-generator.ts`：

1. 删除第 121 行 `  const overlayHtml = renderAreaElements(template.firstPageOverlay?.elements ?? [], contentWidth, undefined, undefined, ctx)`
2. 删除第 133 行 `  <div class="first-page-overlay">${overlayHtml}</div>`
3. 删除第 247-250 行整块（含注释）：

```ts
  // 首页叠加（仅首页）
  const overlayHtml = page.pageIndex === 0
    ? `<div class="first-page-overlay">${renderAreaElements(scoped.firstPageOverlay?.elements ?? [], contentWidth, pageNum, totalPages, pageCtx)}</div>`
    : ''
```

4. 删除第 264 行 `  ${overlayHtml}`
5. 第 260 行注释改为 `  // 设计稿整页内容（水印+三区）；出纸旋转角度非 0 时包进转子层整页旋转`
6. 删除第 301 行 `    firstPageOverlay: mapArea(template.firstPageOverlay),`
7. 删除第 310 行 `    template.firstPageOverlay?.elements,`

- [ ] **Step 3: 改 data-binder / apply-text-fit / 两处注释**

`packages/print-core/src/render/data-binder.ts` 删除第 36-38 行：

```ts
  if (bound.firstPageOverlay?.elements) {
    bound.firstPageOverlay.elements = bound.firstPageOverlay.elements.map(el => bindElement(el, data, baseUrl))
  }
```

`packages/print-core/src/print/apply-text-fit.ts` 删除第 35 行 `  collect(template.firstPageOverlay?.elements)`

`packages/print-core/src/print/pipeline.ts` 第 242 行改为 `  // 最终 HTML：补齐测量趟看不到的码值（页眉/页脚中的真实页码）`
`packages/print-core/src/render/continuous-paper.ts` 第 3 行改为 `// 已天然包含上边距/页眉的纵向偏移；flow-group 跟随区由真实引擎布局如实反映）。`

`packages/print-core/src/print/__tests__/apply-text-fit.spec.ts` 第 60 行只改标题（用例体只测页眉）：

```ts
  it('页眉/页脚区元素同样可回写（这些区域也参与测量趟）', () => {
```

- [ ] **Step 4: 验证 core 全绿**

Run: `npm run test -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/core`
Expected: PASS。此时 `grep -rn "firstPageOverlay" packages/print-core/src` 只剩 `designer/types.ts`、`render/types.ts`、`designer/utils/migrate.ts` 与各测试夹具行——由 Task 10 收口。

Run: `grep -rn "firstPageOverlay" packages/print-core/src | grep -v "__tests__\|\.test\.ts\|types.ts\|migrate.ts" | wc -l`
Expected: `0`

- [ ] **Step 5: 提交**

```bash
git add packages/print-core/src
git commit -m "$(cat <<'EOF'
core 渲染管线拆除首页叠加：HTML 结构、数据绑定与字号回写

测量趟与最终趟均不再插入 .first-page-overlay 层，页面结构收敛为「水印 + 页眉 + 内容区 + 页脚」；bindData 与 applyTextFitSizes 去掉叠加区遍历，页码引用探测与 scoped 模板映射同步；删除「首页叠加仅在各模板自身首页出现」行为用例并改两处注释口径。
EOF
)"
```

---

## Task 8: print-render 端点 / print-client 桩 / CI

**Files:**
- Modify: `services/print-render/src/server.ts:5`、`104-141`
- Modify: `services/print-render/src/pdf-render.ts:3-7`、`49-52`
- Modify: `services/print-render/src/driver-playwright.ts:9`、`53-60`
- Modify: `services/print-render/README.md:8`、`18`、`28`、`33`、`120`、`122`
- Delete: `services/print-render/src/screenshot.test.ts`
- Modify: `.github/workflows/ci.yml:44-46`
- Modify: `clients/print-client/src/main/print-engine.test.ts:40`
- Test: `services/print-render/src/{multipage,text-fit,continuous,batch,tiling,codes,subtotal}.integration.test.ts`、`src/cross-end.parity.mjs` 的夹具行

**Interfaces:**
- Consumes: core 现有 `renderScreenshot`（本任务只停用它，删除在 Task 9）
- Produces: 渲染服务对外只有 `POST /render/pdf`；CI 不再跑截图用例；core 的截图导出进入「无第一方调用方」状态

- [ ] **Step 1: 删端点与包装函数**

`services/print-render/src/server.ts`：第 5 行改为

```ts
import { renderPdf } from './pdf-render.js'
```

删除第 104-141 行整块（`// ─── 截图端点 ───` 到该 `app.post` 的收尾 `})`）。第 11 行 `validatePrintData` 定义保留（`/render/pdf` 第 75 行仍在用），第 143 行起的「启动服务」段不动。

`services/print-render/src/pdf-render.ts`：第 3-7 行 import 去掉 `renderScreenshot as coreRenderScreenshot,`；删除第 49-52 行：

```ts
/** 单遍渲染生成 PNG 截图（测量模式 HTML，不分页） */
export async function renderScreenshot(request: RenderRequest): Promise<Buffer> {
  return Buffer.from(await coreRenderScreenshot(toJob(request), runtime()))
}
```

`services/print-render/src/driver-playwright.ts`：第 9 行去掉 `  ScreenshotTargetSpec,`；删除第 53-60 行 `async screenshot(...)` 方法整块。

- [ ] **Step 2: 删用例与 CI 步骤**

```bash
rm services/print-render/src/screenshot.test.ts
```

`.github/workflows/ci.yml` 删除第 44-46 行整块：

```yaml
      - name: 截图集成测试
        run: npm run test -w @worm-vue3-print/render -- src/screenshot.test.ts
        timeout-minutes: 5
```

`clients/print-client/src/main/print-engine.test.ts` 删除第 40 行 `          toScreenshot: async () => new Uint8Array(),`

- [ ] **Step 3: 清 render 夹具的 `firstPageOverlay` 行**

逐行删除 `    firstPageOverlay: { height: 0, elements: [] },`：`multipage.integration.test.ts:28`、`text-fit.integration.test.ts:31` 与 `:50`、`continuous.integration.test.ts:18`、`batch.integration.test.ts:20` 与 `:35`、`tiling.integration.test.ts:35`、`codes.integration.test.ts:18`、`subtotal.integration.test.ts:13`；`cross-end.parity.mjs:20` 为两空格缩进的 `  firstPageOverlay: { height: 0, elements: [] },`。

- [ ] **Step 4: render README 文案同步**

`services/print-render/README.md`：第 8 行去掉 `` `POST /render/screenshot` ``（只留 `/render/pdf`）；第 18 行删去「（截图接口为单遍 `page.screenshot()`）」；第 28 行端点表整行删除；第 33 行删去「`/render/screenshot` 传数组时仅渲染第一条数据。」整句；第 120 行改为「两遍渲染主流程与公共 API（`renderPdf`）」；第 122 行删去「/`page.screenshot`」。

- [ ] **Step 5: 验证**

Run: `npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/render && npm run test -w @worm-vue3-print/render`
Expected: 构建通过；集成测试全绿（真实起 Headless Chromium）

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add services/print-render .github/workflows/ci.yml clients/print-client
git commit -m "$(cat <<'EOF'
渲染服务移除 /render/screenshot 端点与 Playwright 截图分支，CI 同步下线截图用例

server.ts 删截图端点（validatePrintData 保留给 /render/pdf）、pdf-render.ts 删 renderScreenshot 包装、driver-playwright.ts 删 screenshot 方法；删除 screenshot.test.ts 与 ci.yml 的「截图集成测试」步骤，客户端测试桩去掉 toScreenshot，各集成夹具去掉 firstPageOverlay 字段。
EOF
)"
```

---

## Task 9: print-core — 同构截图管线与原语删除

**Files:**
- Modify: `packages/print-core/src/print/pipeline.ts:8`、`45-73`
- Modify: `packages/print-core/src/print/pdf-spec.ts:2`、`63-68`
- Modify: `packages/print-core/src/print/types.ts:36-40`
- Modify: `packages/print-core/src/print/ports.ts:5`、`33`
- Modify: `packages/print-core/src/print/driver.ts:1`、`48`
- Modify: `packages/print-core/src/print/dom-host-runtime.ts:9`、`118-137`
- Modify: `packages/print-core/README.md:29`、`30`、`32`
- Test: `src/print/__tests__/{exports.spec.ts:7,pipeline.spec.ts:2/188-200/333-338,pdf-spec.spec.ts:6/52-56,fake-driver.ts:13/19/50-52}`

**Interfaces:**
- Consumes: Task 8（已无第一方调用方）
- Produces: core 根入口不再导出 `renderScreenshot` / `buildScreenshotTargetSpec` / `ScreenshotTargetSpec`；`PrintSession` 仅剩 `renderCodes`/`measure`/`probeContentBottom`/`toPdf`；`PageDriver` 仅剩可选 `pdf`

- [ ] **Step 1: 先收测试断言**

`packages/print-core/src/print/__tests__/exports.spec.ts` 第 7 行改为：

```ts
      'prepareDocument', 'renderPdf', 'createDomHostRuntime',
```

`packages/print-core/src/print/__tests__/pdf-spec.spec.ts`：第 6 行删 `  buildScreenshotTargetSpec,`；删除第 52-56 行整块：

```ts
describe('buildScreenshotTargetSpec', () => {
  it('PNG、整页、不省略背景', () => {
    expect(buildScreenshotTargetSpec()).toEqual({ type: 'png', fullPage: true, omitBackground: false })
  })
})
```

- [ ] **Step 2: 删管线与测试桩**

`packages/print-core/src/print/pipeline.ts`：第 8 行改为 `import { buildPdfTargetSpec } from './pdf-spec.js'`；删除第 45-73 行整块（`/** 截图：不分页… */` 到 `renderScreenshot` 的收尾大括号）。

`packages/print-core/src/print/__tests__/pipeline.spec.ts`：第 2 行 import 去掉 `renderScreenshot`；删除第 188-200 行 `describe('renderScreenshot', ...)` 整块；删除第 333-338 行 `it('截图：多模板按真实分页整份渲染（fullPage）', ...)` 整块。

`packages/print-core/src/print/__tests__/fake-driver.ts`：删除第 13 行 `  screenshotBytes?: Uint8Array`、第 19 行 `  supportsScreenshot?: boolean`、第 50-52 行条件展开：

```ts
    ...(options.supportsScreenshot === false
      ? {}
      : { async screenshot() { await slow('screenshot'); return options.screenshotBytes ?? new Uint8Array([9]) } }),
```

- [ ] **Step 3: 删类型、端口与宿主实现**

`packages/print-core/src/print/types.ts` 删除第 36-40 行：

```ts
export interface ScreenshotTargetSpec {
  type: 'png'
  fullPage: boolean
  omitBackground: boolean
}
```

`packages/print-core/src/print/ports.ts`：删除第 33 行 `  toScreenshot(html: string, spec: ScreenshotTargetSpec, viewport: ViewportPx): Promise<Uint8Array>`；第 5 行类型 import 去掉 `  ScreenshotTargetSpec,`。

`packages/print-core/src/print/driver.ts`：删除第 48 行 `  screenshot?(html: string, spec: ScreenshotTargetSpec): Promise<Uint8Array>`；第 1 行 import 去掉 `ScreenshotTargetSpec`。

`packages/print-core/src/print/pdf-spec.ts`：删除第 63-68 行（注释 + 函数）：

```ts
/** Playwright page.screenshot 的最小结构 */
export function buildScreenshotTargetSpec(): ScreenshotTargetSpec {
  return { type: 'png', fullPage: true, omitBackground: false }
}
```

并把第 2 行 import 去掉 `ScreenshotTargetSpec`。

`packages/print-core/src/print/dom-host-runtime.ts`：删除第 118-137 行整块（`async toScreenshot(...) { ... },`，含其上方空行）；第 9 行类型 import 去掉 `  ScreenshotTargetSpec,`。

- [ ] **Step 4: core README 同步**

`packages/print-core/README.md`：第 29 行去掉 `` `renderScreenshot(job, runtime)`、`` 一项；第 30 行去掉 `` `buildScreenshotTargetSpec` ``；第 32 行「与可选 pdf/screenshot」改为「与可选 pdf」。

- [ ] **Step 5: 验证**

Run: `npm run test -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/render`
Expected: PASS

Run: `grep -rn -iE "renderScreenshot|ScreenshotTargetSpec|toScreenshot" packages/print-core/src | wc -l`
Expected: `0`

- [ ] **Step 6: 提交**

```bash
git add packages/print-core
git commit -m "$(cat <<'EOF'
core 移除同构渲染管线的截图入口与宿主截图原语

删 renderScreenshot / buildScreenshotTargetSpec / ScreenshotTargetSpec / PrintSession.toScreenshot / PageDriver.screenshot 与 dom-host-runtime 的截图分支；fake driver 去掉 screenshot 桩，导出清单与 pdf-spec 用例同步，core README 入口清单收口。属 2.0.0 破坏性变更，PDF 链路不受影响。
EOF
)"
```

---

## Task 10: print-core — schema 字段删除与迁移改为剥离（收口）

**Files:**
- Modify: `packages/print-core/src/designer/types.ts:55-58`、`425-432`
- Modify: `packages/print-core/src/render/types.ts:86`
- Modify: `packages/print-core/src/designer/utils/migrate.ts:23-35`
- Test: `src/designer/utils/__tests__/migrate.spec.ts:29-39`，以及 Step 4 列出的全部夹具行

**Interfaces:**
- Consumes: Task 2-9 已清空的全部读取点（本任务是「零残留证明」步骤）
- Produces: `TemplateData` 无 `firstPageOverlay`；`designer` 子路径不再导出 `ScreenshotRequest` / `RequestScreenshotFn`；`normalizeTemplateUnits` 无条件剥离废弃键

- [ ] **Step 1: 先写迁移新语义（预期红）**

`packages/print-core/src/designer/utils/__tests__/migrate.spec.ts` 把第 29-39 行 `it('页眉/页脚/首页叠加元素同样换算', ...)` 整块替换为：

```ts
  it('页眉/页脚元素同样换算，并剥离已废弃的首页叠加字段', () => {
    const tpl = {
      header: { height: 10, elements: [{ id: 'h', options: { left: 20, top: 5, width: 100, height: 10 } }] },
      footer: { height: 10, elements: [{ id: 'f', options: { left: 20, top: 5, width: 100, height: 10 } }] },
      firstPageOverlay: { height: 0, elements: [{ id: 'o', options: { left: 20, top: 5, width: 100, height: 10 } }] },
    } as unknown as TemplateData
    const out = normalizeTemplateUnits(tpl)
    expect(out.header!.elements[0]?.options.left).toBeCloseTo(20 * PT_TO_MM, 1)
    expect(out.footer!.elements[0]?.options.top).toBeCloseTo(5 * PT_TO_MM, 1)
    expect('firstPageOverlay' in out).toBe(false)
  })

  it('unit 已是 mm 时同样剥离首页叠加字段（旧模板导入不留废弃键）', () => {
    const tpl = {
      unit: 'mm',
      firstPageOverlay: { height: 10, elements: [] },
      elements: [{ id: '1', options: { left: 10, top: 20, width: 42, height: 8 } }],
    } as unknown as TemplateData
    const out = normalizeTemplateUnits(tpl)
    expect('firstPageOverlay' in out).toBe(false)
    expect(out.elements![0]?.options.left).toBe(10)
  })
```

Run: `npm run test -w @worm-vue3-print/core -- src/designer/utils/__tests__/migrate.spec.ts`
Expected: FAIL —— 两条 `'firstPageOverlay' in out` 断言均为 `true`

- [ ] **Step 2: 改 `normalizeTemplateUnits` 为无条件剥离**

`packages/print-core/src/designer/utils/migrate.ts` 第 23-35 行整函数替换为：

```ts
export function normalizeTemplateUnits(data: TemplateData): TemplateData {
  // 2.0.0 起首页叠加区已移除：残留该键的旧模板一律剥离，既不换算也不再进渲染
  const rest: Record<string, unknown> = { ...data }
  delete rest.firstPageOverlay
  if (rest.unit === 'mm') return rest as unknown as TemplateData
  const src = rest as unknown as TemplateData
  const convert = (els?: PrintElementData[]): PrintElementData[] => els?.map(convertElement) ?? []
  return {
    ...src,
    unit: 'mm',
    elements: convert(src.elements),
    header: src.header ? { ...src.header, elements: convert(src.header.elements) } : src.header,
    footer: src.footer ? { ...src.footer, elements: convert(src.footer.elements) } : src.footer,
  }
}
```

Run: `npm run test -w @worm-vue3-print/core -- src/designer/utils/__tests__/migrate.spec.ts`
Expected: PASS（4 项全绿）

- [ ] **Step 3: 删类型字段与截图宿主契约**

`packages/print-core/src/designer/types.ts`：删除第 55-58 行

```ts
firstPageOverlay: {
height: number // mm
elements: TemplateElement[]
}
```

（该文件里 `header` / `footer` 块与之同形，只删 `firstPageOverlay` 一块；删后紧跟 `elements: TemplateElement[] // 内容区主体元素`。）再删除第 425-432 行的两个截图契约（连同其后空行）：

```ts
/** 截图请求载荷（设计器叠层对比用） */
export interface ScreenshotRequest {
  templateJson: TemplateData
  printData: Record<string, any>
}

/** 截图适配器：宿主依据模板 + 数据返回 PNG Blob */
export type RequestScreenshotFn = (req: ScreenshotRequest) => Promise<Blob>
```

第 423 行的分节注释 `// ─── 宿主能力注入：开源核心不直接发起网络请求，以下能力由宿主实现后注入 ───` 与其后 `UploadImageFn`（第 434 行起）**保留**——图片上传仍是有效契约。

`packages/print-core/src/render/types.ts`：删除第 86 行 `  firstPageOverlay: { height: number; elements: TemplateElement[] }`

- [ ] **Step 4: 按 TS 报错清单清余下夹具行**

Run: `npm run build -w @worm-vue3-print/core 2>&1 | grep -E "firstPageOverlay|error TS" | head -40`
Expected: 列出全部多余属性位置。逐处删除整行 `firstPageOverlay: { height: 0, elements: [] },`（已被前面任务清掉的跳过）：

- `src/render/types.test.ts:12`、`src/render/text-fit.test.ts:126`、`src/render/watermark.test.ts:33`、`src/render/multilevel-header.test.ts:54`
- `src/render/data-binder.test.ts`：11、112、154、182、204、225、249（整行）；**102 与 142 是单行内联对象**，删子串 `firstPageOverlay: { height: 0, elements: [] }, `（保留同行其余字段）
- `src/render/html-generator.test.ts`：23、158、925、986、1016、1061
- `src/print/__tests__/pipeline.spec.ts:16`、`src/print/__tests__/tiling.spec.ts:35`、`src/print/__tests__/tile-compose.spec.ts:27`、`src/print/__tests__/batch-compose.spec.ts:12`
- `src/browser/__tests__/browser-runtime.spec.ts:19`、`src/designer/utils/__tests__/paper-presets.spec.ts:18`、`src/designer/utils/__tests__/zone-layout.spec.ts:12`

- [ ] **Step 5: 全仓验证（跨包不得有残留引用）**

Run: `npm run build && npm test`
Expected: 五包构建全绿、测试全绿。若 `canvas` / `common` / `render` 报出 `firstPageOverlay` 或 `RequestScreenshotFn` 缺失，说明对应任务有漏项，回到该任务补齐，**不得在此处加兼容分支**。

> 本任务**不要**跑 `npm run typecheck --prefix demo`：`demo/src/samples/*.ts` 要到 Task 11 才剥离该键，此间 demo 类型检查必然红，属预期缺口，不在这里追。

Run: `grep -rn "firstPageOverlay" packages/print-core/src packages/print-canvas/src packages/print-common/src services clients/*/src --exclude-dir=dist --exclude-dir=node_modules`
Expected: 只剩**有意保留**的三类命中：`designer/utils/migrate.ts` 的剥离实现、`migrate.spec.ts` 的剥离断言夹具、`render/pagination-engine.test.ts` 的可证伪语义锁。`canvas`、`common`、`services`、`clients/*/src` 必须为 0 —— 本判据的口径是「代码读取点零残留」，`skills/` 与 `docs/` 内的资产与文档命中属 Task 11/12 范围，不计入此处。

- [ ] **Step 6: 提交**

```bash
git add packages/print-core
git commit -m "$(cat <<'EOF'
core 删除 firstPageOverlay 字段与截图宿主契约类型，迁移改为无条件剥离

designer 与 render 两处 TemplateData 去掉该字段，designer 子路径不再导出 ScreenshotRequest/RequestScreenshotFn；normalizeTemplateUnits 无条件剥离废弃键（unit 已是 mm 的旧模板同样处理），导入含该键的历史模板不报错、坐标不再错换算；各测试夹具的多余属性同步清空。
EOF
)"
```

---

## Task 11: 模板资产与 skill 生成器

**Files:**
- Modify: `skills/print-template-json/scripts/build_template.py:10-11`、`326`
- Modify: `skills/print-template-json/references/template-schema.md:25`
- Modify: skills 8 份模板 JSON、`demo/src` 3 份 JSON、`demo/src/samples` 7 份 ts、`clients/print-client/src/main/test-template.json:8`
- Regenerate: `demo-common/apps/{vue3,vue2,react,jquery}/src/templates.js` 与派生样式

**Interfaces:**
- Consumes: Task 10 的字段剥离迁移
- Produces: 项目内不存在任何写入 `firstPageOverlay` 的模板与生成路径；skill 产出的新模板可直接被 2.0.0 导入

- [ ] **Step 1: 停掉生成器产出废弃字段**

`skills/print-template-json/scripts/build_template.py`：删除第 326 行 `        'firstPageOverlay': {'height': 0, 'elements': []},`；第 10 行 docstring 改为

```python
简写描述只需给出「纸张 + 元素列表」，骨架字段（header/footer/unit/
```

（第 11 行 `元素 id/printElementType/表格占位格）由本脚本补齐，避免手写完整 JSON 时漏字段。` 原样保留。）

`skills/print-template-json/references/template-schema.md`：删除第 25 行 `  "firstPageOverlay": { "height": 0, "elements": [] },`

- [ ] **Step 2: 清模板 JSON 与 samples 的该键**

逐文件删除该键（skills 8 份都是 `{ "height": 0, "elements": [] }` 单行，删行即可；删后需保证上一行结尾逗号仍然合法）：

- `skills/print-template-json/assets/templates/`：`weight-label:19`、`sales-outbound:96`、`price-label:33`、`thermal-receipt:19`、`comprehensive-showcase:59`、`express-waybill:21`、`asset-tag:33`、`purchase-receipt:78`
- `demo/src/`：`template-comprehensive-showcase.json:59`、`template-purchase-receipt.json:78`、`template-pagination-edge.json:21/206/283/414/521`
- `demo/src/samples/`：`asset-tag.ts:79`、`express-waybill.ts:79`、`price-label.ts:87`、`roll-label.ts:99`、`sales-outbound.ts:87`、`thermal-receipt.ts:66`、`weight-label.ts:118`
- `clients/print-client/src/main/test-template.json:8`

- [ ] **Step 3: 用 skill 自检脚本证明模板仍可导入**

Run: `python3 skills/print-template-json/scripts/validate_template.py --help >/dev/null 2>&1; for f in skills/print-template-json/assets/templates/*.json; do python3 skills/print-template-json/scripts/validate_template.py "$f" || echo "FAIL $f"; done`
Expected: 无 `FAIL` 行（若脚本参数形态不同，以 `--help` 输出为准调整）

Run: `python3 -c "import json,glob;bad=[f for f in glob.glob('skills/print-template-json/assets/templates/*.json')+glob.glob('demo/src/*.json') if 'firstPageOverlay' in json.load(open(f))];print('BAD:',bad)"`
Expected: `BAD: []`

- [ ] **Step 4: 重生成多宿主示例产物**

```bash
npm run samples:demo-common && npm run styles:demo-common
```

Run: `grep -c firstPageOverlay demo-common/apps/vue3/src/templates.js demo-common/apps/react/src/templates.js demo-common/apps/vue2/src/templates.js demo-common/apps/jquery/src/templates.js`
Expected: 四个文件计数均为 `0`

Run: `npm run typecheck --prefix demo`
Expected: 通过（`demo/src/samples/*.ts` 不再缺字段也不带废弃键；Task 10 起类型已删字段，本任务是该缺口的收口点）

- [ ] **Step 5: 提交**

```bash
git add skills demo/src clients/print-client/src/main/test-template.json demo-common/apps
git commit -m "$(cat <<'EOF'
模板资产与 skill 生成器停止产出 firstPageOverlay 废弃字段

build_template.py 骨架字段去掉该键、template-schema.md 删条目；skills 8 份模板 + demo 3 份 JSON + 7 份 samples + 客户端测试模板同步剥离；多宿主示例 templates.js 与派生样式由同源脚本重生成。
EOF
)"
```

---

## Task 12: 文档同步（中文权威 + 英文薄层 + skills references）

**Files:**
- Modify: `docs/中文/指南/{使用指南,模板设计器,渲染管线,表达式引擎,三端渲染一致性方案}.md`、`docs/中文/接口/API文档.md`、`docs/中文/示例/示例文档.md`、`docs/中文/打印设计工作台-布局线框图.md`
- Modify: `docs/en/Overview.md`、`README.md`
- Modify: `skills/worm-vue3-print-integration/references/{integration-api,server-render,host-integration-guide}.md`、`skills/worm-vue3-print-integration/SKILL.md`

**Interfaces:**
- Consumes: Task 2-11 的最终形态
- Produces: 对外文档不再描述「首页专属」「叠层对比」「`POST /render/screenshot`」

- [ ] **Step 1: 首页专属描述清除**

- `docs/中文/指南/使用指南.md:17`：删除表格行 `| \`firstPageOverlay\` | 首页叠加层 |`
- `docs/中文/指南/模板设计器.md`：删除第 126 行 schema 字段；第 160 行「页眉、页脚、首页叠加区的文本元素同样参与」改「页眉、页脚的文本元素同样参与」；第 178 行删去「`firstPageOverlay` 改为在**每个页面模板自己的首页**叠加，单页时与既有语义完全一致。」整句；第 197 行「页边距、页眉页脚、首页叠加、水印与内容元素按页独立」去掉「首页叠加、」
- `docs/中文/接口/API文档.md:148`：删去「`firstPageOverlay` 在每个模板自己的首页叠加（单模板时与旧语义等价）；」
- `docs/中文/指南/表达式引擎.md:163`：「元素、页眉/页脚、首页叠加与表格单元格都一致」改「元素、页眉/页脚与表格单元格都一致」
- `docs/中文/打印设计工作台-布局线框图.md`：第 28 行删去 `[首页叠加占位]` 格、第 78 行整行删除、第 93 行「三区高度（页眉 / 页脚 / 首页叠加高度）」改「页眉/页脚高度」

- [ ] **Step 2: 叠层对比与宿主截图契约描述清除**

- `docs/中文/指南/模板设计器.md`：删除第 36 行 props 表行；第 80-92 行示例块删去 `RequestScreenshotFn` import 项与 `requestScreenshot` 常量整段（保留 `uploadImage` / `uploadDesignBackground`）
- `docs/中文/接口/API文档.md`：第 278 行去掉 `ScreenshotRequest` 等、第 290 行删 `ScreenshotRequest, RequestScreenshotFn, `、第 310 行整行删除
- `docs/中文/示例/示例文档.md`：第 233 行标题改「## 六、宿主能力注入：图片上传」；第 236 行 import 去掉 `RequestScreenshotFn`；删除第 238-245 行 `requestScreenshot` 示例；删除第 260 行 `  :request-screenshot="requestScreenshot"`
- `docs/中文/打印设计工作台-布局线框图.md`：第 20 行 `[叠层对比截图层]` 改回普通画布格、第 56 行操作区去掉「首页专属、叠层对比」、第 80 行整行删除
- `docs/en/Overview.md`：第 34 行「Server-side PDF / screenshot renderer」改「Server-side PDF renderer」；第 97 行「for preview, save, or screenshot」改「for preview and save」
- `skills/worm-vue3-print-integration/references/integration-api.md`：第 14 行删 `:request-screenshot="requestScreenshot"`；第 70-77 行删示例函数；第 81 行去掉「`request-screenshot` 和 」只留 `upload-image`；第 93 行删 props 行
- `skills/worm-vue3-print-integration/references/host-integration-guide.md:203`：改为「图片上传是可选能力，需要时才注入 `upload-image`；不注入时对应功能隐藏，基础设计/保存/预览不受影响。」
- `skills/worm-vue3-print-integration/SKILL.md:101`：props 清单去掉 `request-screenshot`

- [ ] **Step 3: 服务端截图端点描述清除**

- `docs/中文/接口/API文档.md`：第 96 行去 `renderScreenshot`、第 97 行去 `buildScreenshotTargetSpec`、第 102 行去 `ScreenshotTargetSpec`；删除第 410-414 行整节 `### \`POST /render/screenshot\``（第 415 行的环境变量行属服务通用，保留）
- `docs/中文/指南/渲染管线.md`：删除第 112 行端点表行；删除第 199 行「截图（`renderScreenshot`）不参与拼版，仍是标签纸单页快照。」
- `docs/中文/指南/三端渲染一致性方案.md:119`：「HTTP `/render/pdf`、`/render/screenshot`」改「HTTP `/render/pdf`」
- `skills/worm-vue3-print-integration/references/server-render.md`：第 11 行端点表整行删除；第 38 行删去「截图接口是单遍 `page.screenshot()`。」；第 112 行整行删除
- `README.md:305`：「提供服务端 PDF / 截图渲染微服务（`/render/pdf`、`/render/screenshot`）」改「提供服务端 PDF 渲染微服务（`/render/pdf`）」

- [ ] **Step 4: 全库文档零残留核对**

Run: `grep -rn -E "firstPageOverlay|首页叠加|首页专属|叠层对比|requestScreenshot|renderScreenshot|/render/screenshot|ScreenshotTargetSpec" docs/中文 docs/en README.md skills packages/*/README.md services/print-render/README.md | grep -v CHANGELOG | cut -c1-160`
Expected: 空输出（CHANGELOG 旧条目按 Global Constraints 保留）

- [ ] **Step 5: 提交**

```bash
git add docs README.md skills
git commit -m "$(cat <<'EOF'
文档与集成 skill 同步：首页专属、叠层对比、服务端截图端点描述全清除

中文权威文档（模板设计器/使用指南/API/渲染管线/表达式引擎/三端一致性/线框图/示例文档）删除 firstPageOverlay 字段、requestScreenshot 契约与 POST /render/screenshot 一节；英文薄层首页、根 README、integration skill 三份 references 与 SKILL 的 props 清单同步。CHANGELOG 历史条目按事实保留。
EOF
)"
```

---

## Task 13: 版本号、变更记录与终检

**Files:**
- Modify: `packages/print-core/package.json`、`packages/print-canvas/package.json`、`packages/print-common/package.json`（`1.3.5` → `2.0.0`）
- Modify: `docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md`
- Modify: `packages/print-canvas/src/help-content/changelog.ts`、`packages/print-common/src/shell/help-content/changelog.ts`

**Interfaces:**
- Consumes: Task 1-12 全部完成
- Produces: 可发布的 2.0.0 定版状态与对外破坏性说明

- [ ] **Step 1: 三个已发布包升 2.0.0**

```bash
npm version 2.0.0 --no-git-tag-version -w @worm-vue3-print/core
npm version 2.0.0 --no-git-tag-version -w @worm-vue3-print/canvas
npm version 2.0.0 --no-git-tag-version -w @worm-vue3-print/common
```

Run: `grep -h '"version"' packages/print-core/package.json packages/print-canvas/package.json packages/print-common/package.json`
Expected: 三行均为 `2.0.0`

- [ ] **Step 2: 中文 CHANGELOG 新增 2.0.0 条目**

`docs/中文/CHANGELOG.md` 在第 4 行空行之后、`## [1.3.5] - 2026-10-01` 之前插入：

```markdown
## [2.0.0] - 2026-10-01

### ⚠️ 破坏性变更（移除功能）

- **移除「首页专属」首页叠加区**：`@worm-vue3-print/core` 的 `TemplateData.firstPageOverlay` 字段、分页引擎的首页预算扣减、`.first-page-overlay` CSS 与首页叠加层 HTML 全部删除；`@worm-vue3-print/canvas` 与 `@worm-vue3-print/common` 的工具栏「首页专属」入口、画布叠加区占位、属性面板「首页叠加高度」字段同步移除。**行为变更**：`firstPageOverlay.height > 0` 或含元素的用户自有模板，出纸排版回归「无首页叠加区」——首页内容区可用高度比 1.x 多出该叠加高度，请按新口径复核版式。导入含该字段的旧模板时由 `normalizeTemplateUnits` 自动剥离，不会报错。
- **移除设计器「叠层对比」**：canvas 的 `requestScreenshot` prop 与 `ScreenshotRequest` / `RequestScreenshotFn` 类型、Common 的 `requestScreenshot` 属性与 `setOverlay()` 公开方法删除。宿主无需再注入截图适配器。
- **移除服务端截图能力**：`@worm-vue3-print/core` 的 `renderScreenshot` / `buildScreenshotTargetSpec` / `ScreenshotTargetSpec` / `PrintSession.toScreenshot` / `PageDriver.screenshot` 与 `@worm-vue3-print/render` 的 `POST /render/screenshot` 端点删除。PDF 链路（`renderPdf`、`POST /render/pdf`）以及浏览器打印、服务端 PDF、桌面静默打印三条出纸口径均不受影响。
- `skills/print-template-json` 的模板生成器不再补齐 `firstPageOverlay` 骨架字段；内置示例模板已同步剥离。
- 已知落后：`demo/video/` 的工具栏演示视频仍包含「首页专属」「叠层对比」两个按钮的镜头，本版未重录。
```

- [ ] **Step 3: 英文 CHANGELOG 同步**

`docs/en/CHANGELOG.en.md` 在最新版本块之前插入 `## [2.0.0] - 2026-10-01` 段，`### Breaking changes (removed)` 三条与中文逐条对应（英文薄层，句式简短，不新增中文没有的说法）。

- [ ] **Step 4: 设计器内「更新记录」新增 v2.0.0 块**

`packages/print-canvas/src/help-content/changelog.ts` 与 `packages/print-common/src/shell/help-content/changelog.ts`：在 `content` 模板字符串起始处（canvas 现第 5 行 `<h2>v1.3.5 <small>2026-10-01</small></h2>` 之前）插入，面向终端用户措辞、不出现字段名等技术标识：

```html
<h2>v2.0.0 <small>2026-10-01</small></h2>

<h3>移除</h3>
<ul>
  <li><strong>「首页专属」按钮与首页叠加区</strong>：不再提供只在首页出现的额外叠加区域。此前在该区域放过内容的模板，叠加内容不再输出，首页可用高度相应增大，请按新口径复核版式。</li>
  <li><strong>「叠层对比」按钮</strong>：画布上的渲染截图叠层比对已下线，改用「预览」核对出纸效果。</li>
</ul>
```

- [ ] **Step 5: 终检**

```bash
npm run build
npm test
npm run test -w @worm-vue3-print/render
npm run test -w @worm-vue3-print/print-client
npm run parity:cross-end
```

Expected: 五条命令全部成功退出（`parity:cross-end` 需 core 与 render 已构建）

Run: `grep -rn -E "firstPageOverlay|overlayVisible|toggle-overlay|requestScreenshot|renderScreenshot|ScreenshotTargetSpec|add-overlay-element|setOverlay" packages services clients demo/src skills docs/中文 docs/en README.md --exclude-dir=dist --exclude-dir=node_modules --exclude-dir=vendor | grep -vE "CHANGELOG|superpowers|migrate\.ts|designer/utils/__tests__/migrate\.spec\.ts|pagination-engine\.test\.ts" | wc -l`
Expected: `0`。排除项即「有意保留」的兼容链与存档：`migrate.ts` 的废弃键剥离实现、`migrate.spec.ts` 的剥离断言夹具、`pagination-engine.test.ts` 的可证伪语义锁（这三处是移除说明第④条要求存在的东西，删掉它们才是缺陷）、CHANGELOG 历史条目与 `docs/superpowers/` 存档。

- [ ] **Step 6: UI 级确认（必须由人完成）**

```bash
npm run dev:demo
```

Expected: 「视图」下拉只剩标尺/网格/虚框/吸附四项且尾部无孤立分隔线；右侧页面属性显示「页眉/页脚高度 (mm)」两项、无「首页叠加高度」；画布无青色叠加区占位带。再跑 `npm run dev:demo-common:all`，四个宿主同口径，`demo-common/scripts/verify-demo.mjs` 断言全绿。

> 本条不可由代理代替：模型为 text-only，不得凭单测通过声称 UI 正确。

- [ ] **Step 7: 提交**

```bash
git add packages/print-core/package.json packages/print-canvas/package.json packages/print-common/package.json package-lock.json docs/中文/CHANGELOG.md docs/en/CHANGELOG.en.md packages/print-canvas/src/help-content/changelog.ts packages/print-common/src/shell/help-content/changelog.ts
git commit -m "$(cat <<'EOF'
版本号升至 2.0.0 并补齐移除说明的更新记录与发布说明

core/canvas/common 三个已发布包定级破坏性版本；中英 CHANGELOG 与设计器内「更新记录」写明「首页专属」「叠层对比」「服务端截图」三项移除、旧模板字段自动剥离的迁移口径，并披露工具栏演示视频尚未重录。
EOF
)"
```

---

## 交付后（不在本计划范围内）

- 推送远端与发布 npm 需另行确认：本仓库 `origin=Gitee`、`github=GitHub` 默认双推；`release.yml` 仅 `workflow_dispatch` 手动触发，推 `v*` 标签不会自动发版。
- `.release/notes-zh.md`、`.release/notes-en.md` 目前只有 v1.2.2 一条旧记录，属既有滞后，本计划不扩面处理。
- `demo/video/script-toolbar.json` 与 `demo/video/out/` 成品保留原样（裁决：不重录），已在 CHANGELOG 披露。




