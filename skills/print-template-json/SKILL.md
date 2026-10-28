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
   纵向预算按**横向相交分列累计**：左右并排的两块（横向不相交）各占一列，但它们下方的整宽元素
   会把两列高度**合计**扣一次——所以「左二维码 + 右多行信息」这类并排块必须给同一 `groupId`
   组合成单元（整组同页、纵向只扣一次并集高度），否则紧尺寸标签会被挤到第二页、拼版直接拒纸。
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
| `quiet` | `qrQuietZone`（二维码静区白边，模块 0~8，缺省 0＝码面铺满元素框） | `barQuiet` | `barQuietZone`（条形码左右白边，模块 0~20，缺省 10＝码制下限；越小条越粗） |
| `barHeight` | `barHeight`（条形码**条区高度 mm，不含下方文字**；缺省按 30 模块。条宽优先：粒度＝每模块物理宽，框高不足时条高让位、条宽不动） | | |
| `indent` | `longTextIndent`（长文本首行缩进，**单位 em＝字符数**，仅 `longText` 消费） | `anchor` | `objectPosition`（图片裁剪锚点，**建议写 `<x>% <y>%`**，如 `50% 0%` 取图顶端；`center 20%` 等等价写法也吃） |

**排版三项的版本与判据**（生成模板前先看宿主用的是哪个包版本）：

- `align: justify`、`indent`、`anchor` 与「`fit` 真的落纸」都是 **1.3.7 起**的行为；`fitScale`（裁剪放大比例）与「属性台锚点行只在剪裁档出现」是 **1.3.8 起**；1.3.6 及更早里 `fit` 只影响画布显示、`text-indent` 不出纸、`justify` 与 `valign` 同时给会静默退成左对齐、单元格 `align: justify` 只在多行时部分生效。
- 本项目的 `justify` 口径是**撑满行宽含末行**（打印设计器同行形态，非 Word 的「两端对齐」）：渲染端成对输出 `text-align:justify;text-align-last:justify`。判据：出纸 HTML 里只出现 `text-align:justify` 而没有 `text-align-last:justify`，单行文本必然不生效——CSS 的 `justify` 永不拉伸段落末行。表格单元格 `align: justify` 同口径（`<td>` 上无需 flex 改造，只有末行这一条规则），生成模板时两者可共用同一判据。
- 判据（对着出纸 HTML 量，不靠猜）：长文本那层 `div.print-element` 的 `style` 里应出现 `text-indent:<N>em`；被裁切的 `<img>` 应出现 `object-fit:cover;object-position:50% 0%`，且它前面有 `width:100%;height:100%`（独立图片元素与 `cover` 档的图片单元格都如此，没有这组撑满就没有可裁余量）。
- **图片单元格的锚点只在 `fit: cover` 时生效**：cover 会把图片外框钉在可用框高（所跨行高之和扣内边距与塌陷边框）、`<img>` 撑满该盒，于是与独立元素同构地裁得动（真 Chromium 实测：取顶打出图顶端红带、取底打出底端蓝带）；代价是**含图单元格的出纸行高不再被图片撑高**，写 cover 前要把行高给够，否则画面被裁没。缺省／`contain`／`fill` 等档保持原状——行高仍由内容决定、图按内在尺寸占位，锚点在这些档位上没有视觉后果。
- 余量按缩放模式**逐轴**算，两轴都可以写：`cover` 等比铺满后贴满框的那一轴没有余量（填 0 与 100 出纸相同），竖图进 35×45mm 框只有垂直能动（上下 7.5mm）、横图进同框只有水平能动（左右 32.5mm）；`contain`／`none`／`scale-down` 在图比框小时挪的是框内空位，两轴都可能有余量；`fill` 两轴都钉死。属性台锚点行只在剪裁档出现（1.3.8 起）；有自然尺寸时只列能动的轴，两轴都能动才出九宫格，其余缩放档不再显示这一行。
- 边界豁免：`anchor` 含 `;`、引号、`url()`、括号（含 `calc()`）等字符时**整条不输出**（防往 style 里追加声明），此时按上面判据查不到属正常，不是丢了配置；属性台遇到这类存量写法会选中「自定义」并保留原值，用户一动档位/数字框即整体替换成 `<x>% <y>%`。`indent` 写在普通 `text` 元素上不生效也属设计口径。

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
