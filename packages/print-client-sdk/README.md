# @worm-vue3-print/client

worm-vue3-print 静默打印桌面客户端的浏览器端 SDK。宿主 Web 系统通过它连接本机运行的打印客户端，完成打印机枚举与静默打印，无需浏览器打印对话框、不依赖浏览器插件。

- 框架无关：纯 TypeScript，无 Vue/React 依赖
- 自动发现：默认从 `127.0.0.1:17521` 起端口探测，无需用户填写端口
- 自动重连：客户端重启后自动恢复连接，可监听状态
- 连续纸：模板 `paperSize: 'CONTINUOUS'` 时，出纸高度由客户端按渲染内容自动推导

## 前置条件

终端电脑已安装并运行 **worm-vue3-print 桌面打印客户端**（Electron，Windows / Linux / macOS）。客户端仅监听 `127.0.0.1`，SDK 必须与客户端在同一台电脑的浏览器中运行。

## 安装

```bash
npm i @worm-vue3-print/client
```

## 最小示例

```ts
import { PrintClient, WormPrintError } from '@worm-vue3-print/client'

const client = new PrintClient()
client.onStatusChange(s => console.log('客户端状态：', s))

// 自动探测端口并握手；客户端未启动时抛 CLIENT_NOT_RUNNING
await client.connect()

const printers = await client.listPrinters()

// 模板 paperSize 已设为 CONTINUOUS（customWidth 80mm）：无需传 paperSize，
// 客户端按渲染内容自动推导纸高
await client.print(templateJson, { orderNo: 'A001' }, {
  printerName: printers[0]?.name,
  copies: 1,
})

// 固定纸长（逃生门）：paperSize: { height: 200000 }；改纸宽：{ width: 58000 }
// 长度单位均为微米（1mm = 1000μm）
```

完整签名：

```ts
client.print(
  templateJson: Record<string, unknown>, // core 模板 JSON
  printData?: Record<string, unknown>,   // 业务数据
  options?: {
    printerName?: string                 // 缺省走系统默认打印机
    copies?: number
    paperName?: string                   // 驱动纸型名（针式打印机优先）
    paperSize?: { width?: number; height?: number } // 微米覆盖项
    landscape?: boolean
    color?: boolean
    margins?: { top: number; bottom: number; left: number; right: number }
    pageRanges?: Array<{ from: number; to: number }>
    baseUrl?: string                     // 相对路径图片资源基址
    timeoutMs?: number                   // 单次打印超时（大任务可放宽）
  },
): Promise<{ jobId: string }>
```

## 打印配置缓存建议

打印机、份数、纸张等「打印配置」由宿主系统维护。建议在宿主侧按模板保存：

```ts
// localStorage：模板 ID → PrintOptions
localStorage.setItem(`print:cfg:${templateId}`, JSON.stringify({
  printerName: '热敏-80',
  copies: 1,
}))
```

每次打印时读取并随任务携带，客户端不持久化任何业务打印配置。

## 安全配对

客户端默认关闭安全开关（开箱即用，仅绑定回环）。在共享电脑或不可信网页环境，可在客户端配置窗口开启安全开关，开启后：

1. 客户端生成随机配对 token，在配置窗口展示；
2. 宿主页面调用一次 `pair(token)`（token 存入浏览器 localStorage，后续自动携带）：

```ts
client.pair('粘贴配置窗口展示的 token')
```

未配对或 token 错误的连接会被客户端直接拒绝（`UNAUTHORIZED`）。

## 自动重连与状态

- 连接断开（客户端重启等）时 SDK 自动指数退避重连（1s 起，上限 10s）；
- 断线期间发出的请求以 `CLIENT_NOT_RUNNING` 拒绝（客户端**不做离线排队**，请在宿主侧重试）；
- 通过 `onStatusChange` 监听 `'disconnected' | 'connecting' | 'connected'`，在 UI 提示客户端在线状态。

## 错误码

捕获 `WormPrintError`，按 `err.code` 程序化处理：

| code | 来源 | 含义 |
|---|---|---|
| `CLIENT_NOT_RUNNING` | SDK | 未发现/断开客户端，或连接被关闭 |
| `CLIENT_TIMEOUT` | SDK | 请求超时未响应 |
| `INVALID_REQUEST` | 客户端 | 请求格式/字段校验失败 |
| `UNAUTHORIZED` | 客户端 | 安全开关开启后 token/Origin 校验失败 |
| `PRINTER_NOT_FOUND` | 客户端 | 指定打印机不存在 |
| `PRINTER_OFFLINE` | 客户端 | 打印机离线/不可用 |
| `BUSY` | 客户端 | 已有任务打印中（客户端串行，不排队） |
| `RENDER_TIMEOUT` | 客户端 | 模板渲染超时（默认 30s） |
| `PRINT_FAILED` | 客户端 | 系统打印接口返回失败 |
| `INTERNAL` | 客户端 | 其他内部错误 |

```ts
try {
  await client.print(template, data, opts)
} catch (e) {
  if (e instanceof WormPrintError && e.code === 'BUSY') {
    // 提示稍后重试
  }
}
```

## License

MIT
