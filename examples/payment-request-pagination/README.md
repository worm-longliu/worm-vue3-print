# 付款申请单：明细分页与付款方式合并

基于当前 `1.4.6` 表格动态行、跨页重复表头、每页小计和 `mergeSameValue` 能力设计，纸张保持问题单的 `140×240mm` 横向规格。

## 文件

- `payment-request.template.json`：设计器可直接导入的模板，不含业务数据。
- `payment-request.data.json`：10 条付款明细的预览数据。
- `preview.html`：验证脚本生成的三页预览，可直接用浏览器打开。
- `verify.html` / `verify-browser.ts`：真实 Chromium 渲染入口。
- `verify.ts`：分页、小计、重复区域和付款方式合并的自动校验。

## 使用

设计器顶栏选择「导入模板」，导入 `payment-request.template.json`，再将 `payment-request.data.json` 的对象作为预览数据。宿主渲染时直接传入该对象，不需要把数据写进模板。

数据数组固定使用 `items`，数据行字段写作 `{summary}`、`{amount}`、`{paymentMethod}`、`{remark}`；页眉、页脚及静态表头使用根对象字段，例如 `{department}`、`{payeeName}`。

## 分页与合并口径

- 页眉、页脚在每页保持一致；收款/合同信息 4 行与明细标题行均设置 `repeatOnPage: true`。
- 单据编号位于页眉左上角；附件单据使用 `fixed + rotate: 90`，固定于正文右侧中央，表格右侧预留 8mm；同时设置 `pageable: false`，取消固定后仍只在第一页按设计坐标显示。
- 正文版心高 88mm，扣除 2mm 分页安全余量后可用 86mm。重复表头 36mm、本页合计 8mm，余下 42mm 每页容纳 4 条 10mm 明细。
- 10 条示例数据分为 `4 / 4 / 2` 三页，每页小计只汇总当前页。
- 付款方式列设置 `mergeSameValue: true`，仅合并同页、相邻且非空的同值单元格。页界会切断合并段，续页首行重新显示付款方式。
- 不使用整表 `repeatOnEveryPage`：该属性会在每页输出全部数据，不适用于明细分页。

## 验证

```bash
npx tsx examples/payment-request-pagination/verify.ts
```

脚本使用 Vite 加载当前 core 源码，并通过 Playwright 在 Chromium 中完成真实测量与分页；不使用不提供布局高度的 DOM 模拟器。
