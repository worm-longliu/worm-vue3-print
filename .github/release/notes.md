# Worm Print V1.4.0 (2026-10-28)

V1.4.0 是一个 minor 版本：设计器支持元素级任意角度旋转与拼版按每格内容旋转，出纸新增裁切提示；打印预览默认改为 100%，并修掉二维码漏判打印分辨率、并排紧尺寸标签重复计高两条缺陷。自 v1.3.11 以来 5 次提交。

## 新增
- **元素级任意角度旋转**。元素新增 `options.rotate`（度，绕自身中心，归一到 0~359）：出纸按旋转后的外接盒分页与结算，底部放不下自动移页并按外接盒顶修正落点，连续纸推导高度天然计入外接盒。表格、流式列表与表格下方跟随区的元素 v1 不支持旋转（属性台不出该行、画布也不转，所见即所打）。条码与二维码的任意角度需 385dpi 以上打印头，低分辨率按 90° 步进出纸；模板未声明打印头分辨率时自由角度输入置灰、只留 ↺/↻ 两个步进按钮。渲染走 CSS 独立属性 `rotate`，不占用 `transform`，旧模板残留的 `transform` 键被忽略。
- **拼版按每格内容旋转**。拼版启用时「内容旋转角度」不再隐藏：0°/180° 格位不变、仅内容旋转/翻转；90°/270° 时每格占位宽高互换，列数、行数与每格数按互换后重算，切换档位时列数自动铺满新档位的上限。未设旋转的拼版模板产物逐字不变。
- **出纸裁切提示**。分页引擎按页产出 `PageLayout.warnings`：旋转后顶越页首、或元素（含旋转外接盒）超出纸面左右缘时给出「打印将被裁切」提示。只提示不阻断，不改 `overflow` 语义与出纸产物；Vue3 预览层顶部常驻提示条，保存时给一次不阻断提示，零框架宿主 `renderInBrowser()` 返回值新增 `warnings` 字段。

## 变更
- **打印预览默认按 100% 显示**。此前模板填了 `printerDpi` 默认落「点阵」档、没填落「适配」档，打开是一张被放大的纸；现默认恒为 100%（CSS 真实尺寸），五档档位与「点阵」入口不变。100% 档下细条码在屏幕上仍会塌缩，core 新增 `viewZoomHint(dpi, currentKey)`，模板声明了打印头分辨率且不在点阵档时在档位条内提示切档，切到点阵档自动收起。**出纸产物、分页与模板契约零变化。**

## 修复
- **拼版整页旋转与元素旋转叠加时二维码不受打印头分辨率约束**。斜角吸附原先只对条码生效，203dpi 工位机上二维码斜角照样出纸；现由 `resolveElementRotation()` 自取元素分辨率，条码与二维码走同一条判定。
- **并排的紧尺寸标签被重复计高挤到第二页**。纵向预算按「横向相交分列」累计，左右并排的二维码与信息行各占一列，下方整宽尾行把两列高度扣了两次，称签 / 资产 / 卷纸三份紧尺寸示例被挤到第二页、拼版模板因此拒纸。现给并排块补同一 `options.groupId`（整组同页、纵向只扣一次并集高度，组合不改几何）；三份示例、四宿主 `templates.js` 与技能资产同批改齐，技能侧 `validate_template.py` 新增 `predict_pages` 复刻引擎记账，八份技能模板 0 ERROR / 0 WARN。

## 工程与验收
- 测试：core 80 文件 1200 例 / canvas 75 文件 714 例 / common 30 文件 344 例 / print-client 14 文件 110 例，共 **199 文件 2368 例全绿**。
- `demo-common` 四宿主 `verify-demo` 52/52 ×4 全绿（含默认档 100% 与点阵切档提示两条断言）。
- core 渲染管线有改动，桌面客户端 **6 件安装包**（mac x64/arm64 dmg、win x64 exe、linux deb/rpm/AppImage）按本版重打，另附 `SHA256SUMS.txt`（共 7 个附件）。

> 明细见 `docs/中文/CHANGELOG.md` 的 V1.4.0 段。安装包已按本版重打并上传（GitHub 侧共 7 个附件，digest 与本地 `SHA256SUMS.txt` 一致）。

---

# Worm Print V1.4.0 (2026-10-28)

V1.4.0 is a minor release: the designer gains free-angle per-element rotation and per-tile content rotation in tiling, output now carries clipping warnings, print preview defaults to 100%, and two defects are fixed (QR codes bypassing the print-head resolution gate, and side-by-side tight labels being double-counted onto a second page). Five commits since v1.3.11.

## Added
- **Free-angle per-element rotation.** Elements gained `options.rotate` (degrees around the element centre, normalized to 0–359): pagination and paper-height derivation settle on the rotated axis-aligned box, so an element that no longer fits moves to the next page and lands by its box top; continuous paper height includes the box. Tables, flow lists and elements inside a table's follow region do not rotate in v1 (the property row is hidden and the canvas keeps them level). Barcode/QR free angles need a ≥385dpi head and snap to 90° steps below that; with no declared resolution the free-angle input is greyed out with only the ↺/↻ step buttons. Rendering uses the standalone CSS `rotate` property (never `transform`), and a legacy `transform` key is ignored.
- **Per-tile content rotation in tiling.** The "content rotation" row is no longer hidden when tiling is on: 0°/180° keep the grid and rotate/flip content only; 90°/270° swap each tile's footprint and recompute columns, rows and tiles per sheet, with the column count auto-filling the new tier's cap on a tier switch. Tiling templates without rotation stay byte-identical.
- **Print clipping warnings.** The pagination engine emits per-page `PageLayout.warnings` when a rotated element's box crosses the page head or an element (rotated box included) exceeds the paper's left/right edge. Advisory only: `overflow` semantics and rendered HTML are untouched. The Vue3 preview shows a persistent notice strip, saving gives one non-blocking notice, and `renderInBrowser()` in all four zero-framework hosts returns a `warnings` field.

## Changed
- **Print preview now defaults to 100%.** Templates with `printerDpi` used to land on the "dots" preset and the rest on "fit", opening an enlarged sheet; the default is now always 100% (true CSS size), with the five presets and the "dots" entry unchanged. Thin barcodes still collapse at 100% on screen, so core gained `viewZoomHint(dpi, currentKey)`, which shows a switch hint inside the preset bar whenever a template declares print-head resolution and a non-dots preset is active; it disappears on the dots preset. **Printed output, pagination and the template contract are unchanged.**

## Fixed
- **QR codes bypassed the print-head resolution gate when page and element rotation were combined.** Oblique-angle snapping only applied to barcodes, so a QR code printed at an angle on a 203dpi station; `resolveElementRotation()` now reads the element's own resolution and both code types share one rule.
- **Side-by-side tight labels were double-counted onto a second page.** The vertical budget accumulates per horizontally intersecting column, so a QR code and an info row side by side each occupied a column and the full-width row below subtracted both heights twice. The weight-tag / asset-tag / roll-label tight-size samples spilled onto page 2 and tiling templates rejected them. Those blocks now share one `options.groupId` (the group stays on one page and the union height is charged once, with no geometry change); the three samples, the four hosts' `templates.js` and the skill assets were updated together, and `validate_template.py` gained `predict_pages`, which mirrors the engine's accounting — all eight skill templates report 0 ERROR / 0 WARN.

## Engineering
- Tests: core 80 files / 1200 cases, canvas 75 / 714, common 30 / 344, print-client 14 / 110 — **199 files / 2368 cases, all green**.
- `verify-demo` across the four `demo-common` hosts: 52/52 ×4 green (including the new 100% default and dots-switch hint assertions).
- Core's render pipeline changed, so all **six desktop-client installers** (mac x64/arm64 dmg, win x64 exe, linux deb/rpm/AppImage) were rebuilt for this release, plus `SHA256SUMS.txt` (seven attachments in total).

> Details in the V1.4.0 section of `docs/en/CHANGELOG.en.md` (the Chinese changelog is authoritative). Installers were rebuilt for this release and uploaded (seven attachments on GitHub; digests match the local `SHA256SUMS.txt`).
