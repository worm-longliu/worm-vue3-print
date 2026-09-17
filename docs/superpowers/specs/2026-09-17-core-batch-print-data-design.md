# core 批量打印数据（printData 数组）三端支持设计

日期：2026-09-17
范围：`packages/print-core`（主管线）+ `packages/print-canvas`（预览 emit）+ `packages/print-client-sdk` + `clients/print-client`（契约放宽）+ `services/print-render`（校验）+ `demo`（回收应用层拼接、改为数组 API 示例）。

## 1. 背景与目标

demo 已在应用层实现批量（`demo/src/batch-render.ts`：串行渲染 + DOMParser 拼接 + `.print-copy` 份间分页），验证了模式可行。但 core 现状是「类型撒谎」：`bindData`（`packages/print-core/src/render/data-binder.ts:17`）收到数组静默取 `raw[0]`；`renderHtmlPages`（`browser/browser-pagination.ts:42`）把数组强转为单对象。需求：

1. 浏览器打印、服务端 PDF、桌面客户端（模板通道）传入 `printData` 数组时，core 自动按数组长度渲染多份、合并为一个输出（一个 PDF/一个打印作业/一次浏览器打印）。
2. 插件自行根据数组长度判断份数，调用方无需循环。
3. 对象入参行为与现状完全一致（单份，零回归）。

非目标：不做每份独立 PDF/独立作业（已在方案选型否决）；不做批量进度回调/流式；`copies`（驱动重复份数）语义不变，与数组批量正交叠加（N 条数据 × copies M = N×M 张纸）。

## 2. 数据契约

- `printData` 全链路类型统一为 `Record<string, any> | Record<string, any>[]`。
- 对象 = 1 份；数组 = N 份，N = 数组长度，即返回值 `copies`。
- 空数组抛错：`批量打印数据必须是非空对象数组`。
- 数组每项必须是普通对象，否则抛错：`批量打印数据第 i 项必须是对象`。
- 份数上限 `MAX_BATCH_COPIES = 500`（core 导出常量），超出抛错：`批量打印最多支持 500 份，当前 N 份`。

## 3. core 管线改造

### 3.1 入口分流（`print/pipeline.ts`）

- 抽出内部函数承载现有 `prepareWithSession` 全部逻辑，签名改为 `prepareSingle(job, session, data: Record<string, any>)`：内部所有 `job.printData` 引用（bindData、generateHtml、水印透传）改用传入的 `data`。
- 新增数据归一：`normalizePrintData(raw): { mode: 'single'; data } | { mode: 'batch'; dataList }`，承担第 2 节的全部校验，是全管线唯一的数组拆分点。
- `prepareDocument`：single → 现状不变；batch → 在**同一个 session 内**串行 for 循环对每条 data 调 `prepareSingle`，得到 `PreparedDocument[]`，再经 `composePreparedDocuments` 合并后返回。串行（不并发）以避免隐藏 iframe/页面测量竞态。
- `renderPdf`：single 现状不变；batch → 合并 HTML 后**只调一次** `session.toPdf(merged.html, buildPdfTargetSpec(merged.paperMm), viewport)`。`buildPdfTargetSpec` 本就 `preferCSSPageSize: true`，页尺寸由文档内 `@page` 决定。
- `renderScreenshot`：截图不分页，数组时取第一条数据渲染单页快照（文档注释写明此语义）。

### 3.2 合并器（新增 `print/batch-compose.ts`，纯函数）

签名：`composePreparedDocuments(docs: PreparedDocument[]): PreparedDocument`

- 用 `DOMParser`（core 浏览器/服务端/Electron 三端运行时均有 DOM；pipeline.spec 的 fake 环境如无 DOMParser，则在该测试以注入/最小文档对象方式覆盖，合并器自身只依赖标准 DOM API）。
- 以首份文档为骨架（同模板各份 head 中静态样式一致）；每份 `body.innerHTML` 包一层 section：
  - 固定纸：`<section class="print-copy">`；
  - 连续纸：`<section class="print-copy print-copy-n">`。
- 固定纸 head 末尾注入：
  `<style>.print-copy:not(:last-child){break-after:page;page-break-after:always;}</style>`
  各份 `@page size` 相同，沿用首份。
- 连续纸各份纸高独立推导、尺寸不同，单文档匿名 `@page` 只能一个尺寸，改用**命名页**：为每份生成
  `@page copy0 { size: <w>mm <h0>mm; margin:0 }` … 并配 `.print-copy-n0{page:copy0}` …
  份间保留 `break-after:page`。三端底层同为 Chromium，命名页 + `preferCSSPageSize` 可在一个 PDF 内输出不同物理页高；由 `services/print-render/src/batch.integration.test.ts` 实测兜底，若不通过，退路为：连续纸多份退化为「每份独立 toPdf、顺序拼接为一次打印/PDF」（届时再单独设计，本期不提前实现）。
- 返回：
  - `html`：`<!DOCTYPE html>` + 序列化骨架；
  - `pageCount`：各份之和；
  - `copies`：份数（见 3.3 类型扩展）；
  - `paperMm`：取首份（toPdf 兜底规格，真实尺寸由 CSS @page 决定）；
  - 新增 `copyPaperMm: PaperMm[]`：每份物理尺寸（HTML 通道/调试用途）；
  - `continuous`、`heightSource` 沿用首份。

### 3.3 类型放宽（core）

- `print/types.ts`：`PrintJob.printData?: Record<string, any> | Record<string, any>[]`；`PreparedDocument` 增 `copies: number`、`copyPaperMm?: PaperMm[]`。
- `render/types.ts`：`RenderRequest.printData` 同步放宽并导出 `MAX_BATCH_COPIES`（导出位置随现有 render 类型出口）。
- `render/html-generator.ts:45` 公共 `generateHtml` 形参与内部已放宽的私有签名对齐为对象|数组（经 prepareSingle 后实际永远收单对象，类型对齐仅消除不一致）。
- `render/data-binder.ts`：数组不再到达此处（拆分点在 pipeline 入口）；移除「静默 raw[0]」分支，`bindData` 形参收敛为单对象（含水印模块一致化）；`data-binder.test.ts` 中数组降级用例按新行为调整。
- `browser/browser-pagination.ts`：删除 :42 强转，`renderHtmlPages` 直接把数组透传给 `prepareDocument`；`BrowserRenderResult` 增 `copies: number`（对象路径恒 1）。

## 4. 三端改动

### 4.1 浏览器 / canvas

- `PrintHtmlPreview.vue`：props 已声明数组，无需改渲染调用；`rendered` 事件签名扩展为 `[pageCount: number, copies?: number]`，数组预览时父级可展示「共 N 份 · X 页」；单份不传 copies（默认 1），现有调用方兼容。
- 浏览器侧两遍渲染产出的合并 HTML 经 Electron HTML 通道（`printHtml`）天然可用，无协议改动。

### 4.2 services/print-render

- `RenderRequest` 类型随 core 自动放宽；`server.ts` 请求体校验新增 printData 数组规则：长度 1–500、每项为普通对象（单对象维持现状不做深校验）。
- `/render/pdf` 无需改代码（透传 core）；`/render/screenshot` 数组取首条（core 语义）。
- 更新服务端 README/API 文档中的 printData 描述。

### 4.3 print-client-sdk + clients/print-client

- SDK `protocol.ts`：`PrintSubmitRequest.printData` 放宽为对象|数组；`PrintClient.print()` 形参同步。
- Electron `request-validation.ts`：`PrintSubmitSpec.printData` 类型放宽（运行时已接受数组），校验增加：数组长度 1–500、每项 isRecord；错误用中文。
- `print-engine.ts` 模板通道零逻辑改动（透传 core）；HTML 通道（`RenderedHtmlPages`/`printHtml`）不含 printData，零改动；任务历史中 pageCount 自然为合并总页数。

## 5. demo 回收

- 删除 `demo/src/batch-render.ts`、`demo/src/components/BatchPrintPreview.vue`。
- 保留 `demo/src/batch-data.ts`（3 份派生模拟数据示例）。
- `demo/src/App.vue` 预览弹层保留「单份预览 / 批量预览」切换：批量分支改为直接渲染现有 canvas `PrintHtmlPreview`，`:print-data="batchDataList"`（数组直传 core 新能力）；副标题利用组件回传 copies 展示「共 3 份 · N 页」。demo 不再持有第二份拼接实现。
- `demo/src/render-client.ts` 的 `requestServerPdf` 形参类型随 `RenderRequest` 放宽，「打印输出」弹窗不新增批量入口（YAGNI；批量验证聚焦预览链路）。

## 6. 错误处理

- 全部校验错误信息为简体中文，在 pipeline 归一函数集中抛出（见第 2 节文案）。
- 批量中第 i 份（1 基）渲染失败：包装为 `第 i 份渲染失败：<原因>` 后中断整批，不产出半成品文档。
- 码值渲染异常、连续纸探针失败等单份内错误沿用现有处理。

## 7. 测试矩阵

- core（TDD，vitest）：
  - 新增 `src/print/__tests__/batch-compose.spec.ts`：2 份极简 PreparedDocument → section 数=2、份间分页样式、固定纸仅一个 `@page` 尺寸、连续纸命名页 `@page copy0/copy1` 与 `.print-copy-n*` 对应、pageCount 求和、copies、copyPaperMm 长度。
  - 扩 `src/print/__tests__/pipeline.spec.ts`（fake driver）：对象入参与改造前结果字节级/结构一致（回归）；2 条数组 → 合并文档、pageCount=两份之和、copies=2；空数组、501 份、数组含 null 三类报错文案；第 2 份 bind/render 失败的错误含「第 2 份」。
  - 扩 `data-binder.test.ts`：bindData 收单对象正常；数组降级用例改为「不再适用」并验证归一函数行为（归一函数测试可放 pipeline.spec 或独立 normalize 测试）。
- render 集成（Playwright，慢）：新增 `services/print-render/src/batch.integration.test.ts`：
  - 固定纸数组 3 份 → 单个 PDF、页数 = 各份之和、每份首页文本对应不同数据；
  - 连续纸数组 2 份（行数不同）→ PDF 两页物理高度不同，证明命名页生效。若此用例失败，立即停止实现并回到设计（启用连续纸退路）。
- 契约：扩 `packages/print-client-sdk/src/protocol.test.ts`（数组透传）、`clients/print-client/src/main/request-validation.test.ts`（数组合法/空数组/501/含非对象）。
- 类型与构建：core 构建、`npm run typecheck -w @worm-vue3-print/client`；收尾全量 `npm run build && npm test`、`npm run lint:print-architecture`（合并器位于 core，三端不新增 DOM 测量/码制 import/硬编码出图参数，守卫须通过）、`npm run test -w @worm-vue3-print/render`。
- demo：临时 Playwright 脚本（用后即删，方式同上一轮）验证数组直传后 iframe 内 3 个 `.print-copy`、份间 `break-after: page`、副标题「共 3 份 · 14 页」（采购模板 8/20/50 行 → 2/4/8 页）。

## 8. 版本与文档

- 属 core/canvas 能力变更，发版时版本号四处同步与 CHANGELOG（中/en/canvas 帮助弹窗）按仓库既有流程处理，不在本设计内执行；实现阶段仅更新受影响包 README/API 类型说明。
