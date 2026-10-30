# Worm Print V1.4.2 (2026-10-30)

V1.4.2 是一个 patch 版本：修复表格旁竖线挤占列导致明细拆页（Gitee #IKQSRG）与流式列表双击打不开表达式编辑器，并把素材台单击复制字段名、Ctrl/⌘ 拖放字段生成静态文本、属性台「内容」分组置顶三项交互带进设计器。竖线修复改动了 core 分页引擎，**桌面客户端受影响，七件安装包按本版重打**。自 v1.4.1 以来 12 次提交（含示例站与测试夹具）。

## 新增
- **素材台单击字段复制中文名**（Gitee #IKRIZM）。拖字段进画布只带取值绑定，字段中文名常需要当静态文本复用。现在单击素材台字段行即复制中文名并就地提示「已复制」（拖拽起手不触发复制）；表达式弹窗里每个字段行右侧新增复制图标，点击后 1.2 秒变对勾。Vue3 画布与零框架宿主同口径，提示统一走 `data-tip`；复制能力收到 core 单点 `copyTextToClipboard`（安全上下文用 Clipboard API，否则回退 `textarea` + `execCommand`）。
- **Ctrl/⌘ + 拖放字段直接生成静态文本**。素材台拖字段进画布默认仍是取值绑定；按住 Ctrl（macOS 为 ⌘）在画布上松手，则生成内容为字段中文名的静态文本元素，省去「先复制字段名、再新建文本」两步。表达式弹窗里 Ctrl/⌘ + 双击字段行可把字段中文名直接插入内容（光标位于函数参数内时自动补双引号），不按修饰键仍是 `{字段}` 取值表达式。core 新增 `createFieldLabelElement`，canvas 与零框架宿主共用同一口径。macOS 会把 Ctrl+左键当作右键，实际请用 ⌘，界面文案统一写「Ctrl/⌘」。

## 变更
- **属性台「内容」分组置顶**。元素属性页签原先以「位置与尺寸」打头，「内容」（绑定表达式、图片上传）排在外观之后，改文本/图片都要往下找。现「内容」为第一个分组，位置与尺寸、外观、条码设置顺延；多选单元格时整组让位的门控不变，两宿主分组顺序一致。

## 修复
- **表格旁的竖线不再挤占表格所在列、把明细拆成两页**（Gitee #IKQSRG）。分页引擎此前按竖线的画布编辑盒宽度（3.5mm）计算横向占用，而竖线实际渲染为 0 宽 + 0.75pt 描边（约 0.26mm），与表格被判为同列后占走 165mm 版面：10 条明细的表格被拆成 2 页，竖线看起来也消失了。现在竖线按边框宽度计算横向占用（左右各半 + 0.05mm 安全余量），10 条明细回到单页，60 条明细拆页时竖线仍留在第一页。**出纸分页有变化**：含竖线与表格的模板可能从 2 页回到 1 页。
- **流式列表双击可打开表达式编辑器**。双击弹框的可编辑字段白名单漏了流式列表，而流式列表的单元模板本身就是 `options.formatter`，于是双击只选中、不弹框。现在 canvas 与零框架宿主都补上 flowList：双击元素框任意区域（含内部单元格）都会弹出表达式编辑器并预填 formatter，锁定元素仍只选中不弹框。

## 工程与验收
- 测试：core 83 文件 1214 例 / canvas 77 文件 740 例 / common 32 文件 361 例 / print-client 14 文件 110 例，共 **206 文件 2425 例全绿**；render 10 文件 38 例全绿。
- core 分页引擎有改动，桌面客户端 7 件安装包（mac x64/arm64 dmg、win x64 exe、linux deb/rpm/AppImage）按本版重打，附 `SHA256SUMS.txt`。
- 示例站：新增 GitHub Pages 多宿主部署（common 构建前置 canvas），修复 jquery 示例互跳链接失效与子路径图片 404。

> 明细见 `docs/中文/CHANGELOG.md` 的 V1.4.2 段。安装包由本次发版重打后上传，上传前本页与 README 的 v1.4.2 直链会 404。

---

# Worm Print V1.4.2 (2026-10-30)

V1.4.2 is a patch release: it fixes a vertical line beside a table consuming the table's column and splitting rows across pages (Gitee #IKQSRG), and double-clicking a flow list not opening the expression editor; it also brings click-to-copy field names, Ctrl/⌘-drag to create static text, and a "Content"-first property panel into the designer. The line fix changes core's pagination engine, so **the desktop client is affected and all seven installers are rebuilt for this release**. Twelve commits since v1.4.1 (including the demo site and test fixtures).

## Added
- **Clicking a field in the field palette copies its name** (Gitee #IKRIZM). Dragging a field onto the canvas only brings its value binding, while the display name often needs to be reused as static text. A single click on a field row now copies the display name and shows an inline "copied" hint (starting a drag does not copy); every field row in the expression dialog also has a copy icon that turns into a check mark for 1.2 seconds. The Vue 3 canvas and the zero-framework hosts behave the same and use `data-tip` for both hint states; the clipboard logic is a single core helper `copyTextToClipboard` (Clipboard API in secure contexts, `textarea` + `execCommand` fallback otherwise).
- **Ctrl/⌘ + drag a field to create static text.** Dragging a field onto the canvas still creates a value-bound element by default; holding Ctrl (⌘ on macOS) while dropping creates a static text element whose content is the field's display name, saving the "copy the name, then add a text element" detour. In the expression dialog, Ctrl/⌘ + double-clicking a field row inserts the display name into the content (quotes are added automatically when the caret is inside a function argument); without the modifier it still inserts the `{field}` value expression. Core gained `createFieldLabelElement` and both the canvas and the zero-framework hosts share it. macOS treats Ctrl+left-click as a right-click, so use ⌘ there — the UI consistently says "Ctrl/⌘".

## Changed
- **The "Content" group now leads the property panel.** Element properties used to start with "Position & size", leaving "Content" (binding expression, image upload) after appearance, so changing text or images required scrolling. "Content" is now the first group, followed by position & size, appearance and barcode settings; the gating that moves the whole group out of the way for multi-selected table cells is unchanged, and both hosts keep the same group order.

## Fixed
- **A vertical line beside a table no longer occupies the table's column and splits rows across pages** (Gitee #IKQSRG). The pagination engine used the line's canvas edit-box width (3.5mm) for its horizontal span, while a vertical line actually renders as zero width plus a 0.75pt border (~0.26mm). The line was therefore judged to share the table's column and consumed 165mm of the budget: a 10-row table was split onto 2 pages and the line appeared to vanish. Vertical lines now use the border width (half on each side plus a 0.05mm safety margin) as their horizontal span — 10 rows fit on one page again, and with 60 rows the line still stays on page 1. **Printed pagination changes**: templates that place a vertical line beside a table may go from 2 pages back to 1.
- **Double-clicking a flow list opens the expression editor.** The double-click editable-field whitelist missed flow lists, whose cell template is `options.formatter` itself, so double-clicking only selected the element. Both the canvas and the zero-framework hosts now include flowList: double-clicking anywhere in the element box (including inner cells) opens the expression editor prefilled with the formatter, while locked elements still only get selected.

## Engineering
- Tests: core 83 files / 1214 cases, canvas 77 / 740, common 32 / 361, print-client 14 / 110 — **206 files / 2425 cases, all green**; render service 10 files / 38 cases green.
- Core's pagination engine changed, so all seven desktop-client installers (mac x64/arm64 dmg, win x64 exe, linux deb/rpm/AppImage) were rebuilt for this release, with `SHA256SUMS.txt`.
- Demo site: GitHub Pages multi-host deployment (common now builds canvas first), plus fixes for the jquery demo's cross-links and sub-path image 404s.

> Details in the V1.4.2 section of `docs/en/CHANGELOG.en.md` (the Chinese changelog is authoritative). Installers are rebuilt and uploaded with this release; the v1.4.2 links in this page and the README 404 until then.
