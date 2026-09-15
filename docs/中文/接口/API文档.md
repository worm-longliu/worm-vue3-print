# API 文档

本页按包列出公开 API。所有签名以当前源码为准，类型细节可对照包内 `.ts` 源码与 d.ts。

- [`@worm-vue3-print/core`](#worm-vue3-printcore)：主入口（引擎 + 渲染）、`/browser`、`/designer` 子路径
- [`@worm-vue3-print/canvas`](#worm-vue3-printcanvas)：Vue 3 组件
- [`@worm-vue3-print/client`](#worm-vue3-printclient)：静默打印 SDK
- [render 微服务 HTTP 接口](#render-微服务-http-接口)

---

## @worm-vue3-print/core

纯 TypeScript，浏览器与 Node 均可使用（DOM 相关能力在 `/browser` 子路径）。

### 模板表达式引擎（主入口）

```ts
import {
  TemplateEngine,
  tokenize, parse, evaluate, compileTemplate,
  parseTemplate, renderTemplate,
  getByPath,
} from '@worm-vue3-print/core'
```

| API | 说明 |
|---|---|
| `new TemplateEngine(options?: { functions?: Record<string, ExprFunction> })` | 引擎实例 |
| `engine.evaluate(expression, context)` | 求值单个表达式 |
| `engine.render(template, context)` | 渲染含 `{expr}` 的模板字符串 |
| `engine.registerFunction(name, fn)` | 注册自定义函数 |
| `tokenize` / `parse` / `evaluate` | 词法 / 语法 / 求值底层 API |
| `compileTemplate(template, functions?)` | 编译为 `(context) => string` |
| `parseTemplate` / `renderTemplate` | 模板 AST 解析与渲染 |
| `getByPath(obj, path)` | 按点路径取值 |

内置函数实现（可在宿主逻辑复用）：

- 格式化：`formatMoney(value)`、`formatDate(value, fmt)`、`toUpperCaseAmount(value)`、`ifFn(cond, a, b)`
- 聚合：`sum(rows, field)`、`avg`、`count`、`min`、`max`
- 系统：`systemVars`、`setPageIndex(v)`、`setTotalPages(v)`

### 渲染管线（主入口）

```ts
import {
  bindData, injectSystemVariables, resolveSystemVariables,
  generateHtml, buildPageCss, elementPositionStyle, mm,
  paginate, tableDesignBottom,
  evaluateTemplate, safeEval,
  getPaperDimensions, PAPER_DIMENSIONS, isContinuousPaper,
  composeContinuousHeight, MIN_CONTINUOUS_HEIGHT_MM,
  // 水印
  WATERMARK_DEFAULTS, WATERMARK_DENSITY_PRESETS, PX_PER_MM, MM_PER_PX,
  isWatermarkVisible, resolveWatermarkText, formatTimestamp,
  resolveWatermarkLayout, renderWatermarkTileSvg, renderWatermarkLayerHtml,
} from '@worm-vue3-print/core'
```

| API | 说明 |
|---|---|
| `bindData(template, data)` | 把业务数据/表达式绑定进模板（含明细行展开） |
| `injectSystemVariables(text, ctx)` / `resolveSystemVariables(now)` | 注入/解析 `printDate`、`printTime`、`pageIndex`、`totalPages` |
| `generateHtml(template, options?: GenerateOptions)` | 由模板生成 HTML |
| `buildPageCss` / `elementPositionStyle` / `mm` | 页面 CSS、元素定位样式、mm 换算 |
| `paginate(...)` / `tableDesignBottom(...)` | 分页算法、表格设计态底边计算 |
| `evaluateTemplate(text, ctx)` | 渲染管线模板求值（含 SUM/AVG 等聚合预处理，失败保留原文） |
| `safeEval(expr, ctx)` | 受限沙箱内求值单个表达式 |
| `getPaperDimensions(template)` / `PAPER_DIMENSIONS` / `isContinuousPaper({ paperSize })` | 纸张解析 |
| `composeContinuousHeight(...)` / `MIN_CONTINUOUS_HEIGHT_MM` | 连续纸纸高推导 |

打印管线命名空间（`print/`，主入口通过 `export *` 转出）：

| API | 说明 |
|---|---|
| `createDomHostRuntime(driverFactory)` | 三端共用的 DOM 宿主编排 runtime |
| `prepareDocument`、`renderPdf`、`renderScreenshot`（`pipeline.ts`） | 管线阶段函数 |
| `buildPdfTargetSpec`、`toElectronPrintToPdfOptions`、`toPlaywrightPdfOptions`、`buildScreenshotTargetSpec` | PDF/截图目标规格与平台参数映射 |
| `resolvePaperMm`、`escapeHeightMm`、`paperViewportPx` | 纸张解析、逃生门、视口换算 |
| `normalizeMeasurements` | 测量结果 px→mm 归一化 |
| `PrintFailure`、`toPrintFailure`、`withTimeout` | 统一错误与超时 |
| 类型 | `PrintJob`、`PreparedDocument`、`RenderPdfResult`、`PageDriver`、`PrintRuntime`、`PrintSession`、`RawMeasurement`、`PdfTargetSpec`、`ScreenshotTargetSpec`、`PaperMm`、`ViewportPx`、`CodeSpec`、`PrintFailureCode` |

主要数据类型（主入口导出）：`PrintTemplateData`、`PrintTemplateElement`、`PaperSize`、`PageLayout`、
`PageSection`、`MeasuredElement`、`RenderRow`、`RenderCell`、`RenderRequest`、
`CodeRenderer`、`CodeRenderOptions`。

```ts
interface RenderRequest {
  templateJson: PrintTemplateData
  printData?: Record<string, any>
  baseUrl?: string                              // 相对图片基址
  paperOverride?: { width?: number; height?: number } // mm
  paperHeightMm?: number                        // 连续纸逃生门
}
```

### 子路径 `/browser`

```ts
import {
  renderHtmlPages, browserCodeRenderer,
  createBrowserPrintRuntime, createIframeDriverFactory,
  domExecutor, EXECUTOR_VERSION,
  waitReady, readMeasurements, readContentBottom, renderCodes,
} from '@worm-vue3-print/core/browser'
import type { BrowserRenderResult, BrowserRenderOptions } from '@worm-vue3-print/core/browser'
```

```ts
renderHtmlPages(
  template,                 // PrintTemplateData（兼容设计器 TemplateData）
  printData?,               // 对象或对象数组
  baseUrl?,                 // 相对图片基址
  codeRenderer?,            // 传入则沿用（覆盖语义），不传由 runtime 自建
  options?: { paperHeightMm?: number },
): Promise<BrowserRenderResult>

interface BrowserRenderResult {
  html: string
  pageCount: number
  pageLayouts: PageLayout[]
  paperMm: { width: number; height: number }
  continuous: boolean
}
```

### 子路径 `/designer`

框架无关的设计器内核与完整模板模型（**不从主入口转出**，需显式从子路径导入）：

```ts
import type { TemplateData, RuntimeElement, PrintBusinessField } from '@worm-vue3-print/core/designer'
```

导出面：模板模型类型（`TemplateData`、`RuntimeElement`、`PrintBusinessField`、`WatermarkOptions`、
`ScreenshotRequest` 等）、宿主能力契约（`RequestScreenshotFn`、`UploadImageFn`），
以及单位/缩放/旧模板迁移/默认配置/表格矩阵/元素工厂/标尺/预设色/字段分组/绑定等纯工具，
吸附（adsorb）、对齐、组合、键盘、缩放等纯交互算法。

---

## @worm-vue3-print/canvas

```ts
import { PrintDesigner, PrintHtmlPreview, renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/canvas'
import type {
  TemplateData, RuntimeElement, PrintBusinessField,
  ScreenshotRequest, RequestScreenshotFn, UploadImageFn,
} from '@worm-vue3-print/canvas'
import '@worm-vue3-print/canvas/native-controls.css'
```

另导出：`createDefaultTemplate()`、`toRuntimePool()`、`getDemoData()`、`DEFAULT_DEMO_DATA`、
`DesignerStateOptions` 类型、注入键 `UPLOAD_IMAGE_KEY`。（`renderHtmlPages`/`browserCodeRenderer`
为 core/browser 的转出。）

### `<PrintDesigner>`

Props：

| 名称 | 类型 | 说明 |
|---|---|---|
| `initialTemplate` | `TemplateData` | 初始模板；整体替换引用即重载画布并记录历史 |
| `initialElements` | `RuntimeElement[]` | 运行时元素初始化（高级） |
| `fields` | `PrintBusinessField[]` | 业务字段，字段树/绑定唯一数据源 |
| `isEdit` | `boolean` | 编辑态 |
| `requestScreenshot` | `RequestScreenshotFn` | 叠层对比截图适配器 |
| `uploadImage` | `UploadImageFn` | 图片上传适配器 |
| `showHelp` | `boolean` | 帮助入口开关，默认 true |

事件：`@save(json: string)`（序列化为字符串）、`@preview()`。
方法（ref）：`getTemplateJson(): TemplateData`（返回模板对象；保存时由宿主自行 `JSON.stringify`）。

### `<PrintHtmlPreview>`

Props：`templateJson`（模板对象）、`printData`（对象或数组）、`baseUrl`（相对图片基址）。
事件：`@rendered(pageCount: number)`、`@error(message: string)`。
方法（ref）：

| 方法 | 说明 |
|---|---|
| `print()` | 唤起 iframe 内浏览器原生打印（可手动另存 PDF），不产出 PDF 文件 |
| `rerender()` | 强制重新渲染 |

---

## @worm-vue3-print/client

框架无关的静默打印浏览器端 SDK，通过 WebSocket 连接本机 Electron 客户端
（默认端口 `17521`，占用则向后探测）。

```ts
import { PrintClient, WsTransport, WormPrintError, MESSAGE_TYPES, DEFAULT_PORT } from '@worm-vue3-print/client'
import type {
  PrintClientOptions, TransportOptions, TransportStatus,
  PrinterInfo, PrintOptions, RenderedHtmlPages,
  HelloResponsePayload, PrintSubmitResponsePayload,
} from '@worm-vue3-print/client'
```

### `PrintClient`

| 成员 | 说明 |
|---|---|
| `new PrintClient(options?: { token?; timeoutMs?; WebSocketCtor? })` | token 缺省读 localStorage 中 `pair()` 保存值；默认超时 15000ms |
| `status` | `'disconnected' \| 'connecting' \| 'connected'` |
| `connect(signal?): Promise<HelloResponsePayload>` | 端口探测 + 握手 |
| `onStatusChange(cb): () => void` | 状态订阅，返回取消函数 |
| `listPrinters(): Promise<PrinterInfo[]>` | 枚举本机打印机 |
| `print(templateJson, printData?, options?, templateName?)` | 兼容链路：客户端内渲染后出纸 |
| `printHtml(rendered, options?, templateName?)` | 推荐链路：浏览器预渲染 HTML 直送，客户端只出纸 |
| `pair(token)` | 保存配对 token 到 localStorage 并更新连接（下次连接生效） |
| `static loadStoredToken()` | 读取已保存 token |
| `close()` | 关闭连接 |

`PrintOptions`（长度单位 μm，1mm = 1000μm）：

```ts
interface PrintOptions {
  printerName?: string
  copies?: number
  paperName?: string                 // 驱动预置纸型名，针式优先
  paperSize?: { width?: number; height?: number }  // printHtml 不允许
  landscape?: boolean                // printHtml 不允许
  margins?: { top: number; bottom: number; left: number; right: number } // printHtml 不允许
  color?: boolean
  pageRanges?: Array<{ from: number; to: number }>
}
```

`print` 的第三参数还接受 `baseUrl` 与 `timeoutMs`；`printHtml` 接受 `timeoutMs`。
消息类型常量：`hello`、`printers.list`、`print.submit`、`print.submitHtml`。

### 错误码（`WormPrintError.code`）

客户端侧：`CLIENT_TIMEOUT`、`CLIENT_NOT_RUNNING`。
服务端侧：`UNAUTHORIZED`、`INVALID_REQUEST`、`PRINTER_NOT_FOUND`、`PRINTER_OFFLINE`、
`BUSY`、`RENDER_TIMEOUT`、`PRINT_FAILED`、`INTERNAL`。
完整排查见《静默打印》。

---

## render 微服务 HTTP 接口

基址默认 `http://localhost:3001`（demo 经同源 `/render-api` 代理）。

### `GET /health`

无需鉴权。返回：

```json
{ "status": "ok", "activeRenders": 0, "maxConcurrent": 2, "queueLength": 0 }
```

### `POST /render/pdf`

- 请求头：`X-Render-Key: <RENDER_API_KEY>`（默认 `dev-render-key`）
- 请求体：`RenderRequest`（`{ templateJson, printData?, baseUrl?, paperOverride?, paperHeightMm? }`）
- 成功：`200 application/pdf`，Body 为 PDF 二进制
- 失败：`{ code, message }`，code：`UNAUTHORIZED`(401)、`INVALID_REQUEST`(400)、
  `RENDER_TIMEOUT`(504)、`RENDER_FAILED`(500)
- 限制：请求体 10MB，单请求 30s

### `POST /render/screenshot`

请求/鉴权同上；成功返回 `200 image/png`（单页截图，不分页），失败 code 为 `SCREENSHOT_FAILED`。

环境变量：`PORT`（默认 3001）、`RENDER_API_KEY`、`PLAYWRIGHT_CHROME_PATH`。
