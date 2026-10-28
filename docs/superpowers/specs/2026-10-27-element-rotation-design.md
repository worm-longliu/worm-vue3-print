# 元素级任意角度旋转 — 设计说明

日期：2026-10-27　影响版本：`@worm-vue3-print/{core,canvas}` 1.3.11 → 1.3.12（新增能力，非破坏）；`@worm-vue3-print/common` 预览版随主线单独升号

## 一、需求与裁决

用户裁决（2026-10-27）：采用 **C 档 —— 完整任意角度元素级旋转**；拖拽旋转手柄**暂不做**，角度一律走属性台数值输入（+ 90° 步进按钮）；先经独立验证件实测（`.lab-rotation/`，已出全部数字），本文档把实测结论固化为可验收口径，**经用户确认本 spec 后才动 `packages/`**。

实测结论摘要（验证件 `.lab-rotation/out/summary.json`，A4 固定页 100×20mm@(20,250)、内容高 277mm）：

| 场景 | 实测数字 | 含义 |
|---|---|---|
| 15° / 30° / 45° / 90° 内容溢出 | 5.59 / 16.65 / 25.42 / 32.99mm | 旋转放大 AABB，`bottom = top + measuredHeight` 会高估 |
| 45° 顶部越界不可见 | AABB 顶在纸外 22.43mm，contentBottom 仍 279.99 | 测高口径只见底边，顶边裁切分页引擎看不见 |
| 假溢出（不修的后果） | 实际底边 272.43 < 277，引擎算 304.85 → `overflow=true` | 测量值含 transform 导致误判 |
| 换页钳位（不修的后果） | 第 2 页 `renderTop=0` → 内容顶相对坐标 −40mm 被裁 | 换页落点必须按 AABB 顶修正 |
| 连续纸（80mm 纸） | 基线 113.99mm；30° 裁 11.47mm、45° 裁 17.04mm | 连续纸推导必须换 AABB 口径 |
| PDF 文本矢量 | 30° 矩阵 `[10.3923,-6,6,10.3923]`、45° `[8.4853,-8.4853,8.4853,8.4853]` | CSS transform 下 PDF 文本保持矢量，无栅格化回归 |
| 条码 raster | 90° ≡ 0° 全 DPI；300dpi 30° 细条（≤2px）占比 1.6%→14.8%，CV 0.499→0.551；385dpi 干净 | 斜角破坏点阵对齐，须设 DPI 门槛 |

## 二、现有代码事实（按符号复核，行号会漂）

- **旋转现状三处，全与元素无关**：`options.outputRotation`（0/90/180/270，末趟转子包裹、测量趟不参与，`html-generator.ts`）；`designBackground.rotation`（90° 步进）；水印 `rotate`（−90~90）。**元素级旋转当前为零**。
- **死字段**：`core/src/designer/types.ts` 的 `ElementOptions.transform?: number` 自 c3fe8a0 起无任何消费方。本期删除，`rotate` 沿用该语义位（JSON 兼容：旧模板里残留的 `transform` 值无渲染效果，删除不改变出纸）。
- **测量趟读的是含 transform 的盒子**：`core/src/browser/dom-executor.ts` 用 `getBoundingClientRect().height` —— 旋转后该值即 AABB 高。当前分页只记 `options.top + measuredHeight`，AABB 顶上移量 `(aabbH − h)/2` 全链路不可见。
- **分页落点**：`pagination-engine.ts` 的 `paginateNonTable` 放不下即 `finishPage(); place()`，新页 `renderTop` 从列游标（新页为 0）起算；溢出经 `noteOverflow(bottom)` 上抛，由上层阻断。
- **连续纸**：`composeContinuousHeight(template, contentBottomMm)`，`contentBottomMm` 来自探针对 `.content-area` 后代的实测最大底边。
- **条码点阵**：`barcode-dot.ts` 按 203/300/600dpi 整数点对齐条宽，注释明言"非整数条宽会被各自取整…出纸即条宽忽宽忽窄"。任意角度使条方向偏离点栅格，90°/180° 无损（实测 raster 逐 run 相等）。
- **拖拽用 `style.transform`**：`canvas/elements/BaseElement.vue` 拖拽中写 `elRef.value.style.transform = translate(...)` 做视觉跟随，mouseup 清空。**元素自身的旋转样式不得占用 `style.transform`**，否则拖拽会瞬间甩平。
- **双端纪律**：`print-common/PARITY.md` 要求画布行为 canvas 与 common 成对实现；渲染链路只在 core。

## 三、契约一：AABB 纯函数（core 单一出口）

```ts
/** 旋转后轴对齐外接盒（mm）。box 为设计盒；角度任意，内部按 [0,360) 归一。 */
export function getRotatedAabb(
  box: { left: number; top: number; width: number; height: number },
  effectiveHeight: number,   // 实测/设计高（autoHeight 元素以实测为准）
  angleDeg: number,
): { left: number; top: number; width: number; height: number }
```

- 数学：`θ = angleDeg·π/180`，`aabbW = w·|cosθ| + h·|sinθ|`，`aabbH = w·|sinθ| + h·|cosθ|`；AABB 围绕设计盒中心，故 `aabbLeft = left − (aabbW − w)/2`、`aabbTop = top − (aabbH − h)/2`。
- **对照数字（验收断言直接抄，与验证件 summary.json 同源）**：100×20 @(20,250)：15°→101.77×45.20（AABB top 237.40）；30°→96.60×67.32（top 226.34）；45°→84.85×84.85（top 217.58）；90°→20×100（top 210）。
- **单一消费点**：分页、连续纸、校验三处一律调它，**禁止各自重抄三角公式**（防口径漂移）。CSS 侧用同一公式反推不必要——浏览器渲染以中心为轴与该公式天然一致，已在验证件中比对过。

## 四、契约二：测量趟保持无旋转，出纸趟才转

- `generateHtml(…, { isMeasurementPass: true })` **不输出旋转样式**（与 outputRotation 转子的既有豁免同构）→ `getBoundingClientRect` 读回的仍是设计盒高，`measuredRowHeights` / 行高链路不受污染。
- 出纸趟在 `renderElement` 的 style 里追加旋转。**用独立 CSS 属性 `rotate: {angle}deg`，不用 `transform`**：`rotate` 与拖拽写的 `style.transform` 是两个独立属性，互不覆盖，`BaseElement.vue` 一行不用改。浏览器兼容基线：Chrome 104+（`services/print-render` 与 `clients/print-client` 的 Chromium / Electron 版本均满足）。
- `angle` 归一化在**写入口**完成：属性台写入时 `(v % 360 + 360) % 360`，0 时**删键**（`undefined`，JSON.stringify 自然消失），保证旧模板与「未旋转」判据统一。

## 五、契约三：分页与连续纸改按 AABB 结算

1. **溢出判定**：`paginateNonTable` 的 `bottom` 从 `top + effectiveHeight` 改为 `getRotatedAabb(...).top + aabbH`。旋转为 0 时公式退化回原值（aabbH = h、aabbTop = top），**存量 20/20 示例产物必须逐一不变**——这是本项的回归判据。
2. **换页落点**：换页时 `renderTop = 列游标 + (aabbH − h)/2`，使 **AABB 顶**（= renderTop − shift）贴列游标而非设计盒顶（修复 −40mm 裁切实测；实施时已更正本 spec 初稿的减号笔误——AABB 顶 = renderTop − shift，要贴游标只能加）。同页放置不动设计坐标。
3. **顶部越界显式告警**：旋转后 `aabbTop < 0` 属分页引擎修不了的问题（顶边在纸外），在既有 overflow 校验里**单列一条警告文案**（区别于底部溢出），导出时提示"元素 X 旋转后顶部超出页首"。
4. **连续纸**：**无需几何补算**——验证件的裁切数字来自「未旋转模板跑管线、事后注入旋转」的旁路口径；真实管线对最终 HTML（已含 rotate）跑 `readContentBottom`，其 `getBoundingClientRect` 天然含外接盒，推导高度自动正确。**验收对照**：80mm 纸 c1@100 走真实 `prepareDocument`，30°/45° 推导纸高 ≈ 128.46 / 134.03mm（±0.5mm），不得再裁。

## 六、契约四：范围裁剪（v1 排除项，写死在实现里）

以下类型/场景 v1 **忽略 rotate（渲染不转、属性台不出输入框）**，而不是报错——模板照常出纸，只是该元素保持水平：

| 排除项 | 理由 |
|---|---|
| `table`（含表格切片分页） | 切片逐行跨页，旋转后行序与 AABB 交叉逻辑需独立设计，实测未覆盖 |
| `flowList` | 网格布局一框一页口径未与旋转对齐 |
| 跟随区（flow-group 内跟随元素） | 「横向相交才跟随」判据按设计盒算，旋转后相交语义待单独裁决 |
| `barcode` / `qrcode` 非 0/90/180/270 档 | 见第七节 DPI 门槛 |

排除判据收敛在 core 一个函数（如 `resolveElementRotation(type, opts)`：返回归一角度或 `undefined`），渲染、属性台、校验三处共用，**禁止散落 if**。

## 七、契约五：条码 DPI 门槛（可验收口径）

- 实测：90° 在 203/300/600dpi 全部与 0° 逐 run 相等 → **直角档白名单放行**；300dpi 30° 细条占比翻 9 倍（1.6%→14.8%）、CV 0.551 → **300dpi 及以下斜角不放行**；385dpi 各斜角干净 → **≥385dpi 白名单放行**。
- 实现口径：属性台对 `barcode`/`qrcode` 输入非直角时，若当前会话无 ≥385dpi 的出纸承诺（设计器无法预知打印端 DPI），**输入框置灰 + 提示文案**「条码仅支持 90° 步进；任意角度需 ≥385dpi 打头」，**渲染端照常渲染**（服务端/客户端按各自已知 DPI 自行决定是否降级为直角取整——`resolveElementRotation` 增加可选 `dpi` 参数，低于门槛时把角度吸附到最近的 90° 倍数）。
- 静区与成品宽判定沿用 `measureBarcode`（成品宽含静区），不因旋转另算。

## 八、契约六：双端画布实现

- **属性台**：外观组新增「旋转」行——数值输入（0~359，步进 1）+ 两个 90° 步进按钮；归一化与 0-删键在写入口完成；接入属性台「恢复默认值」机制（`F = undefined`）。
- **选择框与缩放手柄**：v1 **不做旋转手柄**；选中框仍画设计盒（不画 AABB），8 个 resize 手柄**保持原位**（不做逆旋转数学）——作者在旋转态下拉伸是按设计盒改 w/h，渲染端绕中心重转，几何可预期。此为已知取舍，写在组件注释里。
- **canvas 与 common 成对实现**：`PROPERTY_REGISTRY` 加 1 项；common 侧 `appearance-props.ts` 同步出输入行；`gen-icons.mjs` / `gen-styles.mjs` 无需动（无新图标，复用现有控件形态）。
- **拖拽/吸附**：不动。拖拽 transform 与 `rotate` 属性天然正交；吸附与框选仍按设计盒（v1 口径），AABB 只进渲染链路不进编辑器交互。

## 九、测试与验收

| # | 判据 | 通过标准 |
|---|---|---|
| 1 | `getRotatedAabb` 单测（core） | 第三节对照数字逐档相等；0° 退化回原盒 |
| 2 | 存量回归 | 全部既有示例产物 byte 级不变（20/20）；全量单测绿 |
| 3 | 假溢出修复 | 100×20@(20,250) 45°：`overflow=false`，出纸 1 页 |
| 4 | 换页落点 | 换页用例第 2 页 AABB 顶 ≥ 0（不再 −40mm） |
| 5 | 顶部越界告警 | 校验输出含旋转顶越界专条文案 |
| 6 | 连续纸 | 80mm 纸 30°/45° 出纸高度 128.46/134.03mm（±0.5mm） |
| 7 | PDF 矢量 | pdfjs 提取文本项变换矩阵与角度一致（验证件同法） |
| 8 | 条码门槛 | 90° 全 DPI raster 与 0° 逐 run 相等；`resolveElementRotation` 带 `dpi=300` 时 30° 吸附到 0/90 |
| 9 | 双端 | verify-demo 相应断言 + common 属性台同形态；四宿主出纸一致 |
| 10 | 旧模板兼容 | 残留 `transform` 键的模板 JSON 导入后忽略不报错，出纸与升级前一致 |

## 十、分期

- **本期（spec 批准后）**：契约一~六全部 + 第九节 1~10 判据。
- **不做**（明示，防范围爬行）：拖拽旋转手柄、表格/flowList/跟随区旋转、编辑器 AABB 交互（框选/吸附按旋转后盒）、common 预览缩放联动。
- **后续独立项**：表格切片旋转设计（需先钉行序×AABB 交叉契约，另立 spec）。
