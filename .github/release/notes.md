## v1.3.3（2026-09-27） · Release Notes

语言导航：**[简体中文](#简体中文)** ｜ **[English](#english)**

---

<a id="简体中文"></a>

## v1.3.3（2026-09-27）—— 简体中文

自 `v1.3.2` 以来的功能版本：5 次提交、37 个文件、约 3750 行新增。三件主干事情：**元素级边框体系落地**（画布与出纸同口径、支持逐边）、**设计器格式工具栏与格式刷**（仿 Word / WPS）、**demo 教学视频流水线**。

> 版本号取 `1.3.3`（补丁位），但本版本包含**新增可选字段**与一项**出纸行为变更**（元素级边框开始生效）。严格按语义化版本更接近 `1.4.0`；若下游用 `^1.3.x` 自动升级且不希望吃到该行为变更，请临时锁到 `~1.3.2`。

### 安装与升级

```bash
npm install @worm-vue3-print/core@^1.3.3 @worm-vue3-print/canvas@^1.3.3
```

发布到 npm 的仍然只有 `core`（渲染引擎与表达式系统）与 `canvas`（Vue 3 设计器）两个包。渲染服务 `services/print-render` 与桌面客户端 `clients/print-client` 在仓库内同仓维护，不发布 npm。

### 元素级边框（core）

- **统一判定口径**：新增 `render/element-border`（`resolveElementBorder` / `ELEMENT_BORDER_SIDES` / `acceptsElementBorder`），设计器画布与出纸调用同一函数，边框所见即所得；经 `/designer` 子路径导出供设计器复用。口径为 **px**（表格单元格边框仍是 pt），`box-sizing: border-box`，加边框不改变元素几何。
- **全量生效**：文本、长文本、图片、条形码、二维码、HTML、页码等元素都可携带边框。`rect` / `oval` / `hline` / `vline`（用 border 画自身本体）与 `table`（走单元格边框）排除在外，避免双重边框。
- **支持逐边**：`ElementOptions` 新增可选字段 `borders`（`top` / `right` / `bottom` / `left`），在整圈 `borderWidth` / `borderStyle` / `borderColor` 之上逐边覆盖；未设整圈时只有这些边生效。
- **不凭空长边框**：宽度未设、≤0 或非法值一律视为无边框，不兜底成默认边框。

### 格式工具栏与格式刷（canvas）

- **格式工具栏**（仿 Word / WPS）：字体、字号、加粗 / 下划线 / 删除线、文字颜色、背景颜色、水平与垂直对齐、边框（预设「所有 / 外侧 / 内部 / 无」+ 上下左右逐边开关 + 线型 / 线宽 / 颜色），一次作用于全部选中元素或表格单元格；多选样式不一致时以「混合」占位显示。
- **合并进顶部单行**：原第二行格式工具栏并入顶部工具栏，对齐 / 边框（格式工具栏）与排列 / 视图（顶部工具栏）收进下拉分组；过去随选中状态显隐的分组改为**常驻 + 置灰**，禁用按钮悬停提示会说明原因。
- **格式刷**：从单个源元素捕获格式快照，单击刷一次、双击连续刷、`Esc` 或清空选中退出，待刷态下画布全域显示「复制」光标。写入按目标类型过滤（文本样式只落文本 / 长文本，元素级边框只落在可携带边框的类型，背景色全类型通用），分边边框深拷贝不与源共享引用，框选多目标一次提交只记一次历史。

### 行为变更（存量模板出纸效果会变）

- **元素级边框开始生效**：以前给文本、图片等非形状元素写入过 `borderWidth` / `borderStyle` / `borderColor` 的模板，画布与纸上都不显示边框，升级后会真的画出边框。不需要请把宽度改成 0 或选「无」。矩形 / 椭圆 / 线条 / 表格不受影响。
- **设计器 DOM 结构变化**：格式工具栏不再是独立第二行，部分按钮收进下拉。宿主若对设计器内部 DOM / 类名写了选择器依赖（自动化测试、样式覆盖），需重新核对。

### 兼容性与迁移

- 模板 JSON 向后兼容：`borders` 为新增可选字段，旧模板不写即维持原状，无需迁移脚本。
- 三端同源：浏览器预览、服务端 PDF（print-render）、桌面客户端（print-client）共用 core 渲染管线，边框表现一致。

### 质量

- 新增/补充测试：canvas 51 个文件 389 项、core 61 个文件 814 项全部通过；覆盖元素级边框判定与出纸、格式工具栏读写与混合态、格式刷捕获 / 过滤 / 深拷贝 / 连续刷 / 历史计数。

### 已知限制

- 格式刷源只能是**单个**元素（多选时按钮置灰），且表格单元格上下文下不可用；单元格的批量样式请用格式工具栏。
- 元素级边框宽度为 px，单元格边框为 pt，两套口径并存（沿用历史设计），面板标签已分别标注。

---

<a id="english"></a>

## v1.3.3 (2026-09-27) — English

Feature release since `v1.3.2`: 5 commits, 37 files, ~3.75k added lines. Three headline items: **element-level borders land end to end** (one basis for canvas and paper, per-side support), **a format toolbar plus format painter in the designer** (Word / WPS style), and the **demo teaching-video pipeline**.

> The version is `1.3.3` (patch), but it adds an **optional schema field** and contains one **print behavior change** (element-level borders now actually render). Semantically this is closer to `1.4.0`; if you consume `^1.3.x` and want to avoid the behavior change for now, pin to `~1.3.2`.

### Install / upgrade

```bash
npm install @worm-vue3-print/core@^1.3.3 @worm-vue3-print/canvas@^1.3.3
```

Only `core` (engine + expression pipeline) and `canvas` (Vue 3 designer) are published to npm. The render service (`services/print-render`) and desktop client (`clients/print-client`) remain in-repo and unpublished.

### Element-level borders (core)

- **One source of truth**: new `render/element-border` (`resolveElementBorder` / `ELEMENT_BORDER_SIDES` / `acceptsElementBorder`) — the canvas and the print pipeline call the same function, so what you see is what prints; re-exported through `/designer` for the designer. Units are **px** (table cell borders remain pt) with `box-sizing: border-box`, so adding a border never changes element geometry.
- **Applies to every element type**: text, long text, image, barcode, QR code, HTML and page number can all carry a border now. `rect` / `oval` / `hline` / `vline` (they draw themselves with a border) and `table` (cell borders) are excluded to avoid double borders.
- **Per side**: `ElementOptions` gained the optional `borders` field (`top` / `right` / `bottom` / `left`) which overrides the whole-loop `borderWidth` / `borderStyle` / `borderColor` edge by edge; with no whole loop set, only those sides render.
- **No phantom borders**: a missing, ≤0 or invalid width means "no border" — it never falls back to a default.

### Format toolbar & format painter (canvas)

- **Format toolbar** (Word / WPS style): font, font size, bold / underline / strikethrough, text and background color, horizontal and vertical alignment, borders (presets "all / outer / inner / none" plus per-edge toggles and line style / width / color), applied to the whole selection of elements or table cells at once; mixed values show a "混合" (mixed) placeholder.
- **Merged into one top row**: the second-row format toolbar was folded into the top toolbar; alignment / border (format toolbar) and arrange / view (top toolbar) moved into dropdowns. Groups that used to appear and disappear with the selection are now **always present and greyed out**, and disabled buttons explain why in their hover tip.
- **Format painter**: captures a snapshot from a single source element — single click paints once, double click paints repeatedly, `Esc` or clearing the selection exits, and a `copy` cursor covers the canvas while armed. Application is filtered per target type (text styles only onto text / long text, element borders only onto types that accept them, background color onto everything), per-side borders are deep-copied, and a marquee over several targets records history once.

### Demo video pipeline

- `npm run video` chains Playwright recording → edge-tts voiceover → ffmpeg composition, including a proof-sheet style intro cover (3 s intro spliced with subtitle offset) and 16:9 1920×1080 framing.
- `VIDEO_SCRIPT` switches scripts (toolbar / expression / group lessons); the recorder supports `dblclick` / `key` / `type` / `reload` / `countAssert` steps and a cross-platform `Mod` key; `npm run video:check` validates subtitle/voiceover sync.

### Behavior changes (existing templates will print differently)

- **Element-level borders now render**: templates that previously stored `borderWidth` / `borderStyle` / `borderColor` on non-shape elements showed nothing on canvas or paper; those borders now appear. Set the width to 0 or choose "none" to remove them. Shapes, lines and tables are unaffected.
- **Designer DOM changed**: the format toolbar is no longer a separate second row and some buttons live in dropdowns. Hosts with selector dependencies on the designer's internal DOM / class names (tests, style overrides) need to re-check them.

### Compatibility & migration

- Template JSON stays backward compatible: `borders` is a new optional field, old templates simply omit it — no migration script needed.
- Identical across browser preview, server-side PDF (print-render) and the desktop client (print-client), since all three share core's render pipeline.

### Quality

- New and extended tests: 389 canvas tests (51 files) and 814 core tests (61 files) all pass, covering border resolution and print output, format toolbar read/write and mixed state, and painter capture / filtering / deep copy / repeat painting / history count.

### Known limitations

- The painter source must be a **single** element (the button greys out on multi-select) and is unavailable in the table-cell context — use the format toolbar for bulk cell styling.
- Element borders use px while table cell borders use pt; both bases coexist for historical reasons and the panels label them separately.

---

感谢所有提交者与反馈者。问题请在 [Issues](https://github.com/worm-longliu/worm-vue3-print/issues) 提出，完整变更见 [`docs/中文/CHANGELOG.md`](/docs/中文/CHANGELOG.md)。
