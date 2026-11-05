# Worm Print V1.4.6 (2026-11-05)

> **正式版**：`@worm-vue3-print/core` / `canvas` / `common` / `skills` 均以 dist-tag `latest` 发布到 npm `1.4.6`。GitHub Release 标记为正式版（Prerelease=false）。`@worm-vue3-print/common` 仍为实验性质，不建议用于生产。

```bash
npm install @worm-vue3-print/core@1.4.6 @worm-vue3-print/canvas@1.4.6
# 实验性跨框架宿主包
npm install @worm-vue3-print/common@1.4.6
# Agent 技能安装器
npm install @worm-vue3-print/skills@1.4.6
```

## 本版亮点

- **MCP 原子批量 Patch**：新增 `print_patch_open_template`，按元素 ID 批量执行 `updateElement` / `moveElement`，所有操作通过后才写回一次，并返回可继续链式修改的新 revision。
- **精简实时模板读取**：`print_get_open_template` 新增 `view=summary`、`elementIds`、`includeFields` 和 `includePrintData`，小改无需反复传输完整模板。
- **写回可观测性与反馈**：增加 MCP 请求、会话排队/往返和浏览器写回分段耗时；revision 使用单项缓存，画布写回开始即显示处理中提示。
- **桌面客户端重新打包**：macOS Intel / Apple Silicon、Windows x64、Linux deb / rpm / AppImage 六件安装包均更新为 `1.4.6`，附 `SHA256SUMS.txt`。

Patch 与整份写回都保留 `baseRevision` 防覆盖、模板契约校验、封禁元素和体积门禁。真实分页与出纸效果仍需通过设计器或打印预览确认。

## 安装包

从本 Release 的 Assets 下载：

- `WormPrintClient-1.4.6-mac-x64.dmg`
- `WormPrintClient-1.4.6-mac-arm64.dmg`
- `WormPrintClient-1.4.6-win-x64.exe`
- `WormPrintClient-1.4.6-linux-amd64.deb`
- `WormPrintClient-1.4.6-linux-x86_64.rpm`
- `WormPrintClient-1.4.6-linux-x86_64.AppImage`
- `SHA256SUMS.txt`

---

# Worm Print V1.4.6 (2026-11-05) — English

> **Regular release**: `@worm-vue3-print/core` / `canvas` / `common` / `skills` ship to npm under the `latest` dist-tag at version `1.4.6`. The GitHub Release is marked as a regular release (Prerelease=false). `@worm-vue3-print/common` remains experimental and is not recommended for production.

```bash
npm install @worm-vue3-print/core@1.4.6 @worm-vue3-print/canvas@1.4.6
# Experimental cross-framework host package
npm install @worm-vue3-print/common@1.4.6
# Agent 技能安装器
npm install @worm-vue3-print/skills@1.4.6
```

## Highlights

- **Atomic MCP patches**: the new `print_patch_open_template` tool batches element updates and moves by ID, writes once only after every operation succeeds, and returns a new revision for chained changes.
- **Smaller live-template reads**: `print_get_open_template` now supports summary views, element/field filters, and optional print data.
- **Timing and feedback**: MCP, session, and browser timing metadata is logged; revision hashing uses a one-entry cache; pending canvas writes are surfaced immediately.
- **Rebuilt desktop client**: six installers for macOS, Windows, and Linux are provided at version `1.4.6`, together with `SHA256SUMS.txt`.

Both patch and full replacement retain anti-clobber revisions, contract validation, blocked-element checks, and payload limits. Confirm actual pagination and output in the designer or print preview.
