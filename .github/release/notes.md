## v1.3.2（2026-09-26） · Release Notes

语言导航：**[简体中文](#简体中文)** ｜ **[English](#english)**

---

<a id="简体中文"></a>

## v1.3.2（2026-09-26）—— 简体中文

自 `v1.3.1` 以来的修复性版本：11 次提交、34 个文件、约 1500 行新增。三件主干事情：**出纸版式修正**（表格下方跟随元素的虚假间距、换页后区块叠压）、**设计台组合与多选交互修正**、**工具栏 / 图层面板图标全面焕新**。

> 版本号定为 `1.3.2`，但本版本包含一项**行为变更**（表格设计底部口径），升级前请先读「行为变更」一节。

### 安装与升级

```bash
npm install @worm-vue3-print/core@^1.3.2 @worm-vue3-print/canvas@^1.3.2
```

发布到 npm 的仍然只有 `core`（渲染引擎与表达式系统）与 `canvas`（Vue 3 设计器）两个包。渲染服务 `services/print-render` 与桌面客户端 `clients/print-client` 在仓库内同仓维护，不发布 npm。

### 关键修复

- **表格下方跟随元素的打印间距被拉大**：表格设计底部旧口径只取行高之和（min-height 语义），忽略设计器实测回写的表高——当行内容把表格撑高时，下方跟随元素（合计行、签名栏等）在纸上多出一段「实测高 − 行高和」的虚假间距（实测模板最大达 3.77 mm），而设计台上看着正常。现改为 `top + max(实测表高, Σ行高)`：以画布视觉底部为基准，行高之和保留为物理下界，避免脏数据把跟随元素反向叠压表格。三端（浏览器预览 / 服务端 PDF / 桌面客户端）同源生效。
- **分页换页后区块叠压**：换页后表格续片、组合、普通元素此前一律从新页顶部 0 开始放置，末页的组合元素会与表格续排内容叠在一起。现改为流式光标顺排放置，且表格切片起点在行组扣预算前提前捕获，跨页续排后跟随元素正确接排。补充分页引擎极限回归测试（组合整组不拆分、多区块叠页场景）。

### 设计台交互与视觉（canvas）

- **组合与多选修正**：① 取消组合入口在任一选中元素属于组时即显示；② 元素拖拽起点不再吞掉多选，Ctrl/⌘ 逐个加选在画布与图层面板均可用；③ 图层面板底部新增独立的组合 / 取消组合按钮行；④ 右键菜单移除此前并不生效的编组入口，组合入口统一为工具栏按钮、图层面板按钮与 `Ctrl+G` / `Ctrl+Shift+G`；⑤ 帮助文档补充框选方向语义（左上→右下=相交命中、右下→左上=完全包围命中）、组合强制同页与超高裁切警示，用户可见文案统一为「组合 / 取消组合」。
- **图标焕新**：工具栏 / 图层面板共 17 个图标改为 lucide 按需引入并统一补齐悬停提示，组合 / 取消组合使用专属 `Group` / `Ungroup` 图标。

### 新增示例（demo）

- **「分页极限测试」多页示例**：组合 + 表格的极端版式，用于复现与验证换页后的元素放置；缩略图组件兼容多页模板。

### 行为变更（存量模板出纸效果会变）

- **表格设计底部口径**：行内容把表格撑高的存量模板，表格下方跟随元素的出纸间距会收回到与设计台所见一致（即修复本身）。在设计器里保存过的模板属纯修复；手写 JSON 且 `options.height` 被高估的模板，在设计器打开一次即自动纠正。

### 维护

- canvas 测试新增全局 setup，修复间歇性 `localStorage` 未定义；根脚本清理已删除工作区 `@worm-vue3-print/client` 的残留引用；demo 移除失效的 `native-controls.css` 引入；文档补充 Electron 客户端依赖 core dist 子路径（`@worm-vue3-print/core/client`）的构建约定——改动 core 子入口后必须重建 core 的 dist。

### 已知限制

- 组合强制同页：组内元素合计高度超过单页可用高度时整组会被裁切，帮助面板已有警示，暂不支持自动拆组。
- render 的截图接口对 `printData` 数组只渲染首条，PDF 接口才全量渲染。

---

<a id="english"></a>

## v1.3.2 (2026-09-26) — English

Fix-oriented release since `v1.3.1`: 11 commits, 34 files, ~1.5k added lines. Three headline items: **print-layout fixes** (phantom gap under tables, blocks stacking on top of each other after a page break), **grouping & multi-select interaction fixes in the designer**, and a **full icon refresh** of the toolbar / layer panel.

> The version is `1.3.2`, but this release contains one **behavior change** (the table design-bottom basis). Read "Behavior changes" before upgrading.

### Install / upgrade

```bash
npm install @worm-vue3-print/core@^1.3.2 @worm-vue3-print/canvas@^1.3.2
```

Only `core` (engine + expression pipeline) and `canvas` (Vue 3 designer) are published to npm. The render service (`services/print-render`) and desktop client (`clients/print-client`) remain in-repo and unpublished.

### Notable fixes

- **The print gap below a table was stretched for following elements**: the table design bottom used to be the sum of row heights only (min-height semantics), ignoring the measured height written back by the designer — when row content grew the table taller, followers (total rows, signature lines, …) got an extra phantom gap of "measured height − row-height sum" on paper (up to 3.77 mm on a real template) while the canvas looked fine. It is now `top + max(measured height, Σ row heights)`: anchored at the visual bottom seen on the canvas, with the row-height sum kept as a physical lower bound so dirty data cannot push followers back onto the table. Identical across browser preview, server-side PDF and the desktop client.
- **Blocks no longer stack after a page break**: the table continuation slice, groups and plain elements all used to anchor at offset 0 of the new page, so last-page groups overlapped the table. Placement now follows a streaming cursor, and the table slice start is captured before row-group budgeting, so followers re-flow correctly after a continuation. Extreme-case regression tests (indivisible groups, stacked blocks) were added to the pagination engine.

### Designer interaction & visuals (canvas)

- **Grouping & multi-select fixes**: ① ungroup shows whenever any selected element belongs to a group; ② drag start no longer swallows the selection, Ctrl/⌘ click-to-add works on both the canvas and the layer panel; ③ the layer panel gained its own bottom row with group / ungroup buttons; ④ the (previously non-functional) context-menu entries were removed — grouping is now exactly toolbar button, layer-panel buttons, `Ctrl+G` / `Ctrl+Shift+G`; ⑤ the in-app help documents the marquee direction semantics (top-left → bottom-right = intersect hit, bottom-right → top-left = full-enclose hit), the whole-group-on-one-page rule and the over-height clipping warning; user-facing wording standardized to "组合 / 取消组合".
- **Icon refresh**: 17 toolbar / layer-panel icons migrated to on-demand lucide imports with complete tooltips; group / ungroup use the dedicated `Group` / `Ungroup` icons.

### New sample (demo)

- **"Pagination stress test" multi-page sample**: groups + tables in an extreme layout to reproduce and verify placement after page breaks; the thumbnail component now handles multi-page templates.

### Behavior changes (existing templates will print differently)

- **Table design-bottom basis**: existing templates whose row content grows the table taller will see the follower spacing below the table pulled back to what the designer shows (this is the fix itself). Templates saved in the designer are pure fixes; hand-written JSON with an overestimated `options.height` self-corrects the first time it is saved in the designer.

### Maintenance

- Global vitest setup fixes intermittent `localStorage is not defined` in canvas tests; the root scripts dropped the leftover reference to the deleted `@worm-vue3-print/client` workspace; the demo removed a stale `native-controls.css` import; docs recorded that the Electron client consumes core's dist subpath (`@worm-vue3-print/core/client`) — rebuild core's dist whenever a subpath entry changes.

### Known limitations

- A group is kept on one page: if the members' combined height exceeds the usable page height the whole group is clipped; automatic group splitting is not supported yet (the help panel warns about it).
- The render service screenshot endpoint renders only the first item of a `printData` array, while the PDF endpoint renders them all.

---

感谢所有提交者与反馈者。问题请在 [Issues](https://github.com/worm-longliu/worm-vue3-print/issues) 提出，完整变更见 [`docs/中文/CHANGELOG.md`](/docs/中文/CHANGELOG.md)。
