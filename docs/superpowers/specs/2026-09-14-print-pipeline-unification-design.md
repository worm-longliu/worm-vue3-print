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
- core 生成的打印 HTML 保持 mm 绝对定位，`html-generator`/`css-builder` 不得引入 `vw`/`vh` 等视口单位（客户端测量不设视口的前提）。

## 4. 关键决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 一致性档位 | 档位一：逻辑同源，适配层允许存在但不含业务规则 | 服务端与客户端的内核、字体差异无法靠移植代码消除；档位三（服务端整条管线跑进页面）收益边际递减、部署与调试成本显著上升 |
| 码制渲染器 | 统一到 `jsbarcode`/`qrcode` | 保持现有浏览器视觉基线；`bwip-js` 浏览器构建 min 后 1.1MB，比 `jsbarcode`(68KB)+`qrcode` 大近 9 倍；`qrcode` 无 UMD 产物，故 core 额外产出一个约 0.12MB 的 IIFE 执行器供页面注入 |
| 桌面客户端是否内嵌 Playwright | 不内嵌 | 需自带 Chromium（每平台约 +170MB）并处理 asar 解包、签名公证、Linux 系统依赖；Playwright 不提供静默打印；其 `setContent`/`evaluate`/`pdf` 能力与 Electron 原生（`loadFile`/`executeJavaScript`/`webContents.printToPDF`）完全重合。Playwright 仅作为跨端一致性测试的参照实现 |
| 适配器分层 | driver 契约 + 共享 DOM 宿主 runtime + 三端 driver | 让「载入→注入→等就绪→执行→释放」的时序、超时、错误分类、码值预渲染只写一次，三端差异压缩为几十行机械代码 |
| 截图 | 纳入 core 管线 | 与 PDF 仅差最后一步输出，共用测量、分页、码制与规格推导 |
| 客户端 DOM 宿主 | 主进程常驻隐藏窗口，**模板 HTML 作为该窗口的顶层文档**（临时文件 `loadFile`），执行器用 `webContents.executeJavaScript` 注入；删除 worker 渲染进程与 IPC 桥 | 客户端 driver 与服务端 driver 形状一致（载入文档 → 注入 → evaluate → 出图），不需要宿主页与 iframe。窗口尺寸不参与测量：core 生成的 CSS 是 mm 绝对定位（`css-builder.ts`），盒宽由 mm 决定，测量与视口无关；该约束写入不变量并由守卫测试保护。窗口 `webPreferences` 与现有打印窗口一致（`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`），安全面不高于现状（该窗口形状已长期承载模板 HTML） |
| 会话粒度 | 每任务一个 driver 会话（服务端每请求借一页） | `BrowserPool.acquire()` 每次新建页、`release()` 关闭页（`browser-pool.ts:146-176`），按阶段各借一次会让单请求建页 3–5 次并反复注入执行器；`acquire()` 注释本身即声明「请求级绑定」 |
| 码值处理 | 「收集→渲染→再生成」两趟，禁止静态扫描模板 | 静态枚举会与渲染器取值漂移：表格动态行展开、`{pageIndex}`/`{totalPages}`（测量趟用占位 0）、`{printDate}` 等系统变量都会让枚举集与实际取值不一致 |
| 外部 `CodeRenderer` | 保留 `renderHtmlPages` 第 4 参数的覆盖语义 | 画布预览与 demo 均显式传入 `browserCodeRenderer`（`PrintHtmlPreview.vue:59`、`demo/src/browser-render.ts:18`），改为内部自建会让调用方运行时产物与预期不符，且类型不报错 |

## 5. core 目标结构与导出面

新增 `packages/print-core/src/print/`（纯 TS，Node 与浏览器都能 import）：

| 文件 | 职责 |
| --- | --- |
| `types.ts` | `PrintJob`、`PrintResult`、`RawMeasurement`、`PaperMm`、`ViewportPx`、`CodeSpec`、`PdfTargetSpec`、`ScreenshotTargetSpec`、`PrintFailureCode` |
| `driver.ts` | `PageDriver` 契约、`ExecutorBundle`、`ExecutorMethod` |
| `ports.ts` | `PrintRuntime.withSession()` 与 `PrintSession`（码值渲染、测量、探针、PDF、截图） |
| `dom-host-runtime.ts` | `createDomHostRuntime(driverFactory)`：共享的 DOM 宿主编排与超时、错误收敛 |
| `pipeline.ts` | `prepareDocument`、`renderPdf`、`renderScreenshot` |
| `measure.ts` | `normalizeMeasurements(raw, template)`：px→mm、表格行高、`repeatHeaderHeight` |
| `codes.ts` | 收集型 `CodeRenderer`：包装真实渲染器，未知码值记录规格并输出文本占位；`mergeCodeSpecs` 合并多趟收集结果 |
| `paper.ts` | 纸张解析、覆盖逃生门、µm↔mm、`paperViewportPx`、连续纸最小高度 |
| `pdf-spec.ts` | `buildPdfTargetSpec`、`toElectronPrintToPdfOptions`（英寸）、`toPlaywrightPdfOptions`（mm）、`buildScreenshotTargetSpec` |
| `errors.ts` | `PrintFailure`、失败分类、`withTimeout` |

`packages/print-core/src/browser/` 调整：

- 新增 `dom-executor.ts`：测量读取、连续纸探针、就绪等待、码制渲染的唯一实现，挂载到 `globalThis.__wormDom`；
- 新增 `driver-iframe.ts` 与 `browser-runtime.ts`：`createBrowserPrintRuntime()` = `createDomHostRuntime(createIframeDriver())`；
- `browser-pagination.ts`：`renderHtmlPages` 改为薄包装，导出与签名不变，**保留调用方传入 `CodeRenderer` 的覆盖语义**（传了就用传入的，不传才由 runtime 自建）；
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

`createDomHostRuntime(driverFactory)` 返回 `PrintRuntime`，其 `withSession(job, fn)` 负责建立与释放会话（服务端借还页、客户端复用常驻隐藏窗口槽位、浏览器建/销毁 iframe），业务规则与全局时序只在此处出现。会话方法：

- `renderCodes(specs)`：只复用文档槽位（`open` + `injectExecutor`，不载入模板 HTML）→ `evaluate('renderCodes')` → 码值→SVG 映射 → 返回同步 `CodeRenderer`；可多次调用（"收集→渲染→再生成"两趟），缺键降级文本占位；
- `measure(html, viewport)`：setContent → injectExecutor → `waitReady` → `evaluate('readMeasurements')`；
- `probeContentBottom(html, viewport)`：同上序列，执行 `readContentBottom`；
- `toPdf(html, spec)` / `toScreenshot(html, spec)`：setContent → injectExecutor → `waitReady` → `driver.pdf(html, spec)`/`driver.screenshot(html, spec)`；driver 未实现该能力时抛 `UNSUPPORTED_RUNTIME`；
- 会话结束 `close()`，宿主异常统一收敛为 `PrintFailure`。

注意：`setContent` 会重建文档，此前注入的执行器随文档失效，因此**每次 `setContent` 后都需重新注入**；`injectExecutor` 的幂等语义是"同一文档内不重复注入"，不是"同一会话内只注入一次"。

**第三层：三端 driver**

| 端 | `open`/`setContent` | `injectExecutor` | `pdf`/`screenshot` |
| --- | --- | --- | --- |
| 服务端 `driver-playwright.ts` | 会话开始借页、结束还页（每请求一页）+ `setViewportSize(viewport)` + `setContent`（`waitUntil: 'domcontentloaded'`） | `addScriptTag(dom-executor.iife)`，同一文档幂等 | `page.pdf`/`page.screenshot`，规格来自 core |
| 客户端 `driver-electron.ts` | 常驻隐藏窗口；模板 HTML 写入临时文件后 `loadFile` 为顶层文档；`open(viewport)` 在 Electron 下为 no-op（测量不依赖视口） | `webContents.executeJavaScript(bundle.source)`，同一文档内幂等 | 同一窗口 `printToPDF`（文档已载入且已就绪）；截图不提供 |
| 浏览器 `driver-iframe.ts` | 离屏 iframe + `doc.write` | 进程内直调执行器（ESM 形态） | 不提供 |

客户端改用主进程隐藏窗口后，现有 worker 渲染进程、`worker-preload` 桥、`render-protocol` 契约与 electron-vite 的 worker 入口一并删除；打印机枚举改由既有隐藏/配置窗口的 `webContents.getPrintersAsync()` 承担，`getPrintersAsync` 对任意 `webContents` 可用。

## 7. 管线阶段与数据流

| 阶段 | 输入 → 输出 | 实现位置 |
| --- | --- | --- |
| 1 绑定 | `templateJson` + `printData` → 绑定后模板 | `bindData`（现有） |
| 2 码值收集与渲染 | 生成 HTML 时收集码值规格 → 同步 `CodeRenderer` | 收集型渲染器 + driver `renderCodes`（见下方序列） |
| 3 预测量 | 测量 HTML + viewport → `RawMeasurement[]` → `Map<string, MeasuredElement>` | `generateHtml(isMeasurementPass)` + `normalizeMeasurements` |
| 4 分页 | 模板 + 测量 → `PageLayout[]` | `paginate`（现有） |
| 5 连续纸探针 | 分页后 HTML + 纸宽 → 内容底边 mm → 最终纸高 | `probeContentBottom` + `composeContinuousHeight`；普通纸跳过 |
| 6 最终 HTML | 分页 + `pageHeightMm` → HTML | `generateHtml`（现有），普通纸不传 `pageHeightMm` |
| 7 出图 | HTML + 目标规格 → PDF/PNG | driver `pdf`/`screenshot` |

码值「收集→渲染→再生成」的序列（core 内部，与 `generateHtml` 的调用顺序绑定）：

1. 用**收集型渲染器**生成测量 HTML：未知码值输出文本占位，同时记录其规格（码值 + 码制 + 选项）；
2. 规格非空时调 `renderCodes(specs)` 得到映射，用真实渲染器**再生成**测量 HTML；规格为空则跳过（无码模板仍只生成两次 HTML，与现状相同）；
3. 测量 → 分页 → 用收集型渲染器生成最终 HTML，补齐测量趟看不到的规格（页眉/页脚/首页叠加中的真实 `{pageIndex}`/`{totalPages}` 码值）；
4. 若第 3 步未收集到新规格（模板码制元素不在页眉/页脚/叠加区），跳过第二次 `renderCodes` 与再生成；
5. 连续纸的探针 HTML 与最终 HTML 均使用同一份完整映射。

这套序列保证「枚举集 == 渲染器实际看到的取值」，代价是最坏情况下多两次字符串生成与一次页面往返；静态扫描模板的做法被明确禁止（会与动态行展开、系统变量、页码替换漂移）。

入口：

- `prepareDocument(job, runtime)` → 阶段 1–6，返回 `{ html, pageCount, paperMm, continuous, heightSource, pageLayouts }`；
- `renderPdf(job, runtime)` → 阶段 1–7，返回 `{ pdf, prepared }`；
- `renderScreenshot(job, runtime)` → 阶段 1–2 + 测量模式 HTML + 截图（不分页，保持现有语义）。

`PrintJob` 携带 `paperOverride`（宿主纸张覆盖逃生门）、`paperHeightMm`（连续纸显式纸高）；纸张解析、µm↔mm、`heightSource` 判定全部在 `print/paper.ts`，客户端现有 `resolvePaper` 逻辑随之删除。测量容器尺寸由 `paperViewportPx(paperMm)` 统一给出，三端使用同一尺寸，消除现状中「iframe 纸宽 vs Playwright 1280×720」的差异。

## 8. 错误与超时

- 统一失败分类 `PrintFailureCode`：`INVALID_PAPER`、`MEASURE_FAILED`、`RENDER_TIMEOUT`、`PDF_FAILED`、`SCREENSHOT_FAILED`、`UNSUPPORTED_RUNTIME`、`INTERNAL`。
- 超时预算：`PrintJob.timeoutMs`（总预算，缺省 30s）与 `PrintJob.readinessMs`（就绪等待，缺省 5s）；core 每个阶段取 `min(剩余预算, 阶段上限)`。服务端外层 30s 请求超时必须与 core 预算同源，避免出现「外层已回 504、内部仍在跑」的漂移。
- 就绪等待统一为 5s，这与现状存在两处**行为变更**，需在 CHANGELOG 明示：浏览器测量由 3s 调整为 5s（`browser-pagination.ts:20`）；服务端由 `waitUntil: 'networkidle'` 改为 `domcontentloaded` + 5s 就绪等待（`pdf-render.ts:78`）。
- 码制渲染失败降级为文本占位，不中断任务（保持现有契约）。
- 各端只做映射，不新增协议码（SDK 的 `ServerErrorCode` 仅 8 个值，新增会破坏兼容，见 `packages/print-client-sdk/src/protocol.ts:9-17`）：

| core 失败码 | 客户端协议码 | 服务端 HTTP |
| --- | --- | --- |
| `INVALID_PAPER` | `INVALID_REQUEST` | 400 `INVALID_REQUEST` |
| `RENDER_TIMEOUT` | `RENDER_TIMEOUT` | 504 `RENDER_TIMEOUT` |
| `MEASURE_FAILED` / `PDF_FAILED` / `SCREENSHOT_FAILED` | `PRINT_FAILED` | 500 `RENDER_FAILED` |
| `UNSUPPORTED_RUNTIME` / `INTERNAL` | `INTERNAL` | 500 `RENDER_FAILED` |

- 出图规格硬化：两端的 PDF 规格显式声明 `preferCSSPageSize: false`（Electron `printToPDF` 与 Playwright `page.pdf` 均支持该选项），避免依赖默认值；边距恒为零，边距由 core 生成的 HTML padding 控制。

## 9. 迁移路径与兼容

每步可独立构建、独立验证、独立提交：

1. core 新增 `print/` 纯逻辑，用**假 driver** 做全流程单测，不依赖浏览器；
2. core/browser 收敛：`dom-executor.ts`、`driver-iframe.ts`、`browser-runtime.ts`，`browser-pagination.ts` 改薄包装，`browser-code-renderer.ts` 改参数化；
3. core 增加 IIFE 构建产物与导出；
4. 服务端切换：新增 `driver-playwright.ts`；`pdf-render.ts` **保留 `renderPdf` / `renderScreenshot` 同名同签名导出**（`server.ts` 与既有集成测试直接 import，签名一变全断），内部改调 core 管线；删除 `barcode-renderer.ts` 与 `bwip-js` 依赖并更新 lock；Express、浏览器池、鉴权保持不动，外层请求超时与 core 预算同源；同步修改 `.github/workflows/ci.yml` 的 render job（删除 `src/barcode-renderer.test.ts` 步骤，改为 core 码制用例 + 新增连续纸与 PDF 规格用例）；
5. 客户端切换：新增 `driver-electron.ts`（常驻隐藏窗口 + 模板 HTML 作为顶层文档），main 侧调 core 管线；删除 `paper.ts`、`pdf-generator.ts` 的参数构造、`render-engine.ts` 的编排，以及 worker 渲染进程、`worker-preload`、`render-protocol`、`src/worker/*` 与对应构建入口；`print.submitHtml` 链路保留但改为复用 core 的出图规格推导与超时封装，`buildWebPrintSettings` 中剩余的份数/纸型取值保留；WebSocket 协议、串行锁、任务历史、出纸命令、托盘、`request-validation` 不动；打包冒烟需验证 `require('@worm-vue3-print/core')` 在 asar 内可解析（main 构建为 `externalizeDepsPlugin()`，core 由 electron-builder 从 dist 收集）；
6. 文档口径同步（逐处）：`services/print-render/README.md:9`「由服务端纯 Node 侧完成渲染」需改写；根 `README.md:7,48,70,249` 与 `packages/print-core/README.md:25` 的「一致」表述加限定（档位一：算法同源，字体与内核仍需同源才达像素级一致）；`clients/print-client/README.md:16-17,32-35,97` 的 worker/IPC 架构描述与目录表；`skills/worm-vue3-print-integration/references/` 下 `silent-print.md:7,17`、`troubleshooting.md:88`、`integration-api.md:173`；`docs/中文/指南/静默打印.md:173`；中英文 CHANGELOG 记录两处行为变更；
7. 发布：core 走 minor（只新增导出），canvas 跟版；服务端与客户端不发 npm。

**行为变更**（非回归，需在 CHANGELOG 明示）：

- 服务端首次获得连续纸能力（此前固定 `80×297mm`）；
- 服务端条码/二维码视觉基线由 `bwip-js` 切换为 `jsbarcode`/`qrcode`。

## 10. 验证与门禁

1. core 单测：假 driver 驱动三个入口，覆盖分页边界、连续纸组合、纸张覆盖、码制降级、超时与错误分类；
2. DOM 执行器测试：happy-dom 覆盖 `renderCodes` 与归一化输入输出；真实测量与探针由服务端集成测试覆盖；
3. 服务端集成（CI 已有独立 `render` job）：保留截图与明细分页用例，新增连续纸与 PDF 规格（页数、MediaBox）断言；
4. 跨端一致性比对：同一模板+数据分别经 Playwright driver 与 Electron driver 出 PDF，比对页数、MediaBox 与位图差异（阈值化）；Electron 在 Linux runner 用 xvfb 运行；比对前须将两端字体集对齐，否则位图差异主要来自字体而非管线；
5. 防复制回归门禁：架构守卫测试扫描 `services/print-render/src` 与 `clients/print-client/src`，禁止出现 `offsetHeight`/`getBoundingClientRect`、纸高计算、`printToPDF`/`page.pdf` 的参数构造、`jsbarcode`/`qrcode`/`bwip` 直接导入；driver 与宿主能力调用走白名单；
6. 性能与资源观测：服务端每请求由现状「2 次建页 + 各自 `networkidle`」变为「1 次建页 + 每文档一次执行器注入（测量、最终、探针、出图共 4–5 次，每次约 0.12MB 解析）」，需在集成测试中记录建页/注入次数与端到端耗时；若注入开销显著，改用 `addInitScript` + `goto(data:)` 让脚本随每次导航自动注入；
7. 既有测试的迁移映射（不得静默丢覆盖）：

| 现测试 | 归属变化 |
| --- | --- |
| `services/print-render/src/barcode-renderer.test.ts` | 改为 core 码制用例（同一算法 + 注入 libs），CI render job 同步改步骤 |
| `clients/print-client/src/main/pdf-generator.test.ts` | 换算/零边距/背景/超时与失败码迁至 core `pdf-spec` 与管线测试；客户端保留薄包装测试 |
| `clients/print-client/src/main/paper.test.ts` | 7 条 `resolvePaper` 用例（含「覆盖高度为 0/负数视为未传」「仅覆盖宽度时 heightSource 仍为 derived」）整体迁至 core `paper` 测试，作为 `paperOverride` 语义基线 |
| `clients/print-client/src/main/render-engine.test.ts` | 保留在客户端（`buildWebPrintSettings` 仍属客户端：份数、纸型名、页范围） |
| `clients/print-client/src/main/print-engine.test.ts`、`protocol-handler.test.ts`、`request-validation.test.ts` | 不动 |

8. 验收命令：`npm run build`、`npm test`、`npm run test -w @worm-vue3-print/render`、打包冒烟 `npm run pack:client:dir`。

## 11. 风险与回退

| 风险 | 应对 |
| --- | --- |
| 码制/水印/分页视觉回归 | 客户端侧视觉基线不变；服务端切换后跑跨端比对与既有集成测试；迁移顺序保证 core 与各端可先后切换，出现差异时回退对应端的切换提交 |
| 服务端连续纸从「无实现」变为「有实现」 | 视为行为变更，补服务端连续纸集成测试并在 CHANGELOG 标注 |
| IIFE 执行器注入失败（构建产物缺失） | 客户端与服务端均以 `INTERNAL` 失败并记录日志，不静默降级 |
| driver 契约被业务逻辑污染 | 架构守卫测试 + 评审；driver 内禁止出现纸张、分页、码制相关计算 |
| 跨端比对在 CI 上不稳定 | 位图比对采用阈值化，失败时保留两侧产物供人工核对 |
| 客户端删除 worker 引起的安全面变化 | 隐藏窗口沿用现有打印窗口的 `webPreferences`；删除后由安全测试与冒烟脚本复核；回退点为该端的切换提交 |
| 条码几何仍受字体影响（档位一下的残留差异） | `jsbarcode` 的 SVG 宽度为 `ceil(max(textWidth, barcodeWidth))`（`node_modules/jsbarcode/bin/renderers/shared.js:45`），文字宽度取决于字体，故三端字体不同时条码固有宽度与 `object-fit: contain` 下的视觉尺寸仍会不同；此项列入「已知残留差异」，只有档位二（字体同源）能消除 |
| 码值两趟带来的额外开销 | 无码模板走快路径（不多生成 HTML）；含码模板最坏多两次字符串生成与一次页面往返，在集成测试中记录耗时 |
| 客户端测量对视口的隐式依赖 | core 生成的 HTML 必须保持 mm 绝对定位，`html-generator`/`css-builder` 禁止引入 `vw`/`vh` 等视口单位；由守卫测试保护 |

## 12. 附录：本次勘察的实测证据

- 码制产物（同一码值 CODE128 `123456789012`）：浏览器侧 `jsbarcode` 输出 `<svg width="101px" height="44px" viewBox="0 0 101 44">`；服务端 `bwip-js` 输出 `<svg viewBox="0 0 101 36">`（无固有尺寸）。模块数同为 101，差异在条高与文字占比。
- 二维码（同一码值）：浏览器侧 148×148（29 模块 × 4px + 4 模块静区）；服务端 `viewBox="0 0 174 174"`。
- 依赖体量：`bwip-js` 浏览器构建 min 后 1.1MB；`jsbarcode` min 68KB；`qrcode` 无 UMD 产物，`lib/` 通过 `browser` 字段切换。
- 桌面客户端 Electron 版本 44.3.0，`webContents.printToPDF` 与服务端 `page.pdf` 同走 Chromium 打印管线。
- 仓库既有选型结论：`docs/superpowers/specs/2026-09-12-print-client-design.md` 第 3.1 节已否决在客户端内嵌 Playwright（体积 + 无静默打印能力）。
- CI 现状：`.github/workflows/ci.yml` 中 `render` job 独立安装 Chromium 并分别执行条码单测、截图集成测试、明细分页集成测试。
- 码制宽度依赖字体测量：`node_modules/jsbarcode/bin/renderers/shared.js:45` 为 `encoding.width = Math.ceil(Math.max(textWidth, barcodeWidth))`，`measureText` 走浏览器字体度量（同文件 86-93 行）。
- 服务端页面不复用：`services/print-render/src/browser-pool.ts:146-176`，`acquire()` 每次 `browser.newPage()`，`release()` 直接 `page.close()`。
- 服务端 `setContent` 会重建文档，此前注入的脚本随之失效；`addScriptTag` 注入是按文档生效的。
- 客户端主进程目前仅有一处运行时 DOM 调用：`clients/print-client/src/main/print-engine.ts:223-231` 的 `executeJavaScript` 就绪等待；核心渲染逻辑此前都在 worker 渲染进程。
- 打包链路：`clients/print-client/electron.vite.config.ts:7` 对 main 使用 `externalizeDepsPlugin()`，core 由 electron-builder 从 dist 收集进 asar（`clients/print-client/electron-builder.yml:11-14`），因此 main 运行时 `require('@worm-vue3-print/core')` 可行但需冒烟验证。
- 文档受影响位置：`services/print-render/README.md:9`、根 `README.md:7,48,70,249`、`packages/print-core/README.md:25`、`clients/print-client/README.md:16-17,32-35,97`、`skills/worm-vue3-print-integration/references/silent-print.md:7,17`、`troubleshooting.md:88`、`integration-api.md:173`、`docs/中文/指南/静默打印.md:173`。
