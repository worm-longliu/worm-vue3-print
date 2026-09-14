# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

- `@worm-vue3-print/core`：新增打印管线模块（driver 契约 + 共享 DOM 宿主 runtime + 三端 driver），
  浏览器、服务端、桌面客户端统一使用同一份测量、分页、连续纸推导、码制渲染与出图规格；
  新增 IIFE 执行器产物与 `@worm-vue3-print/core/node` 出口（`loadExecutorBundle`）。
- `@worm-vue3-print/render`：**行为变更** ① 连续纸模板按内容推导纸高（此前固定 `80×297mm`）；
  ② 条码/二维码渲染基线由 `bwip-js` 切换为 `jsbarcode`/`qrcode`（与浏览器预览一致）；
  ③ 就绪等待由 `networkidle` 改为 `domcontentloaded` + 5s 就绪等待；服务端不再依赖 `bwip-js`。
- `print-client`：**行为变更** 测量就绪等待由 3s 调整为 5s；渲染 worker 与 IPC 桥删除，
  改由主进程装配 core 管线与 Electron driver（`print.submit` / `print.submitHtml` 协议与出纸行为不变）。
- 已知缺口（本次未实现）：协议接受 `color` 与 `pageRanges`，但 PDF→系统打印链路从未应用这两个参数。

### 新增

- 打印客户端：新增「保留生成的 PDF」排查开关（配置窗口勾选，`config.json` 的 `keepGeneratedPdf` / `pdfOutputDir`，留空默认 `userData/pdf`）——保留每次打印生成的 PDF，任务记录显示其绝对路径并提供「打开目录」，用于判断问题出在 PDF 生成还是打印机/驱动。
- `@worm-vue3-print/client`：新增浏览器预渲染直提交通道——协议消息 `print.submitHtml` 与 SDK 方法 `PrintClient.printHtml(rendered, options, templateName)`。宿主页用 `@worm-vue3-print/core/browser` 的 `renderHtmlPages` 在浏览器内完成两遍渲染，把最终 HTML（含纸张/方向/边距/连续纸高度）直送客户端静默出纸，客户端不再执行模板渲染；旧 `print`（客户端内渲染）链路保留兼容。
- 打印客户端：`print.submitHtml` 入站校验（HTML 非空、≤20MB、`paperMm` 毫米正数、`continuous`/`pageCount` 类型），纸张/方向/边距覆盖项一律以 `INVALID_REQUEST` 拒绝；打印引擎重构为「准备（渲染或直取 HTML）→ 出纸」双路共用流程。
- demo：「客户端静默打印」改为浏览器侧渲染后经 `printHtml` 提交（新增 `src/browser-render.ts` 封装）。

- `@worm-vue3-print/core`：新增同构水印模块（`render/watermark.ts`）——`generateHtml` 在每页最底层输出 `.watermark-layer`（**显式矢量瓦片**，逐块 `<svg class="watermark-tile">`），设计模板、浏览器预览、服务端 PDF、静默打印四端水印渲染完全一致。
- `@worm-vue3-print/core`：`WatermarkOptions` 新增 `tileWidth`/`tileHeight`（瓦片尺寸，控制水印密度，默认 260×180）；导出 `WATERMARK_DEFAULTS`、`WATERMARK_DENSITY_PRESETS`、`PX_PER_MM`、`MM_PER_PX`、`isWatermarkVisible`、`resolveWatermarkText`、`formatTimestamp`、`resolveWatermarkLayout`、`renderWatermarkTileSvg`、`renderWatermarkLayerHtml`。
- `@worm-vue3-print/core`：水印表达式支持系统变量 `{printDate}`（打印日期 YYYY-MM-DD）、`{printTime}`（打印时间 HH:mm:ss）、`{pageIndex}`（当前页码）、`{totalPages}`（总页数），与表达式弹框「变量」一致；`injectSystemVariables` 同步支持 `{printTime}` 替换，并导出 `resolveSystemVariables` 供设计器预览复用（预览与打印取值同源）。
- `@worm-vue3-print/canvas`：水印配置面板合并为单一「水印表达式」输入——**纯文本即静态水印（`mode=fixed`）**，含 `{字段}`、函数调用（`CONCAT(...)`）或字段路径（`order.no`）则按表达式解析（`mode=binding`），无需再手选模式；表达式通过表达式弹框（按钮或双击输入框打开）编辑，弹框内可直接选业务字段与打印日期/时间等变量；移除预设绑定字段下拉与时间戳开关（时间戳改由表达式里的 `{printDate}`/`{printTime}` 表达）；测试值仅在表达式模式下展示；保留密度（密/中/疏/自定义瓦片尺寸）等设置。
- `@worm-vue3-print/canvas`：`WatermarkConfig`、`CanvasPaper` 水印渲染改用 core 同构模块，三端渲染一致。

### 修复

- `@worm-vue3-print/core`：修复水印经**真实打印机出纸**后被放大约 3 倍、位置偏移、平铺错乱的问题。根因是水印原先用 CSS 平铺背景（`background-image` + `background-repeat`）实现，Chromium 会把它编译成 PDF 平铺图案（tiling pattern），PDF 查看器正常但出纸链路的 RIP 忽略图案矩阵（其所在 form 的 CTM 为 3.125 = 300dpi÷96px，实测放大倍数吻合）。现改为显式矢量瓦片：`resolveWatermarkLayout` 按纸张尺寸（含连续纸探针推导的最终纸高）计算瓦片网格，逐块输出内联 `<svg>`，出纸几何回到设计值（A4 默认密度 68.8mm × 47.6mm）。删除 `buildWatermarkSvgDataUrl`，杜绝回归到平铺背景方案。
- 打印客户端：修复**出纸方向与浏览器/服务端预览不一致**（横向页面被打成纵向）。根因是出纸命令未声明纸张，CUPS 按队列默认纸张（多为纵向 A4）处理，`pdftopdf` 把横向页旋转 90°（产物 PDF 带 `/Rotate 90`）。现在按「宿主指定驱动纸型 → 标准纸型匹配 → `Custom.<宽>x<高>`（点）」显式下发 `-o media=…`，实测同一份横向 A4 页面由 `/Rotate 90` 恢复为 `/Rotate 0`，纵向页面不受影响。
- 打印客户端：修复静默打印「PDF 生成超时 → 后续任务全部 BUSY」——`webContents.printToPDF` 已移除回调重载（回调永不触发、Promise 拒绝被静默吞掉），且 `PrintToPDFOptions.pageSize` 单位是**英寸**而非微米（误传微米会得到 210000×297000 英寸纸张，Electron 44 直接生成失败）。改用 Promise + 超时兜底（`src/main/pdf-generator.ts`）、纸张微米→英寸换算、显式零边距与 `printBackground: true`；生成失败/超时统一以 `PRINT_FAILED` 返回并释放串行锁，客户端静默打印产物与服务端 PDF 的水印、纸张尺寸一致。
- 打印客户端：出纸链路文档同步为「HTML → printToPDF → 系统打印命令」（`clients/print-client/README.md`、`docs/中文/指南/静默打印.md`、静默打印技能参考）。

### 变更

- 渲染微服务 `worm-vue3-print-render` 并入本 monorepo，落地为私有服务包 `services/print-render`（包名 `@worm-vue3-print/render` 保持不变，不发布 npm）；通过 npm workspace 本地软链依赖 `@worm-vue3-print/core`，不再从 npm registry 安装 core。
- 根工作区新增 `services/*` 分层；`npm run build` 同时构建 render，根 `npm test` 仍只覆盖 core/canvas，render 的浏览器集成测试由 CI 独立 job 执行。
- 新增根 `.npmrc`：Playwright 浏览器不随依赖安装自动下载，本地/CI 按需执行 `npx playwright install chromium`，Docker 镜像使用基础镜像内置 Chromium；Docker 构建上下文改为仓库根（`docker build -f services/print-render/Dockerfile .`）。
- demo（`demo/`）新增服务端 PDF 打印：顶栏显示渲染服务在线状态，「服务端 PDF」按钮经 Vite dev 代理（`/render-api/*`，代理层注入 `X-Render-Key`）调用 render 微服务，取当前画布 JSON + 示例数据两遍渲染出 PDF 并新标签页打开。
- `@worm-vue3-print/canvas`：**破坏性变更** 删除设计器内置的「加载默认布局」按钮与 `load-default-template` prop——模板加载/重置属于宿主业务。宿主在自有页面区域渲染入口，把新的 `TemplateData` 赋给 `initial-template` 即可重载画布（设计器按引用变化监听并记录一次历史，撤销可回退）。原注入 `load-default-template` 的宿主该 prop 会被忽略，需改为上述写法。

## [1.2.2] - 2026-09-11

### 变更

- `@worm-vue3-print/core`：新增子路径导出 `@worm-vue3-print/core/designer`——框架无关的设计器内核，包含完整模板模型类型、通用工具（元素工厂、表格矩阵、单位换算、模板迁移、标尺等）与纯交互逻辑（对齐、分组、键盘、缩放、吸附计算），无 Vue/React 等框架依赖。
- `@worm-vue3-print/core`：新增子路径导出 `@worm-vue3-print/core/browser`——浏览器侧渲染适配器（`renderHtmlPages` 两遍分页渲染、`browserCodeRenderer` 条形码/二维码渲染）。
- `@worm-vue3-print/canvas`：设计器模型、工具与纯逻辑下沉至 core 子路径，canvas 仅保留 Vue 适配层；公共导出 API 保持不变，core 主入口仍保持零运行时依赖。

### 修复

- `@worm-vue3-print/canvas`：修复工具栏放大/缩小按钮直接线性修改缩放比例、未做滚动锚点校正导致画面漂移的问题；按钮缩放改为与 Ctrl+滚轮一致的乘性步进，并以视口中心为锚点（与「适应窗口」同一缩放管线）。

## [1.2.1] - 2026-09-11

### 变更

- `@worm-vue3-print/canvas`：工具栏编辑区/层级区/视图区图标按钮统一使用 data-tip 自定义悬浮提示，补齐「网格」「吸附」缺失提示；提升提示层级，不再被画布顶部标尺遮挡。
- `@worm-vue3-print/canvas`：优化「适应窗口」——以视口中心为锚点一步缩放到位（与 Ctrl+滚轮同一缩放换算管线），缩放平滑过渡；允许低于交互缩放下限（最小可至 5%），超大纸张也能整版容纳，纸张在画布视口内水平垂直居中。
- `@worm-vue3-print/canvas`：新增 `showHelp` 配置——控制帮助入口（帮助按钮与帮助弹框）显示，默认开启，传入 `false` 即可隐藏。

### 修复

- `@worm-vue3-print/canvas`：修复工具栏悬浮提示气泡被画布顶部固定标尺遮挡无法显示的问题。
- `@worm-vue3-print/canvas`：修复「适应窗口」后超大纸张仍残留滚动条、纸张未在画布视口居中（垂直偏上）的问题。

### 文档

- 新增打印设计工作台布局线框图文档（`docs/中文/打印设计工作台-布局线框图.md`），标注各区域名称、功能与对应组件文件，便于后续布局调整。

## [1.2.0] - 2026-09-10

### 新增

- `@worm-vue3-print/canvas`：新增帮助文档模态框（HelpModal），包含功能介绍、快捷键一览、常见问题等帮助内容。
- `@worm-vue3-print/canvas`：标尺参考线增强——支持拖拽添加参考线、双击编辑、删除，参考线对齐吸附实时显示。
- `@worm-vue3-print/canvas`：表格列宽拖拽新增末列右边界手柄，可直接拖拽调整末列宽并受 `maxTableWidth` 钳制。

### 变更

- `@worm-vue3-print/canvas`：优化缩放逻辑，取消放大上限，支持滚轮乘性步进缩放，修复缩放锚点漂移问题。
- `@worm-vue3-print/canvas`：移除设计态元素左上角的 fx 绑定标签提示，简化元素视觉呈现。

### 文档

- 仓库根目录新增 `AGENTS.md` AI 代理行为规范文件，明确代理在本仓库工作时的语言、专家态度、协作约定等强制要求。
- 新增 `worm-vue3-print` 集成支持 skill（`skills/worm-vue3-print-integration/`），包含安装指南、集成 API、故障排查等参考文档。

### 修复

- `@worm-vue3-print/canvas`：修复表格列宽拖拽存在的多个缺陷——内部列边界向左拖时左列宽度不变导致边界线不跟随光标、px→mm 单位换算缺失导致拖拽距离存在约 3.78 倍偏差、`table-layout:fixed` 下拖拽过程中表格 CSS `width(100%)` 与列宽和失配导致浏览器按比例拉伸列使边界线与右侧内容偏离光标；同时删除 `onColResizeStart` 中残留的 `document.title` 调试代码。

## [1.1.0] - 2026-09-06

### 新增

- `@worm-vue3-print/canvas`：表格元素支持列宽拖拽——设计态选中表格后，在列边界悬停并拖动即可调整该列宽（左侧列），实时更新画布与元素尺寸；受打印范围宽度（`maxTableWidth`）与最小列宽（5mm）钳制，拖拽结束后计入一次撤销历史。属性面板的列宽数值输入保留作为精确输入兜底。
- `@worm-vue3-print/canvas`：表格单元格支持图片类型——单元格可切换为图片类型，设计态支持选择图片与设置 fit/maxWidth/maxHeight，预览与打印输出完整渲染。
- `@worm-vue3-print/canvas`：条形码与二维码单元格支持 fit/maxWidth/maxHeight 属性。
- `@worm-vue3-print/canvas`：属性面板位置尺寸改用 StepperInput 控件，支持按钮微调数值；StepperInput 支持可选值列表和小数步进。
- `@worm-vue3-print/canvas`：新增统一颜色选择器并重构属性面板字段分组。
- `@worm-vue3-print/canvas`：支持页面（纸张）背景色 `pageBackground`，预览与打印/PDF 输出一致。
- `@worm-vue3-print/canvas`：支持 canvas 库模式构建与 npm 发布。

### 修复

- `@worm-vue3-print/canvas`：打印/导出 PDF 保留元素背景色（`print-color-adjust: exact`）。
- `@worm-vue3-print/canvas`：打印预览保留元素重叠，表格下方跟随元素按设计坐标绝对定位并透传层级 z-index。
- `@worm-vue3-print/canvas`：打印页眉页脚区域贴页面底部，修复页边距失效。
- `@worm-vue3-print/canvas`：条形码渲染缺少 `object-fit: contain`。
- `@worm-vue3-print/canvas`：修复 canvas 测试在 vitest v4 + happy-dom 环境下 `localStorage` 未定义的问题，补充 mock 以兼容测试环境。

## [1.0.0] - 2026-09-02

### 新增

- 首次开源发布。
- `@worm-vue3-print/core`：模板表达式引擎与同构渲染管线（HTML 生成/分页/数据绑定）。
- `@worm-vue3-print/canvas`：Vue 3 可视化打印模板设计器画布。
- 渲染微服务拆分为独立仓库 `worm-vue3-print-render`（仅 Docker 部署，不上 npm）。
