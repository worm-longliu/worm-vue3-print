# 标签多行多列拼版打印（拼版到指定纸张）设计

日期：2026-09-19
范围：`packages/print-core`（管线 + CSS 生成 + 新拼版模块）+ `packages/print-canvas`（模板配置 UI）。`services/print-render`、`packages/print-client-sdk`、`clients/print-client` **零代码改动**。

> A4 只是**默认值**，不是写死的目标纸。目标纸张由用户在模板里自定义（预设纸张 / 自定义宽高 / 方向），并可在调用时由宿主覆盖，见第 3.2 节。

## 1. 背景与目标

现状：`prepareWithSession`（`print/pipeline.ts:54`）对 `printData` 数组逐份渲染，`composeBatchHtml`（`print/batch-compose.ts:26`）把各份拼成一个文档，份间强制分页。即**一份数据占一整张纸**：标签模板（如 70×40mm）批量打印时，若输出纸是 A4，每张只落一个标签，纸面绝大部分空白。

目标：
1. 标签尺寸的模板可开启「拼版」，把同一模板的多条数据按「列 × 行」网格铺满目标纸（默认 A4），一张纸出多个标签。
2. 三端（浏览器打印、服务端 PDF、桌面客户端静默打印）行为一致，一次实现全部生效。
3. 拼版关闭时与现状**完全一致**（零回归）。
4. 拼版配置非法（**列数超出目标纸可用宽度**、标签高于纸面可用高度等）时**不允许保存模板**：拦截「保存」动作并给出与渲染管线完全一致的错误文案，同时把用户定位到出错字段（§8.1、§9）。

> 第 4 条是硬约束：非法配置**不能落盘**。否则模板会被存成一份永远打不出正确结果的配置（保存成功 → 打印时才报错 / 或被静默裁掉列），错误暴露得太晚。

## 2. 非目标

- 不支持连续纸（CONTINUOUS）模板拼版（格高由探针推导，与「固定格尺寸铺网格」语义冲突）。
- 不做裁切线 / 格边框 / 定位十字（后续按需单独立项）。
- 不做「格内缩放」：标签内容必须与格尺寸一致，不等比缩放。
- 不做列优先（纵向填充）排布开关：固定行优先（左→右、上→下）。
- 不改 `copies`（驱动重复份数）语义；不做「同一份数据复制 N 格」的 repeat 参数（调用方传 N 条同值数据即可）。
- **不做静默修正**：保存时若列数超宽，**不**自动改写为 `maxColumns` 后放行，而是拦下保存并提示。静默改写会让用户以为「我配的 5 列生效了」，属于比报错更糟的体验。（唯一例外是打开拼版开关时的默认值收敛，见 §8——那是「帮你选一个初始值」，不是「偷偷改你的值」。）

## 3. 数据契约

### 3.1 类型与落盘位置

新增类型定义在 `packages/print-core/src/print/tiling.ts`（纯逻辑，无 DOM / 无 IO），两处 `TemplateData` 以 `import('../print/tiling.js').TilingOptions` 引用——与既有 `fonts` 同一手法（`render/types.ts:37`、`designer/types.ts:42`）：

```ts
export interface TilingOptions {
  enabled: boolean
  /** 目标纸张（张）预设；缺省 A4。支持 A4/A3/A5/Letter/Legal/CUSTOM，不含 CONTINUOUS（见 3.2 解析优先级） */
  sheetPaperSize?: Exclude<PaperSize, 'CONTINUOUS'>
  /** 目标纸张方向；缺省 portrait。只影响目标纸，不影响标签朝向 */
  sheetOrientation?: 'portrait' | 'landscape'
  /** sheetPaperSize='CUSTOM' 时的纸宽（mm）；缺省 210 */
  sheetCustomWidth?: number
  /** sheetPaperSize='CUSTOM' 时的纸高（mm）；缺省 297 */
  sheetCustomHeight?: number
  /** 目标纸四边留白（mm）。注意：与模板 margins（标签内部边距）不是一回事 */
  sheetMargin: { top: number; right: number; bottom: number; left: number }
  /** 相邻格横向间距（mm） */
  gapX: number
  /** 相邻格纵向间距（mm） */
  gapY: number
  /** 列数（手工指定，必填，≥1 的整数）；行数由纸面自动推导 */
  columns: number
}

/** { enabled: true, sheetPaperSize: 'A4', sheetOrientation: 'portrait',
 *    columns: 2, gapX: 2, gapY: 2, sheetMargin: 四边 10 } */
export const TILE_DEFAULTS: TilingOptions
```

模板字段：`TemplateData.tiling?: TilingOptions`（`render/types.ts:25` 与 `designer/types.ts:24` 各一处）。**缺省不写**，存量模板结构不变。

**为何放模板级（而非 `PrintJob`）**：三端渲染全部只由 `templateJson` 驱动（`services/print-render/src/server.ts:56` 无字段白名单、客户端透传 core），放模板层则协议 / SDK / 客户端零改动；且「这个模板该怎么出纸」与 `watermark` / `fonts` / `pageBackground` 同类。需要同一模板两种出纸时，`PrintJob.paperOverride` 已覆盖大部分场景。

### 3.2 目标纸张由用户自定义（解析优先级）

目标纸张是**完整的纸张设置**，与模板自身的纸张设置（标签纸）地位对等、彼此独立：

| 优先级 | 来源 | 说明 |
|---|---|---|
| 1 | `PrintJob.paperOverride.width / height` | 调用时覆盖，出纸链路逃生门（0 或负数视为未提供）；布局按覆盖后的纸面重算 |
| 2 | `tiling.sheetCustomWidth / sheetCustomHeight` | `sheetPaperSize='CUSTOM'` 时的自定义宽高（mm） |
| 3 | `PAPER_DIMENSIONS[sheetPaperSize]`（`render/types.ts:12`） | 预设纸张：A4 / A3 / A5 / Letter / Legal，**排除 CONTINUOUS**。core 布局用 render 层常量（`print` 已依赖 `render`，避免引入 `print`→`designer` 的依赖方向）；设计器下拉另用 `PAPER_PRESETS`（`designer/utils/default-config.ts:4`，同样排除 CONTINUOUS），两者数值一致 |
| 4 | 缺省 | `A4` + 纵向（210×297mm） |

- **方向**：`sheetOrientation`（缺省 `portrait`）只影响**目标纸**；标签自身的朝向由模板 `orientation` 决定，两者互不干扰——横向标签模板可以拼到纵向目标纸上。
- 自定义宽高必须是大于 0 的数值，否则抛错（第 9 节）。目标纸张的可用范围不做上限截断，由用户自行保证能被打印机实际出纸。
- 设计器侧与「模板纸张尺寸」用同一套预设来源（`designer/utils/default-config.ts:4 PAPER_PRESETS` 去掉 CONTINUOUS）+ 同一个 `CUSTOM` 自定义宽高交互，保证两处纸张设置的交互与文案一致。

### 3.3 校验入口（错误文案的唯一真实来源）

`tiling.ts` 同时导出「不抛错」与「抛错」两个入口；**所有错误文案只在 `validateTiling` 一处定义**，管线与设计器都消费它的输出，从根本上杜绝「UI 提示与实际报错不一致」：

```ts
export type TilingIssueCode =
  | 'COLUMNS_INVALID'         // 列数缺失 / 非正整数
  | 'COLUMNS_OVERFLOW'        // 列数超出目标纸可用宽度   ← 保存拦截的主要依据
  | 'SHEET_SIZE_INVALID'      // CUSTOM 目标纸宽高非法
  | 'LABEL_TOO_TALL'          // 目标纸可用高度容不下一行
  | 'CONTINUOUS_UNSUPPORTED'  // 标签纸为连续纸
  | 'SHEET_CONTINUOUS'        // 目标纸为连续纸

export interface TilingIssue { code: TilingIssueCode; message: string }

export interface TilingResolveOptions { paperOverride?: { width?: number; height?: number } }

/** 永不抛错；合法返回 []。设计器（实时红字 + 保存拦截）与管线共用 */
export function validateTiling(template: TemplateData, opts?: TilingResolveOptions): TilingIssue[]

/** 有 issue 即抛 TilingError（message = 首条 issue 的 message）。管线与三端只走这里 */
export function computeTileLayout(template: TemplateData, opts?: TilingResolveOptions): TileLayout

export class TilingError extends Error { code: TilingIssueCode }
```

- `validateTiling` 只做纯计算校验，**不检查 `enabled`**（调用方自行决定是否校验：设计器在开关关闭时跳过，管线在分流后调用）。
- 管线（`pipeline.ts`）继续只调 `computeTileLayout`，不感知 issue 列表 → 服务端 400、客户端任务失败、设计器红字三处文案同源。
- `enabled !== true` 时 `computeTileLayout` 不做任何校验直接返回（保持「拼版关闭零回归」）。

## 4. 布局算法

`computeTileLayout(template: TemplateData, opts?: TilingResolveOptions): TileLayout`（纯函数，导出供核心与设计器共用，保证 UI 提示与实际输出同源；内部先 `validateTiling`，有 issue 即抛 `TilingError`）：

```
label = getPaperDimensions(template)                 // 格尺寸 = 标签纸尺寸（render/types.ts:228）
sheet = 目标纸张：按第 3.2 节优先级解析（paperOverride → 自定义宽高 → 预设 → 缺省 A4 纵向）
availW = sheet.width  - sheetMargin.left - sheetMargin.right
availH = sheet.height - sheetMargin.top  - sheetMargin.bottom
needW  = columns × label.width + (columns - 1) × gapX
maxColumns = floor((availW + gapX) / (label.width + gapX))   // 本纸最多可放列数；0 = 标签比可用宽度还宽
rows   = floor((availH + gapY) / (label.height + gapY))     // 至少 1，否则抛错（第 9 节）
perSheet = columns × rows

sheetOfTile(i) = floor(i / perSheet)
slot           = i % perSheet
col            = slot % columns
row            = floor(slot / columns)
left           = sheetMargin.left + col × (label.width + gapX)
top            = sheetMargin.top  + row × (label.height + gapY)
```

**「行不允许跨页」的实现方式**：行数只由纸高决定（`rows × label.height + (rows-1) × gapY ≤ availH` 恒成立），合成阶段按 `columns × rows` **整块切片**，因此任何一行都不会被分到两张纸上；最后一张底部装不下一整行的剩余空间一律留白。

`TileLayout` 返回值：`{ tile: {width, height}, sheet: {width, height}, columns, rows, perSheet, maxColumns }`。

- `columns > maxColumns` → `COLUMNS_OVERFLOW`（即「列数超出纸面可用宽度」，保存拦截的主要场景）；`columns < 1` 或非整数 → `COLUMNS_INVALID`。
- `sheetsN = ceil(tileCount / perSheet)`；`maxColumns` 供设计器提示「本纸最多 3 列」并做开关默认值收敛（§8）。

## 5. 渲染结构与 CSS

```html
<section class="print-sheet">                            <!-- 一张：@page 尺寸 = 拼版纸 -->
  <div class="print-tile" style="left:12mm;top:12mm">    <!-- 一格：绝对定位 -->
    <section class="print-page" data-page="1">…标签整页（水印层/三区/元素）…</section>
  </div>
  …
</section>
```

新增 `buildSheetPageCss(template, layout)`（`render/css-builder.ts`，与 `buildBatchPageCss:164` 并列）：

```css
/* 1) 拼版纸尺寸：必须排在标签页 @page 之后（同优先级后者胜）。
      服务端/客户端链路靠 paperMm 显式定尺寸、不看 @page；但浏览器 window.print() 只看 @page，
      漏掉这条会按标签纸分页 —— 实测 12 格被切成 7 张 70×40mm（见 §5.1 D4） */
@page { size: <拼版纸宽>mm <拼版纸高>mm; margin: 0; }

.print-sheet { width:<拼版纸宽>mm; height:<拼版纸高>mm; position:relative;
               overflow:hidden; break-after:page; page-break-after:always; }
.print-sheet:last-child { break-after:auto; page-break-after:auto; }
.print-tile { position:absolute; overflow:hidden; width:<标签宽>mm; height:<标签高>mm; }
/* 防御性声明：绝对定位 + overflow:hidden 容器内的后代不产生分页点，故当前布局下该覆盖无实际作用；
   但若将来改用 flex/grid 布局，格内整页会重新参与分页，故保留（详见 §5.1 D2） */
.print-tile > .print-page { break-after:auto; page-break-after:auto; }
@media screen {
  .print-sheet { margin:12px auto; box-shadow:0 2px 12px rgba(0,0,0,.18); }
  /* 必需：抵消标签 CSS 的 @media screen{.print-page{margin:12px auto}}，
     否则设计器预览错位 3.17mm、与出纸不一致（详见 §5.1 D1） */
  .print-tile > .print-page { margin:0; box-shadow:none; }
}
```

- `break-after:page` + `:last-child{auto}` 是**必需**的，不是可选优化：它让分页与容器高度解耦，不依赖「`.print-sheet` 高度恰好等于纸高」这一脆弱隐式前提（详见 §5.1 D3）。
- 格内 `.print-page` 的 `width / min-height / padding` 沿用 `buildPageCss(template)` 的**标签几何** → 标签渲染产物零改动，水印层、页眉页脚、首页叠加、绝对定位元素、`{pageIndex}/{totalPages}` 变量全部照旧。
- 张容器不额外设背景（默认白）；标签底色仍由格内 `.print-page` 的 `pageBackground` 表达，避免格内白底覆盖张背景。
- 格位置用**绝对定位**而非 CSS Grid：与项目既有元素定位模型一致，且不受 Chromium 对 grid 容器分片的影响（`css-builder.ts:67` 水印注释里已记录过一次 RIP 相关踩坑）。

### 5.1 实证结论（SPIKE，2026-09-19）

方案的核心假设已用真实管线产物 + 真实 Chromium 出 PDF 验证过（报告：`docs/superpowers/spikes/2026-09-19-tiling-poc/RESULTS.md`）。要点：

| 结论 | 内容 |
|---|---|
| **成立** | 绝对定位网格方案正确：12 格 → 1 张、13 格 → 2 张、无空白页；PDF 内实测 2 列 × 6 行、列距 72mm、行距 42mm、行优先填充顺序 L01→L12、第 2 张仅 L13 落在首格，10/10 项检查通过 |
| **成立** | 服务端/客户端页尺寸只由 `paperMm` 决定（`preferCSSPageSize: false`），CSS `@page` 层叠对其无影响 → 「三端零代码改动」成立 |
| **D1** | 预览期必须覆盖 `.print-page` 的 `margin`：否则设计器预览里格内标签垂直错位 **3.17mm**（打印时正常，但预览与出纸不一致） |
| **D2** | 「格内整页不得再分页」的覆盖在当前布局下**非必需**（措辞已从「关键」降级为「防御性」） |
| **D3** | 显式 `break-after:page` 是**必需**的：容器高 148mm 的对照实验里，有 break → 2 张 ✅，无 break → 1 张 ❌ |
| **D4** | 拼版 `@page` 是浏览器链路的硬需求：不追加则该链路输出 7 张 70×40mm（完全错误）；追加后 209.9×297.0mm ✅ |
| **D5** | 集成测试统一用 `pdfjs-dist`，其坐标为**标准 pt 且按页重置**（`mm = pt × 25.4 / 72`，无需按页码补偿）。原「CSS px + 文档流补偿」的说法是 **pypdf 的特例**，用 pdfjs 后不适用 |
| **D6** | 页尺寸断言必须带容差：MediaBox 存在 mm↔pt 舍入（210mm 读作 210.2mm） |


## 6. 管线改造（`print/pipeline.ts`）

- `prepareWithSession` 出口分流：`template.tiling?.enabled` → 拼版合成；否则现状路径不动。
- **校验先行**：分流后第一时间调 `computeTileLayout`（内部 `validateTiling`），纸面/列数/高度任一非法立即抛 `TilingError` —— 在渲染任何一页之前失败，不浪费渲染开销、不产出半成品文档。
- 合成前逐份校验（第 9 节），任一份不合格立即抛错，**不产出半成品文档**。
- 展平：`各份 × 该份各页` → 格队列（因校验保证每份恰好 1 页，实际是「一份一格」）。
- 新增 `print/tile-compose.ts`：`composeTiledHtml(input): { html, sheetCount, tileGrid }`，纯字符串、不依赖 DOM，签名与 `composeBatchHtml` 对齐。
- `paperMm` = **拼版纸**（先经 `job.paperOverride` 解析出最终纸面，再据此算行列，保证布局与物理纸始终一致）；`heightSource` = `'config'`。
- `pageCount` = **张数**（实际输出页数）；`copies` 仍为标签份数。标签内容里的 `{pageIndex}/{totalPages}` 语义不变（标签自身页序）。
- `renderScreenshot` 不参与拼版（仍按标签纸单页快照），在函数注释中写明该语义。
- 单份数据（对象入参）走同一路径：1 条数据 = 1 格 + 1 张（不特殊分支）。

## 7. 三端改动

| 端 | 改动 |
|---|---|
| `services/print-render` | **零代码**。页尺寸取自 `prepared.paperMm`（`pdf-render.ts` → `buildPdfTargetSpec`），拼版后自动变目标纸 |
| `packages/print-client-sdk` | **零代码**。`RenderedHtmlPages.paperMm` 即拼版纸 |
| `clients/print-client` | **零代码**。`print-engine.ts:123` 取 `prepared.paperMm` → Electron `pageSize`；`request-validation.ts` 的 `paperMm` 校验天然通过 |
| `print-core` 导出 | `print/index.ts` 加 `export * from './tiling.js'`；主入口导出 `computeTileLayout` / `validateTiling` / `TilingError` / `TILE_DEFAULTS` / `composeTiledHtml` 及 `TilingOptions` / `TileLayout` / `TilingIssue` / `TilingIssueCode` 类型 |

架构守卫 `scripts/check-print-architecture.mjs` 只管 `services/` 与 `clients/`，拼版逻辑全在 core，与守卫一致（且必须如此，否则违反「三端不得各自实现出图参数」）。

## 8. 设计器改动（`packages/print-canvas`）

新增 `src/components/TilingConfig.vue`（原生控件，无 Element Plus，结构与 `WatermarkConfig.vue` 同构），在「页面」页签挂载（`PropertyPanel.vue:73` 纸张设置块之后），沿用 `pd-*` 样式类。字段按下面的顺序排列：

| 行 | 控件 | 落盘字段 | 说明 |
|---|---|---|---|
| 1 | 开关 | `enabled` | 关闭时下列字段隐藏并保留值；打开时若未配置过则写入 `TILE_DEFAULTS`，并按当前纸面收敛列数（见下） |
| 2 | 目标纸张 | `sheetPaperSize` | 下拉：A4 / A3 / A5 / Letter / Legal / 自定义；**与模板「纸张尺寸」用同一套预设来源，但不含连续纸** |
| 3 | 目标纸宽高 (mm) | `sheetCustomWidth` / `sheetCustomHeight` | 仅 `sheetPaperSize='CUSTOM'` 时显示，两个 `StepperInput`（min 25 / max 2000），与模板自定义纸张同一交互 |
| 4 | 目标纸方向 | `sheetOrientation` | 纵向 / 横向（`pd-radio-group`），仅影响目标纸，不影响标签朝向 |
| 5 | 拼版留白 (mm) | `sheetMargin.{top,right,bottom,left}` | 四个 `StepperInput`，复用 `margin-grid` 布局 |
| 6 | 格间距 (mm) | `gapX` / `gapY` | 横向 / 纵向 |
| 7 | 列数 | `columns` | `StepperInput`（min 1 / 整数 / `max` 动态取 `maxColumns`）；下方即时显示「自动推导 N 行 · 本纸最多 M 列」，超限时红字 |

- **实时摘要**（只读，位于开关下方）：调 `computeTileLayout` 得出，形如「目标纸 A4 纵向 210×297mm · 2 列 × 6 行 = 每张 12 格」。宿主用 `paperOverride` 覆盖时摘要按模板值显示，并在预览/状态栏按实际出纸刷新。
- **打开开关时的列数收敛**：`columns = clamp(2, 1, maxColumns)`（取 `TILE_DEFAULTS` 的 2 列与纸面最大可放列数的较小值）。理由：用户可能先把纸改成很小的自定义纸、再打开拼版，直接写 2 列会立刻进入非法态、连保存都被拦，体验很差。若 `maxColumns = 0`（标签比可用宽度还宽），仍写 1 列并保留红字——这是标签本身超出纸面的真实问题，不静默改写。
- 连续纸模板：开关置灰 + 提示「连续纸不支持拼版」。
- 列数非法 / 超出可用宽度 / 标签高度容不下一行：输入框下即时红字（调 `validateTiling`，单一真实来源），与管线报错文案完全一致。
- **实时校验不阻断输入**（关键）：列数从 2 改成 5 时中间态必然非法，若在输入层拦截，用户就改不回去了。红字只是「预警」，真正的闸门在保存（§8.1）。
- 新建模板不写 `tiling` 字段（存量字节兼容）。
- 画布（`CanvasPaper`）保持标签设计视图不变；拼版效果由 `PrintHtmlPreview` 全屏预览呈现——该组件渲染的就是管线 HTML，**无需改动**。
- `StatusBar` 可选显示「拼版 · 目标纸 A4 · 每张 12 格」。

### 8.1 非法配置不允许保存（本次新增的核心行为）

**拦截点**：`PrintDesigner.vue:481 handleSave()` —— 保存动作的唯一出口。

```ts
function handleSave() {
  const json = templateJsonWithFonts()
  if (json.tiling?.enabled) {
    const issues = validateTiling(json)          // 不抛错
    if (issues.length) {
      emit('update:activeTab', 'page')           // 自动切到「页面属性」页签
      tilingIssue.value = issues[0].message      // 传给 TilingConfig 高亮 + 红字
      alert(issues[0].message)                   // 与画布既有阻塞提示惯例一致
      return                                      // ← 不 emit('save')、不 markSaved()
    }
  }
  emit('save', JSON.stringify(json))
  markSaved()
}
```

三条必须遵守的细节：

1. **只拦「保存」，不拦预览/导出旁路**：预览仍可打开（便于用户对照实际效果排查），但摘要区红字照旧显示。
2. **保存按钮不禁用，保持可点**：禁用按钮会让用户只看到「点不动」而不知道原因；点击后给出明确文案并定位字段才是有效反馈。按钮态仅在存在 issue 时加警示样式（可选）。
3. **宿主旁路必须也给到闸门**：宿主常用的 `getTemplateJson()`（`PrintDesigner.vue:479` expose，绕过 `handleSave`）拿不到拦截，因此**新增 expose `validateTemplate(): TilingIssue[]`**，宿主在导出/另存/提交等自有保存链路里先调它再决定是否放行。此项为公开 API 变更，需同步进集成文档与 skills（§11）。

**校验时机矩阵**（写清每一处为什么这样设计）：

| 时机 | 行为 | 是否阻断 | 理由 |
|---|---|---|---|
| 改列数 / 纸 / 留白 / 间距的输入过程中 | 输入框下红字 + 摘要标「放不下」 | 否 | 中间态必然非法，阻断会导致用户无法修正 |
| 点击「保存」 | `alert` 首条 issue + 自动切「页面属性」页签 + 字段红字 | **是**（不 `emit('save')`、不 `markSaved()`） | 非法配置不得落盘，避免错误推迟到打印时才暴露 |
| 宿主调 `getTemplateJson()` 自行保存 | 无自动拦截，宿主调 `validateTemplate()` 自行决定 | 由宿主决定 | 旁路过不了组件内部；提供校验 API 是唯一可行做法 |
| 打开预览 | 正常渲染 | 否 | 只读、可诊断；拼版开启但配置非法时预览走管线会抛 `TilingError`，预览组件需 catch 后展示错误文案而非白屏（沿用现有预览错误提示路径） |
| 三端渲染（服务端 / 客户端 / 浏览器打印） | `computeTileLayout` 抛 `TilingError` | **是** | 最后一道防线；服务端 400 / 客户端任务失败 |

## 9. 错误处理

全部简体中文，文案唯一来源为 `validateTiling`（§3.3），按 issue 的 `code` 对照：

| code | 触发条件 | 文案 |
|---|---|---|
| `COLUMNS_INVALID` | 列数缺失 / 为 0 / 非整数 | `拼版列数必须是大于 0 的整数` |
| `COLUMNS_OVERFLOW` | `columns > maxColumns`（列数超出纸面可用宽度） | `拼版列数 {columns} 超出纸面可用宽度：{sheetW}mm − 左右留白 {ml+mr}mm = {availW}mm，最多可放 {maxColumns} 列；当前 {columns} 列 {labelW}mm 标签含间距需要 {needW}mm` |
| `SHEET_SIZE_INVALID` | `CUSTOM` 目标纸宽高 ≤ 0 / 非数值 | `拼版自定义纸张宽高必须是大于 0 的数值（mm）` |
| `LABEL_TOO_TALL` | 可用高度容不下一行（`rows` 算得 0） | `标签高度 {labelH}mm 超出纸面可用高度 {availH}mm，拼版每张 0 行；请缩小标签高度或改用横向纸` |
| `CONTINUOUS_UNSUPPORTED` | 标签纸为连续纸 | `连续纸不支持拼版打印，请将模板纸张改为固定纸张或关闭拼版` |
| `SHEET_CONTINUOUS` | 目标纸为连续纸 | `拼版目标纸张不能是连续纸` |

约定：

- **判定顺序**：纸面尺寸类（`SHEET_SIZE_INVALID` / `SHEET_CONTINUOUS` / `CONTINUOUS_UNSUPPORTED`）→ 列数类（`COLUMNS_INVALID` → `COLUMNS_OVERFLOW`）→ 高度类（`LABEL_TOO_TALL`）。`validateTiling` 返回全部命中项，设计器红字显示**全部**、保存提示只弹**第一条**（避免弹窗连击）。
- `COLUMNS_OVERFLOW` 文案必须带**「最多可放 {maxColumns} 列」**：只说「超了」用户不知道改到几，可执行建议才算合格的错误信息。
- 一处例外不走 `validateTiling`：**每份非单页**必须在渲染后才知道，仍由管线在合成前抛错 —— `拼版要求每份标签恰好 1 页，第 {i} 份渲染出 {n} 页（内容超出纸张）；请缩小内容或调整标签纸张高度`。这条**设计器无法提前拦截**（依赖真实数据渲染结果），故不纳入保存校验；宿主可通过预览提前发现。
- 其余（码值渲染异常等）沿用现状；批量单份失败仍是 `第 {i} 份渲染失败：{原因}`。

## 10. 测试矩阵

core（vitest，TDD 红绿）：

- 新增 `src/print/__tests__/tiling.spec.ts`：
  - 布局基线：A4 纵向 + 70×40 标签 + 四边 10mm + 间距 2mm + `columns=2` → `rows=6`、`perSheet=12`；第 0/1/2 格的 `left/top`。
  - 目标纸张可自定义：`A5` 预设 → 行数随纸高变化；`sheetPaperSize='CUSTOM'` + 自定义宽高生效；缺省（无 `tiling` 纸张字段）回落 A4 纵向。
  - 解析优先级：`paperOverride` 覆盖后行列按覆盖纸面重算（覆盖为更小纸 → 行数减少）；`paperOverride` 为 0/负数时视为未提供、回落模板设置。
  - 方向独立：`landscape` 目标纸行数随之变化；横向标签模板 + 纵向目标纸时格尺寸取横向标签尺寸。
  - **`maxColumns`**：A4 纵向 + 70×40 标签 + 四边 10mm + 间距 2mm → `maxColumns = floor((190+2)/(70+2)) = 2`；标签比可用宽度还宽 → `0`；间距变化后随之变化。
  - **`validateTiling` 不抛错语义**：非法配置返回 issue 数组而非异常；合法返回 `[]`；`enabled=false` 时 `computeTileLayout` 不校验直接返回。
  - **issue 判定与顺序**：`columns=5`（A4/70mm 下 `maxColumns=2`）→ 恰好 1 条 `COLUMNS_OVERFLOW`，文案含「最多可放 2 列」；同时命中纸面非法 + 列数超宽时，返回顺序为纸面类在前。
  - **`computeTileLayout` 抛错一致性**：同一非法输入下 `TilingError.message` 严格等于 `validateTiling` 首条 issue 的 `message`（防止两处文案漂移的回归测试）；`TilingError.code` 与首条 issue 的 `code` 一致。
  - 报错文案：`columns` 为 0/小数/缺失 → `COLUMNS_INVALID`；`CUSTOM` 但宽高非法 → `SHEET_SIZE_INVALID`；`columns` 超出可用宽度 → `COLUMNS_OVERFLOW`；标签高于可用高度 → `LABEL_TOO_TALL`；两类连续纸错误。
- 新增 `src/print/__tests__/tile-compose.spec.ts`：12 格 → 1 张；13 格 → 2 张且第 2 张仅 1 格（留白）；`.print-tile > .print-page` 分页覆盖样式存在；`@page size` = 拼版纸；格内保留标签几何；全程纯字符串（无 DOMParser）。
- 扩 `src/print/__tests__/pipeline.spec.ts`（fake driver）：拼版关闭 → 与改造前结构一致（回归）；开启 + 12 条 → `paperMm`=A4、`pageCount`=1、`copies`=12；13 条 → `pageCount`=2；某份 2 页 → 抛错含「恰好 1 页」「第 2 份」；连续纸 + 拼版 → 抛错。
- 扩 `render/css-builder.test.ts`：`buildSheetPageCss` 的 `@page` 尺寸与格位断言；**另加一条顺序断言：拼版 `@page{size:拼版纸}` 必须出现在标签 `@page{size:标签纸}` 之后**（SPIKE D4 的回归保护，防止将来改动 CSS 拼接顺序导致浏览器链路静默失效）；断言 `@media screen` 下存在 `.print-tile > .print-page{margin:0}`（SPIKE D1 的回归保护）。

render 集成（Playwright，慢）：新增 `services/print-render/src/tiling.integration.test.ts`：

- 70×40 标签 + 12 条数据 + A4 2 列 → 单个 PDF、1 页、页尺寸 210×297mm（**容差 ±0.5mm**：MediaBox 存在 mm↔pt 舍入，210mm 会读成 210.2mm，SPIKE D6）。
- 13 条 → 2 页；自定义目标纸（如 100×150mm）→ 页尺寸随之为 100×150mm（同容差）。
- 页内网格：`page.emulateMedia({ media: 'print' })` + `getBoundingClientRect` 断言 12 格的 left/top/宽高与理论值误差 < 0.5mm（SPIKE H5 已证明可行，误差为 0）。
- 分张归属：用 `pdfjs-dist` 断言「第 1 张文本含 L01/L12 不含 L13、第 2 张含 L13 不含 L01」（写法已实测，见下方）。

**分张归属断言（已决策并落地）**：新增 `pdfjs-dist@6.3.289` 为 `@worm-vue3-print/render` 的 devDependency。SPIKE §4.6 已用纯 Node 实测 12/12 项通过（第 1 张 L01–L12、第 2 张仅 L13、页尺寸 210×297mm、2×6 网格、列距 72mm、行距 42mm）。要点：入口 `pdfjs-dist/legacy/build/pdf.mjs`；**v6 起析构在 loadingTask 上**（`await task.destroy()`）；坐标为**标准 pt、按页重置**。另新增 `services/print-render/vitest.config.ts` 把 `spike/**` 排除出 `npm test`。

canvas：新增 `src/__tests__/TilingConfig.spec.ts`，覆盖开关联动（打开写入 `TILE_DEFAULTS`、关闭保留字段）、**开关打开时列数按 `maxColumns` 收敛**（小自定义纸 → 收敛为 1；正常 A4 → 2；`maxColumns=0` → 写 1 并保留红字）、切换预设纸张 / 方向后实时摘要更新、选「自定义」后显示宽高输入并落盘 `sheetCustomWidth` / `sheetCustomHeight`、非法列数的即时红字（**且不阻断输入**）；补 `PropertyPanel` 页签挂载交互。

canvas 保存拦截（落地为 `src/__tests__/print-designer-tiling.spec.ts`，**挂载真实 `PrintDesigner`** 走工具栏 `save` 事件，顺带验证 `tiling` 能穿过模板载入的迁移存活；未按计划抽出 `tilingSaveGuard` 纯函数——真实挂载能覆盖 include 迁移、页签联动等更多真实路径）：

- 拼版开启 + `columns` 超宽 → 点保存：**不触发 `save` 事件**、不 `markSaved()`、`alert` 收到 `COLUMNS_OVERFLOW` 文案、`activeTab` 切到 `'page'`、`TilingConfig` 收到该 issue。
- 拼版开启 + 配置合法 → 正常 `emit('save')` 且 JSON 含 `tiling`。
- 拼版关闭 / 无 `tiling` 字段 → 保存行为与改造前完全一致（回归，不调 `validateTiling`）。
- 暴露的 `validateTemplate()`：非法 → 返回 issue 数组且**不弹窗、不切页签**（纯查询，供宿主自行拦截）；合法 → `[]`。
- 非法配置下打「预览」仍可进入（不被保存闸门连带拦死）。

收尾门禁：`npm run build`、`npm test`、`npm run lint:print-architecture`、`npm run test -w @worm-vue3-print/render`。

## 11. 版本与文档

- 属 core / canvas 能力变更；发版按仓库既有流程（四处版本号 + CHANGELOG 中/en + canvas 帮助弹窗）另行处理，不在本设计内执行。
- 实现阶段需同步：
  - `docs/中文/指南/渲染管线.md`：新增拼版小节，写清「目标纸张可自定义、A4 仅为默认」与「非法配置不允许保存」的完整时机矩阵。
  - `docs/中文/接口/API文档.md`：`TilingOptions` 字段表与第 3.2 节解析优先级、`computeTileLayout`、`TileLayout.maxColumns`、**`validateTiling` 与 `TilingIssueCode` 全量对照表**（宿主需据此做本地化提示）、`pageCount` 语义变更。
  - 两个包 README：canvas 侧补「`PrintDesigner` 新增 expose `validateTemplate(): TilingIssue[]`，宿主自有保存链路须先校验再落盘」。
  - `skills/worm-vue3-print-integration`：能力表补一行「拼版打印」；`references/host-integration-guide.md` 的保存章节补一句「`getTemplateJson()` 是旁路、不经过设计器保存闸门，宿主应调 `validateTemplate()` 自行拦截」；`references/integration-api.md` 的 expose 清单同步（现有文档明确写「组件只 expose 了 `getTemplateJson`」，此处必须更新，否则文档即错误）。
  - `demo/src/App.vue`：`onExportTemplate` / `onSave` 接入 `validateTemplate()`，示范宿主侧拦截写法（demo 目前直接用 `getTemplateJson()` 下载，会成为反例）。
