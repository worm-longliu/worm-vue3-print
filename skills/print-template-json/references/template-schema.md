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

元素类型：`text`（文本）、`longText`（长文）、`image`（图片）、`table`（表格）、`flowList`（流式列表）、
`hline`（横线）、`vline`（竖线）、`rect`（矩形）、`oval`（椭圆）、
`barcode`（条形码）、`qrcode`（二维码）、`html`、`pageNumber`（页码）。
对应 title：文本 / 长文 / 图片 / 表格 / 流式列表 / 横线 / 竖线 / 矩形 / 椭圆 / 条形码 / 二维码 / HTML / 页码。

### 常用 options（通用）

| 字段 | 说明 |
|---|---|
| `left` `top` `width` `height` | 几何（mm，相对内容区） |
| `formatter` | 内容表达式，如 `'单价 ¥{MONEY(product.price)}'` |
| `fontSize` | 字号 pt |
| `fontWeight` | `bold` / `normal` |
| `fontFamily` / `color` / `backgroundColor` | 字体、前景、背景；`fontFamily` **缺省不写**，详见下「字体档位」 |
| `textAlign` | `left` / `center` / `right` / `justify` |

| `verticalAlign` | `top` / `middle` / `bottom` |
| `textDecoration` | `underline` / `line-through` |
| `wordWrap` / `textFit` | 换行开关（`false`＝单行）；溢出形式 `clip` / `shrink` / `autoHeight`。**省略号只在裁剪档（`clip`/`shrink`）才画得出**：`longText` 的缺省形式是 `autoHeight`（保留 `overflow:visible`），该档下关自动换行的落纸形态是**单行溢出**（文字越出元素右缘，可能与邻元素叠压），要省略号必须显式写 `"textFit": "clip"`。**版本边界**：V1.3.10 及更早，`longText` 关自动换行在出纸端**完全不生效**（纸面仍按多行折行、只有画布是单行），V1.3.11 起三端同源（`1.3.10` 及更早不含）——给存量模板补该档要按目标版本说话。判据：`npm test -w @worm-vue3-print/core`（`text-fit.test.ts`「longText 关自动换行的出纸落值」五组正/负对照）。**缺省行高**：不填 `lineHeight` 时 `text` 走 `normal`、`longText` 走 **1.5 倍**（三端同值，V1.3.11 起出纸与设计器一致；算行数按 1.5×字号估）。**注意**：元素级的 `\n` 在缺省下**不生效**（画布与出纸都不出 `white-space`，按 CSS 默认折叠成一行），要多行请开 `keepLineBreaks`（见下行），或把文字放进表格单元格 |
| `rotate` | 元素级旋转角（度，绕自身中心），归一到 0~359、**0 与缺省同形（不写出来）**。出纸按旋转后的**外接方框**分页与结算：底部放不下自动移页并按外接框顶落位，顶越页首或左右越过纸面写进 `PageLayout.warnings`（**只提示不阻断**，不改出纸 HTML）。**排除项**：`table` / `flowList` / 表格下方跟随区成员写了也不生效（渲染保持水平，属性台不出该行）；`barcode` / `qrcode` 直角档（90/180/270）全分辨率放行，斜角需 `printerDpi ≥ 385`，低于门槛吸附到最近直角档，**模板未声明 `printerDpi` 时按声明角出纸**（设计器会置灰自由角度输入）。渲染走 CSS 独立属性 `rotate`，**不占用 `transform`**（拖拽与出纸互不覆盖）；残留的 `transform` 数字键被忽略。**判据**：`npm test -w @worm-vue3-print/core`（`rotation.test.ts` 12 条 + `pagination-rotation.test.ts` 21 条，含 45° 外接框 84.85×84.85、顶越界 22.43mm、条码 203dpi 吸附/600dpi 放行）；跟随区归属单点 `collectFollowMemberIds()` 由两宿主属性台与画布共用（`npm test -w @worm-vue3-print/canvas` 的 `element-rotate-gate.spec.ts` 13 条、`@worm-vue3-print/common` 同名 spec 10 条）。**版本边界**：V1.4.0 起（含拼版下按每格生效的 `outputRotation`），更早版本给 `rotate` 会被静默忽略 |
| `keepLineBreaks` | **缺省不写＝关**。打开后 `text` / `longText` 出纸带 `white-space:pre-wrap`：`\n` 各占一行、行首与连续空格原样保留，同时仍按框宽自动换行。与 `wordWrap: false` 冲突时**单行优先**（新档不出声明）。判据单点在 core `resolveElementWhiteSpace`，画布 / print-common / 三条出纸链路同一份；仅这两类元素消费，挂到表格上不改一个字节 |
| `borderWidth` `borderStyle` `borderColor` | 边框（宽度 pt） |
| `zIndex` `locked` `visible` | 层级 / 锁定 / 可见 |

**单元格换行与断词口径（算行数必须按这个来）**：可换行档出纸内联是
`white-space:pre-wrap;word-break:normal;overflow-wrap:break-word` —— `\n` 各占一行、连续空格与行首空格原样显形、
英文按整词换行（只有一个词本身比列宽还长时才在行末兜底切一次）、中文按字断行。
`wordWrap: false` 档是 `white-space:nowrap` + 省略号，`\n` 在该档折叠。
判据：强制行数 = `\n` 段数；每段再用「可用宽 = 列宽和 − 2×`padding` − 塌陷边框」按字号估每行字符数，
行数 ×（≈ 1.4×字号）+ 2×`padding` 即该格最小行高。`height` 声明小于它就由内容撑开，
整表随之变长并牵动分页预算（预算 = 纸内区 − 表格元素 `top`，单枚标签类模板尤其要复核）。
**边界豁免**：多行只能从**表达式编辑器**（textarea）录入，属性台「内容」是单行 input，粘贴多行会被浏览器剥掉换行；
合并单元格按空格拼接内容（`mergeCells`），`\n` 会被压平。

#### 字体档位（不预置字体）

`fontFamily` 写的是 **CSS 族名**，只有用户手工配置过才会出现在模板里：

- **不写该字段**（缺省）：出图端不输出 `font-family`，落纸字体交还渲染端的系统默认字体。
  设计器不内置任何字体名档位，也不替用户预置族名。
- **模板声明字体**（宿主 `fonts` prop + `@font-face`）：字体文件随宿主分发，三端字面一致。
  **字体文件的授权由使用者自查**——OFL/Apache 系（思源黑体、站酷、马善政等）可自由分发，
  微软授权的字体名不允许随镜像或安装包再分发。
- **手工输入族名**：字体框可直接键入本机已装的字体名，能否出图取决于各端装了什么。

表格另有 `tableDefaultFontFamily`（单元格未设字体时的基线），继承序为「单元格 → 表格默认 →
交还 CSS 继承」，同样缺省不写。

三端解析不同：画布、浏览器直印、桌面客户端用「用户机」装了什么，服务端 PDF 用渲染容器
装了什么（镜像内中文只有 `fonts-noto-cjk`）。族名在本机缺失时按兜底栈逐级回落（`toFontFamilyStack`），
不会出豆腐块，但字宽随之变化，可能引起换行与分页差异——跨端字面要求严格就走模板声明字体。

热敏（203dpi＝8 点/mm）建议笔画均匀的黑体系；宋体、楷体、仿宋是衬线或细笔画，出纸易断笔发虚。
选哪一族由使用者按自己的字体授权决定。**字重保持缺省 `normal`**：写 `bold` 而模板没挂对应字重的字体文件时，
Chromium 会合成粗体，度量漂移会静默改分页。

### 类型专属

| 类型 | 字段 |
|---|---|
| `barcode` | `barcodeType`（`code128`/`ean13`/`code39`/`itf14`，默认 code128）、`barWidth`（模块倍率 2~8，每模块首选宽 = 倍率/2 × 0.25mm）、`barQuietZone`（条码左右静区白边，单位「模块」，0~20，**缺省 10**＝一维码码制要求下限；越小白边越窄、同框内条越粗）、`barHeight`（条区高度 mm，**不含下方文字**；缺省按 30 模块，粒度＝每模块宽，框高不足时条高让位）、`printerDpi`（203/300/600，给出则吸附整数打印点，热敏强烈建议给）、`hideTitle` |
| `qrcode` | `qrCodeLevel`（`L`/`M`/`Q`/`H`）、`qrQuietZone`（静区白边，单位「模块」，0~8，缺省 0＝不留白边、码面等比铺满元素框）、`fit`（缺省 `contain`）、`maxWidth`/`maxHeight` |
| `image` | `src`、`fit`（`contain`/`cover`/`fill`/`none`/`scale-down`，缺省 `contain`；属性台里 `cover` 显示为「剪裁（等比铺满后裁边）」）、`objectPosition`（裁剪锚点，**建议写 `<x>% <y>%`**，如 `50% 0%` 取图顶端；缺省不输出＝`50% 50%` 居中）、`fitScale`（剪裁放大比例，100~400 的百分数，**仅 `fit: 'cover'` 消费**：铺满后把画面再推大这么多才有可裁的边，`transform-origin` 取的就是同一条 `objectPosition`；100 与缺省同形、不要写出来）、`maxWidth`/`maxHeight` |
| `longText` | `longTextIndent`（首行缩进，单位 **em**＝「N 个字符宽」，随字号走；仅 `longText` 消费，写在 `text` 上不生效） |
| `flowList` | `flowColumns`（每行列数，**必须显式给**，1~12，缺省 4）、`flowRowHeight`（行高 mm，**最小高**语义，3~100，缺省 8）、`flowGapX`（单元横向间距 mm，0~50，缺省 4）、`flowAutoSpan`（内容过长时跨列，**缺省 false**）、`flowMaxSpan`（最多跨几列，**钳到 `flowColumns`**）、`formatter`（**单元模板 = 一条完整表达式**，对数组每项求值一次，列表路径写在里面：`{drugs.name} {drugs.spec}`；只写行内字段 `{name} {spec}` 也行，此时按数据里第一个数组兜底）、`dataSource`（**可选覆盖**，属性台不提供该行；显式给出时优先于表达式检出）。排布规则：整单元占位换行（当前行列位不够就把整单元挪到下一行行首，绝不切词）；**一框一页不续页**，超出框高按 `textFit` 三档（缺省 `clip`）处理；**跨列只在出纸生效**，画布永远是一列一格。要「剂量成列」需单元本身等长 |
| `hline`/`vline` | `borderWidth` + `borderColor`（元素高度常取 0.2） |

**排版口径**：`textAlign` 支持 `justify`（两端对齐 = 撑满行宽，含末行；渲染端会同时输出 `text-align-last:justify`，因为 CSS 的 `justify` 不拉伸段落末行，单行文本否则毫无变化）。与 `verticalAlign` 同时给出时，渲染端把 flex 主轴改成纵向让行盒取满宽，右缘才真正齐平——三端（画布/浏览器打印/PDF/客户端）同策。
**元素级多行**：文本/长文本元素里的 `\n` 与手工空格**默认折叠**（`text` 缺省档不输出任何 `white-space`，落回 UA 默认 `normal`），这是历史形态，存量模板照此不变。要按手打的换行上纸就显式给 `keepLineBreaks: true`（属性台「保留换行符」同一档），效果与单元格一致；只想要首行缩进则用 `longTextIndent`（em），两者可并存。**算行数/撑高前先看这一档**：打开后行数 = `\n` 段数 + 各段按宽折算的行数，元素会被内容撑高——但**独立元素按 `top` 归页，撑高本身不会让模板换页**（真实两趟管线实测：内容底边越出内容区 3mm 时开关两档都留在同一页）；只有表格那侧才走分页预算，见上文。
证件照这类「竖版自拍按居中裁剪会切头顶」的场景，给 `fit: 'cover'` 再配 `objectPosition: '50% 0%'` 取画面顶端（`'center 20%'` 等价于 `'50% 20%'`，两种写法都吃）；
`objectPosition` 含 `;`、引号、`url()` 等字符时整条丢弃（防往 style 里追加声明），只在确实发生裁切时可见。

**余量按缩放模式逐轴算，两轴都可以写**：`cover` 是等比铺满，贴满框的那一轴没有溢出，它的百分比填 0 还是 100 出纸相同——竖图放 35×45mm 框只有垂直能动（上下共 7.5mm），横图进同框只有水平能动；而 `contain`／`none`／`scale-down` 在图比框小时挪的是框内空位，两轴都可能有余量（如 60×60px 的图进 35×45mm 框，水平 19.13mm、垂直 29.13mm 都能挪）；`fill` 把图钉成框，两轴都挪不动。
所以生成模板时把有余量的轴写成非 50 的值、贴满的那一轴留 50；属性台水平／垂直两框常驻，档位只列能动的轴，挪不动的轴会直说「这一轴已贴满」。
**图片单元格的锚点只在 `fit: cover` 时生效**：cover 会把图片外框钉在可用框高（所跨行高之和扣内边距与塌陷边框）、`<img>` 补 `width/height:100%`，与独立图片元素同构地裁得动；代价是含图单元格的出纸行高不再被图片撑高，所以写 cover 前先把行高给够，别把画面裁没。缺省／`contain`／`fill` 等档保持原状：外框 `height:100%`、img 不撑满，行高仍由内容决定，锚点无视觉后果。要控制图片大小仍可用单元格 `maxWidth`/`maxHeight`（钉盒后它仍是上限）。
判据：`npm test -w @worm-vue3-print/core -- src/render/__tests__/crop-anchor.test.ts`（声明级，含 cover 钉盒与其余档不变的对照）；真浏览器几何与像素取证见 `services/print-render/src/cell-crop.integration.test.ts`。`scripts/validate_template.py` 不校验 `fit` 枚举，写错档位不报错、由浏览器忽略（要精确出纸就照上表取值）。

**条码尺寸口径**：每模块首选宽 = `barWidth/2 × 0.25mm`（`barWidth` 可填 2~8）；给了 `printerDpi` 就吸附到整数打印点
（dpi 优先），可用框放不下则整体等比缩小，绝不溢出。热敏出纸「条宽忽宽忽窄」的根因就是没给 dpi。
**推荐档只是设计器提示，不落字段**：填了 `printerDpi` 后，「条宽（倍率）」下方会给出按「吸附后每模块宽 ≥ 0.254mm（10mil）」的最小倍率——**203dpi→3**（3 点 / 0.375mm）、**300/600dpi→2**（0.254mm）；生成模板时照 `barWidth` 写值即可，没有单独的推荐字段，设计器也不会替你改。半档常被吸成同一点数（203dpi 下 2 与 2.5 都是 2 点），别把 2.5 当成"比 2 粗"。
**条形码只缩不放**：拉满元素框会得到非整数条宽，故没有 `fit` 缩放模式——大框里条码停在首选尺寸属正常，别指望它自己撑满。

**要把条码做大（元素与单元格同一套旋钮，按增益排序）**：
1. `barWidth` 抬到 4/6/8（每模块 0.5/0.75/1.0mm）——上限翻倍是 8；
2. `barQuietZone` 收窄（缺省 10 → 例如 4 或 0）：左右各 10 模块的白边直接换成条宽，8 位数字 CODE128C 图形 99 模块里有 20 模块是白边，填 0 最多可让条粗 ~25%（码值越长占比越小，12 位约 12%）；
3. 关掉文本（元素 `hideTitle: true` / 单元格 `showBarcodeText: false`）：文本区占 12 模块（总高 44 → 32），当**高度**是受限轴时条宽可 +37%；
4. 加列宽/行高、把单元格 `padding` 调小（内容宽 = 列宽 − 2×padding − 塌陷边框）。
5. **只要条码变高、不想动条宽**：`barHeight`（mm，**条区本体高度，不含下方文字**）。口径是「条宽优先」——它按每模块物理宽折算成条区模块数，所以只能落到该粒度的整数倍（`barWidth=4` 即 0.5mm 步进）；可用框高装不下时**由条高让位，条宽一分不损**（8 位数字 + 默认条宽在 14.1mm 框内填 20mm，实际得到整图 14mm）。未填按 30 模块，存量模板逐毫米不变。
判据：受限轴看 `min(可用宽/总模块, 可用高/总模块)`，总模块 = 码值模块 + 2×`barQuietZone`，总高模块 = 条区（缺省 30，给了 `barHeight` 则按 `barHeight ÷ 每模块宽` 折算）+（有文本再 +`barFontSize`/缺省 10 + 2）。
**边界豁免**：`barQuietZone: 0` 压掉的白边参与「条→空→条」跳变，紧邻文字或表格线时可能扫不出（一维码静区是码制硬要求，不像二维码能靠框外白纸兜底），必须实打验证；缺省 10 不要改。

**二维码铺满口径**：图形走 `<img>`，写 `width/height:100%` 再配 `object-fit`（缺省 `contain`），码面等比贴住元素框短边；
框内那圈白边就是 `qrQuietZone`（单位「模块」，与元素框大小无关，**缺省 0**）。21 模块的码：`0`→码面占框 100%、`2`→84%、`4`→72%。
需要 ISO/IEC 18004 推荐的静区时显式写 `qrQuietZone: 4`——0 档靠元素框外的白纸充当静区，密集排版（紧邻文字或表格线）可能扫不出。


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
- 单元格常用字段：`formatter`、`cellType`（`text`/`barcode`/`qrcode`/`image`）、`align`（`left`/`center`/`right`/`justify`，`justify` = 撑满列宽含末行，渲染端成对输出 `text-align:justify;text-align-last:justify`）、`valign`、
  `fontSize`、`fontWeight`、`color`、`backgroundColor`、`padding`、`borders`（`{top,right,bottom,left}`，
  每边 `{width(pt), style, color}`）、`colspan`、`rowspan`
- 单元格条码另支持 `barcodeType` / `barWidth`（2~8） / `barQuietZone`（静区白边 0~20，缺省 10） / `barHeight`（条区高度 mm，不含文字，缺省按 30 模块） / `printerDpi` / `showBarcodeText` / `barFontSize`

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
- 模板的 `outputRotation` 在拼版下按**每格内容**旋转：90/270 时每格占位宽高互换（70×40 → 40×70），列数上限与行数按互换后重算；设计器里切换旋转档位时拼版列数会自动铺满新档位上限；0/180 不改变格位几何
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
