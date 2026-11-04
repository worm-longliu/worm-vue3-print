# Worm Print V1.4.4 Preview (2026-11-04)

> **预览版（Prerelease）**：本版以 dist-tag `next` 发布到 npm（`@worm-vue3-print/core` / `canvas` / `common` / `skills` 的 `1.4.4`），其中 **core / canvas / common 的 latest 仍为 1.4.3**；GitHub Release 显式标记为 Prerelease。四个包的预览版均通过 `@next` 安装；生产环境建议 core / canvas / common 继续使用 1.4.3。

V1.4.4 把 AI 接入收敛成**一条链路**：浏览器设计器 ↔ 桌面客户端 ↔ AI Agent，并把「技能」做成开箱即用的 npx 安装器；设计器侧新增动态分页的流式列表容器与表格明细行按值合并。

## 重大变更：MCP 只保留桌面端单链路

- **唯一链路**：AI Agent → 桌面客户端内置 MCP（本机 HTTP `/mcp`，Bearer 鉴权）→ 浏览器设计器正在编辑的模板。不再提供 stdio 连接器、独立 MCP 服务或直连渲染服务的链路。
- **工具集收敛为 8 个**：5 个纯计算工具（`print_element_kinds` / `print_validate_template` / `print_check_expression` / `print_inspect_layout` / `print_draft_template`，宿主可免审批）+ 3 个实时模板会话工具（`print_list_open_templates` / `print_get_open_template` / `print_apply_open_template`，操作浏览器里正在编辑的模板，`apply` 带防覆盖 revision，一次撤销可恢复）。
- **移除** `print_render_preview`（渲染服务预览）与 `templatePath` 文件路径入参：模板一律以 `templateJson` 内联传入；真实分页请在设计器或打印预览中确认。
- 接入方式见设置页「AI 助手」一键复制的 MCP 配置，文档：[AI 接入](docs/中文/指南/AI接入.md)。

## 新增

- **技能支持 npx 安装**：`npx @worm-vue3-print/skills <技能名>` 把 `worm-vue3-print-integration`（Vue 3）、`worm-vue3-print-common`（跨框架）、`worm-vue3-print-mcp`（MCP 与模板生成）三个使用技能安装到项目 `.agents/skills`，支持 `--repo` / `--ref` / `--dir` / `--force`。
- **流式列表动态分页容器（`flowLayoutMode`）**：`dynamic` 模式下容器高度由内容撑开，按真实文本行整行续页，文本块与跨列单元不拆行；四边内边距随内容参与分页预算，每个切片绘制完整四边边框。缺省 `fixed`，旧模板无需迁移。本期块内仅支持文本。
- **表格明细行按值纵向合并（`mergeSameValue`）**：数据行模板格声明 `"mergeSameValue": true` 后，相邻明细行该列求值文本相同即自动合并（rowspan），跨页段在页界断开、下一页首行重放该值；空值与含页码表达式的列不参与。设计器属性台与右键菜单同步提供「按值合并」开关。

## 修复

- **设计态条码默认码值可被 CODE128 编码**：内容与示例值都为空时，设计态回退显示从文字「条码」改为示例值 `12345678`，画布呈现真实的条码图样而非报错态。仅影响设计态展示，出纸逻辑不变。

## 桌面客户端（Prerelease 安装包）

- 本版重打全平台安装包（macOS Intel/Apple Silicon、Windows、Linux deb/rpm/AppImage），挂在本 Prerelease 附件与 `SHA256SUMS.txt`。
- **安装包未做 Developer ID 签名与 Windows 签名公证**（项目没有相应证书）：macOS 首次打开需 `xattr -dr com.apple.quarantine /Applications/WormPrintClient.app` 或在「系统设置 → 隐私与安全性」点「仍要打开」；Windows 在 SmartScreen 点「更多信息 → 仍要运行」。
- Linux 包在 x64 Docker 内交叉构建，未经真机出纸验证；详见 README「下载客户端安装包」一节。

---

# Worm Print V1.4.4 Preview (2026-11-04)

> **Prerelease**: this version ships to npm under the `next` dist-tag (`1.4.4` of `@worm-vue3-print/core` / `canvas` / `common` / `skills`), while **latest remains 1.4.3 for core / canvas / common**. The GitHub Release is explicitly marked as a prerelease. Install any of the four preview packages with `@next`; production users of core / canvas / common should stay on 1.4.3.

V1.4.4 collapses AI integration into **a single link** — browser designer ↔ desktop client ↔ AI Agent — and turns the skills into one-command npx installers; on the designer side it adds a dynamically paginating flow-list container and value-based row merging for table details.

## Breaking change: MCP now only works through the desktop client

- **The only link**: AI Agent → the desktop client's built-in MCP (local HTTP `/mcp`, Bearer auth) → the template open in the browser designer. There is no stdio connector, standalone MCP service, or direct render-service link anymore.
- **The tool set is now 8 tools**: 5 pure computation tools (`print_element_kinds` / `print_validate_template` / `print_check_expression` / `print_inspect_layout` / `print_draft_template`, safe to run without approval) + 3 live template-session tools (`print_list_open_templates` / `print_get_open_template` / `print_apply_open_template`, which operate on the template being edited in the browser; `apply` carries an anti-clobber revision and is recoverable in one undo).
- **Removed**: `print_render_preview` (render-service preview) and the `templatePath` file-path argument — templates are always passed inline as `templateJson`; confirm real pagination in the designer or print preview.
- See the MCP config that the settings page's "AI assistant" copies in one click; docs: [AI integration](docs/中文/指南/AI接入.md) (Chinese, authoritative).

## Added

- **Skills installable via npx**: `npx @worm-vue3-print/skills <skill>` installs the three usage skills — `worm-vue3-print-integration` (Vue 3), `worm-vue3-print-common` (cross-framework) and `worm-vue3-print-mcp` (MCP & template generation) — into the project's `.agents/skills`, with `--repo` / `--ref` / `--dir` / `--force` support.
- **Dynamic paginated container for flow lists (`flowLayoutMode`)**: in `dynamic` mode the container grows with its content and continues onto following pages by whole real text rows — text blocks and spanning cells are never split; four-side paddings join the page budget and every slice draws a complete border. The default `fixed` mode is unchanged, so old templates need no migration. Cells are text-only in this release.
- **Value-based vertical merging for table data rows (`mergeSameValue`)**: a `data` row template cell declaring `"mergeSameValue": true` merges adjacent detail rows whose evaluated text is equal (rowspan); segments crossing a page break are cut at the boundary and the next page repeats the value in its first row; empty values and page-number columns never merge. Both designers expose a "merge by value" toggle and context-menu item.

## Fixed

- **Design-time barcode falls back to a CODE128-encodable sample**: with empty content and empty `testData`, the design-time fallback now shows the sample value `12345678` instead of the text "条码", so the canvas shows a real barcode. Design-time display only; print output is unchanged.

## Desktop client (Prerelease installers)

- All platform installers were rebuilt for this release (macOS Intel/Apple Silicon, Windows, Linux deb/rpm/AppImage) and are attached to this prerelease together with `SHA256SUMS.txt`.
- **The installers carry no Developer ID signature/notarization or Windows code-signing** (the project has no such certificates): on macOS run `xattr -dr com.apple.quarantine /Applications/WormPrintClient.app` or click "Open anyway" in System Settings → Privacy & Security; on Windows choose "More info → Run anyway" on the SmartScreen prompt.
- The Linux packages are cross-built inside an x64 Docker container and have not been verified on real hardware; see the README's "Download client installers" section for details.
