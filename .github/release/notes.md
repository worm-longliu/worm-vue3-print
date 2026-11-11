# Worm Print V1.4.8 (2026-11-11)

> **修复版**：`@worm-vue3-print/core` / `canvas` / `common` / `skills` 均以 dist-tag `latest` 发布到 npm `1.4.8`。GitHub Release 标记为正式版（Prerelease=false）。本版 core 出纸层零改动，**不重打客户端安装包**，`v1.4.7` 的全平台安装包继续沿用。`@worm-vue3-print/common` 仍为实验性质，不建议用于生产。

```bash
npm install @worm-vue3-print/core@1.4.8 @worm-vue3-print/canvas@1.4.8
# 实验性跨框架宿主包
npm install @worm-vue3-print/common@1.4.8
# Agent 技能安装器
npm install @worm-vue3-print/skills@1.4.8
```

## 本版内容

### 修复

- **macOS / Safari 下表格单元格右键菜单难以唤醒**（GitHub issue #6）。macOS 的 `contextmenu` 先于同一次右键的 `mouseup` 派发，表格菜单又在 `contextmenu` 里同步挂了 `mouseup` 关闭监听，WebKit/Safari 下菜单尚未进入命中测试就被当成外点移除（Chrome 仅因菜单先绘制到指针下方而未暴露）。现改为与画布元素菜单一致的外点关闭口径：`mousedown` + 菜单渲染后绑定，菜单根 `@mousedown.stop` 保证菜单项点击不受影响。实测 WebKit 快速右键驻留 0/20 → 5/5，Chrome 5/5；菜单项点击、外点关闭与菜单内按下均正常。

本版只动 `canvas` 的表格元素组件与其单测，`core` 的渲染、分页与出纸管线未触碰。

真实分页与最终出纸效果仍需通过设计器或打印预览确认。明细见 [更新日志](https://github.com/worm-longliu/worm-vue3-print/blob/master/docs/中文/CHANGELOG.md)。

## 安装包

本版沿用 `v1.4.7` 的客户端安装包（core 出纸层无改动），请从 `v1.4.7` 发行版的 Assets 下载：

- `WormPrintClient-1.4.7-mac-x64.dmg`
- `WormPrintClient-1.4.7-mac-arm64.dmg`
- `WormPrintClient-1.4.7-win-x64.exe`
- `WormPrintClient-1.4.7-linux-amd64.deb`
- `WormPrintClient-1.4.7-linux-x86_64.rpm`
- `WormPrintClient-1.4.7-linux-x86_64.AppImage`
- `SHA256SUMS.txt`

---

# Worm Print V1.4.8 (2026-11-11) — English

> **Patch release**: `@worm-vue3-print/core` / `canvas` / `common` / `skills` ship to npm under the `latest` dist-tag at version `1.4.8`. The GitHub Release is marked as a regular release (Prerelease=false). Core's print layer is untouched, so **desktop installers are not rebuilt** and the `v1.4.7` installers remain the downloadable ones. `@worm-vue3-print/common` remains experimental and is not recommended for production.

```bash
npm install @worm-vue3-print/core@1.4.8 @worm-vue3-print/canvas@1.4.8
# Experimental cross-framework host package
npm install @worm-vue3-print/common@1.4.8
# Agent skill installer
npm install @worm-vue3-print/skills@1.4.8
```

## What's in this release

### Fixed

- **Table cell context menu hard to open on macOS/Safari** (GitHub issue #6). On macOS the `contextmenu` event fires before the same gesture's `mouseup`; the table menu registered its "close on outside release" listener during `contextmenu`, so under WebKit/Safari the menu was removed as an outside click before it entered hit testing. Chrome only appeared unaffected because the menu was painted under the pointer before release. The menu now uses the same outside-close behavior as the canvas element menu: close on `mousedown`, bound after the menu renders, with `@mousedown.stop` on the menu root so item clicks still work. WebKit quick right-click retention went from 0/20 to 5/5; Chrome remains 5/5; menu item clicks, outside close, and press-inside behavior are all verified.

This release only changes the table element component in `canvas` and its unit test; core's render, pagination, and print pipeline are untouched.

Confirm actual pagination and final output in the designer or print preview. See the [changelog](https://github.com/worm-longliu/worm-vue3-print/blob/master/docs/en/CHANGELOG.en.md) for details.

## Installers

This release reuses the `v1.4.7` desktop installers (core's print layer is unchanged). Download them from the `v1.4.7` release Assets:

- `WormPrintClient-1.4.7-mac-x64.dmg`
- `WormPrintClient-1.4.7-mac-arm64.dmg`
- `WormPrintClient-1.4.7-win-x64.exe`
- `WormPrintClient-1.4.7-linux-amd64.deb`
- `WormPrintClient-1.4.7-linux-x86_64.rpm`
- `WormPrintClient-1.4.7-linux-x86_64.AppImage`
- `SHA256SUMS.txt`
