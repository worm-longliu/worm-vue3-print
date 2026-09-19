# 拼版打印方案验证报告（SPIKE）

日期：2026-09-19
对应设计：`docs/superpowers/specs/2026-09-19-label-tiling-print-design.md`
探针（**验证完成后已删除**，结论见本报告；同类方法见 skill `chromium-print-pagination-verify`）：`services/print-render/spike/tiling-css.spike.test.ts`（5 项）、`spike/pdfjs-assert.spike.test.ts`（12 项，TS 侧断言可行性）、`verify-pdf-pages.py`、`verify-pdf-coords.py`
产物（已随探针删除）：`services/print-render/spike/output/`（7 个变体 PDF + 各步 JSON）
永久回归：`services/print-render/src/tiling.integration.test.ts`（4 项）已覆盖本报告 H1–H5/H9–H11 的关键结论（页数、页尺寸、分张归属、网格坐标）

## 1. 为什么先做验证

设计文档的核心是三条 CSS/分页假设，全部属于「写得通、但 Chromium 未必照做」的类型：

1. 多张「整页高的绝对定位容器」能恰好各占一页，不多出空白页；
2. 服务端/客户端的页尺寸真的只由 `paperMm` 决定，与 CSS `@page` 无关（这决定「三端零改动」是否成立）；
3. 绝对定位格子的坐标在打印时精确落在网格上。

这三条任何一条不成立，方案就要重写。所以先用手写拼版 HTML（**不写任何生产代码**）+ 真实管线产物出 PDF 验证。

## 2. 验证方法

标签页 HTML 全部来自真实管线：`prepareDocument()` 渲染 70×40mm 标签模板 × 13 条数据 → 提取 13 个 `.print-page` 片段与标签页 CSS。
然后按设计文档 §5 的结构拼装 `.print-sheet` / `.print-tile`，出 PDF 并测量。布局参数：

```
标签 70×40mm · 目标纸 A4 210×297mm · 四边留白 10mm · 格间距 2mm · 2 列
→ 自动推导 6 行、每张 12 格
矩阵 7 个 CSS 变体 × 数据量 {12, 13} + 链路对照 3 组 + 屏幕态 2 组
```

## 3. 结论总览

| 编号 | 假设 | 结论 |
|---|---|---|
| H1 | 多张整页容器各占一页、无空白页 | ✅ 成立（12 格 → 1 张，13 格 → 2 张） |
| H2 | 格内 `.print-page` 的 `break-after` 必须被覆盖 | ❌ **证伪**（见 D2） |
| H3 | 服务端/客户端页尺寸只由 `paperMm` 决定 | ✅ 成立，CSS `@page` 层叠完全无影响 |
| H4 | 浏览器链路 `@page` 需换成拼版纸 | ✅ **成立且必需**（不换则输出完全错误，见 D4） |
| H5 | 绝对定位格坐标精确 | ✅ 成立（误差 0） |
| H6 | 预览与出纸一致 | ❌ **发现缺陷**（预览偏移 3.17mm，见 D1） |
| H7 | 显式 `break-after` 是否冗余 | ✅ **必需**（见 D3） |
| H8 | PDF 层最终坐标与填充顺序正确 | ✅ 10/10 项通过 |
| H9 | 纯 Node（`pdfjs-dist`）能承担集成测试的 PDF 断言 | ✅ 成立（12/12 项通过，见 §4.6） |
| H10 | 分张归属（第 N 张含哪几条）在 TS 侧可断言 | ✅ 成立，`pdfjs-dist` 即可，无需外部脚本 |
| H11 | 每页文本坐标是否需按页码做纵向补偿 | ❌ **不需要**：pdfjs 坐标按页重置（见 §4.6） |

## 4. 关键实测数据

### 4.1 页尺寸由谁决定（H3/H4）

| 链路 | CSS `@page` 声明 | 页数 | MediaBox |
|---|---|---|---|
| 服务端/客户端（显式 width/height = `paperMm`） | 标签 70×40 + 拼版 210×297 | 1 | **210.2×297.0mm** |
| 浏览器（`preferCSSPageSize`，即 `window.print()`） | 同上 | 1 | 209.9×297.0mm |
| **对照组**：浏览器链路但不追加拼版 `@page` | 仅标签 70×40 | **7** | **69.8×39.9mm ×7** |

- 服务端链路里 `buildPdfTargetSpec` 的 `preferCSSPageSize: false`，页尺寸 = `paperMm`，**CSS `@page` 说什么都不影响** → 「服务端 / Electron 客户端零代码改动，只换 `paperMm`」成立。
- 但浏览器链路靠 `@page`。对照组说明：不把 `@page` 换成拼版纸，12 格的文档会被切成 **7 张 70×40mm 的纸**——输出完全不可用。
- 同优先级下**后出现的 `@page` 胜出**，所以拼版 `@page` 必须排在标签 `@page` 之后（或改用命名页 / 剔除标签 `@page`，二者实测同样有效）。

> 页尺寸读数为 210.2×297.0mm 而非 210×297：mm→pt→mm 的舍入（297mm 精确，210mm 偏差 0.2mm）。集成测试断言页尺寸**必须带容差**。

### 4.2 变体等价性（H1/H2/H7）

7 个变体在「12 格 → 1 张、13 格 → 2 张」上**页数完全一致**，包括：

- `height` / `min-height` 均可；
- `break-after` / `break-before` / 无 break 属性 均可；
- 命名页 `@page sheet` 与「剔除标签 `@page`」均可；
- **删掉 `.print-tile > .print-page{break-after:auto}` 也一致** → 这条声明在绝对定位方案下**不是正确性关键**（原因：处于绝对定位 + `overflow:hidden` 容器内的后代，其 `break-after` 不产生分页点）。

### 4.3 显式分页是否必需（H7）

把 `.print-sheet` 高度人为设成 148mm（放大「容器高 ≠ 纸高」的偏差）：

| 方案 | 页数 | 正确 |
|---|---|---|
| `height:148mm` + `break-after:page`（+ `:last-child{auto}`） | 2 | ✅ |
| `height:148mm`，无 break 属性 | 1 | ❌ |

→ 显式 `break-after` 让**分页与容器高度解耦**，不是冗余声明。仅靠「高度恰好等于纸高」是脆弱的隐式依赖。

### 4.4 格坐标（H5 + PDF 层 H8）

浏览器 print media 下 `getBoundingClientRect`：12 个格子的 left/top 与理论值**完全一致**（10/10、82/10、10/52 … 82/220），尺寸 70×40mm，误差 0。

真实 PDF 内文本坐标（pypdf 提取）：

```
列 x 去重: [13.0, 85.0]       步距 72.0mm   ← 13 = 格 left 10 + 标签 padding 3
行 y 去重: [17, 60, 102, 143, 185, 228]   步距 42mm
每行标签数: 2（共 6 行）
填充顺序: L01 L02 L03 … L12（自上而下、每行左→右）
第 2 页: 仅 L13，x=12.99、y=17.59（= 首格位置）
```

10/10 项检查通过：网格 2×6、步距 72/42mm、行优先填充顺序、无坐标重叠、全部落在纸面内、第 2 张仅 L13 且落在首格。

### 4.5 分张归属断言可提取（决定集成测试怎么写）

pypdf 能逐页提取文本：第 1 张 = `L01…L12`，第 2 张 = `L13`。**结论：设计文档 §10 规划的「抽样断言某张含某条数据」在技术上可行。**

但要注意：**项目当前没有任何 PDF 解析依赖**（`services/print-render` 只有 playwright / express）。TS 侧集成测试想读 PDF 文本，需要新增 devDependency。这是实施计划里的一个待决策点（**已于 §4.6 决策并实测**）。

### 4.6 纯 Node 断言链路（H9/H10/H11）—— 已决策：新增 `pdfjs-dist`

**决策**：新增 `pdfjs-dist` 为 `@worm-vue3-print/render` 的 devDependency（实测版本 **6.3.289**）。理由：分张归属是拼版最核心的正确性，不能只靠「页数 + 页尺寸」。

探针 `spike/pdfjs-assert.spike.test.ts` 解析 SPIKE 产物 `A-height___break-after-13.pdf`，12/12 项通过：

```
✓ 页数 = 2                              ✓ 第1页列数 = 2
✓ 第1页尺寸 = 210×297mm                 ✓ 第1页行数 = 6
✓ 第1页 12 个标签                       ✓ 列步距 ≈ 72mm
✓ 第1页标签为 L01..L12                  ✓ 行步距 ≈ 42mm
✓ 第2页仅 1 个标签 L13                  ✓ 无坐标重叠
✓ 第2页坐标按页重置（L13 与 L01 同格）   ✓ 全部落在纸面高度内
```

**三条实现要点**（写集成测试必读）：

1. **入口**：`import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'`（Node 环境用 legacy 构建，避免 DOM 依赖）。
2. **析构**：v6 起 `PDFDocumentProxy` 已无 `destroy()`，改用 **`const task = getDocument(...)` → `await task.destroy()`**（踩过一次：`doc.destroy is not a function`）。
3. **坐标单位是标准 pt**，原点在**该页左下角**，`mm = pt × 25.4 / 72`；`y_top = pageHeightMm − transform[5] × 25.4 / 72`。

**H11：D5 的第一个「坑」在 pdfjs 下不存在。** 实测第 2 页 `L13` 的坐标为 `(13, 17.5)mm`，与第 1 页 `L01` 完全一致 —— pdfjs 是逐页 `getTextContent()`，**坐标天然按页重置**，不需要 pypdf 那套「减 `(N-1) × 纸高`」的文档流补偿。集成测试因此更简单、更不易写错。

**代价**：多 3 个包（`pdfjs-dist` + 传递依赖），仅 devDependency，不进生产镜像。

## 5. 对设计文档的修正（必须落回 §5 / §10）

| 编号 | 问题 | 修正 |
|---|---|---|
| **D1** | 设计器预览下格内标签被标签 CSS 的 `@media screen { .print-page{margin:12px auto} }` 挤偏 **3.17mm**（垂直），预览与实际出纸不一致；注入 `margin:0` 后偏移为 0 | 拼版 CSS 必须追加 `@media screen { .print-tile > .print-page { margin: 0; box-shadow: none; } }` |
| **D2** | 「格内整页不得再分页」的覆盖在绝对定位方案下**非必需**，文档却标为「关键」 | 措辞降级为「防御性声明」并说明原因；保留无害（若将来改 flex/grid 布局则变为必需） |
| **D3** | 未说明显式 `break-after` 的必要性 | 明确标注为**必需**，理由：让分页与容器高度解耦，不依赖「高度恰好等于纸高」 |
| **D4** | 只写了「追加拼版 `@page`」，未说明它是浏览器链路的**硬需求** | 补充实测证据（不追加 → 7 张 70×40mm），并加一条单测断言「拼版 `@page` 出现在标签 `@page` 之后」 |
| **D5** | 未记录 PDF 坐标提取的换算坑 | 集成测试统一用 `pdfjs-dist`，其坐标为**标准 pt 且按页重置**，无补偿需求（§4.6）。仅当改用 pypdf 时才需注意其 `tm` 单位是 **CSS px（25.4/96）** 且 y 延续文档流 |
| **D6** | 未说明页尺寸断言精度 | MediaBox 有 mm↔pt 舍入（210 → 210.2mm），集成测试断言必须带容差（±0.5mm） |

## 6. 复现方式

探针目录已随实现完成删除（结论全部固化在本报告）。若要重新验证，按下列方法重建探针；同类方法已沉淀为 skill `chromium-print-pagination-verify`。

```bash
# 1) 建探针：手写 HTML（不碰生产代码），用生产管线的真实产物当输入
# 2) 出 PDF：真实 Chromium，两种模式对照（CSS @page 说了算 vs API paperMm 说了算）
# 3) 断言：优先用 pdfjs-dist（纯 Node、坐标为标准 pt 且按页重置）
cd services/print-render
npx vitest run spike/<probe>.spike.test.ts   # 需在 vitest.config.ts 已排除的 spike/ 下，显式指定路径
```

> `spike/**` 已在 `services/print-render/vitest.config.ts` 中从 `npm test` 排除：探针含真实 Chromium、单文件可达数分钟，
> 按约定临时存在、验证完即删。该排除规则保留，供后续方案验证复用。

现在若只需回归拼版行为，直接跑永久集成测试即可（快且进 CI）：

```bash
npm run test -w @worm-vue3-print/render -- tiling.integration
```

环境：macOS + 系统 Chrome（`BrowserPool` 自动探测到 `/Applications/Google Chrome.app`）、Playwright 1.63。

## 7. 结论

设计文档的主体方案（模板级配置、绝对定位网格、复用标签整页产物、`paperMm` 换成拼版纸驱动三端）**经实证成立**；不需要改架构。

需要改进的是 3 处 CSS 细节（D1 新增预览覆盖、D3 明确 break 必需、D4 明确 `@page` 硬需求）与 1 处措辞降级（D2），以及集成测试的断言写法（D5/D6）。
