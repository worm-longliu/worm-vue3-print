---
name: print-template-json
description: 生成 worm-vue3-print 可视化打印模板设计器可直接导入的打印模板 JSON（面单、标签、称签、价签、资产标签、小票、出库单/收货单等），也用于校验已有模板 JSON 能否安全出纸。当用户给出打印场景、纸张尺寸、字段清单或样例数据并要求生成打印模板 / 模板 JSON / 套打版式时使用。
version: 1.0.0
agent_created: true
---

# 打印模板 JSON 生成

把用户的打印需求编译成一份可被设计器「导入模板」直接载入的 JSON 文件，用户无需手写坐标与骨架字段。

## 何时使用

- 用户描述一个打印场景（面单/标签/小票/单据）并要求生成模板
- 用户给出字段列表或样例数据，要「做成能打印的版式」
- 用户已有模板 JSON，要求检查能否安全出纸、为什么溢出/分页不对

## 收集输入（缺失时按默认假设推进，不要卡住）

| 需要 | 缺失时的默认 |
|---|---|
| 场景与内容区块 | 按同类场景配方补（`references/layout-recipes.md`） |
| 纸张 | 单据 A5、标签 `LABEL_60X40`、小票 `THERMAL_80`、面单自定义 100×150 |
| 字段与数据 | 按场景造一份合理的静态示例数据，字段路径用业务语义（如 `order.no`、`goods[].name`） |
| 是否拼版 | 标签默认不开；用户说「一张 A4 打多枚」才开 |
| 条码/二维码 | 需要扫码就加；条码默认 `code128` + `printerDpi: 203` |

模板只描述版式、**不含数据**：字段用 `{order.no}` 绑定，另出一份同名 `.data.json` 供宿主预览。

## 工作流

1. **确认场景与纸张**：无法判断时选最接近的常见场景，并在回复中说明假设。
2. **算版心与安全线**：`内容宽 = 纸宽 − 左右边距`，`内容高 = 纸高 − 上下边距 − 页眉 − 页脚`；
   固定纸的内容底边必须离版心底边 **≥ 2mm**（分页引擎内建安全余量，贴边会溢出到第二页）。
3. **写简写描述** `scene.json`：只写纸张、边距、元素列表（见下方简写 schema）。
4. **编译**：`python3 scripts/build_template.py scene.json -o <名称>.template.json`
   （骨架字段、元素 `id`、`printElementType`、表格合并占位格由脚本补齐）。
5. **校验**：`python3 scripts/validate_template.py <名称>.template.json`，修到 0 ERROR 再交付。
   ERROR 会给出可执行的修法（越界多少 mm、安全余量差多少、拼版最多几列）。
6. **交付**：同时给出 `<名称>.template.json` 与 `<名称>.data.json`，并说明导入路径：
   设计器顶栏「导入模板」→ 选 `.template.json`。

需要精细控制（手写原生 options）时，元素里直接写 `"options": {...}` 即原样透传，不做简写映射。

## 简写 schema（scene.json）

```jsonc
{
  "paper": "LABEL_60X40",                 // 或 {"size":"CUSTOM","width":100,"height":150}
  "orientation": "portrait",
  "margins": [2, 2, 2, 2],                // [上,右,下,左]；也可 {"top":2,...} 或单个数字
  "header": 0, "footer": 0,               // 页眉/页脚高度 mm
  "tiling": {                             // 可选：一张纸排多枚标签
    "sheet": "A4", "columns": 3, "gapX": 2, "gapY": 2, "sheetMargin": [10, 10, 10, 10]
  },
  "elements": [
    { "type": "text",    "box": [0, 0, 56, 4.2], "text": "{shop.name}",
      "size": 8, "weight": "bold", "align": "center", "valign": "middle", "color": "#444" },
    { "type": "barcode", "box": [0, 20, 56, 8], "text": "{product.barcode}",
      "code": "code128", "barWidth": 2, "dpi": 203 },
    { "type": "qrcode",  "box": [23, 52, 28, 28], "text": "{order.no}", "level": "M" },
    { "type": "hline",   "box": [0, 19, 56, 0.2], "border": [0.4, "#9a9a9a"] },
    { "type": "table",   "box": [0, 23, 128, 30], "cols": [40, 20, 20, 20, 14, 14],
      "source": "goods", "size": 8, "padding": 1, "rows": [
        { "type": "header", "height": 8, "repeatOnPage": true,
          "cells": [{"text": "品名", "align": "center"}, {"text": "金额", "colspan": 2, "align": "right"}] },
        { "type": "data", "height": 8,
          "cells": [{"text": "{name}"}, {"text": "{MONEY(amount)}", "colspan": 2, "align": "right"}] },
        { "type": "summary", "height": 7,
          "cells": [{"text": "合计", "colspan": 4, "align": "right"},
                    {"text": "{MONEY(SUM(amount))}", "colspan": 2, "align": "right", "weight": "bold"}] }
      ] }
  ]
}
```

简写键映射（完整对照见 `references/template-schema.md`）：

| 简写 | 原生 | 简写 | 原生 |
|---|---|---|---|
| `box` | left/top/width/height | `text` | `formatter` |
| `size` | `fontSize` | `weight` | `fontWeight` |
| `align` | `textAlign` | `valign` | `verticalAlign` |
| `bg` | `backgroundColor` | `border` | `borderWidth/Style/Color` |
| `code` | `barcodeType` | `dpi` | `printerDpi` |
| `level` | `qrCodeLevel` | `cols`/`rows`/`source` | 表格三件套 |

表格行类型：`header`（表头）、`data`（明细，按 `source` 迭代）、`subtotal`（本页小计）、`summary`（总计）。
`colspan`/`rowspan` 的占位格由脚本自动补齐。多页面模板用 `{"pages": [scene, scene]}`。

## 参考资源

- `references/template-schema.md` — 完整字段规范：纸张表、元素选项、表格模型、拼版几何、表达式函数
- `references/layout-recipes.md` — 五类场景版式配方 + 10 条避坑清单
- `assets/templates/` — 8 份可直接导入的成品模板（含配套 `.data.json` 与 `manifest.json`）：
  采购收货单、销售出库单、快递电子面单、综合示例模板、称签打印、价签打印（拼版）、资产/设备标签（拼版）、零售小票。
  新需求与某份相近时，复制改名后微调比从零排更快。

## 校验输出解读

- `❌ ERROR`：必须修（结构缺字段、元素越界、表达式不配对、拼版列数/高度溢出）
- `⚠️ WARN`：建议修（贴 2mm 安全线、列宽/行高和与元素尺寸不符——设计器会回写尺寸）
- 退出码 0 = 无 ERROR；加 `--json` 输出机器可读结果
