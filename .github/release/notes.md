# Worm Print V1.4.7 (2026-11-09)

> **正式版**：`@worm-vue3-print/core` / `canvas` / `common` / `skills` 均以 dist-tag `latest` 发布到 npm `1.4.7`。GitHub Release 标记为正式版（Prerelease=false）。`@worm-vue3-print/common` 仍为实验性质，不建议用于生产。

```bash
npm install @worm-vue3-print/core@1.4.7 @worm-vue3-print/canvas@1.4.7
# 实验性跨框架宿主包
npm install @worm-vue3-print/common@1.4.7
# Agent 技能安装器
npm install @worm-vue3-print/skills@1.4.7
```

## 本版亮点

- **AI 先看图、再写回画布：MCP 工具由 9 个增至 12 个**。新增 `print_preview_template`，走桌面客户端完整渲染管线（测量 → 分页 → 出纸）把模板渲染成单页 PNG 返回给模型自评版式——对齐、密度、留白、溢出、条码清晰度不再靠推断；长文本换行、表格分页、页眉页脚重复都是真实效果，多页模板用 `page` 参数逐页看，只读不写、不落画布。
- **参考设计稿测量与视觉回验**。`print_analyze_reference_image` 读取本地参考稿，输出内容区、竖横线、文本行与表格候选的像素与归一化坐标，给出 `dpi` 或 `paper` 时附毫米层；`print_compare_with_reference` 把渲染结果与参考图各自按内容区归一化后逐线比对位置与起止范围，返回 `pass` / `fail` / `inconclusive`。三个新工具在客户端启用 MCP 后**无条件注册**，预览走本地管线与隐藏窗口，不需要另配渲染服务。
- **6 个版式 preset**：`doc-a4`、`doc-a5`、`receipt-80mm`、`label-60x40`、`label-40x30`、`waybill-100x150`。表格列宽跟随最终内容宽等比缩放、末列吸收舍入，固定纸底边留 2mm 安全线。
- **整表统一网格只写一次**。表格元素新增 `tableDefaultBorders` 作为全部单元格边框的继承基线，四边可分别缺省：单元格自身声明优先，缺的那边继承元素级默认，两边都没有才为 `none`。未声明该字段的旧模板出纸逐字不变。
- **客户端设置页可复制 Agent 接入提示词**：按场景（实时模板编辑 / Vue 3 接入 / Common 接入）生成含真实 MCP URL 与 Bearer token 的 `mcpServers` JSON、技能 npx 安装命令与 Gitee 镜像备用命令。令牌属敏感凭据，界面已提示勿外发。
- **零框架宿主滚动后标尺错位与视口跳顶已修**（GitHub PR #13）：重绘后恢复滚动位置、标尺测量不再重复叠加滚动量、缩放同步记账、滚动时定点更新浮层 transform。**Vue3 画布实现零改动**（它由响应式与常驻 DOM 天然满足该口径），本版只补齐回归用例。
- **桌面客户端重新打包**：macOS Intel / Apple Silicon、Windows x64、Linux deb / rpm / AppImage 六件安装包均更新为 `1.4.7`，附 `SHA256SUMS.txt`。core 出纸层有改动，故本版不沿用上版安装包。

本版能力主要来自 GitHub PR #12（MCP 视觉回验，含两轮评审修复）与 PR #13（标尺滚动），另有客户端接入提示词、打包脚本按平台拆分与测试补齐。逐页截取时 `{totalPages}` 恒为 1 的失真、预览按元素 ID 重复计数、空 spec 起草静默出白纸、以及 `showBarcodeText` / `tableDefaultBorders` 正确写法被误报未知键，均已修复。

## 已知限制

- 参考图比对**只覆盖线条**，不比对文字内容与字体；`inconclusive` 表示判据不足，**不代表通过**。
- `diffMmApprox` 按纸张尺寸而非内容区换算，是近似值，仅供量级判断；线长匹配用贪心最近邻，密集双线场景可能低估偏差，但不会把 `fail` 误判成 `pass`。
- 参考图无闭合外框时内容区退化为整图、置信度 low，整版平移保护不生效；长边 <300px 的小图可能漏检。
- 参考图硬上限：PNG / JPEG / BMP / WebP，≤20MiB、长边 ≤4000px、总像素 ≤2000 万，尺寸在解码前由容器头预检拦截；WebP 头解析只覆盖常见 VP8X / VP8L / VP8 子块。
- 预览与比对渲染总预算 20s（单截止时间），串行门禁排队时间不计入该预算，属设计取舍。
- preset 的几何保证仅限其默认纸张：覆盖纸型或边距后，条码等固定坐标元素不跟着缩放，可能落到纸外。
- 渲染类工具如实声明 `openWorldHint: true`——模板引用的远程图片/字体可能触发网络请求或读取本地文件，宿主应就此征求用户批准。
- 零框架宿主 `RULER_THICK=20` 与 core `RULER_THICKNESS=22` 仍差 2px，本版未处理且被回归用例固化；属性台 pane 的同类滚动丢失另算。
- Linux 三包仍未在真实 Linux 主机上验证；安装包未做代码签名与公证，首次打开会有系统安全提示。

真实分页与最终出纸效果仍需通过设计器或打印预览确认。明细见 [更新日志](https://github.com/worm-longliu/worm-vue3-print/blob/master/docs/中文/CHANGELOG.md)。

## 安装包

从本 Release 的 Assets 下载：

- `WormPrintClient-1.4.7-mac-x64.dmg`
- `WormPrintClient-1.4.7-mac-arm64.dmg`
- `WormPrintClient-1.4.7-win-x64.exe`
- `WormPrintClient-1.4.7-linux-amd64.deb`
- `WormPrintClient-1.4.7-linux-x86_64.rpm`
- `WormPrintClient-1.4.7-linux-x86_64.AppImage`
- `SHA256SUMS.txt`

---

# Worm Print V1.4.7 (2026-11-09) — English

> **Regular release**: `@worm-vue3-print/core` / `canvas` / `common` / `skills` ship to npm under the `latest` dist-tag at version `1.4.7`. The GitHub Release is marked as a regular release (Prerelease=false). `@worm-vue3-print/common` remains experimental and is not recommended for production.

```bash
npm install @worm-vue3-print/core@1.4.7 @worm-vue3-print/canvas@1.4.7
# Experimental cross-framework host package
npm install @worm-vue3-print/common@1.4.7
# Agent skill installer
npm install @worm-vue3-print/skills@1.4.7
```

## Highlights

- **See before writing back: MCP tools grow from 9 to 12.** The new `print_preview_template` renders a template to a single-page PNG through the desktop client's full pipeline (measure → paginate → print) so the model can review layout — alignment, density, whitespace, overflow, and barcode clarity are no longer guesswork. Long-text wrapping, table pagination, and repeated headers/footers are real; multi-page templates are reviewed page by page via `page`, read-only and never touching the canvas.
- **Reference measurement and visual verification.** `print_analyze_reference_image` reads a local reference design and returns pixel and normalized coordinates for the content area, rules, text lines, and table candidates, with a millimetre layer when `dpi` or `paper` is given. `print_compare_with_reference` normalizes both images against their own content areas and compares rule positions and spans line by line, returning `pass` / `fail` / `inconclusive`. All three new tools are registered **unconditionally** once MCP is enabled; previewing uses the local pipeline and a hidden window, so no separate render service is required.
- **Six layout presets**: `doc-a4`, `doc-a5`, `receipt-80mm`, `label-60x40`, `label-40x30`, `waybill-100x150`. Table column widths scale with the final content width, the last column absorbs rounding, and fixed paper keeps a 2mm bottom safety line.
- **Declare a uniform table grid once.** The new element-level `tableDefaultBorders` acts as the inheritance baseline for every cell border, with each of the four sides independently optional: a cell's own declaration wins, a missing side inherits the element default, and only when neither exists is it `none`. Output for existing templates without the field is unchanged byte for byte.
- **Copyable Agent integration prompts** in the client settings page, generated per scenario (live editing / Vue 3 / Common) with the real MCP URL and Bearer token as `mcpServers` JSON, the skill npx install command, and a Gitee mirror fallback. The token is sensitive and the UI warns against sharing it.
- **Ruler misalignment and viewport jump-to-top after scrolling fixed in the zero-framework host** (GitHub PR #13): scroll position is restored after repaint, ruler measurement no longer double-adds the scroll offset, zoom keeps bookkeeping in sync, and the overlay transform updates in place. **The Vue 3 canvas implementation is unchanged** (reactivity and persistent DOM already satisfy it); only regression cases were added.
- **Rebuilt desktop client**: six installers for macOS, Windows, and Linux at version `1.4.7`, together with `SHA256SUMS.txt`. Core's print layer changed, so this version does not reuse the previous installers.

This version comes mainly from GitHub PR #12 (MCP visual verification, including two review rounds) and PR #13 (ruler scrolling), plus client integration prompts, per-platform packaging scripts, and added tests. Also fixed: `{totalPages}` collapsing to 1 on single-page extraction, duplicate preview bounding boxes per element ID, blank output from an empty draft spec, and valid `showBarcodeText` / `tableDefaultBorders` declarations being flagged as unknown keys.

## Known limitations

- Reference comparison **covers rules only**, not text content or fonts. `inconclusive` means insufficient evidence and **does not mean pass**.
- `diffMmApprox` converts using paper size rather than the content area, so it is approximate and only useful for order-of-magnitude judgement. Rule-span matching uses greedy nearest-neighbour, which may underestimate deviation in dense double-line scenarios but never turns a `fail` into a `pass`.
- Without a closed outer frame the content area degrades to the whole image with low confidence and shift protection does not apply; images with a long edge under 300px may miss detections.
- Reference image limits: PNG / JPEG / BMP / WebP, ≤20MiB, long edge ≤4000px, ≤20 million pixels, rejected from container headers before decoding. WebP parsing covers only common VP8X / VP8L / VP8 sub-blocks.
- Preview and comparison share a 20s budget on a single deadline; serial-gate queue time is not counted against it, a deliberate trade-off.
- Preset geometry guarantees hold only for their default paper: after overriding paper or margins, fixed-coordinate elements such as barcodes do not scale and may fall outside the sheet.
- Render tools honestly declare `openWorldHint: true` — remote images/fonts referenced by a template may trigger network requests or local file reads, and the host should ask the user for approval.
- The zero-framework host's `RULER_THICK=20` still differs from core's `RULER_THICKNESS=22` by 2px; not addressed here and pinned by regression cases. The analogous property-panel pane scroll loss is tracked separately.
- The three Linux packages are still not verified on a real Linux host; installers are not code-signed or notarized, so first launch shows a system security prompt.

Confirm actual pagination and final output in the designer or print preview. See the [changelog](https://github.com/worm-longliu/worm-vue3-print/blob/master/docs/en/CHANGELOG.en.md) for details.

## Installers

Download from this release's Assets:

- `WormPrintClient-1.4.7-mac-x64.dmg`
- `WormPrintClient-1.4.7-mac-arm64.dmg`
- `WormPrintClient-1.4.7-win-x64.exe`
- `WormPrintClient-1.4.7-linux-amd64.deb`
- `WormPrintClient-1.4.7-linux-x86_64.rpm`
- `WormPrintClient-1.4.7-linux-x86_64.AppImage`
- `SHA256SUMS.txt`