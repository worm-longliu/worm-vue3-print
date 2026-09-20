# 模板 JSON 字段规范（worm-vue3-print）

适用：手写或脚本生成的、供「打印模板设计器」顶栏「导入模板」载入的 JSON。
单位统一为 **mm**（`unit: "mm"`），字号为 **pt**。坐标原点在**内容区左上角**（不含页边距）。

## 1. 设计器导入的结构门槛

导入时只做轻量结构校验，通过即载入：

- 单页：同时含 `paperSize`（字符串）、`margins`（对象）、`elements`（数组）
- 多页：`{ "pages": [ 单页模板, ... ] }`，每页都要满足上面三要素

缺少任一项会被拒绝；其余字段缺失则由设计器补默认。

## 2. 顶层结构（TemplateData）

```jsonc
{
  "unit": "mm",                    // 固定写 mm
  "paperSize": "A4",               // 见纸张表
  "orientation": "portrait",       // portrait | landscape（landscape 直接交换纸张宽高）
  "margins": { "top": 10, "right": 10, "bottom": 10, "left": 10 },
  "header":  { "height": 0, "elements": [] },   // 页眉（每页重复）
  "footer":  { "height": 0, "elements": [] },   // 页脚（每页重复）
  "firstPageOverlay": { "height": 0, "elements": [] },
  "elements": [ /* 内容区主体元素 */ ],
  "name": "采购收货单",             // 可选，多页模板的页签名
  "customWidth": 210,              // 仅 paperSize=CUSTOM 必填；连续纸时为纸宽
  "customHeight": 297,             // 仅 CUSTOM；连续纸时仅作设计画布高度
  "watermark": {},                 // 可选
  "tiling": { /* 拼版配置，见 §6 */ }
}
```

连续纸 / 小票纸（`CONTINUOUS`、`THERMAL_*`）的 `height` 只是设计画布高度，**出纸高度按内容推导**。

## 3. 纸张预设（mm）

| paperSize | 宽×高 | 说明 |
|---|---|---|
| `A4` | 210×297 | |
| `A3` | 297×420 | |
| `A5` | 148×210 | 单据常用 |
| `Letter` / `Legal` | 216×279 / 216×356 | |
| `DOT_FULL` / `DOT_HALF` / `DOT_THIRD` | 241×279.4 / 241×139.7 / 241×93.1 | 针式打印纸等分 |
| `LABEL_80X60` / `LABEL_60X40` / `LABEL_40X30` | 80×60 / 60×40 / 40×30 | 标签纸；选标签纸时设计器默认把页边距与页眉页脚归零 |
| `THERMAL_57` / `THERMAL_80` / `THERMAL_110` | 57×297 / 80×297 / 110×297 | 热敏小票（连续纸） |
| `CUSTOM` | customWidth × customHeight | |
| `CONTINUOUS` | 80×297 | 连续纸（默认 80mm） |

## 4. 元素通用结构

```jsonc
{
  "id": "el1",                 // 同页内唯一即可
  "type": "text",              // 见类型表
  "options": { "left": 0, "top": 0, "width": 56, "height": 6, /* 类型专属 */ },
  "printElementType": { "type": "text", "title": "文本" }   // title 用于属性面板显示
}
```

元素类型：`text`（文本）、`longText`（长文）、`image`（图片）、`table`（表格）、
`hline`（横线）、`vline`（竖线）、`rect`（矩形）、`oval`（椭圆）、
`barcode`（条形码）、`qrcode`（二维码）、`html`、`pageNumber`（页码）。
对应 title：文本 / 长文 / 图片 / 表格 / 横线 / 竖线 / 矩形 / 椭圆 / 条形码 / 二维码 / HTML / 页码。

### 常用 options（通用）

| 字段 | 说明 |
|---|---|
| `left` `top` `width` `height` | 几何（mm，相对内容区） |
| `formatter` | 内容表达式，如 `'单价 ¥{MONEY(product.price)}'` |
| `fontSize` | 字号 pt |
| `fontWeight` | `bold` / `normal` |
| `fontFamily` / `color` / `backgroundColor` | 字体、前景、背景 |
| `textAlign` | `left` / `center` / `right` |
| `verticalAlign` | `top` / `middle` / `bottom` |
| `textDecoration` | `underline` / `line-through` |
| `wordWrap` / `textFit` | 换行；溢出形式 `clip` / `shrink` |
| `borderWidth` `borderStyle` `borderColor` | 边框（宽度 pt） |
| `zIndex` `locked` `visible` | 层级 / 锁定 / 可见 |

### 类型专属

| 类型 | 字段 |
|---|---|
| `barcode` | `barcodeType`（`code128`/`ean13`/`code39`/`itf14`，默认 code128）、`barWidth`（模块倍率 2~4）、`printerDpi`（203/300/600，给出则吸附整数打印点，热敏强烈建议给）、`hideTitle` |
| `qrcode` | `qrCodeLevel`（`L`/`M`/`Q`/`H`）、`fit`、`maxWidth`/`maxHeight` |
| `image` | `src`、`fit`（`contain`/`cover`/`fill`/`none`/`scale-down`）、`maxWidth`/`maxHeight` |
| `hline`/`vline` | `borderWidth` + `borderColor`（元素高度常取 0.2） |

**条码尺寸口径**：每模块首选宽 = `barWidth/2 × 0.25mm`；给了 `printerDpi` 就吸附到整数打印点
（dpi 优先），可用框放不下则整体等比缩小，绝不溢出。热敏出纸「条宽忽宽忽窄」的根因就是没给 dpi。

## 5. 表格模型

```jsonc
{
  "type": "table",
  "options": {
    "left": 0, "top": 23, "width": 128, "height": 30,
    "tableColWidths": [40, 20, 20, 20, 14, 14],   // 列宽 mm，和 == width
    "tableDefaultFontSize": 8,
    "tableDefaultPadding": 1,
    "dataSource": "goods",                        // 明细行迭代的数组路径
    "tableRows": [
      { "id": "r1", "type": "header",   "height": 8, "repeatOnPage": true, "cells": [...] },
      { "id": "r2", "type": "data",     "height": 8, "cells": [...] },
      { "id": "r3", "type": "subtotal", "height": 7, "cells": [...] },
      { "id": "r4", "type": "summary",  "height": 7, "cells": [...] }
    ]
  }
}
```

- 行类型：`header`（表头，可 `repeatOnPage` 每页重复）、`data`（明细，按 `dataSource` 迭代）、
  `subtotal`（**本页**小计，`SUM` 只聚合当前页）、`summary`（总计，聚合全部）
- **每行 `cells` 长度恒等于列数**：`colspan`/`rowspan` 覆盖的格必须补 `{ "id": "...", "merged": true }` 占位格
- 列宽和应等于 `width`、行高和应等于 `height`（设计器加载会按实际渲染尺寸回写，但手写时应自洽）
- 单元格常用字段：`formatter`、`cellType`（`text`/`barcode`/`qrcode`/`image`）、`align`、`valign`、
  `fontSize`、`fontWeight`、`color`、`backgroundColor`、`padding`、`borders`（`{top,right,bottom,left}`，
  每边 `{width(pt), style, color}`）、`colspan`、`rowspan`
- 单元格条码另支持 `barcodeType` / `barWidth` / `printerDpi` / `showBarcodeText` / `barFontSize`

> 单据抬头常用「纯 header 行的表格」做栅格排版——这不是异常，不必为它配 `dataSource`。

## 6. 拼版（一张纸上排多枚标签）

```jsonc
"tiling": {
  "enabled": true,
  "sheetPaperSize": "A4",           // 目标纸（张），不能是连续纸
  "sheetOrientation": "portrait",   // 只影响目标纸，不影响标签朝向
  "sheetMargin": { "top": 10, "right": 10, "bottom": 10, "left": 10 },  // 目标纸留白
  "gapX": 2, "gapY": 2,             // 相邻格间距 mm
  "columns": 2                      // 列数（必填）；行数由纸面自动推导
}
```

几何约束：
- `columns` 必须是 ≥1 的整数，且 `columns × 标签宽 + (columns−1) × gapX ≤ 目标纸宽 − 左右留白`
- 标签高 ≤ 目标纸高 − 上下留白，否则每张 0 行
- **连续纸/小票纸不支持拼版**；模板自己的 `margins` 是「标签内部边距」，与目标纸留白是两回事
- 拼版要求每份标签**恰好 1 页**——标签内容溢出会直接拒绝出纸

## 7. 表达式

- 字段：`{order.no}`、`{goods.0.name}`；data 行内直接写 `{name}`（相对当前行）
- 函数：`MONEY`（千分位两位小数）、`FORMAT`、`UPPER`（金额大写）、`DATE(v,'YYYY-MM-DD')`、
  `IF(cond,a,b)`、`IFEMPTY(v,def)`、`CONCAT`、`SUBSTR`、`LEN`、`NOW`、`PAD`、`REPLACE`、`JSON`
- 四则：`ADD(a,b,…)`、`SUB(a,b,…)`、`MUL(a,b,…)`、`DIV(a,b)`；也可直接写运算符 `{qty * price}`
- 修约：`ROUND(n,d)` 四舍五入、`ROUNDUP/CEIL` 进一、`ROUNDDOWN/FLOOR` 去尾、`ROUNDBANK` 四舍六入五成双；
  `d` 缺省 2，负数修约到整十/整百（`-2` → 百位）
- 聚合（表格汇总行）：`SUM(field)`、`AVG`、`COUNT`、`MIN`、`MAX`
- 系统变量：`{pageIndex}`、`{totalPages}`、`{printDate}`、`{printTime}`
- 文本与表达式可混排：`'金额大写：{UPPER(order.total)} 元'`

## 8. 打印数据（与模板配套）

模板 JSON **不含数据**；字段绑定 `{order.no}` 的值来自宿主注入的 printData 对象，例如：

```jsonc
{ "order": { "no": "CG20260920001" }, "goods": [ { "name": "..." } ] }
```

生成模板时同步给出一份同名 `.data.json`，便于宿主联调预览。
