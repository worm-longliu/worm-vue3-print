## v1.3.0（2026-09-20） · Release Notes

语言导航：**[简体中文](#简体中文)** ｜ **[English](#english)**

---

<a id="简体中文"></a>

## v1.3.0（2026-09-20）—— 简体中文

自 `v1.2.2` 以来的第一个特性版本：174 次提交、332 个文件、约 5.7 万行新增。核心变化是一份模板终于能描述**多页不同版式**的整份文书，同时把出纸链路里几个「设计稿清楚、实物出问题」的老毛病一次性补掉：条码不再被拉伸、条码可以按打印机点阵对齐、矢量水印不会再被放大、分页不再把层叠组合拆散。

### 安装与升级

```bash
npm install @worm-vue3-print/core@^1.3.0 @worm-vue3-print/canvas@^1.3.0
```

发布到 npm 的只有 `core`（渲染引擎与表达式系统）与 `canvas`（Vue 3 设计器）两个包。渲染服务 `services/print-render`、桌面客户端 `clients/print-client`、浏览器 SDK `@worm-vue3-print/client` 在仓库内同仓维护，不发布 npm。

### 新增能力

**模板能力（core + canvas）**

- **多页面模板**：新增 wrapper 类型 `MultiPageTemplateData`（`{ version?: 1, pages: TemplateData[] }`），一份模板可由多篇版式不同的页面按固定顺序组成（如「封面 + 正文 + 条款」），全部绑定同一份数据。此前一份模板只能描述单页版式，多页只能来自内容溢出切片或同模板多份拼接。配套导出 `normalizeTemplate` / `isMultiPageTemplate` / `mergeFontDeclarations` / `composeMultiPageDocument`；各页各自跑完「绑定 → 测量 → 分页」，页码 `{pageIndex}`/`{totalPages}` 份内全局连续，整份文档一次 `page.pdf()` 出图。**单模板产物与旧版逐字一致**，由护栏测试锁死，存量模板零迁移。
- **页面内容旋转角度** `TemplateData.outputRotation`（0 / 90 / 180 / 270）：解决「横版设计、竖版出纸」，90/270 时出纸纸张宽高互换、内容整体旋转填满版面，不缩放不裁切。
- **批量打印**：`printData` 传对象数组即拼出同一模板的多份副本，份间强制分页，上限 `MAX_BATCH_COPIES` = 500 份。
- **设计背景（套打底图）** `designBackground`（`src` + `rotation`）：只在设计画布显示用于精确套打对位，预览、服务端 PDF、静默打印一律不产出。
- **标签拼版** `tiling`：把小尺寸标签按「列 × 行」铺进 A4 等目标纸，行数自动推导，不再「一张纸打一个标签」。
- **新的纸张预设**：针式打印纸（241×279.4 全等分 / 二等分 / 三等分）、标签纸（80×60 / 60×40 / 40×30mm）、热敏小票纸（57 / 80 / 110mm，连续纸）。
- **文字溢出三种形式** `textFit`：`clip` 截断、`shrink` 自动缩小（下限可调）、`autoHeight` 自适应行高；设计态字号即出纸字号。
- **模板级字体声明**：`PrintDesigner` 的 `fonts` prop 写进模板 JSON 的 `fonts` 字段，三端据此出图；字体 URL 支持独立的 `fontBaseUrl`，与图片 `baseUrl` 解耦。
- **分页：元素堆叠与显式编组同页**：纵向重叠元素按并查集聚为「堆叠单元」只占用一次版面、整组换页；`groupId` 相同的成员强绑定同页，不再被拆散。

**出纸确定性（core）**

- **条形码打印点对齐** `printerDpi`（203 / 300 / 600）：把条码最终尺寸吸附到打印机点阵网格，修复热敏机出纸「条宽忽宽忽窄、边缘发灰」；元素与表格单元格同口径支持。
- **同构水印**：改为显式矢量瓦片（`<svg class="watermark-tile">`），设计器、浏览器预览、服务端 PDF、静默打印四端一致；水印表达式支持 `{printDate}` / `{printTime}` / `{pageIndex}` / `{totalPages}` 系统变量。
- **打印管线三端同源**：新增 driver 契约 + 共享 DOM 宿主 runtime + IIFE 执行器产物与 `@worm-vue3-print/core/node` 出口，浏览器、服务端、桌面客户端共用同一份测量、分页、连续纸推导、码制渲染与出图规格。

**桌面与服务端**

- 桌面客户端 `print-client` 完成可用形态：回环 WebSocket 服务与访问控制、串行打印引擎、打印机服务、分级日志与 JSONL 任务记录、配置窗口、macOS/Windows 安装包目标，以及「保留生成的 PDF」排查开关。
- `@worm-vue3-print/client` SDK 新增 `PrintClient.printHtml()` —— 浏览器侧渲染完直送客户端静默出纸，旧 `print` 链路保留兼容。
- 渲染微服务 `@worm-vue3-print/render` 并入本 monorepo（私有服务包，不发布 npm），通过 workspace 软链消费 core。

**工具与生态**

- 新增仓库内技能 `skills/print-template-json`：用简写 JSON 生成并出纸前校验打印模板（附 7 份成品模板与数据）。
- demo 新增示例模板库（采购收货单、称签、价签、快递面单、零售小票、资产标签、销售出库单），「加载示例」改为分组选择弹窗。

### 破坏性变更（升级需要处理）

1. **移除字体查询能力**（含服务端与桌面客户端）：删除 `PrintDesigner` 的 `serverFonts` / `clientFonts` / `loadFonts` props 与「查询字体」按钮，删除 render 的 `GET /fonts` 与 `X-Font-Warnings` 响应头、SDK 的 `PrintClient.listFonts()` 与 `fonts.list` 协议，以及 core 的 `readSystemFonts` / `mergeFontSources` / `findMissingFonts`。字体可用性改由模板 `fonts` 声明 + `@font-face` 决定 → 迁移：用 `fonts` prop 声明字体，注意字体站点必须返回 `Access-Control-Allow-Origin`。
2. **移除设计器内置「加载默认布局」**与 `load-default-template` prop：模板加载/重置归属宿主业务 → 迁移：把新的 `TemplateData` 赋给 `initial-template` 引用即可重载画布（会记录一次历史，撤销可回退）。

### 行为变更（同一份模板出纸效果会变）

- **条形码不再拉伸填满可用框**，改为「条宽 → 打印机 dpi → 等比缩小」结算。缺省条宽下条码会变小（约为元素框的一半），这是有意为之——调大 `barWidth` 即可加大条码，换来的是出纸条宽稳定；因此条形码不再提供「缩放模式」，需要上限请用「最大宽高」。
- **表格单元格的 `fontFamily` 现在真正生效**：此前该字段被静默丢弃，修复后同一份旧模板的呈现会变化；同时修复含空格族名（如 `Microsoft YaHei`）不生效的问题。
- `@worm-vue3-print/render`：连续纸模板按内容推导纸高（此前固定 80×297mm）；条码/二维码渲染基线切为 `jsbarcode`/`qrcode`，与浏览器预览一致，服务端不再依赖 `bwip-js`。
- `print-client`：测量就绪等待 3s → 5s；删除渲染 worker 与 IPC 桥，改由主进程装配 core 管线与 Electron driver（协议与出纸行为不变）。

### 关键修复

- **水印经真实打印机出纸被放大约 3 倍、位移、平铺错乱**：根因是 CSS 平铺背景被 Chromium 编译成 PDF tiling pattern，而 RIP 忽略图案矩阵（CTM 3.125 = 300dpi÷96px，与实测放大倍数吻合）。改为显式矢量瓦片后出纸几何回到设计值。
- **横向页面被静默打成纵向**：出纸命令未声明纸张，CUPS 按队列默认纸张处理、`pdftopdf` 把横向页旋转 90°。现在显式下发 `-o media=…`。
- **一次 PDF 生成超时导致后续任务全部 BUSY**：`printToPDF` 回调重载已移除，且 `pageSize` 单位是英寸而非微米（误传微米会得到 21 万 × 29.7 万英寸纸张）。改用 Promise + 超时兜底，失败/超时统一返回 `PRINT_FAILED` 并释放串行锁。
- **小纸张模板输出空白第一页**（如 80×60mm）：分页引擎无条件入列空页 + DOM 执行器用 `offsetHeight`（整数 px 向上取整）测量，两处根因都已修掉。
- 多页面模板：页签名漂移与新增页重名；批量打印时份间分页失效（复用 `COPY_BREAK_CSS`）。
- `renderHtmlPages` 入参放宽为 `TemplateData | MultiPageTemplateData`，浏览器侧可直接提交多页面模板。

### 已知限制

- 多页面模板出纸时「内容旋转角度」取**首页**的 `outputRotation`（各页纸张尺寸已强制一致，角度尚未纳入一致性校验）。
- 多页面模板不支持连续纸与标签拼版，也不支持数据驱动的条件包含页。
- 桌面客户端协议接受 `color` 与 `pageRanges`，但 PDF → 系统打印链路从未应用这两个参数。
- render 的截图接口对 `printData` 数组只渲染首条（PDF 接口全量渲染），语义不同。

---

<a id="english"></a>

## v1.3.0 (2026-09-20) — English

First feature release since `v1.2.2`: 174 commits, 332 files, ~57k added lines. The headline change is that a single template can now describe a **whole document made of differently laid-out pages**, alongside fixes to the "looks right on screen, wrong on paper" class of problems: barcodes are no longer stretched, can be snapped to the printer's dot grid, vector watermarks are no longer upscaled, and stacked or grouped elements are no longer split across pages.

### Install / upgrade

```bash
npm install @worm-vue3-print/core@^1.3.0 @worm-vue3-print/canvas@^1.3.0
```

Only `core` (engine + expression pipeline) and `canvas` (Vue 3 designer) are published to npm. The render service (`services/print-render`), desktop client (`clients/print-client`) and browser SDK (`@worm-vue3-print/client`) live in this repo and are not published.

### Added

**Template capabilities (core + canvas)**

- **Multi-page templates**: new wrapper type `MultiPageTemplateData` (`{ version?: 1, pages: TemplateData[] }`) — one document composed of several pages with different layouts (cover + body + terms), all bound to the same data. Previously one template could only describe a single page layout. Exports `normalizeTemplate`, `isMultiPageTemplate`, `mergeFontDeclarations`, `composeMultiPageDocument`. Each page runs the full bind → measure → paginate pass; `{pageIndex}`/`{totalPages}` are continuous across the whole copy; the document is rasterized in a single `page.pdf()`. **Single-template output is byte-identical to the previous version**, locked down by guard tests — no migration needed.
- **Page content rotation** `TemplateData.outputRotation` (0 / 90 / 180 / 270): design in landscape, print in portrait. At 90/270 the output paper swaps width and height and the content is rotated to fill it — no scaling, no cropping.
- **Batch printing**: pass an array to `printData` to compose multiple copies of the same template with forced page breaks between copies; limit `MAX_BATCH_COPIES` = 500.
- **Design background** `designBackground` (`src` + `rotation`): a registration/overlay image shown only on the design canvas; never emitted to preview, server-side PDF or silent print.
- **Label tiling** `tiling`: lay small labels out on A4 (or another target sheet) in columns × rows instead of one label per sheet.
- **New paper presets**: dot-matrix sheets (241×279.4 / half / third), label stock (80×60 / 60×40 / 40×30 mm), receipt rolls (57 / 80 / 110 mm, continuous).
- **Three text overflow modes** `textFit`: `clip`, `shrink` (auto-reduce to a configurable floor), `autoHeight`. What you see in the designer is what prints.
- **Template-level font declarations**: the `fonts` prop of `PrintDesigner` is written to the template JSON's `fonts` field and honored by all three renderers; font URLs resolve against an independent `fontBaseUrl`, decoupled from the image `baseUrl`.
- **Pagination: element stacking and group keeping**: vertically overlapping elements are unioned into a "stacking unit" that consumes layout once and page-breaks as a whole; elements sharing `groupId` stay on the same page.

**Output determinism (core)**

- **Barcode dot-grid alignment** `printerDpi` (203 / 300 / 600): the final barcode size is snapped to the printer's dot grid, fixing "modules randomly wide or narrow, edges gray" on thermal printers — supported for both elements and table cells.
- **Isomorphic watermarks**: rendered as explicit vector tiles (`<svg class="watermark-tile">`) so designer, browser preview, server PDF and silent print agree; watermark expressions support `{printDate}` / `{printTime}` / `{pageIndex}` / `{totalPages}`.
- **One print pipeline, three targets**: driver contract + shared DOM host runtime + IIFE executor bundle and a `@worm-vue3-print/core/node` export. Browser, server and desktop share the same measurement, pagination, continuous-paper derivation, code rendering and output specs.

**Desktop & server**

- `print-client` reaches a usable state: loopback WebSocket service with access control, serial print engine, printer service, leveled logging and JSONL job history, settings window, macOS/Windows packaging targets, and a "keep generated PDF" troubleshooting switch.
- `@worm-vue3-print/client` SDK adds `PrintClient.printHtml()` — render in the browser and hand the final HTML to the client for silent printing; the legacy `print` path stays for compatibility.
- The render microservice `@worm-vue3-print/render` moved into this monorepo as a private workspace package and consumes core through a workspace link.

**Tooling & ecosystem**

- New in-repo skill `skills/print-template-json`: author templates from shorthand JSON and validate them before printing (7 sample templates included).
- The demo ships a sample template library (purchase receipt, scale label, price tag, shipping label, retail receipt, asset tag, sales delivery note) behind a grouped picker.

### Breaking changes (action required)

1. **System font discovery removed** (server and desktop): `PrintDesigner` loses `serverFonts` / `clientFonts` / `loadFonts` props and the "Query fonts" button; render loses `GET /fonts` and the `X-Font-Warnings` header; the SDK loses `PrintClient.listFonts()` and the `fonts.list` protocol; core loses `readSystemFonts` / `mergeFontSources` / `findMissingFonts`. Font availability is now fully determined by the template's `fonts` declarations and `@font-face` → migrate to the `fonts` prop, and make sure font CDNs return `Access-Control-Allow-Origin`.
2. **The designer's built-in "Load default layout" was removed**, along with the `load-default-template` prop — loading and resetting a template is the host application's job → assign a new `TemplateData` to `initial-template` to reload the canvas (it records one history entry, so undo works).

### Behavior changes (existing templates will print differently)

- **Barcodes are no longer stretched** to fill their box; size comes from module width → printer dpi → proportional shrink. With the default module width barcodes become smaller (roughly half the element box) — intentional: raise `barWidth` to enlarge, and get stable module widths in return. "Scale mode" was removed; use "max width/height" instead.
- **Table cell `fontFamily` now actually applies** — it used to be silently dropped, so existing templates will render differently; font family names containing spaces (e.g. `Microsoft YaHei`) now work too.
- `@worm-vue3-print/render`: continuous-paper templates derive their height from content (previously hard-coded 80×297 mm); barcode/QR rendering switched to `jsbarcode`/`qrcode` to match browser preview, dropping the `bwip-js` dependency.
- `print-client`: measurement readiness wait raised from 3s to 5s; the render worker and IPC bridge were replaced by the core pipeline plus an Electron driver (protocol and output behavior unchanged).

### Notable fixes

- **Watermarks printed 3× too large, offset and tiled incorrectly**: CSS repeating backgrounds were compiled by Chromium into a PDF tiling pattern whose pattern matrix the RIP ignores (CTM 3.125 = 300dpi÷96px, matching the observed scale). Explicit vector tiles restore design geometry.
- **Landscape pages silently printed as portrait**: no paper was declared, so CUPS used the queue default and `pdftopdf` rotated the page 90°. `-o media=…` is now passed explicitly.
- **One PDF generation timeout poisoned every following job with BUSY**: the `printToPDF` callback overload no longer exists, and `pageSize` is in inches, not microns (passing microns yields a 210000×297000 inch page). Now promise-based with timeout, returning `PRINT_FAILED` and releasing the serial lock.
- **Blank first page on small paper** (e.g. 80×60 mm): caused by the pagination engine queueing empty pages plus `offsetHeight` (integer px, rounded up) being used for measurement.
- Multi-page templates: drifting page names and duplicate names for new pages; missing page break between batch copies (now reuses `COPY_BREAK_CSS`).
- `renderHtmlPages` now accepts `TemplateData | MultiPageTemplateData`, so the browser can submit multi-page templates directly.

### Known limitations

- For multi-page templates the **content rotation angle is taken from the first page** (paper sizes are forced equal across pages; rotation is not part of the consistency check yet).
- Multi-page templates do not support continuous paper or label tiling, nor data-driven conditional pages.
- The desktop client protocol accepts `color` and `pageRanges`, but the PDF → system print path never applied them.
- The render service screenshot endpoint renders only the first item of a `printData` array, while the PDF endpoint renders them all.

---

感谢所有提交者与反馈者。问题请在 [Issues](https://github.com/worm-longliu/worm-vue3-print/issues) 提出，完整变更见 [`docs/中文/CHANGELOG.md`](/docs/中文/CHANGELOG.md)。
