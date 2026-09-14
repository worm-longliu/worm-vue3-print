# 打印管线三端同源抽离设计文档

- 日期：2026-09-14
- 状态：待评审
- 范围：`packages/print-core`（核心包）、`services/print-render`（服务端渲染服务）、`clients/print-client`（桌面打印客户端），涉及 `packages/print-canvas` 预览侧的接线

## 1. 背景与问题

项目对外承诺「浏览器预览与后端输出保持一致」，实际链路中三端各自持有一部分打印逻辑，部分实现甚至彼此行为不一致。勘察结论：

| 环节 | 现状 | 位置 |
| --- | --- | --- |
| HTML 生成、水印、分页算法、数据绑定、表达式 | 已共享 | `packages/print-core/src/render/*` |
| 管线编排（绑定→测量→分页→最终 HTML） | 两份 | `src/browser/browser-pagination.ts`、`services/print-render/src/pdf-render.ts` |
| 预测量读取（`data-measure-id`、表格行高、`repeatHeaderHeight`） | 两份等价代码 | 同上两处 |
| 就绪等待（字体/图片） | 两份，策略不同（3s 兜底 vs networkidle+30s） | 同上两处 |
| 连续纸探针与纸高推导 | 只有浏览器端有 | `src/browser/browser-pagination.ts` |
| 码制渲染器 | 两套实现（`jsbarcode`/`qrcode` vs `bwip-js`） | `src/browser/browser-code-renderer.ts`、`services/print-render/src/barcode-renderer.ts` |
| HTML→PDF 参数推导（纸张/边距/背景/缩放/超时/错误码） | 两份（µm→英寸 vs mm） | `clients/print-client/src/main/pdf-generator.ts`、`services/print-render/src/pdf-render.ts` |
| 纸张解析与宿主覆盖逃生门 | 只有客户端 | `clients/print-client/src/main/paper.ts`、`src/main/render-engine.ts` |
| 截图渲染 | 只有服务端 | `services/print-render/src/pdf-render.ts` |

由此产生的确定性问题：同一连续纸模板在客户端按内容高度出纸，在服务端固定输出 `80×297mm` 单页并截断；同一码值在两端生成不同几何的 SVG；字体与内核差异会级联到分页。这些问题不是单点缺陷，而是「目的相同的逻辑被实现了多次」的结构性后果。

## 2. 目标与非目标

**目标**：三端所有「目的相同」的打印逻辑在 core 中只有一份实现；各端只保留宿主 I/O 能力，且适配层内不出现任何业务规则。

**进 core**：HTML 生成与分页算法、水印、预测量归一化、连续纸探针与纸高推导、最终 HTML、PDF 目标规格推导与宿主选项映射、截图规格、码制枚举与渲染算法、纸张解析与覆盖逃生门、单位换算、统一失败分类与超时、管线编排。

**不进 core**：

- Express、Playwright 浏览器池（服务端）；Electron 窗口池、托盘、串行锁、任务历史（客户端）；WebSocket 协议与 SDK 类型（SDK 包）；
- 出纸平台命令与 CUPS 媒体名映射（唯一消费者，属驱动适配，保留在客户端）；
- 设计器画布的 Vue 交互渲染（`CanvasPaper.vue`、`elements/*.vue`，目的不同：可拖拽编辑 vs 最终出图）；
- 各端自身传输层错误码（HTTP 状态码、JSON-RPC 错误码）。

## 3. 不变量

- core 现有导出只增不改：`renderHtmlPages`、`generateHtml`、`paginate`、`browserCodeRenderer` 等签名不变；
- 静默打印 SDK 的 `print.submit`、`print.submitHtml` 请求与响应结构不变；
- 服务端 HTTP 路径、鉴权、超时语义不变；
- 浏览器预览与客户端的条码、水印视觉保持不变（这正是统一到 `jsbarcode`/`qrcode` 的意义所在）；
- core 根入口在 Node 下可直接 `import`，不在模块加载期触碰 DOM；
- core 保持框架无关，不引入 Vue/React 依赖。

## 4. 关键决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 一致性档位 | 档位一：逻辑同源，适配层允许存在但不含业务规则 | 服务端与客户端的内核、字体差异无法靠移植代码消除；档位三（服务端整条管线跑进页面）收益边际递减、部署与调试成本显著上升 |
| 码制渲染器 | 统一到 `jsbarcode`/`qrcode` | 保持现有浏览器视觉基线；`bwip-js` 浏览器构建 min 后 1.1MB，比 `jsbarcode`(68KB)+`qrcode` 大近 9 倍；`qrcode` 无 UMD 产物，故 core 额外产出一个约 0.12MB 的 IIFE 执行器供页面注入 |
| 桌面客户端是否内嵌 Playwright | 不内嵌 | 需自带 Chromium（每平台约 +170MB）并处理 asar 解包、签名公证、Linux 系统依赖；Playwright 不提供静默打印；其 `setContent`/`evaluate`/`pdf` 能力与 Electron 原生（`loadFile`/`executeJavaScript`/`webContents.printToPDF`）完全重合。Playwright 仅作为跨端一致性测试的参照实现 |
| 适配器分层 | driver 契约 + 共享 DOM 宿主 runtime + 三端 driver | 让「载入→注入→等就绪→执行→释放」的时序、超时、错误分类、码值预渲染只写一次，三端差异压缩为几十行机械代码 |
| 截图 | 纳入 core 管线 | 与 PDF 仅差最后一步输出，共用测量、分页、码制与规格推导 |
| 客户端 DOM 宿主 | 主进程隐藏窗口（`loadFile` + `executeJavaScript`），删除 worker 渲染进程与 IPC 桥 | 使客户端 driver 与服务端 driver 结构同形，宿主专有代码进一步减少；该窗口的 `webPreferences` 与现有打印窗口一致（`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`），安全面不高于现状 |

## 5. core 目标结构与导出面

新增 `packages/print-core/src/print/`（纯 TS，Node 与浏览器都能 import）：

| 文件 | 职责 |
| --- | --- |
| `types.ts` | `PrintJob`、`PrintResult`、`RawMeasurement`、`PaperMm`、`ViewportPx`、`CodeSpec`、`PdfTargetSpec`、`ScreenshotTargetSpec`、`PrintFailureCode` |
| `driver.ts` | `PageDriver` 契约、`ExecutorBundle`、`ExecutorMethod` |
| `ports.ts` | `PrintRuntime` 五方法端口 |
| `dom-host-runtime.ts` | `createDomHostRuntime(driver)`：共享的 DOM 宿主编排 |
| `pipeline.ts` | `prepareDocument`、`renderPdf`、`renderScreenshot` |
| `measure.ts` | `normalizeMeasurements(raw, template)`：px→mm、表格行高、`repeatHeaderHeight` |
| `codes.ts` | `collectCodeSpecs(template)`：枚举元素与表格单元格的码值与参数 |
| `paper.ts` | 纸张解析、覆盖逃生门、µm↔mm、`paperViewportPx`、连续纸最小高度 |
| `pdf-spec.ts` | `buildPdfTargetSpec`、`toElectronPrintToPdfOptions`（英寸）、`toPlaywrightPdfOptions`（mm）、`buildScreenshotTargetSpec` |
| `errors.ts` | `PrintFailure`、失败分类、`withTimeout` |

`packages/print-core/src/browser/` 调整：

- 新增 `dom-executor.ts`：测量读取、连续纸探针、就绪等待、码制渲染的唯一实现，挂载到 `globalThis.__wormDom`；
- 新增 `driver-iframe.ts` 与 `browser-runtime.ts`：`createBrowserPrintRuntime()` = `createDomHostRuntime(createIframeDriver())`；
- `browser-pagination.ts`：`renderHtmlPages` 改为薄包装，导出与签名不变；
- `browser-code-renderer.ts`：保留导出，内部改为调用 `print/` 的同一套码制算法，`jsbarcode`/`qrcode` 以参数注入（同一算法 + 不同库绑定，不是两套实现）。

构建产物：ESM/CJS/dts 三个入口不变，新增 IIFE 入口 `src/browser/dom-executor.iife.ts`（`globalName: '__wormDom'`，browser 平台），package.json 增加可解析的文件路径导出与 `files` 白名单条目。

## 6. driver 契约 + 共享 DOM 宿主 runtime + 三端 driver

**第一层：driver 契约**（`print/driver.ts`）

```ts
export interface PageDriver {
  open(viewport: ViewportPx): Promise<void>
  setContent(html: string): Promise<void>
  injectExecutor(bundle: ExecutorBundle): Promise<void>   // 幂等
  evaluate<T>(method: ExecutorMethod, args: unknown[]): Promise<T>
  // 出图能力显式接收 HTML：实现可复用已载入文档，也可自行载入，避免隐式状态
  pdf?(html: string, spec: PdfTargetSpec): Promise<Uint8Array>
  screenshot?(html: string, spec: ScreenshotTargetSpec): Promise<Uint8Array>
  close(): Promise<void>
}
export type ExecutorMethod = 'waitReady' | 'readMeasurements' | 'readContentBottom' | 'renderCodes'
```

**第二层：共享 DOM 宿主 runtime**（`print/dom-host-runtime.ts`）

`createDomHostRuntime(driver)` 实现五方法端口，业务规则与全局时序只在此处出现：

- `measure(html, viewport)`：open → setContent → injectExecutor → `waitReady` → `readMeasurements` → close；
- `probeContentBottom(html, viewport)`：同序列，执行 `readContentBottom`；
- `createCodeRenderer(specs)`：open → injectExecutor → `renderCodes(specs)` → 码值→SVG 映射 → 返回同步 `CodeRenderer`，缺键降级文本占位；
- `toPdf` / `toScreenshot`：open → setContent → injectExecutor → `waitReady` → `driver.pdf(html, spec)`/`driver.screenshot(html, spec)`，driver 未实现该能力时抛 `UNSUPPORTED_RUNTIME`；
- 每阶段 `finally` 必 `close`，宿主异常统一收敛为 `PrintFailure`。

**第三层：三端 driver**

| 端 | `open`/`setContent` | `injectExecutor` | `pdf`/`screenshot` |
| --- | --- | --- | --- |
| 服务端 `driver-playwright.ts` | 池中借页 + `setViewportSize` + `setContent` | `addScriptTag(dom-executor.iife)`，按页标记幂等 | `page.pdf`/`page.screenshot`，规格来自 core |
| 客户端 `driver-electron.ts` | 主进程隐藏窗口：临时文件 `loadFile` + `setContentSize(viewport)` | `webContents.executeJavaScript(bundle.source)` | 同一窗口 `printToPDF`；截图不提供 |
| 浏览器 `driver-iframe.ts` | 离屏 iframe + `doc.write` | 进程内直调执行器（ESM 形态） | 不提供 |

客户端采用主进程隐藏窗口后，现有 worker 渲染进程、`worker-preload` 桥、`render-protocol` 契约与 electron-vite 的 worker 入口一并删除；打印机枚举改由既有隐藏/配置窗口的 `webContents.getPrintersAsync()` 承担。

## 7. 管线阶段与数据流

| 阶段 | 输入 → 输出 | 实现位置 |
| --- | --- | --- |
| 1 绑定 | `templateJson` + `printData` → 绑定后模板 | `bindData`（现有） |
| 2 码值预渲染 | 绑定后模板 → 同步 `CodeRenderer` | `collectCodeSpecs` + driver `renderCodes` |
| 3 预测量 | 测量 HTML + viewport → `RawMeasurement[]` → `Map<string, MeasuredElement>` | `generateHtml(isMeasurementPass)` + `normalizeMeasurements` |
| 4 分页 | 模板 + 测量 → `PageLayout[]` | `paginate`（现有） |
| 5 连续纸探针 | 分页后 HTML + 纸宽 → 内容底边 mm → 最终纸高 | `probeContentBottom` + `composeContinuousHeight`；普通纸跳过 |
| 6 最终 HTML | 分页 + `pageHeightMm` → HTML | `generateHtml`（现有），普通纸不传 `pageHeightMm` |
| 7 出图 | HTML + 目标规格 → PDF/PNG | driver `pdf`/`screenshot` |

入口：

- `prepareDocument(job, runtime)` → 阶段 1–6，返回 `{ html, pageCount, paperMm, continuous, heightSource, pageLayouts }`；
- `renderPdf(job, runtime)` → 阶段 1–7，返回 `{ pdf, prepared }`；
- `renderScreenshot(job, runtime)` → 阶段 1–2 + 测量模式 HTML + 截图（不分页，保持现有语义）。

`PrintJob` 携带 `paperOverride`（宿主纸张覆盖逃生门）、`paperHeightMm`（连续纸显式纸高）；纸张解析、µm↔mm、`heightSource` 判定全部在 `print/paper.ts`，客户端现有 `resolvePaper` 逻辑随之删除。测量容器尺寸由 `paperViewportPx(paperMm)` 统一给出，三端使用同一尺寸，消除现状中「iframe 纸宽 vs Playwright 1280×720」的差异。

## 8. 错误与超时

- 统一失败分类 `PrintFailureCode`：`INVALID_PAPER`、`MEASURE_FAILED`、`RENDER_TIMEOUT`、`PDF_FAILED`、`SCREENSHOT_FAILED`、`UNSUPPORTED_RUNTIME`、`INTERNAL`；
- core 用 `withTimeout` 包住每次运行时调用，默认值与现状一致：测量/探针 30s、PDF 30s、就绪等待 5s（在 DOM 执行器内）；
- 码制渲染失败降级为文本占位，不中断任务（保持现有契约）；
- 各端只做映射：客户端 → `ProtocolFailure`（沿用 `PRINT_FAILED`/`RENDER_TIMEOUT`/`INTERNAL`），服务端 → HTTP（沿用 `RENDER_FAILED`/`RENDER_TIMEOUT`/`INVALID_REQUEST`）。

## 9. 迁移路径与兼容

每步可独立构建、独立验证、独立提交：

1. core 新增 `print/` 纯逻辑，用**假 driver** 做全流程单测，不依赖浏览器；
2. core/browser 收敛：`dom-executor.ts`、`driver-iframe.ts`、`browser-runtime.ts`，`browser-pagination.ts` 改薄包装，`browser-code-renderer.ts` 改参数化；
3. core 增加 IIFE 构建产物与导出；
4. 服务端切换：新增 `driver-playwright.ts`，`pdf-render.ts` 改调 core 管线，删除 `barcode-renderer.ts` 与 `bwip-js` 依赖，Express/浏览器池/鉴权/外层超时保持不动；
5. 客户端切换：新增 `driver-electron.ts`（主进程隐藏窗口），main 侧调 core 管线；删除 `paper.ts`、`pdf-generator.ts` 的参数构造、`render-engine.ts` 的编排，以及 worker 渲染进程、`worker-preload`、`render-protocol`、`src/worker/*` 与对应构建入口；WebSocket 协议、串行锁、任务历史、出纸命令、托盘、`request-validation` 不动；
6. 文档口径同步：根 README、core/print-render README、静默打印指南、中英文 CHANGELOG；
7. 发布：core 走 minor（只新增导出），canvas 跟版；服务端与客户端不发 npm。

**行为变更**（非回归，需在 CHANGELOG 明示）：

- 服务端首次获得连续纸能力（此前固定 `80×297mm`）；
- 服务端条码/二维码视觉基线由 `bwip-js` 切换为 `jsbarcode`/`qrcode`。

## 10. 验证与门禁

1. core 单测：假 driver 驱动三个入口，覆盖分页边界、连续纸组合、纸张覆盖、码制降级、超时与错误分类；
2. DOM 执行器测试：happy-dom 覆盖 `renderCodes` 与归一化输入输出；真实测量与探针由服务端集成测试覆盖；
3. 服务端集成（CI 已有独立 `render` job）：保留截图与明细分页用例，新增连续纸与 PDF 规格（页数、MediaBox）断言；
4. 跨端一致性比对：同一模板+数据分别经 Playwright driver 与 Electron driver 出 PDF，比对页数、MediaBox 与位图差异（阈值化）；Electron 在 Linux runner 用 xvfb 运行；
5. 防复制回归门禁：架构守卫测试扫描 `services/print-render/src` 与 `clients/print-client/src`，禁止出现 `offsetHeight`/`getBoundingClientRect`、纸高计算、`printToPDF`/`page.pdf` 的参数构造、`jsbarcode`/`qrcode`/`bwip` 直接导入；driver 与宿主能力调用走白名单；
6. 验收命令：`npm run build`、`npm test`、`npm run test -w @worm-vue3-print/render`、打包冒烟 `npm run pack:client:dir`。

## 11. 风险与回退

| 风险 | 应对 |
| --- | --- |
| 码制/水印/分页视觉回归 | 客户端侧视觉基线不变；服务端切换后跑跨端比对与既有集成测试；迁移顺序保证 core 与各端可先后切换，出现差异时回退对应端的切换提交 |
| 服务端连续纸从「无实现」变为「有实现」 | 视为行为变更，补服务端连续纸集成测试并在 CHANGELOG 标注 |
| IIFE 执行器注入失败（构建产物缺失） | 客户端与服务端均以 `INTERNAL` 失败并记录日志，不静默降级 |
| driver 契约被业务逻辑污染 | 架构守卫测试 + 评审；driver 内禁止出现纸张、分页、码制相关计算 |
| 跨端比对在 CI 上不稳定 | 位图比对采用阈值化，失败时保留两侧产物供人工核对 |
| 客户端删除 worker 引起的安全面变化 | 隐藏窗口沿用现有打印窗口的 `webPreferences`；删除后由安全测试与冒烟脚本复核；回退点为该端的切换提交 |

## 12. 附录：本次勘察的实测证据

- 码制产物（同一码值 CODE128 `123456789012`）：浏览器侧 `jsbarcode` 输出 `<svg width="101px" height="44px" viewBox="0 0 101 44">`；服务端 `bwip-js` 输出 `<svg viewBox="0 0 101 36">`（无固有尺寸）。模块数同为 101，差异在条高与文字占比。
- 二维码（同一码值）：浏览器侧 148×148（29 模块 × 4px + 4 模块静区）；服务端 `viewBox="0 0 174 174"`。
- 依赖体量：`bwip-js` 浏览器构建 min 后 1.1MB；`jsbarcode` min 68KB；`qrcode` 无 UMD 产物，`lib/` 通过 `browser` 字段切换。
- 桌面客户端 Electron 版本 44.3.0，`webContents.printToPDF` 与服务端 `page.pdf` 同走 Chromium 打印管线。
- 仓库既有选型结论：`docs/superpowers/specs/2026-09-12-print-client-design.md` 第 3.1 节已否决在客户端内嵌 Playwright（体积 + 无静默打印能力）。
- CI 现状：`.github/workflows/ci.yml` 中 `render` job 独立安装 Chromium 并分别执行条码单测、截图集成测试、明细分页集成测试。
