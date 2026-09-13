# 水印改为显式矢量瓦片（修复静默打印水印放大/错位）设计

- 日期：2026-09-13
- 状态：已与用户确认方向（方案 A）
- 范围：`@worm-vue3-print/core` 水印渲染表达方式 + `@worm-vue3-print/canvas` 设计器画布接线

## 1. 背景与问题

桌面静默打印客户端出纸后，模板水印与设计器/浏览器预览不一致，用户实测现象为：

> 水印位置偏移、平铺错乱、所有页面都一样、文字方向是反的、并且很大。

同一份模板在浏览器预览、服务端 PDF 文件、`printToPDF` 直接产物里都正常，只有**经打印机出纸**后异常。

## 2. 根因（已实测确认）

水印当前实现为「CSS 内联 SVG 背景 + `background-repeat: repeat`」（`render/watermark.ts` 的
`buildWatermarkSvgDataUrl`）。Chromium 在打印/PDF 后端会把这种重复背景编译成 **PDF 平铺图案
（tiling pattern, PatternType 1）**。

实测证据（本机 `Print_to_PDF` 虚拟打印机链路，同一份含平铺水印的 A4 HTML，瓦片设计值
260×180px@96dpi = 68.8×47.6mm）：

| 产物 | 横向平铺周期 | 纵向平铺周期 |
| --- | --- | --- |
| 直接 `printToPDF` 产物（基准） | 68.8mm | 47.8mm |
| 现状（CSS 平铺背景）经出纸链路 | 15.0mm | 240.5mm（≈放大 3.1 倍） |
| 用户 17:03 真实打印产物 | 29.0mm | 12.4mm |
| 改为显式矢量瓦片后同链路出纸 | 68.8mm | 47.5mm |

PDF 内部结构：水印层被编译为 `/Pattern` 资源（`/P11 SCN /P11 scn ... 0 0 794 1123 re f`），
所在 form 的 CTM 为 `3.125`（300dpi ÷ 96px）。PDF 查看器（预览 / Acrobat / poppler）会正确
解释图案矩阵，因此**文件与浏览预览都正确**；而打印出纸链路的 RIP（CUPS 过滤器 / 驱动光栅化）
忽略图案矩阵、按设备空间平铺，于是瓦片被放大约 3.1 倍、错位、只铺出零星几块，旋转中心同步
偏移，呈现为「很大、方向反了、平铺错乱」。

结论：换用浏览器打印或服务端渲染**不能**解决问题——三条链路共用同一份 core 生成的 HTML，
水印一样会落成 PDF 平铺图案；决定成败的是「水印怎么写进页面」，不是「谁来出纸」。

## 3. 目标与验收口径

目标：水印经真实出纸链路后与设计器/预览一致——A4 默认密度下瓦片周期 68.8×47.6mm，
角度/颜色/透明度一致，每页相同，不放大、不偏移。

验收口径（可判定）：

1. 产物 HTML 的水印层**不含任何 CSS 平铺背景**：无 `background-repeat`、无
   `background-image:url(data:image/svg+xml...)`，只有显式瓦片元素。
2. 出纸后量测瓦片周期回到设计值（虚拟打印机 + 真机各验一次）。
3. 无水印模板输出零变化；水印文本解析（`fixed` / `binding` / 表达式 / 时间戳）行为不变。

## 4. 设计

### 4.1 core：几何与表达分离（`packages/print-core/src/render/watermark.ts`）

- 新增纯函数 `resolveWatermarkLayout(wm, printData, paperMm)`：返回
  `{ text, color, rotate, opacity, fontSizePx, tileWidthMm, tileHeightMm, columns, rows, tiles[] }`；
  不可见/文本为空返回 `null`。瓦片网格 = `ceil(纸宽/瓦片宽) × ceil(纸高/瓦片高)`，
  位置以 mm 表达（`1px = 25.4/96mm`），密度预设与下限语义保持现状。
- `renderWatermarkLayerHtml(wm, printData, paperMm)` 改为输出
  `<div class="watermark-layer" style="opacity:…">` + N 个 `<svg class="watermark-tile">`，
  每块自带 `viewBox="0 0 tileW tileH"`、`width/height` 用 mm、`rotate` 保持原角度语义。
- 删除 `buildWatermarkSvgDataUrl`（尚无外部使用者），避免再把水印写回 CSS 平铺背景。

### 4.2 core：连续纸纸高贯通

连续纸的最终纸高由浏览器探针推导后经 `GenerateOptions.pageHeightMm` 传给 `buildPageCss`，
但 `renderPage` 之前只读模板纸高，导致连续纸水印网格按 297mm 计算。改为把最终纸高经
`RenderCtx` 传给 `renderPage`，水印网格与 `@page` / `.print-page` / 页脚同源。

### 4.3 CSS 与画布

- `css-builder.ts`：`.watermark-layer` 去掉平铺背景声明，仅保留定位/层级/裁剪；新增
  `.watermark-tile { position: absolute; }`。
- `CanvasPaper.vue`：改用 `resolveWatermarkLayout` + `v-for` 渲染同一批瓦片，
  与打印端共用一份几何来源，消除画布与打印两套实现。

## 5. 备选方案（本次未采用）

- **B. 整页单张水印图片**：把平铺结果预渲染成覆盖整页的一张图（`background-size:100% 100%`、
  不 repeat），PDF 中只有单个图片对象，最抗驱动差异；代价是每页 200KB–1MB 且为栅格。
  作为方案 A 真机复验不达标时的兜底，本次不做。
- **C. PDF 后处理叠加水印**（pdf-lib 等）：新增依赖、需字体嵌入，且会让预览/服务端/客户端
  出现两套水印逻辑，破坏同构一致性，不做。

## 6. 测试与回归

- core 单测：瓦片数量与坐标（A4、连续纸、自定义瓦片）、产物不含 `background-repeat` /
  `data:image/svg`、未配置水印零输出、转义与绑定回退不变。
- canvas 单测：由「断言 `background-repeat: repeat`」改为「断言渲染出瓦片 `<svg>`」。
- 文档：`skills/worm-vue3-print-integration/references/troubleshooting.md` 记录根因与排查口径，
  CHANGELOG 记录修复。

## 7. 风险与未决项

- 本机虚拟打印机把 SVG 文字水印渲染为灰色（图案版本反而为红色），判断是该虚拟打印机对文本
  对象的处理；**水印颜色需在真机复验**，不达标时启用备选方案 B。
- 显式瓦片会增加 HTML 体积：A4 每页 28 块约 7KB，100 页约 700KB，远低于协议 20MB 上限。

## 8. 不在范围内

- 不改 Electron / WebSocket / `printToPDF` / 系统打印命令的客户端出纸链路；
- 不引入 PDF 后处理依赖；
- 不改水印配置面板的交互与字段语义。
