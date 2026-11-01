# Worm Print V1.4.3 (2026-11-01)

V1.4.3 是一个 patch 版本：修掉字段 Ctrl/⌘ 拖放在 macOS 与 Windows 上「整次拖拽被原生判为无效、松手没反应」的问题（Vue3 画布与零框架宿主同口径），并把「画布看得见、纸面永远空白」的 HTML 占位元素在模板装载链上剥离。

本版改动全部落在设计器交互与模板装载链上，**未触及 core 渲染管线**（`git diff v1.4.2..HEAD` 对 `packages/print-core/src/render/*` 与 `functions/format.ts` 零命中）⇒ **桌面客户端出纸行为与 V1.4.2 完全一致，本版不重打安装包、发行版不挂附件**，可下载的最新安装包仍是 `v1.4.2`；已装 V1.4.2 客户端的用户不必升级。本版实改动两笔：8785b30（字段拖放全链路修复）与 7ccd852（core 屏蔽 HTML 占位元素类型），其余提交只作升版与发布载体同步。

## 新增
- **core 出「屏蔽元素类型」单点判据与装载入口**。`/designer` 子路径新增 `BLOCKED_ELEMENT_TYPES`（当前 `['html']`）与 `isBlockedElementType()`、`stripBlockedElements()`（正文 / 页眉 / 页脚三区各自过滤，返回新对象、不改入参）、`countBlockedElements()`（宿主装载前计数提示用，与剥离同判据）。恢复某一类型只需把它移出该表并放回素材台，不必再动渲染分支。`countBlockedElements` 本仓库两宿主尚未接入，先作为集成方可用的入口发出。

## 修复
- **字段拖放的 Ctrl/⌘ 切换不再整次会话失效**（真机复盘 macOS / Windows Chromium，三层平台陷阱逐层修）。落点 `dragover` 显式钉 `dropEffect='copy'`——不写时 Windows 按原生修饰键重算效果，按住 Ctrl 拖动会吞掉复制徽标甚至整次拒收；拖起件效果集由单一 `copy` 放宽为 `'all'`——macOS 的 ⌘ 是「切换默认拖拽动作」，锁单一效果时切换结果落在允许集外，原生会话直接判整次拖拽无效、`drop` 根本不派发（common 两处此前漏设、与 canvas 不对称，现补齐并各加守卫断言防日后收窄）；画布自绘落点徽标 `.drop-hint`，拖动期间按拖起件类型与锁存意图显示「＋ 取值字段 / ＋ 静态文本 / ＋ 元素」并跟随光标，外部拖入不显示，绕开不可控的操作系统光标；静态文本意图锁存——macOS 按住 ⌘ 松鼠标时 `drop` 仍可能不派发，改为拖拽中任一 `dragover` 见到过 ⌘/Ctrl 即锁定本次为静态文本，徽标显示同一锁存值（所见即所得），`drop` / `dragend` 后会话复位。入口文案同步为与实测一致的「拖动 / 双击途中按住 Ctrl（Mac 为 ⌘）切换」。
- **导入旧模板不再带出 HTML 占位元素**。HTML 类型是占位实现：设计态画得出来，`html-generator` 的 `case 'html'` 却只输出一个空盒子，导入后留在画布上会让人以为有内容。现在装载模板时三区（正文 / 页眉 / 页脚）里的 HTML 元素一律剥离（接在 `normalizeTemplateUnits` 上，`unit` 已是 `mm` 的模板同样处理）；元素类型可能只写在 `printElementType.type` 上，判据两处都看。**口径边界**：本版只收导入这一路——两宿主素材台的「HTML」项未摘，用它手建的元素照旧不出纸，收编手建入口另起一笔。**存量影响**：含 HTML 元素的旧模板重新导入并保存后，出纸少掉那个空 `div`；若该元素当时设了边框（元素级边框判据没排除 HTML，框线是真的会上纸），那条框线随之消失——此前它也只是一圈没有内容的框。不含 HTML 元素的模板产物逐字不变。

## 工程与验收
- 测试：core 83 文件 1219 例 / canvas 77 文件 747 例 / common 32 文件 365 例 / print-client 14 文件 110 例，共 **206 文件 2441 例全绿**；渲染服务 10 文件 38 例全绿。
- 安装包：本版未重打，Release 不挂附件；判据为 `git diff --name-only v1.4.2..HEAD` 未命中 core `render/*` 与 `functions/format.ts`。README 的直链表因此继续指向 `v1.4.2` 资产（改成 v1.4.3 反而会 404），`npm run check:release-carriers` 已支持这一形态。
- 出纸链路：模板产物、分页与三条出纸链路（浏览器打印 / 服务端 PDF / 客户端静默打印）零变化；本版两条修复均为设计器侧。

> 明细见 `docs/中文/CHANGELOG.md` 的 V1.4.3 段。

---

# Worm Print V1.4.3 (2026-11-01)

V1.4.3 is a patch release: it fixes Ctrl/⌘ field dragging being invalidated for the whole native session on macOS and Windows (same behaviour in the Vue 3 canvas and the zero-framework hosts), and strips the HTML placeholder element — visible on the canvas but never printed — when a template is loaded.

Every change sits in designer interaction or the template loading chain. **Core's render pipeline is untouched** (`git diff v1.4.2..HEAD` has zero hits for `packages/print-core/src/render/*` and `functions/format.ts`), so **the desktop client prints exactly as in V1.4.2: no installers were rebuilt and this release carries no installer assets.** the newest downloadable installers remain those of `v1.4.2`, and users on the V1.4.2 client do not need to upgrade. Two substantive commits since v1.4.2 — 8785b30 (field-drag chain fix) and 7ccd852 (core blocks the HTML placeholder element type); the rest only sync version and release carriers.

## Added
- **Core gained a single source of truth for blocked element types plus its loading helpers.** The `/designer` subpath now exports `BLOCKED_ELEMENT_TYPES` (currently `['html']`) and `isBlockedElementType()`, `stripBlockedElements()` (filters body, header and footer separately, returning a new object instead of mutating the input) and `countBlockedElements()` (same predicate, for hosts wanting a count before loading). Re-enabling a type only means removing it from the table and putting it back in the palette. `countBlockedElements` is not wired into either host in this repo yet; it ships as an integration entry point.

## Fixed
- **Ctrl/⌘ switching while dragging a field no longer dies for the whole session** (verified on real macOS / Windows Chromium; three platform traps, each fixed). `dragover` at the drop target now pins `dropEffect='copy'` — without it Windows recomputes the effect from the native modifiers, so holding Ctrl swallowed the copy badge or rejected the drop outright. The dragged item's effect set is widened from `copy` to `'all'` — on macOS ⌘ means "toggle the default drag action", and locking a single effect puts the toggled result outside the allowed set, which invalidates the entire drag so that `drop` never fires (two spots in common were missing this and are now symmetric with canvas, each guarded by an assertion against future narrowing). The canvas draws its own `.drop-hint` badge — "＋ bound field / ＋ static text / ＋ element" based on the dragged item and the latched intent — following the cursor and hidden for external drags, sidestepping the uncontrollable OS cursor. The static-text intent is latched: releasing the mouse while ⌘ is held may still not dispatch `drop`, so seeing ⌘/Ctrl in any `dragover` during the drag locks this drop as static text, the badge shows the latched value (what you see is what you get), and the session resets after `drop` / `dragend`. Hint wording now matches observed behaviour: "hold Ctrl (⌘ on Mac) at some point during the drag/double-click to switch".
- **Importing an old template no longer brings in HTML placeholder elements.** HTML is a placeholder type: the canvas draws it while `html-generator`'s `case 'html'` emits an empty box, so imported templates looked like they had content. Those elements are now stripped from the body, header and footer while loading (hooked into `normalizeTemplateUnits`, so templates already marked `unit: 'mm'` are handled too); the type may live only in `printElementType.type`, and both places are checked. **Scope**: only the import path is closed in this release — the "HTML" item is still in both palettes, so elements created by hand still produce nothing; closing that entry is a separate change. **Existing templates**: re-importing and saving a template that contained HTML elements drops that empty `div` from the output; if such an element carried a border (the element-border rule does not exclude HTML, so the line did print), the line goes away with it — previously it was only an empty frame. Templates without HTML elements are byte-for-byte unchanged.

## Engineering
- Tests: core 83 files / 1219 cases, canvas 77 / 747, common 32 / 365, print-client 14 / 110 — **206 files / 2441 cases, all green**; render service 10 files / 38 cases green.
- Installers: not rebuilt for this release and no assets attached; the criterion is that `git diff --name-only v1.4.2..HEAD` misses core's `render/*` and `functions/format.ts`. The README link table therefore keeps pointing at the `v1.4.2` assets (switching it to v1.4.3 would 404), a state `npm run check:release-carriers` now accepts.
- Print chain: template output, pagination and the three print paths (browser, server PDF, silent desktop client) are unchanged — both fixes are designer-side.

> Details in the V1.4.3 section of `docs/en/CHANGELOG.en.md` (the Chinese changelog is authoritative).
