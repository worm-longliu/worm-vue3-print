# Worm Print V1.4.1 (2026-10-28)

V1.4.1 是一个 patch 版本：只有一条缺陷修复——条码/二维码的设计态取值改为 formatter 优先，元素工厂预置的示例码值不再永久遮住作者填的内容（Gitee PR #1）。出纸渲染管线零变更，**桌面客户端不受影响，安装包沿用 V1.4.0 产物**（已在 v1.4.1 发行版重传同名文件与校验和）。自 v1.4.0 以来 1 次实变更提交。

## 修复
- **设计态条码/二维码不再被示例码值永久遮住**（Gitee PR #1）。元素工厂给条码/二维码预置的 `testData` 排在 formatter 之前取值，作者在「内容」里填了含 `{字段}` 占位的表达式后，属性台与画布仍一直显示工厂预置的占位码值，看起来像内容没有生效。现把条码/二维码设计态取值统一切到 core 单点 `resolveBarcodeDesignValue`：formatter 的 `{字段}` 先按示例数据求值（与表格单元格同口径），**求不到值才回退** `testData` 示例码值；canvas 条码/二维码两处、print-common 零框架 shell 两处全部改走这一个单点。**存量影响仅在设计态展示**——出纸端仍按 `resolveTextBinding` 走实时数据绑定，产物、分页与模板契约零变化。

## 工程与验收
- 测试与构建全绿（含 canvas / common / core 设计态取值回归用例；新增条码/二维码 fallback 语义测试 3 份）。
- core 渲染管线（`render/*`、`functions/format.ts`）零变更，桌面客户端安装包按判据沿用 V1.4.0 产物，`SHA256SUMS.txt` 重算后共 7 个附件。

> 明细见 `docs/中文/CHANGELOG.md` 的 V1.4.1 段。

---

# Worm Print V1.4.1 (2026-10-28)

V1.4.1 is a patch release with a single defect fix: the design-time value of barcode/QR elements now resolves the formatter first, so the factory-preset sample value no longer permanently masks the author's content (Gitee PR #1). The print render pipeline is unchanged, so **the desktop client is not affected and its installers are reused from V1.4.0** (re-uploaded to this release under the same names, with a recalculated `SHA256SUMS.txt`). One substantive commit since v1.4.0.

## Fixed
- **Design-time barcode/QR values are no longer permanently masked by the sample value** (Gitee PR #1). The element factory presets a `testData` sample and it used to be resolved before the formatter — after the author filled "content" with a `{field}` placeholder expression, the property panel and canvas kept showing the factory's placeholder code as if the content had no effect. All four design-time barcode/QR paths (two in canvas elements, two in the zero-framework print-common shell) now go through the single core helper `resolveBarcodeDesignValue`: `{field}` placeholders in the formatter are evaluated against sample data first (same rules as table cells), and the sample is used **only when the value cannot be resolved**. **Existing impact is design-time display only** — the print path still resolves live data via `resolveTextBinding`, so output, pagination and template contracts are unchanged.

## Engineering
- Builds and tests are all green (including design-time value regression cases; three new tests pin the fallback semantics).
- Core's render pipeline (`render/*`, `functions/format.ts`) is untouched, so per the release rule the desktop-client installers are reused from V1.4.0; `SHA256SUMS.txt` was recomputed — seven attachments in total.

> Details in the V1.4.1 section of `docs/en/CHANGELOG.en.md` (the Chinese changelog is authoritative).
