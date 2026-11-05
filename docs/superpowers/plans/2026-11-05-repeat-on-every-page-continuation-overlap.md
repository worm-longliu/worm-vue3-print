# repeatOnEveryPage 每页重复区与正文防重叠 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 `options.repeatOnEveryPage: true` 字段，将重复元素布局到每页页眉下方；首页正文完全按设计坐标和原有分页预算布局，不受重复元素影响；续页将整组重复元素归一到页眉下方 `0` 起排并保持相对间距，正文接在实际重复区之后并扣减其预算，消除续页重叠。

**Architecture:** 继续在 `paginate()` 内复用现有 `PageSection` 和 `occupied` 记账。根据 `repeatedSorted + rotatedSettlement()` 计算重复组最小顶边 `repeatStart` 与最大底边，续页保留高度为“最大底边 − 最小顶边”；仅 `pageBroken === true` 时 `fullPageHeight()` 扣除该高度、`pageCursorTop()` 增加同一偏移。首页重复元素使用设计 `top`，续页重复元素统一平移 `-repeatStart`。连续纸不预留重复区，无 repeatOnEveryPage 与 repeat-only 模板保持原行为。

**Tech Stack:** TypeScript、Vitest、Playwright、pdfjs-dist、npm workspaces。

**Spec:** `TODO.md` T-33（2026-11-05，方案已确认；明确续页重复区从页眉下方归一起排）。

## Global Constraints

- 直接在 `master` 开发，不创建隔离工作区，不提交 `.cache/` 与 `.workbuddy/`。
- 不新增模板字段、`PageLayout` 字段或第二套渲染路径，不调整 zIndex。
- 首页设计坐标与首页预算不受重复元素影响；续页重复组从页眉下方 `0` 起排并保持相对间距；无 repeatOnEveryPage、连续纸、repeat-only 行为不变。
- 续页容量减少和总页数增加属于预期结果；底部仍不得越过物理内容区。
- 先写并运行 RED，再写最小实现；不通过删除或放宽断言掩盖回归。
- Electron 真机 PDF 未提供时，必须明确记录未覆盖。

---

### Task 1: core 每页位置与预算回归测试

**Files:**
- Modify: `packages/print-core/src/render/pagination-engine.test.ts`
- Modify: `packages/print-core/src/render/page-number-expression.test.ts`
- Modify: `packages/print-core/src/render/html-generator.test.ts`
- Modify: `packages/print-core/src/render/__tests__/flow-list-pagination.spec.ts`

**Interfaces:**
- Consumes: 现有 `paginate(template, measuredElements)`、`PageSection.renderTop/groupTop`。
- Produces: 首页重复组最小顶边 2mm、最大底边 28mm 时续页归一为 26mm 的重叠 RED；重复底边为 100mm 时仅续页表格容量下降的预算 RED；普通元素、编组、动态列表、汇总与跟随区位置断言。

- [x] **Step 1: 写表格续片重叠与分页预算 RED**

使用 A4、上下边距 10mm、无页眉页脚。固定文本/信息表最大底边为 28mm，普通表格含 20 条以上明细；断言首页切片保持设计 `top=31`，续页重复组从 `0` 起排且所有流式 section 的 `renderTop/groupTop >= 26`。另用 12 行×50mm、重复底边 100mm 的表格断言行区间为 `[0,5) / [5,8) / [8,11) / [11,12)`，证明首页预算保持 275mm、续页降为 175mm。

- [x] **Step 2: 写普通元素、编组、动态列表和跟随区 RED**

普通元素与编组断言首页保持设计坐标、续页整体平移到重复底边；动态 `flowList` 断言首页容量不变、续片起点和行容量同步变化；表格汇总/跟随区断言单独移页后的 `renderTop/groupTop` 不再硬编码为 0。调整旧 repeatOnEveryPage 用例，不再与无 repeatOnEveryPage 基线逐字比对。

- [x] **Step 3: 运行 RED**

```bash
npm test -w @worm-vue3-print/core -- --run src/render/pagination-engine.test.ts src/render/__tests__/flow-list-pagination.spec.ts
```

预期：新增断言因首页被重复区推挤、续页 `renderTop/groupTop=0`、页数或行区间仍按旧预算而失败；失败原因必须是功能缺失而非夹具错误。

### Task 2: 每页重复区保留高度最小实现

**Files:**
- Modify: `packages/print-core/src/render/pagination-engine.ts`
- Modify: `packages/print-core/src/render/html-generator.ts`

**Interfaces:**
- Consumes: Task 1 的 sections 断言、现有 `repeatedSorted`、`rotatedSettlement()`、`pageBroken`。
- Produces: 内部每页重复底边；更新后的 `sectionTop()`、`fullPageHeight()`、`pageCursorTop()` 及汇总/跟随区落点。

- [x] **Step 1: 实现每页偏移与预算扣减**

在非连续纸且存在 repeatOnEveryPage 时，取 `max(0, settle.outerBottom)` 的最大值。计算 `repeatStart = min(outerTop)`、`repeatBottom = max(outerBottom) - repeatStart`。首页 `fullPageHeight()` 保持 `contentHeight - SAFETY_MARGIN`，续页再减 `repeatBottom`；首页重复元素保持设计 `top`，续页重复元素 `renderTop = 设计 top - repeatStart`，正文 `pageCursorTop(x)` 返回 `repeatBottom + depthIn(x)`。

- [x] **Step 2: 修正硬编码续页起点**

表格汇总单独移页和 `applyFollowGroup()` 整体移页改用 `sectionTop()` / `pageCursorTop()`；编组超高判断使用实际光标。首页旋转元素的顶部越界警告仍按设计外接盒顶计算；续页重复元素按归一后的实际位置重算顶部和底部越界。整表 `renderTableElement()` 仅透传 `overrideTop`，禁止回退设计 `top`，同时保持原有不写死表格高度的测量语义。

- [x] **Step 3: 运行 core 定向测试**

重复 Task 1 Step 3 命令，随后运行 `npm test -w @worm-vue3-print/core`。预期全部通过；若无 repeatOnEveryPage 或连续纸测试变红，停止并修复兼容性，不修改其断言迎合实现。

### Task 3: 真实 PDF 几何验收与文档同步

**Files:**
- Modify: `services/print-render/src/repeat-on-every-page.integration.test.ts`
- Modify: `packages/print-core/src/designer/types.ts`
- Modify: `skills/worm-vue3-print-mcp/references/template-schema.md`
- Modify: `TODO.md`

**Interfaces:**
- Consumes: 修复后的 core 分页与 HTML/PDF 管线。
- Produces: 重复区域与续页表格文本的 pdfjs 坐标不重叠断言，以及更新后的 repeatOnEveryPage 契约说明。

- [x] **Step 1: 先增加真实渲染 RED**

模板包含固定标题/信息区和跨页表格，并直接使用 `demo/src/template-comprehensive-showcase.json` 将静态 `infoTable` 设为每页重复。通过 `renderPdf()` 生成 PDF，pdfjs 读取第二页固定文本和明细表头文本的 `transform[5]`，按 A4 高度与 mm→pt 换算比较纵向区间，断言明细表头位于固定区域下方；同时检查 `prepared.pageCount` 与核心分页产物，避免只检查文本存在。

- [x] **Step 2: 运行真实渲染测试**

```bash
npm run test -w @worm-vue3-print/render -- --run src/repeat-on-every-page.integration.test.ts
npm run test -w @worm-vue3-print/render
```

预期全部通过；若仅文本断言通过而几何断言失败，继续修复，不能删除几何断言。

- [x] **Step 3: 更新契约与 TODO**

说明 repeatOnEveryPage 首页按设计位置输出且不占位；续页重复组从页眉下方归一起排，按实际外接框高度保留区域并扣减预算；连续纸仅输出一次。TODO 记录实现与验证证据，Electron 真机未覆盖。

### Task 4: 全量验收

- [x] **Step 1: 运行仓库门禁**

```bash
npm run lint:print-architecture
npm run build
npm test
npm run test -w @worm-vue3-print/render
git diff --check
```

- [x] **Step 2: 审查影响面**

`git diff` 只能包含本计划文件、core 分页/契约及测试、render 集成测试、技能文档和 TODO。确认无第二套渲染路径、无 zIndex 修复、无无关格式化，未提交用户未跟踪文件。
