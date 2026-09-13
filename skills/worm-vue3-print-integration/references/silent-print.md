# 静默打印（桌面客户端链路）对接指南

链路 C = 浏览器页面 + 本机桌面打印客户端 + 物理打印机，实现**无打印对话框**的静默出纸（收银小票、热敏/标签、针式多联、批量无感打印）。

```
宿主 Web 页面
   │  @worm-vue3-print/client（SDK：端口探测/重连/超时/鉴权）
   ▼  WebSocket（仅绑定 127.0.0.1）
桌面打印客户端（Electron，clients/print-client）
   ├─ WsServer  握手鉴权 → 协议帧分发
   ├─ PrintEngine（串行锁，并发返回 BUSY）
   ├─ RenderEngine（IPC 桥 → 隐藏 worker：core/browser 两遍渲染 + 连续纸纸长推导）
   └─ 打印窗口 webContents.print({ silent: true }) → 系统打印机
```

- 渲染与静默打印都在本地客户端完成，断网可打（模板引用的在线图片 URL 除外）。
- 客户端默认从 `127.0.0.1:17521` 起监听，端口被占用则 +1；SDK 从同一起点逐端口探测握手。

## 1. 前置条件

1. 工位电脑已安装并运行**桌面打印客户端**（详见第 5 节打包与分发）。客户端仅监听回环地址，浏览器必须与客户端在同一台电脑。
2. 浏览器侧安装 SDK：

```bash
npm install @worm-vue3-print/client
```

SDK 框架无关（纯 TypeScript，无 Vue/React 依赖），当前版本 `0.1.0`。

## 2. 浏览器侧接入

### 连接、枚举、打印

```ts
import { PrintClient, WormPrintError } from '@worm-vue3-print/client'

const client = new PrintClient()
client.onStatusChange((s) => {
  // 'disconnected' | 'connecting' | 'connected'，用于 UI 提示客户端在线状态
})

// 自动探测端口并握手；客户端未启动抛 CLIENT_NOT_RUNNING
await client.connect()

const printers = await client.listPrinters()   // [{ name, isDefault, status }]

await client.print(templateJson, printData, {
  printerName: printers[0]?.name,             // 缺省走系统默认打印机
  copies: 1,
  // paperName: '…',                            // 驱动纸型名（针式打印机优先）
  // paperSize: { width: 58000 },               // 微米覆盖项；连续纸不必传 height
  // landscape, color, margins, pageRanges, baseUrl, timeoutMs
})
```

`print()` 完整签名：

```ts
client.print(
  templateJson: Record<string, unknown>,  // core 模板 JSON（getTemplateJson() 产物）
  printData?: Record<string, unknown>,    // 业务数据
  options?: {
    printerName?: string; copies?: number;
    paperName?: string;
    paperSize?: { width?: number; height?: number };  // 微米
    landscape?: boolean; color?: boolean;
    margins?: { top; bottom; left; right };            // 微米
    pageRanges?: Array<{ from; to }>;
    baseUrl?: string;      // 相对路径图片基址
    timeoutMs?: number;    // 单次打印超时
  },
): Promise<{ jobId: string }>
```

### 连续纸（热敏/标签）

模板 `paperSize: 'CONTINUOUS'`（设计器纸张下拉选「连续纸」，默认 80mm 宽）时，无需传 `paperSize.height`：
客户端把单页最终 HTML 载入离屏 iframe，由**真实浏览器布局探针**推导出纸高度（动态表格/合计签名均由引擎如实布局），
再统一写入最终 HTML 的 `@page`、`.print-page`、footer 与出纸 `pageSize.height`。

仅在驱动对自定义纸高有步进/舍入、真机走纸公差不满足时，用逃生门显式覆盖：

```ts
await client.print(templateJson, data, { paperSize: { width: 58000, height: 180000 } }) // 58mm × 180mm
```

长度单位一律为**微米 μm**（1mm = 1000μm）。

### 打印配置缓存建议

打印机、份数、纸张等「打印配置」由宿主系统维护，客户端不持久化业务打印配置。建议按模板保存于浏览器：

```ts
localStorage.setItem(`print:cfg:${templateId}`, JSON.stringify({ printerName: '热敏-80', copies: 1 }))
```

### 安全配对

客户端默认关闭安全开关（开箱即用，仅绑定回环）。共享电脑/不可信网页环境可在客户端配置窗口开启安全开关，开启后：

1. 客户端生成随机配对 token，在配置窗口展示；
2. 宿主页面调用一次 `pair(token)`（token 存浏览器 localStorage，后续自动携带）：

```ts
client.pair('粘贴配置窗口展示的 token')
```

未配对或 token 错误会被客户端直接拒绝（`UNAUTHORIZED`）。白名单非空时还校验浏览器 `Origin`。

### 自动重连

- 断线后 SDK 指数退避重连（1s 起，上限 10s），客户端重启后自动恢复。
- 断线期间发出的请求以 `CLIENT_NOT_RUNNING` 拒绝；客户端**不做离线排队**，请在宿主侧重试。

## 3. 错误码

捕获 `WormPrintError`，按 `err.code` 程序化处理：

| code | 来源 | 含义 |
|---|---|---|
| `CLIENT_NOT_RUNNING` | SDK | 未发现/断开客户端，或连接被关闭 |
| `CLIENT_TIMEOUT` | SDK | 请求超时未响应 |
| `INVALID_REQUEST` | 客户端 | 请求格式/字段校验失败 |
| `UNAUTHORIZED` | 客户端 | 安全开关开启后 token/Origin 校验失败 |
| `PRINTER_NOT_FOUND` | 客户端 | 指定打印机不存在 |
| `PRINTER_OFFLINE` | 客户端 | 打印机离线/不可用 |
| `BUSY` | 客户端 | 已有任务打印中（客户端串行，不排队）→ 宿主延时重试 |
| `RENDER_TIMEOUT` | 客户端 | 模板渲染超时（默认 30s） |
| `PRINT_FAILED` | 客户端 | 系统打印接口返回失败 |
| `INTERNAL` | 客户端 | 其他内部错误 |

```ts
try {
  await client.print(template, data, opts)
} catch (e) {
  if (e instanceof WormPrintError && e.code === 'BUSY') {
    // 提示稍后重试，或宿主侧入队
  }
}
```

## 4. 宿主清单要点

- 前端：业务打印入口在取到 `{templateJson, printData, baseUrl}` 后，可直连本机客户端执行静默打印，无需后端参与出纸（与链路 A 数据包一致）；打印配置随任务下发。
- 后端：链路 C 与链路 A 共用「渲染数据组装」功能，无额外后端职责。
- 高并发工位：客户端单任务串行，由宿主前端负责排队/重试（`BUSY`）。

## 5. 客户端部署与分发

客户端是 monorepo 内私有工作区包 `clients/print-client`（Electron，**不发布 npm**）。

```bash
# 仓库根：先构建 core 与 SDK dist，再 electron-builder --mac --win
npm run pack:client

# 绿色目录版（免安装）
npm run pack:client:dir
```

- macOS：`clients/print-client/dist/mac-arm64/*.dmg|*.zip`（Apple Silicon）/ `dist/mac/*`（Intel）；绿色版为 `dist/mac/WormPrintClient.app`。
- Windows：`dist/win-unpacked/` + `*.exe`（NSIS 安装程序）；Linux 只能在 Linux 上构建 `dist/linux-unpacked/`。
- 产物默认无签名 + Electron 默认图标；分发前需补充 `build/` 图标资源与签名证书。
- 客户端闭环说明、WebSocket 协议、连续纸纸长策略、配置/日志/任务记录文件位置见 [`clients/print-client/README.md`](../../../clients/print-client/README.md)。

## 6. 常见排查

- **`CLIENT_NOT_RUNNING`**：客户端未启动/端口探测失败。检查工位电脑托盘是否运行客户端；确认浏览器与客户端同机（仅回环）。
- **`UNAUTHORIZED`**：安全开关开启后未 `pair(token)`，或 Origin 不在白名单。
- **`PRINTER_NOT_FOUND`**：打印机名不在枚举列表，先 `listPrinters()` 拿真实名称。
- **`BUSY`**：上一任务未完成，宿主延时重试即可。
- **中文/样式与预览不一致**：模板字体需在客户端所在电脑已安装（回退字体可能改变测量高度，进而影响分页/纸长推导）。
- **连续纸末尾留白/裁切**：驱动对自定义纸高有步进/舍入时，用 `paperSize.height` 显式覆盖；纸宽用 `width`。