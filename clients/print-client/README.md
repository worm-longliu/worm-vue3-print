# @worm-vue3-print/print-client

worm-vue3-print 跨平台（Windows / Linux / macOS）静默打印桌面客户端。宿主 Web 系统通过浏览器端 SDK（`@worm-vue3-print/client`）连接本机运行的本客户端，复用 `@worm-vue3-print/core` 的同构渲染管线，在隐藏窗口里渲染出最终 HTML，再用 Electron `printToPDF` 生成 PDF 并交给系统打印命令静默出纸——无浏览器打印对话框、不依赖浏览器插件。

## 架构

```
宿主 Web 页面
   │  @worm-vue3-print/client（SDK：端口探测/重连/超时）
   ▼  WebSocket（仅绑定 127.0.0.1）
WsServer（回环服务：握手鉴权 → 协议帧分发）
   ▼
PrintEngine（串行锁，并发直接 BUSY）
   ├─ PrinterService   枚举/解析目标打印机
   ├─ RenderEngine     下发渲染任务 + 纸长推导/覆盖
   │     ▼ 装配 core 运行时 + Electron driver
   │   隐藏窗口承载模板 HTML（沙箱 WebPreferences，注入 core DOM 执行器）
   │     两遍渲染：测量 pass → 分页（连续纸探针推导高度）→ 最终 HTML
   └─ 打印窗口 printToPDF（纸张微米→英寸、保留背景/零边距）→ 系统命令打印 PDF → 任务记录/日志
```

> 出纸统一走「HTML → PDF → 系统打印命令」：PDF 由 Chromium 打印管线生成，与服务端 Playwright 产物同源，
> 纸张尺寸与背景（含水印）表现一致；`webContents.print()` 依赖打印驱动的纸张/可打印区域，已不再使用。
> 出纸时显式向打印系统声明纸张（`lp -o media=…`：宿主指定驱动纸型 > 标准纸型匹配 > `Custom.<宽>x<高>`），
> 避免驱动按队列默认纸张处理、把横向页旋转成纵向（产物 PDF 出现 `/Rotate 90`）。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `src/main/` | 主进程：WS 服务、安全、打印/渲染引擎、打印机、配置、日志、任务记录、托盘、装配 |
| `src/preload/` | 配置窗口 preload（`index.ts`，`wormPrint` 桥） |
| `src/renderer/` | 配置窗口 Vue 3 界面（设置 / 任务记录 / 日志） |
| `src/main/driver-electron.ts` | Electron driver：隐藏窗口载入模板 HTML、注入 core 执行器、`printToPDF` |
| `src/main/print-host.ts` | 打印机枚举专用常驻隐藏窗口 |
| `scripts/smoke.mjs` | 真机冒烟脚本（hello → 枚举 → 测试页） |

## 开发

```bash
npm install                      # 在仓库根目录
npm run dev:client               # 启动客户端（electron-vite dev，根脚本短别名）
npm run test -w @worm-vue3-print/print-client  # 单元/集成测试（node + happy-dom，不依赖 Electron）
npm run build -w @worm-vue3-print/print-client # electron-vite 三环境构建到 out/
```

## 打包

### 安装包（macOS 上交叉打包 mac + win）

macOS 上可同时产出**当前系统安装包**与**交叉构建的 Windows 安装包**（`win.nsis` 目标；Linux 安装包只能在 Linux 上构建）：

```bash
npm run pack:client        # 在仓库根目录：先构建 core 与 SDK 的 dist，再 electron-builder --mac --win
```

产物：

- macOS：`clients/print-client/dist/mac-arm64/*.dmg|*.zip`（Apple Silicon）或 `dist/mac/*.dmg|*.zip`（Intel）
- Windows：`clients/print-client/dist/win-unpacked/` + `*.exe`（NSIS 安装程序，可选择安装目录/创建桌面快捷方式）

> 未配置代码签名与自定义图标，产物为未签名 + Electron 默认图标；分发前请补充 `build/` 资源（`icon.icns`/`icon.ico`）与签名证书。

### 绿色目录版（免安装）

仅产出**不安装即可运行**的目录：

```bash
npm run pack:client:dir
```

产物（electron-builder 限制，各平台只能在对应系统上构建本平台产物）：

- macOS：`clients/print-client/dist/mac/WormPrintClient.app`
- Windows：`clients/print-client/dist/win-unpacked/`
- Linux：`clients/print-client/dist/linux-unpacked/`

## WebSocket 协议

- 帧：请求 `{ id, type, payload }`；响应 `{ id, ok, payload } | { id, ok:false, error:{ code, message } }`。
- 消息：`hello`、`printers.list`、`print.submit`（客户端内渲染，兼容链路）、`print.submitHtml`（浏览器预渲染 HTML 直提交，推荐链路）。
- 端口发现：默认从 `127.0.0.1:17521` 起探测，占用则 +1（SDK 与服务端同策略）。

`print.submit` 的 `print` 字段（长度单位均为**微米 μm**，1mm=1000μm）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `printerName` | string | 省略则用系统默认打印机 |
| `copies` | number | 正整数，默认 1 |
| `paperName` | string | 驱动纸型名（如针式打印机的预置纸型），优先于自定义 pageSize |
| `paperSize` | `{width?,height?}` | 自定义纸（μm）；连续纸 `height` 省略/为 0 时按内容推导 |
| `landscape` / `color` | boolean | 方向 / 彩色 |
| `margins` | `{top,bottom,left,right}` | μm；省略则零边距（边距由模板 HTML padding 控制） |
| `pageRanges` | `[{from,to}]` | 页码范围，从 1 开始 |

`print.submitHtml` 的 payload：`{ html, paperMm: {width,height}（毫米）, continuous?, pageCount?, templateName?, print }`。
出图规格（纸张、零边距、保留背景、`preferCSSPageSize: false`）与超时由 core 统一给出，客户端只负责载入文档与 `printToPDF`。
> 已知缺口：`print` 中的 `color` 与 `pageRanges` 会被校验通过，但 PDF→系统打印链路未应用这两个参数。
宿主用 `@worm-vue3-print/core/browser` 的 `renderHtmlPages` 在浏览器页内完成两遍渲染后提交，纸张/方向/边距/连续纸高度已固化进 HTML，`print` 字段只允许 `printerName`、`copies`、`paperName`、`color`、`pageRanges`；传 `paperSize`/`margins`/`landscape` 返回 `INVALID_REQUEST`。HTML 载荷上限 20MB。

错误码：`INVALID_REQUEST`、`UNAUTHORIZED`、`PRINTER_NOT_FOUND`、`PRINTER_OFFLINE`、`PRINT_FAILED`、`BUSY`、`RENDER_TIMEOUT`、`INTERNAL`。

## 安全

- 默认**仅绑定回环** `127.0.0.1`，本机页面即可直连，安全开关默认关闭。
- 在设置中开启安全开关后：
  - 首次开启自动生成 32 字节配对 token；SDK 连接 URL 需携带 `?token=<token>`（或 `client.pair(token)` 后重连）。
  - Origin 白名单非空时，握手同时校验浏览器 `Origin`；留空则只校验 token。
- token 不明文进日志。

## 连续纸（热敏/标签）纸长策略

仅对模板 **`paperSize: 'CONTINUOUS'`（连续纸）** 生效，普通纸一律使用模板纸张：

1. 任务显式传 `print.paperSize.height`（μm，正数）时优先采用（逃生门覆盖）。
2. 否则由 `core/browser` 用**浏览器布局探针**推导：把单页最终 HTML 载入离屏 iframe，遍历内容区后代取相对纸顶的最大底边（动态表格、表下跟随区/合计签名均由引擎如实布局），再加 footer 高与模板底边距，最小钳制 1 英寸（25.4mm）。
3. 推导高度统一写入最终 HTML 的 `@page`、`.print-page`、footer 定位，以及出纸 `pageSize.height`，四者同源，避免末尾多走纸/裁切（p4）。
4. 连续纸真机走纸公差受驱动影响，精度需现场验证；不满足时用方式 1 显式覆盖。

## 设计器中的连续纸

在页面属性纸张下拉选择「连续纸」：默认纸宽 80mm（可改为 58/76 等）、设计高度固定 297mm、强制纵向；「下」边距即连续纸末尾走纸留白（默认 0，可配）。

## 配置 / 日志 / 任务记录文件位置

`app.getPath('userData')`：

- macOS：`~/Library/Application Support/<应用名>/`（开发态为 `@worm-vue3-print`，绿色版为 `WormPrintClient`）
- Windows：`%APPDATA%\<应用名>\`
- Linux：`~/.config/<应用名>/`

其中 `config.json`（配置）、`jobs.jsonl`（最近 500 条任务）、`logs/client.log`（分级日志）。

### 排查用：保留生成的 PDF

出纸链路是「HTML → printToPDF → 系统命令打印 PDF」。默认生成的 PDF 落在系统临时目录、
打印完成（或失败）后即删除；需要在「PDF 生成」与「打印机/驱动」之间定位问题时，可在配置窗口
勾选**保留生成的 PDF**（`config.json` 的 `keepGeneratedPdf`），并可指定保存目录
（`pdfOutputDir`，留空为 `userData/pdf`）。

- 保留后每份 PDF 以 `jobId` 命名，任务记录（配置窗口「任务记录」页）会显示其绝对路径；
  配置项旁提供「打开目录」按钮。
- 判断口径：用 PDF 阅读器打开保留的 PDF，颜色/方向正确 → 问题在打印机或驱动；PDF 里就不对
  → 问题在渲染/PDF 生成环节。
- 开启后文件不会自动清理，请自行定期清理目录。

## 平台注意

- macOS：未签名应用首次需右键 → 打开；命令行启动可能出现「Unable to set login item」提示，为系统自启权限限制，不影响打印。
- Linux：依赖 CUPS 与 Electron 所需系统库（如 `libgtk-3-0` 等，按 electron-builder/启动报错安装）。
- 针式打印机：优先使用驱动预置纸型 `paperName`。
- 字体：模板使用的字体需在客户机已安装，否则回退字体可能改变测量高度。

## 真机验证清单

自动化测试覆盖协议/编解码/校验/串行锁/连续纸分页与 CSS/纸高组合函数/安全纯函数/WS 回环；以下需现场确认：

- [x] macOS：启动、托盘、回环 hello、打印机枚举（本机已验证，`HP_OfficeJet_Pro_8020_series`）。
- [ ] macOS：A4 测试页出纸（含 `{printDate}` 替换）、指定打印机/份数、任务记录与日志实时刷新。
- [ ] macOS：安全开关开/关两路径（无 token 拒绝、带 token 成功、白名单）。
- [ ] Windows 10/11：绿色目录启动、默认打印机、中文打印机名、针式 `paperName`。
- [ ] Linux（Ubuntu 桌面）：绿色目录启动、CUPS 打印、缺库按提示安装。
- [ ] 连续纸 58/80mm：探针推导高度出纸，检查末尾留白/走纸公差；不满足时显式 `paperSize.height` 覆盖。
- [ ] 脱机/缺纸：返回 `PRINTER_OFFLINE`/`PRINT_FAILED`，记录可查、锁释放可再次打印。
