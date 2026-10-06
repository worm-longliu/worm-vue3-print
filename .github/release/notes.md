## v1.3.5（2026-10-01） · Release Notes

语言导航：**[简体中文](#简体中文)** ｜ **[English](#english)**

---

<a id="简体中文"></a>

## v1.3.5（2026-10-01）—— 简体中文

自 `v1.3.4` 以来 31 次提交。**本版本包含破坏性移除**：设计器的「首页专属」叠加区与「叠层对比」连同服务端截图链路一并下线。其余三件主干事情：**画布右键菜单全线恢复**（此前能弹出、点了没反应）、**npm 分发补齐 MIT 署名并瘦身产物**、**样式引入入口口径修正**（此前文档给的子路径根本不在包 `exports` 里）。

> ⚠️ 版本号口径：本次移除以补丁版本 `1.3.5` 发布，而不是 major 版本。这样 npm 上的版本序列不跳号，代价是 `^1.3.4` 的自动升级会直接拿到这些移除。**升级前请先按下面「破坏性移除」一节自查。**

### 安装与升级

```bash
npm install @worm-vue3-print/core@^1.3.5 @worm-vue3-print/canvas@^1.3.5
```

发布到 npm 的仍然只有 `core`（渲染引擎与表达式系统）与 `canvas`（Vue 3 设计器）两个包。渲染服务 `services/print-render`、桌面客户端 `clients/print-client` 与实验性的 `packages/print-common` 在仓库内维护，不发布 npm。

### 破坏性移除（core / canvas）

四项移除，canvas 与实验性的 print-common 两宿主同步下线：

- **「首页专属」首页叠加区整体移除**：core 的 `TemplateData.firstPageOverlay` 字段、分页引擎的首页预算扣减、`.first-page-overlay` CSS 与首页叠加层 HTML 全部删除；工具栏「首页专属」入口、画布叠加区占位、属性面板「首页叠加高度」字段同步移除。
- **「叠层对比」下线**：canvas 的 `requestScreenshot` prop 与 `ScreenshotRequest` / `RequestScreenshotFn` 类型删除，print-common 的 `requestScreenshot` 属性与 `setOverlay()` 公开方法删除。宿主无需再注入截图适配器，改用「预览」核对出纸效果。
- **服务端截图能力移除**：core 的 `renderScreenshot` / `buildScreenshotTargetSpec` / `ScreenshotTargetSpec` / `PrintSession.toScreenshot` / `PageDriver.screenshot`，以及渲染服务的 `POST /render/screenshot` 端点删除。PDF 链路（`renderPdf`、`POST /render/pdf`）与浏览器打印 / 服务端 PDF / 桌面静默打印三条出纸口径均不受影响。
- **`PrintFailureCode` 移除成员 `'SCREENSHOT_FAILED'`**：这是对外公开联合类型的成员删除，任何对该值的 `switch` 分支、赋值、类型标注都会编译报错。请删除对应分支或改用其余码值（`INVALID_PAPER` / `MEASURE_FAILED` / `RENDER_TIMEOUT` / `PDF_FAILED` / `UNSUPPORTED_RUNTIME` / `INTERNAL`）。

### 右键菜单修复（canvas，本版本主体）

三处根因，两宿主（canvas 与实验性的 print-common）同步对齐口径：

- **菜单动作全部落空**：画布「外点即关」的 `mousedown` 监听会在菜单项 `click` 之前移除菜单 DOM，元素菜单 8 项与表格菜单 12 项都能弹出、都没反应。现改为菜单根节点 `@mousedown.stop` + `contains` 守卫 + 菜单代次计数（连续右键两处不会互相关闭），动作统一经 `closeContextMenu` 解绑后派发；表格菜单同理由 `mousedown` 改 `mouseup` 关闭。
- **右键不改选中态导致操作静默无效**：复制 / 剪切 / 删除 / 层级只作用于当前选中集，先点空白取消选中、再右键元素后操作等于没选中。现右键命中非选中元素时先单选该元素（命中已选中的多选成员不打断多选），元素菜单「粘贴」补剪贴板守卫，与空白菜单口径统一。
- **表格单元格右键无反应**：单元格层原带「表格未选中即忽略」守卫，且 `stopPropagation` 已挡住元素菜单，未选中表格时右键完全静默。现先单选该表格再弹表格菜单。

### 分发与产物（core / canvas）

- 两个包补 `LICENSE` 文件与 `author` / `repository` / `readme` 元数据；构建产物统一注入 MIT 版权头（core 用 tsup banner 覆盖 esm / cjs / minify / iife，canvas 用 vite 插件覆盖 lib 产物，类型声明由 `scripts/inject-license-banner.mjs` 兜底 —— tsup 的 dts 与 `vue-tsc` 都没有 banner 能力）。
- canvas 关闭 sourcemap：tarball 由 606.9 kB 降至 203.6 kB，且不再随包发布未混淆源码。

### 样式引入方式修正（重要）

npm 宿主必须写：

```ts
import '@worm-vue3-print/canvas/style.css'
```

此前 7 处文档示例给的 `@worm-vue3-print/canvas/native-controls.css` **不在包的 `exports` 声明内**，Node 解析实测报 `ERR_PACKAGE_PATH_NOT_EXPORTED`；该文件只在源码 / 别名接入方式下存在（Vite 构建 demo 时会自动注入，故示例里看不到显式引入）。

### 行为变更与影响面

- **右键菜单开始真正执行动作**：若宿主此前按「菜单能弹但点了没用」这一表象写过兜底逻辑，升级后会真的执行复制 / 粘贴 / 删除 / 层级等操作。
- **右键会改变选中态**：右键非选中元素时选中集被替换为该元素（多选成员被右键时不替换）。依赖「右键不改变选中」的自动化脚本需重新核对。
- **含首页叠加区的自有模板会改变出纸**：`firstPageOverlay.height > 0` 或该区域内放过元素的模板，叠加内容不再输出，首页内容区可用高度比 `1.3.4` 多出该叠加高度，请按新口径复核版式。导入含该字段的旧模板时由 `normalizeTemplateUnits` 自动剥离，不会报错。
- 除 `firstPageOverlay` 的剥离外，模板 JSON 无其他字段变更。

### 文档与示例

- 新增英文首页 `docs/en/Overview.md`，页首声明由 AI 依据中文文档生成、中文版为权威版本。
- README 新增「依赖开源协议」章节：含 dev 依赖逐包审计（545 包），无 GPL / AGPL / LGPL 污染，`dompurify` 按其 Apache-2.0 分支使用，商用无风险。
- demo 新增「双列卷纸标签」示例：60×45 mm 标签拼版到 122 mm 宽卷纸，页高 = 单枚标签高（每页 2 枚），份数由渲染管线按 `perSheet` 自动分页（实测 20 枚 → 10 页），贴合标签机逐截走纸；示例计数修正为 10 份。
- demo 新增竖屏口播视频流水线：`script.json` 驱动 voice → cards → check-layout → compose → check-subs 五段，1080×1920 竖版成品与 ASS / SRT 字幕。
- **已知落后**：工具栏演示视频仍包含「首页专属」「叠层对比」两个按钮的镜头，本版未重录，看视频时请以实际工具栏为准。

### 实验性（不在 npm 发布范围内）

- `@worm-vue3-print/common`（`packages/print-common`）与多宿主示例 `demo-common/` 为**实验性质、尚未完成稳定性测试**，只在工作区内构建，未发布 npm（npm 上查询为 404）。它把设计器以零框架运行时的原生自定义元素 `<print-designer>` 提供给 **Vue 3 / Vue 2 / React / jQuery 等多种运行时框架**（含无框架宿主），不打包 Vue 运行时。
- 本周期内该包对齐了 canvas 的右键口径，并把双击改走 `mousedown` 判定器（画布是 `clear(shell)` 全量重建，第一击选中后旧节点即被替换，Chrome 不会再对新节点派发原生 `dblclick`），新增与 `dblclick-element` 对称的宿主事件 `dblclick-cell`。
- **Vue 3 项目请继续使用 `@worm-vue3-print/canvas`（成熟方案）**。

### 桌面客户端安装包（本版本起随发行版提供）

不发布 npm 的桌面客户端 `clients/print-client`（Electron 静默打印，回环 WebSocket 默认端口 17521）从本版本起以安装包附件的形式挂在本发行版页面：

| 附件 | 适用系统 |
| --- | --- |
| `WormPrintClient-1.3.5-mac-x64.dmg` | Intel Mac |
| `WormPrintClient-1.3.5-mac-arm64.dmg` | Apple Silicon Mac |
| `WormPrintClient-1.3.5-win-x64.exe` | Windows 10 / 11 x64（NSIS 安装程序，可选择安装目录、创建桌面快捷方式） |
| `SHA256SUMS.txt` | 以上安装包的 SHA-256 校验和 |

> ⚠️ **安装包未做 Developer ID 签名与公证**（本项目没有 Apple Developer ID 与 Windows 签名证书）。主程序、Helper 与 `Electron Framework` 保留 Electron 官方预编译自带的 ad-hoc 签名，所以 arm64 包在 Apple Silicon 上不缺执行前提；缺的只是 bundle 级资源封印，表现为 macOS 首次打开被 Gatekeeper 拦截。绕过方式：`xattr -dr com.apple.quarantine /Applications/WormPrintClient.app`（与系统版本无关），或 macOS 15 起在 系统设置 → 隐私与安全性 点「仍要打开」。Windows 会在 SmartScreen 提示「未知发布者」，点「更多信息」→「仍要运行」。arm64 包在 Apple Silicon 真机的实际启动**未经真机验证**（构建机为 Intel）。打包与上传步骤见 [客户端 README](https://github.com/worm-longliu/worm-vue3-print/blob/master/clients/print-client/README.md)。

### 质量

- 四工作区测试 1439 项全绿：core 814 / canvas 415 / common 120 / print-client 90。
- 移除链以「零残留」判据收口：全仓（排除 `node_modules`、`dist`）不存在任何写入 `firstPageOverlay` 的模板与生成路径，`renderScreenshot` 等截图原语与两端「叠层对比」标识已无功能引用，仅剩 `normalizeTemplateUnits` 的废弃键剥离分支与其回归用例。
- 新增右键与双击回归：canvas `CanvasAreaContextMenu.spec.ts`（18 项，含「菜单内按下不误关」）、`TableElement.spec.ts` 表格菜单块（9 项，逐命令断言行列矩阵与尺寸同步、置灰判定、历史与选区清理）；common `context-menu.spec.ts`（10 项）、`expression-dblclick.spec.ts`（8 项）。
- `npm run lint:print-architecture`（三端重复实现守卫）通过。

---

<a id="english"></a>

## v1.3.5 (2026-10-01) — English

31 commits since `v1.3.4`. **This release contains breaking removals**: the designer's "first-page-only" overlay area and "overlay compare" are gone, together with the server-side screenshot pipeline. The other three headline items: **the canvas context menu works again end to end** (it opened but every item was a no-op), **npm artifacts now carry proper MIT attribution and a slimmer tarball**, and **the documented stylesheet entry was wrong**.

> ⚠️ Versioning note: these removals ship as the patch version `1.3.5` rather than a major bump, so the npm version sequence stays uninterrupted. The trade-off is that a `^1.3.4` automatic upgrade receives them directly. **Check the "Breaking removals" section before upgrading.**

### Install / upgrade

```bash
npm install @worm-vue3-print/core@^1.3.5 @worm-vue3-print/canvas@^1.3.5
```

Only `core` and `canvas` are published to npm. The render service, the desktop client and the experimental `print-common` package remain in-repo.

### Breaking removals (core / canvas)

Four removals, taken offline in both hosts (canvas and the experimental print-common):

- **The "first-page-only" overlay area is gone**: `TemplateData.firstPageOverlay` in core, the first-page budget deduction in the pagination engine, the `.first-page-overlay` CSS and the overlay HTML are deleted; so are the toolbar entry, the canvas placeholder and the "first-page overlay height" property-panel field.
- **"Overlay compare" is gone**: canvas's `requestScreenshot` prop and the `ScreenshotRequest` / `RequestScreenshotFn` types, plus Common's `requestScreenshot` attribute and public `setOverlay()` method, are deleted. Hosts no longer need a screenshot adapter — use "Preview" to check the output.
- **Server-side screenshotting is gone**: core's `renderScreenshot` / `buildScreenshotTargetSpec` / `ScreenshotTargetSpec` / `PrintSession.toScreenshot` / `PageDriver.screenshot` and the render service's `POST /render/screenshot` endpoint are deleted. The PDF path (`renderPdf`, `POST /render/pdf`) and all three output paths — browser printing, server-side PDF, desktop silent printing — are unaffected.
- **`PrintFailureCode` lost the `'SCREENSHOT_FAILED'` member**: a member of a public union type is gone, so any `switch` branch, assignment or type annotation referencing it now fails to compile. Drop the branch or use the remaining codes (`INVALID_PAPER` / `MEASURE_FAILED` / `RENDER_TIMEOUT` / `PDF_FAILED` / `UNSUPPORTED_RUNTIME` / `INTERNAL`).

### Context menu fixes (canvas, the substance of this release)

Three root causes, aligned across both hosts (canvas and the experimental print-common):

- **Every menu action was dropped**: the canvas "close on outside press" `mousedown` listener removed the menu DOM before the item's `click` could fire, so all 8 element-menu and 12 table-menu items looked usable but did nothing. The menu root now stops `mousedown`, the outside handler is guarded with `contains`, and a generation counter stops two consecutive right-clicks from closing each other; actions dispatch through `closeContextMenu` after unbinding. The table menu switched from `mousedown` to `mouseup` for the same reason.
- **Right-click left the target unselected**: copy / cut / delete / layer act on the current selection, so right-clicking after clearing the selection silently did nothing. Right-clicking an unselected element now selects it first (right-clicking a member of a multi-selection keeps it intact), and "Paste" in the element menu gained the clipboard guard the blank-canvas menu already had.
- **Right-clicking a table cell was dead**: the cell handler required the table to be selected while `stopPropagation` suppressed the element menu. The table is now selected first, then the table menu opens.

### Distribution & artifacts (core / canvas)

- Both packages ship a `LICENSE` file plus `author` / `repository` / `readme` metadata; build artifacts carry an MIT banner (tsup banner for core, a Vite plugin for canvas lib output, `scripts/inject-license-banner.mjs` for type declarations).
- Canvas sourcemaps are disabled: the tarball went from 606.9 kB to 203.6 kB and no longer publishes readable source.

### Stylesheet entry corrected (important)

npm hosts must use `import '@worm-vue3-print/canvas/style.css'`. The `@worm-vue3-print/canvas/native-controls.css` path shown in 7 documentation examples is not in the package `exports` and Node resolves it as `ERR_PACKAGE_PATH_NOT_EXPORTED`; that file only exists in source / alias setups.

### Behavior changes

- **Context menu actions now run**: hosts that wrote workarounds around "menu opens but items do nothing" will now see real copy / paste / delete / layer operations.
- **Right-click changes the selection**: right-clicking an unselected element replaces the selection with it.
- **Templates that used the overlay area print differently**: with `firstPageOverlay.height > 0` or elements inside it, the overlay content is no longer emitted and the first page's usable height grows by that overlay height compared to `1.3.4` — re-check your layout. Importing such a template strips the field via `normalizeTemplateUnits` without erroring.
- Apart from that stripping, the template JSON format is otherwise unchanged.

### Docs & samples

- New English landing page `docs/en/Overview.md`, marked at the top as AI-generated from the authoritative Chinese docs.
- README gained a "Dependency licenses" section (per-package audit of 545 packages including dev dependencies; no GPL / AGPL / LGPL contamination; `dompurify` used under its Apache-2.0 branch).
- demo gained a two-up roll-label sample (60×45 mm labels ganged onto 122 mm roll stock, page height = one label, copies paginated by `perSheet` — 20 labels measured as 10 pages) and a portrait voice-over video pipeline (1080×1920 with ASS / SRT subtitles).

- **Known gap**: the toolbar demo videos still show the "first-page-only" and "overlay compare" buttons; they were not re-recorded for this release, so trust the actual toolbar over the footage.

### Experimental (outside the npm release scope)

- `@worm-vue3-print/common` and the `demo-common/` multi-host samples are **experimental and not yet stability-tested**; they build inside the workspace only and are not published (npm returns 404). They expose the designer as the zero-framework native custom element `<print-designer>` for Vue 3 / Vue 2 / React / jQuery and framework-less hosts, without bundling Vue. This cycle it matched the canvas context-menu semantics and moved double-click detection to a `mousedown` judge (full repaints break native `dblclick`), adding the host event `dblclick-cell`.
- **Vue 3 projects should keep using `@worm-vue3-print/canvas`.**

### Desktop client installers (new with this release)

The desktop client `clients/print-client` (Electron silent printing over a loopback WebSocket, port 17521) is not published to npm. From this release on, its installers are attached to this release page:

| Asset | Target |
| --- | --- |
| `WormPrintClient-1.3.5-mac-x64.dmg` | Intel Mac |
| `WormPrintClient-1.3.5-mac-arm64.dmg` | Apple Silicon Mac |
| `WormPrintClient-1.3.5-win-x64.exe` | Windows 10 / 11 x64 (NSIS, selectable install dir and desktop shortcut) |
| `SHA256SUMS.txt` | SHA-256 checksums for the installers above |

> ⚠️ **The installers carry no Developer ID signature and are not notarized** — the project holds no Apple Developer ID or Windows signing certificate. The main executable, the Helpers and `Electron Framework` keep the ad-hoc signature that ships inside Electron's official prebuilds, so the arm64 package is not missing any execution prerequisite on Apple Silicon; what is missing is the bundle-level resource seal, which surfaces as a Gatekeeper prompt on first launch. Bypass it with `xattr -dr com.apple.quarantine /Applications/WormPrintClient.app` (works on every macOS version), or on macOS 15 via System Settings → Privacy & Security → "Open Anyway". On Windows, SmartScreen reports an unknown publisher → More info → Run anyway. Launching the arm64 build on real Apple Silicon hardware has **not been verified** (the build machine is Intel). Packaging and upload steps live in the [client README](https://github.com/worm-longliu/worm-vue3-print/blob/master/clients/print-client/README.md).

### Quality

- 1439 tests pass across the four workspaces: core 814 / canvas 415 / common 120 / print-client 90, including new context-menu and double-click regression specs on both hosts.
- The removal chain is closed out with a zero-residue criterion: no template or generator in the repo still writes `firstPageOverlay`, the screenshot primitives and the "overlay compare" identifiers have no functional references left in either host, and what remains is only the deprecated-key stripping branch in `normalizeTemplateUnits` plus its regression cases.

---

感谢所有提交者与反馈者。问题请在 [Issues](https://github.com/worm-longliu/worm-vue3-print/issues) 提出，完整变更见 [`docs/中文/CHANGELOG.md`](/docs/中文/CHANGELOG.md)。
