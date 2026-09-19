# 多页面模板打印设计（固定顺序版式组合 · 同源数据）

- 日期：2026-09-19
- 状态：brainstorming 已收敛，待用户审阅
- 关联：CLAUDE.md 渲染管线（data-binder → pagination-engine → html-generator + css-builder）、AGENTS.md 架构边界

## 一、背景与现状

当前 `TemplateData` 描述**单页**版式：纸张 + 页边距 + 页眉/页脚/首页叠加 + 内容元素。一份数据的渲染流程为

```
bindData → 测量 → paginate（内容溢出切片为 PageLayout[]）→ generateHtml（多页 .print-page 序列）
```

页眉/页脚每页重复、首页叠加仅第 1 页；**多页只来自内容溢出分页**（同一模板被切片）。批量（数组数据）= 同一模板 × 每份数据拼接。目前**不存在**「不同页用不同版式」的机制。

## 二、需求与已确认决策

一次打印产出的一份文档中，各页来自**不同的页面模板**（如封面 + 内容 + 条款），顺序固定、每页独立版式，全部绑定**同一份数据**。

| 问题 | 决策 |
| --- | --- |
| 核心场景 | 固定顺序的版式组合（非数据驱动选页） |
| 纸张尺寸 | 各页模板必须相同 |
| 单页约束 | 允许每模板按内容溢出多页；下一模板必须**新开一页**，不与前一模板连续拼接 |
| 页码语义 | 份内全文档**全局连续**（`{pageIndex}/{totalPages}`） |
| 改动范围 | core 渲染管线 + canvas 设计器 |
| 出图方式 | 整份文档**一次出图**（单次 `page.pdf()`），非逐页出图 |

## 三、非目标（本期不做）

- 数据驱动的页面选择 / 条件包含页（如金额超阈值才加条款页）；
- 多模板与连续纸（小票/热敏/`CONTINUOUS`）组合——「必须新开一页」与连续纸单卷输出语义冲突；
- 多模板与标签拼版（tiling）组合——拼版要求每份恰好 1 页，与多页版式冲突；
- 各页纸张不同（需多份 PDF 合并，引入 pdf-lib）。

## 四、数据模型与校验

### 4.1 新增 wrapper 类型

```ts
// packages/print-core/src/render/types.ts
export interface MultiPageTemplateData {
  /** 版本号，缺省 1 */
  version?: 1
  /** 按打印顺序排列的页面模板，每个都是完整的单页 TemplateData */
  pages: TemplateData[]
}
```

`RenderRequest.templateJson` 与 `PrintJob.templateJson` 放宽为 `TemplateData | MultiPageTemplateData`。

### 4.2 归一化与校验

pipeline 入口新增纯函数（放 `src/print/multi-template.ts`，可单测）：

```ts
export function normalizeTemplate(
  templateJson: TemplateData | MultiPageTemplateData,
): TemplateData[]
```

- 单模板 → `[t]`，路径不变；
- `pages.length === 0` → 抛错「多页面模板至少需要一页」；
- ≥2 页才按多模板处理；1 页时按单模板（保持语义一致）。

多模板校验（同一函数内统一抛错，render 服务与设计器预览共用）：

| 校验 | 规则 | 错误信息 |
| --- | --- | --- |
| 纸张一致 | 各页 `getPaperDimensions`（含方向）必须相等 | 「多页面模板各页纸张尺寸必须一致」 |
| 排除连续纸 | 任一页为小票/热敏/`CONTINUOUS` | 「多页面模板不支持连续纸」 |
| 排除拼版 | 任一页 `tiling.enabled === true` | 「多页面模板不支持标签拼版」 |

### 4.3 页面模板可选字段

`TemplateData` 增加可选 `name?: string`（页面名称，设计器显示/错误上下文用；渲染端忽略）。

## 五、渲染管线与全局页码

### 5.1 逐模板复用现有单模板管线

`prepareSingleWithSession` 内部对 `normalizeTemplate` 结果循环：每个页面模板独立走

```
bindData（同一份 data）→ 测量趟 HTML → session.measure（同一 session 内串行，沿用防竞态）
→ applyTextFitSizes → paginate
```

得到各模板的 `bound_i`、`pageLayouts_i`、码制渲染器 `codeRenderer_i`。

### 5.2 全局页码

- 累计 `pageOffset`：模板 i 的起始页号 = 前 i 个模板页数之和；
- `{totalPages}` = 份内各模板页数之和；
- `renderFinalPages` / `renderPage` 增加 `pageOffset` 与 `totalPages` 覆盖参数（小签名扩展；单模板路径传默认值，输出逐字不变）；
- `{pageIndex}` = `pageOffset + 模板内页序`。

**首页叠加语义**：`firstPageOverlay` 的渲染条件由「文档第 1 页」（现有 `page.pageIndex === 0`）改为「**各模板自身的第 1 页**」（`局部页序 === 0`）。单模板时两者等价，行为不变；多模板时各页模板的叠加在各自首页生效（如内容模板溢出多页，叠加只在其第 1 页出现）。

### 5.3 片段拼接

- 每个页面模板经 `buildHtmlWithCodes` 两趟产出**最终 HTML 片段**（`.print-page` 序列，含码图 SVG 与水印层），拼接即整份文档 body；
- 「下一模板新开一页」天然成立：每模板产出整页 `.print-page`，自带 `page-break-after: always`，模板间即整页边界，无需额外分页 CSS；
- 连续纸被排除，多模板路径不涉及纸高推导。

### 5.4 CSS 作用域化重构（零回归关键）

拆分 `buildPageCss`（`src/render/css-builder.ts`）：

```ts
export function buildBasePageCss(): string
export function buildPageGeometryCss(template: TemplateData, scope?: string, pageHeightMm?: number): string
```

- `buildBasePageCss`：模板无关部分——全局重置、`@page` 尺寸、屏幕/打印样式、`.print-element`/`.print-table`/水印/测量模式；
- `buildPageGeometryCss(template, scope, pageHeightMm)`：模板相关几何——`.print-page` padding/背景、`.page-header`/`.page-footer`/`.content-area`/`.first-page-overlay`，以及连续纸推导纸高对 `@page`/`.print-page`/`.page-footer` 的覆盖；`scope` 为选择器前缀（如 `.mt-3`）时输出作用域规则；
- 单模板：`buildPageCss` 保留为公开 API（core 索引仍导出），内部改为 `buildBasePageCss() + buildPageGeometryCss(t, '', pageHeightMm)`，输出与今日**逐字一致**（回归护栏测试）；连续纸单模板路径（含推导纸高）走同一入口；
- 多模板：`buildBasePageCss() + pages.map((t,i) => buildPageGeometryCss(t, '.mt-'+i))`，每个 `.print-page` 挂 `mt-i` 类；`@page` 尺寸全局一致（纸张已校验相同）。

### 5.5 字体合并

各页模板 `fonts` 声明合并去重（按 `font-family` 名，保留首个），生成一份 `@font-face`。

### 5.6 输出

- `PreparedDocument.html`：合并 CSS + 拼接片段，`wrapHtmlDocument` 套壳；
- `pageCount`：份内所有模板页数之和；
- `paperMm`：取首模板（纸张已校验相同）；
- `pageLayouts`：展平为全局连续 `pageIndex`（可加 `templateIndex` 便于调试）；
- `continuous: false`、`heightSource: 'config'`。

**截图路径**：`renderScreenshot`（设计器预览缩略图）多模板时改为按真实分页渲染整份文档后 `fullPage` 截图（现有实现是单页测量模式，仅适用于单模板）。

## 六、批量语义（数组数据）

- 每份数据 = 一份**完整多页文档**（封面+内容+条款），页码份内全局（延续现状「每份重置」）；
- 多模板 CSS（字体合并 + base + 作用域几何）按 job 计算一次（模板集合相同），各份只贡献 `.print-page` 片段；份间用 `.print-copy` 包装 + `COPY_BREAK_CSS` 拼接（固定纸分支，与现有批量一致）；
- 复杂度：`O(份数 × 模板数)` 次渲染，沿用现有串行防竞态。

## 七、设计器改造（canvas）

### 7.1 状态模型

- 新增 `pages: ref<TemplateData[]>` 与 `activePageIndex: ref<number>`；
- 现有 `templateData` ref 改为**当前激活页**的别名，既有 composables（拖拽/选择/历史/属性面板/吸附等）零改动地作用在当前页；
- 页面 `name?: string` 用于页签显示。

### 7.2 页面栏 UI（原生控件）

页签列表，支持新增、删除、复制、排序、重命名、点击切换；删除最后一页时回落单模板模式。

### 7.3 纸张共享、其余按页独立

- 纸张控制（纸型/方向/自定义宽高）绑定当前页但变更时**写入所有页**（多模板 UI 只暴露一份纸张设置，杜绝各页不一致）；
- 页边距、页眉/页脚/首页叠加、水印、内容元素**按页各自独立**；
- 多页模式下隐藏拼版（tiling）配置项、禁用连续纸纸型（与渲染端校验双保险）。

### 7.4 序列化与加载

- `getTemplateJson()`：1 页输出裸 `TemplateData`；≥2 页输出 `{ version: 1, pages }`；
- `initialTemplate` prop 放宽为 `TemplateData | MultiPageTemplateData`，加载时归一化；
- 保存/预览前用 core `normalizeTemplate` 同款校验，错误在 UI 内提示；
- 预览/截图：`requestScreenshot` 直接传 wrapper，`fullPage` 截图 = 整份多页文档（一次出图）。

## 八、三端消费方改动（只改类型，不改逻辑）

| 消费方 | 改动 |
| --- | --- |
| render 服务 | `RenderRequest.templateJson` 放宽联合类型，透传 pipeline（校验在 core） |
| Electron 客户端 | `src/shared` IPC 契约与 worker 传参类型放宽 |
| client-sdk / demo | 类型放宽；demo 模板持久化接受 wrapper（存什么返回什么） |

多页编排逻辑全部留在 core，宿主不重实现（架构守卫 `lint:print-architecture` 保持通过）。

## 九、错误处理

- `normalizeTemplate` 校验错误在 pipeline 入口统一抛出，中文信息带页面名称；render 服务映射为 `RenderError`（带错误码），设计器保存/预览在 UI 内提示；
- 逐模板渲染失败包装上下文：`第 N 页模板「封面」渲染失败：<原因>`；批量时叠加大份序号（沿用现有「第 i 份渲染失败」包装）；
- 码制渲染失败维持每模板降级文本占位（现有行为不改变）。

## 十、测试计划

### core 单测

- `normalizeTemplate`：单模板透传、多模板合法、四类校验错误各一条；
- 页码：多模板下 `pageOffset` 累计与 `{totalPages}` 全局正确（`renderFinalPages` 覆盖参数用例）；
- CSS：`buildBasePageCss + buildPageGeometryCss('')` 与现有 `buildPageCss` **输出逐字一致**（回归护栏）；多模板作用域 CSS 正确；
- pipeline spec：多模板 prepare 的 `pageCount`、`pageLayouts` 展平（全局 pageIndex）、批量「每份一份完整文档」；
- 字体合并去重。

### canvas spec

页面栏增删/排序/切换、`getTemplateJson` 裸值↔wrapper、加载 wrapper、纸张变更传播到所有页、多页模式下拼版/连续纸禁用。

### render 集成测试（Playwright）

一个多模板 job → PDF 页数正确、各页纸张一致、「下一模板新开一页」由 PDF 页边界断言。

### 架构守卫

`npm run lint:print-architecture` 保持通过。

## 十一、兼容性与迁移

- 单模板路径输出与今日逐字一致（CSS 重构由护栏测试保证）；
- 设计器 1 页时保存仍为裸 `TemplateData`，存量模板与宿主零改动；
- 消费方仅放宽类型，无逻辑变化。
