# 静默打印桌面客户端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个 Electron 跨平台（Win/Linux/Mac）静默打印桌面客户端与浏览器端 SDK：宿主页面经本机 WebSocket 下发「模板 JSON + 数据」，客户端本地用 core 同构管线渲染并调用 `webContents.print({ silent: true })` 静默出纸。

**Architecture:** Electron 主进程启动仅绑定 `127.0.0.1` 的 `ws` 服务；隐藏渲染窗口分两个职责——常驻 worker 窗口（**sandbox + contextIsolation + 专用 preload**，不开启 nodeIntegration）跑 core 两遍渲染生成最终 HTML，经自定义 `wormprint://` protocol 载入打印窗口后静默打印；协议类型/错误码定义在 SDK 包，客户端 import 同一份类型。连续纸（`paperSize: 'CONTINUOUS'`，热敏/标签）由 core 与设计器原生支持：设计高度默认 297mm、可配连续纸底边距，出纸时按渲染测量总高（含底边距）推导纸高，显式高度可覆盖。单任务串行锁，无队列。

**Tech Stack:** Electron 37、electron-vite 3、Vue 3.5（仅配置窗口）、ws 8、TypeScript 5.9、Vitest 3、tsup 8（SDK 打包）、`@worm-vue3-print/core` workspace 依赖（条码由 core/browser 的 jsbarcode + qrcode 渲染，客户端不直接依赖 bwip-js）。

**Spec:** `docs/superpowers/specs/2026-09-12-print-client-design.md`（执行任务时 spec 与本计划同时阅读）

## Global Constraints

- 所有回复、注释、提交信息使用简体中文；标识符保留英文。
- monorepo npm workspaces；客户端代码在 `clients/print-client`（private，包名 `@worm-vue3-print/print-client`）；SDK 在 `packages/print-client-sdk`（发布名 `@worm-vue3-print/client`）。
- 依赖方向：`core`（纯逻辑）← `client-sdk`（协议类型）← `print-client`（Electron）；禁止反向依赖，禁止 core 依赖 Vue/Electron。
- Node 引擎 `>=20`；TypeScript `~5.9.3`；strict 模式；测试命令统一 `vitest run`。
- WebSocket 仅绑定 `127.0.0.1`；默认端口 `17521`，占用时 +1 重试，上限 20 个端口。
- 安全开关（Origin 白名单 + 配对 token）默认关闭；开启后 token 经连接 URL `?token=` 携带，握手前校验。
- 渲染超时 30 秒；任务并发拒绝并返回 `BUSY`；不做本地队列/离线缓存。
- 纸长策略：模板 `paperSize==='CONTINUOUS'`（连续纸）时，`print.paperSize.height` 显式传入优先；否则用第一遍测量内容总高（mm，含模板底边距）推导；宽度取 `print.paperSize.width` 或模板纸宽（默认 80mm）。普通纸始终取模板纸张，除非显式覆盖。
- 长度单位：协议/`webContents.print` 一律微米（1mm = 1000μm），core 内部为 mm。
- 任务记录 JSONL 环形保留最近 500 条；日志默认 info 级别。
- 配置窗口用 Vue 3 原生控件，不引入任何 UI 组件库（对齐 print-canvas 约定）。
- 每个任务结束必须真实运行其测试/构建命令并通过后才提交；提交粒度按任务。
- 本计划只交付绿色目录版（`electron-vite build` 产物可运行），安装包/签名/自动更新不在范围内。

---

## File Structure

### 新增包 `packages/print-client-sdk/`（框架无关纯 TS 浏览器 SDK）

| 文件 | 职责 |
|---|---|
| `package.json` | 包名 `@worm-vue3-print/client`，tsup 打包 ESM+CJS |
| `tsconfig.json` / `tsup.config.ts` | 构建配置（对齐 print-core） |
| `src/protocol.ts` | **协议唯一事实源**：帧类型、消息 payload 类型、错误码、编解码与校验 |
| `src/protocol.test.ts` | 协议编解码单测 |
| `src/transport.ts` | WebSocket 封装：端口探测连接、发请求、超时、自动重连、状态事件 |
| `src/transport.test.ts` | mock WebSocket 单测 |
| `src/print-client.ts` | 对外类 `PrintClient`：connect/listPrinters/print/pair/onStatusChange |
| `src/index.ts` | 公共导出 |
| `README.md` | 宿主集成说明 |

### 新增应用 `clients/print-client/`（Electron，private）

| 文件 | 职责 |
|---|---|
| `package.json` / `tsconfig.json` / `electron.vite.config.ts` | 工程配置（main / preload / renderer / worker 四入口） |
| `src/main/index.ts` | 应用入口：单实例锁、`whenReady` 装配各模块、优雅退出 |
| `src/main/config.ts` | userData 下 `config.json` 读写、默认值、校验 |
| `src/main/logger.ts` | 分级日志：控制台 + 文件 + 向配置窗口广播 |
| `src/main/job-history.ts` | 任务记录 JSONL 环形 500 条 |
| `src/main/ws-server.ts` | `ws` 服务：回环绑定、端口递增、连接生命周期、Origin/token 校验 |
| `src/main/protocol-handler.ts` | 按 type 分发 `hello` / `printers.list` / `print.submit`，统一错误包装 |
| `src/main/printer-service.ts` | `webContents.getPrintersAsync()` 封装与打印机存在性校验 |
| `src/main/renderer-pool.ts` | 常驻 worker 隐藏窗口 + 每任务打印窗口的创建/重建 |
| `src/main/render-engine.ts` | 两遍渲染编排、30s 超时、纸高推导（纯函数导出供单测） |
| `src/main/print-engine.ts` | 串行锁 + 渲染 + `webContents.print` 静默出纸 + 记录落盘 |
| `src/main/tray.ts` | 系统托盘菜单 |
| `src/main/main-window.ts` | 配置窗口创建与 IPC 注册 |
| `src/worker/index.html` / `worker.ts` | 沙箱化隐藏页（sandbox + contextIsolation，经 `worker-preload` 暴露 `wormRender`）：import core，执行两遍渲染，返回最终 HTML 与测量总高 |
| `src/preload/worker-preload.ts` | worker 专用 preload：仅暴露 `renderPages(spec)` IPC 桥 |
| `src/preload/index.ts` | 配置窗口 contextBridge API |
| `src/renderer/index.html` / `main.ts` / `App.vue` | 配置窗口 UI（设置/任务记录/日志/测试打印） |
| `README.md` | 客户端说明（含绿色版运行、三平台注意事项） |

### 修改根仓库

- `package.json`：workspaces 增加 `"clients/*"`。

---

## Task 1: SDK 协议层（类型/错误码/编解码，唯一事实源）

**Files:**
- Modify: `package.json`（根 workspaces）
- Create: `packages/print-client-sdk/package.json`
- Create: `packages/print-client-sdk/tsconfig.json`
- Create: `packages/print-client-sdk/tsup.config.ts`
- Create: `packages/print-client-sdk/src/protocol.ts`
- Create: `packages/print-client-sdk/src/protocol.test.ts`
- Create: `packages/print-client-sdk/src/index.ts`（本任务仅导出协议，Task 2 扩充）

**Interfaces:**
- Consumes: 无（本任务是依赖根）。
- Produces（后续所有任务依赖，名称不可再变）：
  - 错误码联合 `ProtocolErrorCode`：`'INVALID_REQUEST' | 'UNAUTHORIZED' | 'PRINTER_NOT_FOUND' | 'PRINTER_OFFLINE' | 'BUSY' | 'RENDER_TIMEOUT' | 'PRINT_FAILED' | 'INTERNAL'`；SDK 侧另有 `'CLIENT_TIMEOUT' | 'CLIENT_NOT_RUNNING'`（仅客户端本地产生，服务端不会发送）。
  - `ClientRequest<T>`、`ServerResponse<T>`、`PrinterInfo`、`PrintOptions`、`PrintSubmitRequest`、各消息 payload 类型（见代码）。
  - 常量 `APP_ID = 'worm-print-client'`、`DEFAULT_PORT = 17521`、`PORT_SCAN_LIMIT = 20`。
  - 函数 `encodeRequest(type, payload): string`（JSON，自动生成 id）、`decodeServerMessage(raw: string): ServerResponse | { malformed: true }`（不抛异常）。

- [ ] **Step 1: 根 workspaces 登记 `clients/*`**

修改根 `package.json` 的 `workspaces`：

```json
  "workspaces": [
    "packages/*",
    "services/*",
    "clients/*"
  ],
```

- [ ] **Step 2: 创建 SDK 包配置**

`packages/print-client-sdk/package.json`：

```json
{
  "name": "@worm-vue3-print/client",
  "version": "0.1.0",
  "type": "module",
  "description": "worm-vue3-print 静默打印桌面客户端的浏览器端 SDK（WebSocket 连接/打印机枚举/静默打印）",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "license": "MIT",
  "keywords": ["print", "silent-print", "electron", "websocket", "worm-vue3-print"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "~5.9.3",
    "vitest": "^3.0.0"
  }
}
```

`packages/print-client-sdk/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`packages/print-client-sdk/tsup.config.ts`：

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
```

- [ ] **Step 3: 写失败测试 `src/protocol.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  APP_ID,
  DEFAULT_PORT,
  encodeRequest,
  decodeServerMessage,
} from './protocol.js'

describe('encodeRequest', () => {
  it('生成带唯一 id 的 JSON 帧', () => {
    const a = JSON.parse(encodeRequest('hello', {}))
    const b = JSON.parse(encodeRequest('hello', {}))
    expect(a).toMatchObject({ type: 'hello', payload: {} })
    expect(typeof a.id).toBe('string')
    expect(a.id.length).toBeGreaterThan(0)
    expect(a.id).not.toBe(b.id)
  })
})

describe('decodeServerMessage', () => {
  it('解析成功响应', () => {
    const msg = decodeServerMessage(
      JSON.stringify({ id: '1', ok: true, payload: { app: APP_ID, version: '0.1.0', port: DEFAULT_PORT } }),
    )
    expect(msg).toEqual({
      id: '1',
      ok: true,
      payload: { app: 'worm-print-client', version: '0.1.0', port: 17521 },
    })
  })

  it('解析失败响应', () => {
    const msg = decodeServerMessage(
      JSON.stringify({ id: '2', ok: false, error: { code: 'BUSY', message: '打印中' } }),
    )
    expect(msg).toMatchObject({ id: '2', ok: false })
    if (!('ok' in msg) || msg.ok) throw new Error('应为失败响应')
    expect(msg.error.code).toBe('BUSY')
  })

  it('非法 JSON 或结构缺失返回 malformed，不抛异常', () => {
    expect(decodeServerMessage('not-json')).toEqual({ malformed: true })
    expect(decodeServerMessage(JSON.stringify({ id: '3' }))).toEqual({ malformed: true })
    expect(decodeServerMessage(JSON.stringify({ ok: true, payload: {} }))).toEqual({ malformed: true })
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npm install -w @worm-vue3-print/client && npm run test -w @worm-vue3-print/client`
Expected: FAIL，报 `Cannot find module './protocol.js'`。

- [ ] **Step 5: 实现 `src/protocol.ts`**

```ts
// 客户端与桌面端共享的 WebSocket 协议唯一事实源。
// 帧：请求 { id, type, payload }；响应 { id, ok, payload | error }。

export const APP_ID = 'worm-print-client'
export const DEFAULT_PORT = 17521
export const PORT_SCAN_LIMIT = 20

/** 服务端可能返回的错误码 */
export type ServerErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'PRINTER_NOT_FOUND'
  | 'PRINTER_OFFLINE'
  | 'BUSY'
  | 'RENDER_TIMEOUT'
  | 'PRINT_FAILED'
  | 'INTERNAL'

/** SDK 本地产生的错误码（服务端不会发送） */
export type ClientErrorCode = 'CLIENT_TIMEOUT' | 'CLIENT_NOT_RUNNING'

export type ProtocolErrorCode = ServerErrorCode | ClientErrorCode

// ─── 基础帧 ───

export interface ClientRequest<T = unknown> {
  id: string
  type: string
  payload: T
}

export interface ServerOk<T = unknown> {
  id: string
  ok: true
  payload: T
}

export interface ServerError {
  id: string
  ok: false
  error: { code: ServerErrorCode; message: string }
}

export type ServerResponse<T = unknown> = ServerOk<T> | ServerError

/** 无法解析的服务端消息 */
export interface MalformedMessage {
  malformed: true
}

// ─── 业务消息 payload ───

export interface PrinterInfo {
  name: string
  isDefault: boolean
  /** 系统返回的打印机状态描述（如 idle、offline），无信息时为空串 */
  status: string
}

export interface HelloRequestPayload {}

export interface HelloResponsePayload {
  app: typeof APP_ID
  version: string
  port: number
}

export interface PrintersListResponsePayload {
  printers: PrinterInfo[]
}

/** 打印参数；长度单位均为微米（1mm = 1000μm） */
export interface PrintOptions {
  /** 缺省走系统默认打印机 */
  printerName?: string
  copies?: number
  /** 打印机驱动内已配置纸型名，针式打印机优先使用 */
  paperName?: string
  /**
   * 纸张覆盖项（微米）。
   * - 普通模板：缺省（或仅给 width）时以模板自带纸张（getPaperDimensions）为准；
   * - 连续纸模板（templateJson.paperSize === 'CONTINUOUS'）：高度缺省或 <=0 时按渲染测量内容高度
   *   ＋连续纸底边距推导实际纸高；显式 height>0 为配置覆盖（逃生门）。
   *   宽度缺省取模板 customWidth（默认 80mm）。
   */
  paperSize?: { width?: number; height?: number }
  landscape?: boolean
  /**
   * 页边距覆盖（微米）；缺省使用模板 margins。
   * 连续纸的末尾留白由模板连续纸底边距（默认 0）控制，已计入推导纸高。
   */
  margins?: { top: number; bottom: number; left: number; right: number }
  color?: boolean
  pageRanges?: Array<{ from: number; to: number }>
}

/** print.submit 请求 payload；templateJson 结构由 core 定义，这里保持松散耦合 */
export interface PrintSubmitRequest {
  templateJson: Record<string, unknown>
  printData?: Record<string, unknown>
  /** 相对路径图片资源解析基址 */
  baseUrl?: string
  print: PrintOptions
}

export interface PrintSubmitResponsePayload {
  jobId: string
}

// ─── 消息 type 常量 ───

export const MESSAGE_TYPES = {
  HELLO: 'hello',
  PRINTERS_LIST: 'printers.list',
  PRINT_SUBMIT: 'print.submit',
} as const

// ─── 编解码 ───

let seq = 0
function nextId(): string {
  seq = (seq + 1) % Number.MAX_SAFE_INTEGER
  return `${Date.now().toString(36)}-${seq.toString(36)}`
}

/** 编码请求帧为 JSON 字符串 */
export function encodeRequest<T>(type: string, payload: T): string {
  const frame: ClientRequest<T> = { id: nextId(), type, payload }
  return JSON.stringify(frame)
}

/** 解码服务端消息；任何非法输入统一返回 { malformed: true }，不抛异常 */
export function decodeServerMessage(raw: string): ServerResponse | MalformedMessage {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { malformed: true }
  }
  if (typeof data !== 'object' || data === null) return { malformed: true }
  const obj = data as Record<string, unknown>
  if (typeof obj.id !== 'string' || typeof obj.ok !== 'boolean') return { malformed: true }
  if (obj.ok) {
    return { id: obj.id, ok: true, payload: (obj.payload ?? {}) as unknown }
  }
  const err = obj.error as Record<string, unknown> | undefined
  if (!err || typeof err.code !== 'string' || typeof err.message !== 'string') {
    return { malformed: true }
  }
  return {
    id: obj.id,
    ok: false,
    error: { code: err.code as ServerErrorCode, message: err.message },
  }
}
```

`src/index.ts`：

```ts
export * from './protocol.js'
```

- [ ] **Step 6: 运行测试确认通过，并做类型检查与构建**

Run: `npm run test -w @worm-vue3-print/client`
Expected: PASS（3 个 describe 用例全绿）。

Run: `npm run build -w @worm-vue3-print/client`
Expected: `dist/` 产出 `index.js`、`index.cjs`、`index.d.ts`，无 TS 报错。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json packages/print-client-sdk
git commit -m "feat(client-sdk)：新增协议层（消息类型/错误码/编解码）"
```

---

## Task 2: SDK 传输层（端口探测、请求响应、自动重连）

**Files:**
- Create: `packages/print-client-sdk/src/transport.ts`
- Create: `packages/print-client-sdk/src/errors.ts`
- Create: `packages/print-client-sdk/src/transport.test.ts`
- Modify: `packages/print-client-sdk/src/index.ts`（追加导出）

**Interfaces:**
- Consumes: Task 1 的 `encodeRequest`、`decodeServerMessage`、`DEFAULT_PORT`、`PORT_SCAN_LIMIT`、`MESSAGE_TYPES`、`HelloResponsePayload`、`ServerResponse`、`ProtocolErrorCode`。
- Produces:
  - `class WormPrintError extends Error { code: ProtocolErrorCode }`（errors.ts）。
  - `type TransportStatus = 'disconnected' | 'connecting' | 'connected'`。
  - `interface TransportOptions { token?: string; timeoutMs?: number; ports?: number[] }`。
  - `class WsTransport`：
    - `constructor(opts?: TransportOptions)`
    - `readonly status: TransportStatus`
    - `onStatus(cb: (s: TransportStatus) => void): () => void`（返回退订函数）
    - `connect(signal?: AbortSignal): Promise<HelloResponsePayload>`（依次探测端口，成功后启动自动重连）
    - `request<T>(type: string, payload: unknown, timeoutMs?: number): Promise<T>`（连接未建立时 reject `CLIENT_NOT_RUNNING`；超时 reject `CLIENT_TIMEOUT`；服务端错误 reject `WormPrintError(code)`）
    - `setToken(token: string | undefined): void`
    - `close(): void`（用户主动关闭，不触发自动重连）

- [ ] **Step 1: 写失败测试 `src/transport.test.ts`**

测试通过注入假 WebSocket 构造器完成，不依赖真实端口。先在文件顶部定义测试替身：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WsTransport } from './transport.js'
import { WormPrintError } from './errors.js'
import { MESSAGE_TYPES } from './protocol.js'

// ─── 最小 WebSocket 替身 ───
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static failAll = false
  static lastToken: string | undefined
  url: string
  readyState = 0 // WebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  // 测试辅助：模拟服务端
  open() { this.readyState = 1; this.onopen?.() }
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
  closeRemote() { this.readyState = 3; this.onclose?.() }
  send(data: string) {
    this.sent.push(data)
    const frame = JSON.parse(data)
    if (frame.type === MESSAGE_TYPES.HELLO) {
      queueMicrotask(() => this.emit({
        id: frame.id, ok: true,
        payload: { app: 'worm-print-client', version: '0.1.0', port: Number(new URL(this.url).port) },
      }))
    }
  }
}

function setupTransport(opts?: { timeoutMs?: number; token?: string }) {
  FakeWebSocket.instances = []
  FakeWebSocket.failAll = false
  return new WsTransport({
    ...opts,
    // @ts-expect-error 注入测试替身
    WebSocketCtor: FakeWebSocket,
  })
}
```

补三条用例（与上面替身同文件）：

```ts
beforeEach(() => { vi.useRealTimers() })

describe('WsTransport.connect', () => {
  it('首个端口握手失败时自动探测下一端口，直到成功', async () => {
    const t = setupTransport()
    const p = t.connect()
    // 第一个端口直接失败（客户端未运行）
    FakeWebSocket.instances[0]!.onerror?.(new Event('error'))
    FakeWebSocket.instances[0]!.closeRemote()
    // 第二个端口成功
    FakeWebSocket.instances[1]!.open()
    const hello = await p
    expect(hello.app).toBe('worm-print-client')
    expect(hello.port).toBe(17522)
    expect(t.status).toBe('connected')
  })

  it('全部端口失败时以 CLIENT_NOT_RUNNING 拒绝', async () => {
    const t = setupTransport()
    // 只探测 2 个端口以加速用例
    const p = t.connect()
    // @ts-expect-error 直接驱动内部：所有候选端口均失败
    await expect(p).rejects.toMatchObject({ code: 'CLIENT_NOT_RUNNING' })
  })

  it('开启 token 时连接 URL 携带查询参数', async () => {
    const t = setupTransport({ token: 'abc123' })
    const p = t.connect()
    expect(FakeWebSocket.instances[0]!.url).toContain('token=abc123')
    FakeWebSocket.instances[0]!.open()
    await p
  })
})

describe('WsTransport.request', () => {
  async function connectedTransport() {
    const t = setupTransport({ timeoutMs: 1000 })
    const p = t.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    return { t, ws: FakeWebSocket.instances[0]! }
  }

  it('成功响应按 id 匹配并 resolve payload', async () => {
    const { t, ws } = await connectedTransport()
    const pending = t.request<{ printers: [] }>(MESSAGE_TYPES.PRINTERS_LIST, {})
    const frame = JSON.parse(ws.sent.find(s => s.includes('printers.list'))!)
    ws.emit({ id: frame.id, ok: true, payload: { printers: [] } })
    await expect(pending).resolves.toEqual({ printers: [] })
  })

  it('服务端错误响应 reject 为带 code 的 WormPrintError', async () => {
    const { t, ws } = await connectedTransport()
    const pending = t.request(MESSAGE_TYPES.PRINT_SUBMIT, {})
    const frame = JSON.parse(ws.sent.at(-1)!)
    ws.emit({ id: frame.id, ok: false, error: { code: 'BUSY', message: '打印中' } })
    await expect(pending).rejects.toBeInstanceOf(WormPrintError)
    await expect(pending).rejects.toMatchObject({ code: 'BUSY' })
  })

  it('超时未响应以 CLIENT_TIMEOUT 拒绝', async () => {
    vi.useFakeTimers()
    const { t } = await connectedTransport()
    const pending = t.request(MESSAGE_TYPES.PRINTERS_LIST, {}, 500)
    await vi.advanceTimersByTimeAsync(501)
    await expect(pending).rejects.toMatchObject({ code: 'CLIENT_TIMEOUT' })
  })
})
```

注：第二条「全部端口失败」用例若因时序不稳定，实现时以「传入 `ports: [9001, 9002]` 并让两个实例都立即 error/close」方式驱动（构造器支持 `ports` 覆盖），保持断言不变。

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/client`
Expected: FAIL，`Cannot find module './transport.js'`。

- [ ] **Step 3: 实现 `src/errors.ts`**

```ts
import type { ProtocolErrorCode } from './protocol.js'

/** 协议/SDK 错误：携带可程序化处理的错误码 */
export class WormPrintError extends Error {
  readonly code: ProtocolErrorCode
  constructor(code: ProtocolErrorCode, message: string) {
    super(message)
    this.name = 'WormPrintError'
    this.code = code
  }
}
```

- [ ] **Step 4: 实现 `src/transport.ts`**

```ts
import {
  DEFAULT_PORT,
  PORT_SCAN_LIMIT,
  encodeRequest,
  decodeServerMessage,
  type ClientRequest,
  type HelloResponsePayload,
  type ServerResponse,
} from './protocol.js'
import { WormPrintError } from './errors.js'

export type TransportStatus = 'disconnected' | 'connecting' | 'connected'

export interface TransportOptions {
  /** 安全开关开启后的配对 token */
  token?: string
  /** 请求默认超时（毫秒），默认 15000 */
  timeoutMs?: number
  /** 覆盖探测端口列表（测试用）；默认 DEFAULT_PORT 起连续 PORT_SCAN_LIMIT 个 */
  ports?: number[]
  /** 注入 WebSocket 构造器（测试用） */
  WebSocketCtor?: typeof WebSocket
}

interface PendingRequest {
  resolve: (payload: unknown) => void
  reject: (err: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

export class WsTransport {
  private ws: WebSocket | null = null
  private status_: TransportStatus = 'disconnected'
  private hello: HelloResponsePayload | null = null
  private pendings = new Map<string, PendingRequest>()
  private statusCbs = new Set<(s: TransportStatus) => void>()
  private manualClose = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private readonly ctor: typeof WebSocket
  private readonly defaultTimeout: number

  constructor(private readonly opts: TransportOptions = {}) {
    this.ctor = opts.WebSocketCtor ?? WebSocket
    this.defaultTimeout = opts.timeoutMs ?? 15_000
  }

  get status(): TransportStatus {
    return this.status_
  }

  onStatus(cb: (s: TransportStatus) => void): () => void {
    this.statusCbs.add(cb)
    return () => this.statusCbs.delete(cb)
  }

  setToken(token: string | undefined): void {
    this.opts = { ...this.opts, token }
  }

  /** 依次探测端口并完成 hello 握手；全部失败抛 CLIENT_NOT_RUNNING */
  async connect(signal?: AbortSignal): Promise<HelloResponsePayload> {
    if (this.status_ === 'connected' && this.hello) return this.hello
    this.setStatus('connecting')
    const ports = this.opts.ports
      ?? Array.from({ length: PORT_SCAN_LIMIT }, (_, i) => DEFAULT_PORT + i)

    for (const port of ports) {
      if (signal?.aborted) throw new WormPrintError('CLIENT_NOT_RUNNING', '连接已取消')
      try {
        this.hello = await this.tryPort(port, signal)
        this.manualClose = false
        this.reconnectAttempts = 0
        this.setStatus('connected')
        return this.hello
      } catch {
        // 该端口无客户端，继续探测下一个
      }
    }
    this.setStatus('disconnected')
    throw new WormPrintError(
      'CLIENT_NOT_RUNNING',
      '未发现运行中的打印客户端（已探测默认端口区间），请确认客户端已启动',
    )
  }

  /** 发送请求并等待同 id 响应 */
  request<T>(type: string, payload: unknown, timeoutMs?: number): Promise<T> {
    if (this.status_ !== 'connected' || !this.ws) {
      return Promise.reject(new WormPrintError('CLIENT_NOT_RUNNING', '打印客户端未连接'))
    }
    const raw = encodeRequest(type, payload)
    const frame = JSON.parse(raw) as ClientRequest
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendings.delete(frame.id)
        reject(new WormPrintError('CLIENT_TIMEOUT', `请求 ${type} 超时未响应`))
      }, timeoutMs ?? this.defaultTimeout)
      this.pendings.set(frame.id, {
        resolve: resolve as (p: unknown) => void,
        reject,
        timer,
      })
      this.ws!.send(raw)
    })
  }

  close(): void {
    this.manualClose = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.failAllPendings(new WormPrintError('CLIENT_NOT_RUNNING', '连接已关闭'))
    this.setStatus('disconnected')
  }

  // ─── 内部 ───

  private buildUrl(port: number): string {
    const url = new URL(`ws://127.0.0.1:${port}`)
    if (this.opts.token) url.searchParams.set('token', this.opts.token)
    return url.toString().replace(/\/$/, '')
  }

  private tryPort(port: number, signal?: AbortSignal): Promise<HelloResponsePayload> {
    return new Promise<HelloResponsePayload>((resolve, reject) => {
      const ws = new this.ctor(this.buildUrl(port))
      this.ws = ws
      let settled = false
      const onAbort = () => { if (!settled) { settled = true; reject(new Error('aborted')) } }
      signal?.addEventListener('abort', onAbort, { once: true })

      ws.onopen = () => {
        ws.send(encodeRequest('hello', {}))
      }
      ws.onmessage = (ev: MessageEvent) => {
        const msg = decodeServerMessage(String(ev.data))
        if ('malformed' in msg) return
        if (msg.ok && isHello(msg.payload)) {
          if (settled) return
          settled = true
          this.bindLifecycle(ws)
          resolve(msg.payload as HelloResponsePayload)
        } else if (!settled) {
          settled = true
          reject(new Error('握手失败'))
        }
      }
      ws.onerror = () => {
        if (!settled) { settled = true; reject(new Error('连接错误')) }
      }
      ws.onclose = () => {
        if (!settled) { settled = true; reject(new Error('连接关闭')) }
      }
    })
  }

  /** 握手成功后绑定正式生命周期（消息分发、掉线重连） */
  private bindLifecycle(ws: WebSocket): void {
    ws.onmessage = (ev: MessageEvent) => {
      const msg = decodeServerMessage(String(ev.data))
      if ('malformed' in msg || msg.ok === undefined) return
      const pending = this.pendings.get(msg.id)
      if (!pending) return
      this.pendings.delete(msg.id)
      clearTimeout(pending.timer)
      if (msg.ok) {
        pending.resolve(msg.payload)
      } else {
        pending.reject(new WormPrintError(msg.error.code, msg.error.message))
      }
    }
    ws.onclose = () => {
      this.failAllPendings(new WormPrintError('CLIENT_NOT_RUNNING', '与客户端的连接中断'))
      if (!this.manualClose) this.scheduleReconnect()
    }
    ws.onerror = () => { /* onclose 负责收尾，避免重复处理 */ }
  }

  private scheduleReconnect(): void {
    this.setStatus('connecting')
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts++, 10_000)
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => this.scheduleReconnect())
    }, delay)
  }

  private failAllPendings(err: unknown): void {
    for (const [, p] of this.pendings) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pendings.clear()
  }

  private setStatus(s: TransportStatus): void {
    if (this.status_ === s) return
    this.status_ = s
    for (const cb of this.statusCbs) cb(s)
  }
}

function isHello(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null
    && (payload as Record<string, unknown>).app === 'worm-print-client'
}
```

- [ ] **Step 5: 扩充 `src/index.ts`**

```ts
export * from './protocol.js'
export * from './errors.js'
export { WsTransport } from './transport.js'
export type { TransportOptions, TransportStatus } from './transport.js'
```

- [ ] **Step 6: 运行测试通过 + 构建**

Run: `npm run test -w @worm-vue3-print/client`
Expected: 全部 PASS（connect 3 条、request 3 条 + Task 1 用例）。
Run: `npm run build -w @worm-vue3-print/client`
Expected: 无报错，dist 正常产出。

- [ ] **Step 7: 提交**

```bash
git add packages/print-client-sdk
git commit -m "feat(client-sdk)：新增 WebSocket 传输层（端口探测/超时/自动重连）"
```

---

## Task 3: SDK 对外门面 `PrintClient` 与 README

**Files:**
- Create: `packages/print-client-sdk/src/print-client.ts`
- Create: `packages/print-client-sdk/src/print-client.test.ts`
- Modify: `packages/print-client-sdk/src/index.ts`
- Create: `packages/print-client-sdk/README.md`

**Interfaces:**
- Consumes: Task 2 `WsTransport`、`TransportStatus`；Task 1 `MESSAGE_TYPES`、`PrinterInfo`、`PrintSubmitRequest`、`PrintSubmitResponsePayload`、`PrintOptions`、`HelloResponsePayload`；core 类型在 SDK 中不直接依赖（templateJson 以 `Record<string, unknown>` 接收，保持 SDK 零运行时依赖）。
- Produces（宿主集成最终 API，README 与客户端均以此为准）：

```ts
interface PrintClientOptions {
  token?: string
  timeoutMs?: number
  autoReconnect?: boolean // 默认 true
}
class PrintClient {
  constructor(opts?: PrintClientOptions)
  readonly status: TransportStatus
  connect(signal?: AbortSignal): Promise<HelloResponsePayload>
  onStatusChange(cb: (s: TransportStatus) => void): () => void
  listPrinters(signal?: AbortSignal): Promise<PrinterInfo[]>
  print(
    templateJson: Record<string, unknown>,
    printData?: Record<string, unknown>,
    printOptions?: PrintOptions & { baseUrl?: string; timeoutMs?: number },
  ): Promise<{ jobId: string }>
  pair(token: string): void          // 持久化到 localStorage 并更新传输层
  static loadStoredToken(): string | null
  close(): void
}
```

- [ ] **Step 1: 写失败测试 `src/print-client.test.ts`**

复用 Task 2 的替身思路（本文件自带最小假 WebSocket，hello 自动应答，并按消息类型回打印机列表）：

```ts
import { describe, it, expect } from 'vitest'
import { PrintClient } from './print-client.js'
import { MESSAGE_TYPES } from './protocol.js'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  open() { this.readyState = 1; this.onopen?.() }
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
  send(data: string) {
    const frame = JSON.parse(data)
    queueMicrotask(() => {
      if (frame.type === MESSAGE_TYPES.HELLO) {
        this.emit({ id: frame.id, ok: true, payload: { app: 'worm-print-client', version: '0.1.0', port: 17521 } })
      } else if (frame.type === MESSAGE_TYPES.PRINTERS_LIST) {
        this.emit({ id: frame.id, ok: true, payload: { printers: [{ name: 'PDF', isDefault: true, status: 'idle' }] } })
      } else if (frame.type === MESSAGE_TYPES.PRINT_SUBMIT) {
        this.emit({ id: frame.id, ok: true, payload: { jobId: 'job-1' } })
      }
    })
  }
}

function makeClient() {
  FakeWebSocket.instances = []
  const client = new PrintClient({
    // @ts-expect-error 测试注入
    WebSocketCtor: FakeWebSocket,
  })
  return { client }
}

// 浏览器环境 localStorage 替身（happy-dom/vitest 默认提供；防御性兜底）
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  })
}

describe('PrintClient', () => {
  it('connect 后 listPrinters 返回打印机数组', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    const printers = await client.listPrinters()
    expect(printers).toEqual([{ name: 'PDF', isDefault: true, status: 'idle' }])
  })

  it('print 组装 print.submit payload 并返回 jobId', async () => {
    const { client } = makeClient()
    const p = client.connect()
    FakeWebSocket.instances[0]!.open()
    await p
    const ws = FakeWebSocket.instances[0]!
    const result = await client.print(
      { paperSize: 'A4' },
      { orderNo: 'A001' },
      { printerName: '热敏-80', copies: 2, baseUrl: 'http://example.com' },
    )
    expect(result.jobId).toBe('job-1')
    const submitFrame = JSON.parse(ws.sent ? '' : '') // sent 未定义时走下面直接拦截
    // 直接通过最后一帧断言 payload 结构
    expect(lastSubmitPayload(ws)).toMatchObject({
      templateJson: { paperSize: 'A4' },
      printData: { orderNo: 'A001' },
      baseUrl: 'http://example.com',
      print: { printerName: '热敏-80', copies: 2 },
    })
  })

  it('pair 写入 localStorage，重建客户端时自动带上 token', () => {
    const { client } = makeClient()
    client.pair('tok-xyz')
    expect(PrintClient.loadStoredToken()).toBe('tok-xyz')
    const { client: client2 } = makeClient()
    const p = client2.connect()
    expect(FakeWebSocket.instances.at(-1)!.url).toContain('token=tok-xyz')
    FakeWebSocket.instances.at(-1)!.open()
    return p
  })
})

// 测试辅助：从替身已发帧中取最后一个 print.submit 的 payload
function lastSubmitPayload(ws: FakeWebSocket & { sent?: string[] }): unknown {
  const sent = (ws as unknown as { sent: string[] }).sent ?? []
  const frames = sent.map(s => JSON.parse(s))
  return frames.find(f => f.type === MESSAGE_TYPES.PRINT_SUBMIT)?.payload
}
```

注意：替身需记录发送帧，实现测试时给 `FakeWebSocket` 增加 `sent: string[] = []`，在 `send` 内 `this.sent.push(data)`；上面「直接通过最后一帧断言」前的废弃两行（`submitFrame`）实现时删除，以 `lastSubmitPayload` 断言为准。

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/client`
Expected: FAIL，`Cannot find module './print-client.js'`。

- [ ] **Step 3: 实现 `src/print-client.ts`**

为支持测试注入，`PrintClientOptions` 增加内部字段 `WebSocketCtor?: typeof WebSocket`（不写进 README 公共文档，加 JSDoc 标注 `@internal`）。

```ts
import {
  WsTransport,
  type TransportOptions,
  type TransportStatus,
} from './transport.js'
import {
  MESSAGE_TYPES,
  type HelloResponsePayload,
  type PrinterInfo,
  type PrintOptions,
  type PrintSubmitRequest,
  type PrintSubmitResponsePayload,
  type PrintersListResponsePayload,
} from './protocol.js'

const TOKEN_STORAGE_KEY = 'worm-print-client:token'

export interface PrintClientOptions {
  /** 配对 token；不传则自动读取 localStorage 中 pair() 保存的值 */
  token?: string
  /** 单请求默认超时 ms，默认 15000 */
  timeoutMs?: number
  /** @internal 注入 WebSocket 构造器（测试用） */
  WebSocketCtor?: typeof WebSocket
}

export class PrintClient {
  private readonly transport: WsTransport

  constructor(opts: PrintClientOptions = {}) {
    const token = opts.token ?? PrintClient.loadStoredToken() ?? undefined
    const transportOpts: TransportOptions = {
      token,
      timeoutMs: opts.timeoutMs,
      WebSocketCtor: opts.WebSocketCtor,
    }
    this.transport = new WsTransport(transportOpts)
  }

  get status(): TransportStatus {
    return this.transport.status
  }

  /** 连接本机客户端（自动端口探测 + 掉线重连） */
  connect(signal?: AbortSignal): Promise<HelloResponsePayload> {
    return this.transport.connect(signal)
  }

  onStatusChange(cb: (s: TransportStatus) => void): () => void {
    return this.transport.onStatus(cb)
  }

  /** 枚举本机打印机 */
  async listPrinters(): Promise<PrinterInfo[]> {
    const res = await this.transport.request<PrintersListResponsePayload>(
      MESSAGE_TYPES.PRINTERS_LIST,
      {},
    )
    return res.printers
  }

  /**
   * 提交静默打印任务。
   * @param templateJson core 模板 JSON
   * @param printData 业务数据
   * @param options 打印机/纸张/份数等；baseUrl 为相对图片资源基址；timeoutMs 可单独放宽大任务
   */
  print(
    templateJson: Record<string, unknown>,
    printData?: Record<string, unknown>,
    options: PrintOptions & { baseUrl?: string; timeoutMs?: number } = {},
  ): Promise<PrintSubmitResponsePayload> {
    const { baseUrl, timeoutMs, ...print } = options
    const payload: PrintSubmitRequest = { templateJson, printData, baseUrl, print }
    return this.transport.request<PrintSubmitResponsePayload>(
      MESSAGE_TYPES.PRINT_SUBMIT,
      payload,
      timeoutMs,
    )
  }

  /** 保存配对 token（localStorage），并即时更新当前连接的鉴权参数（下次连接生效） */
  pair(token: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    this.transport.setToken(token)
  }

  static loadStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY)
    } catch {
      return null
    }
  }

  close(): void {
    this.transport.close()
  }
}
```

- [ ] **Step 4: 扩充 `src/index.ts`**

```ts
export * from './protocol.js'
export * from './errors.js'
export { WsTransport } from './transport.js'
export type { TransportOptions, TransportStatus } from './transport.js'
export { PrintClient } from './print-client.js'
export type { PrintClientOptions } from './print-client.js'
```

- [ ] **Step 5: 运行测试与构建**

Run: `npm run test -w @worm-vue3-print/client`
Expected: 全绿。
Run: `npm run build -w @worm-vue3-print/client`
Expected: 无报错。

- [ ] **Step 6: 写 `README.md`**

内容必须包含：安装（`npm i @worm-vue3-print/client`）、前置条件（桌面客户端运行中）、最小示例（connect → listPrinters → print 完整代码）、模板打印配置缓存建议（宿主侧 localStorage 保存「模板 ID → PrintOptions」）、错误码表（引自协议）、安全配对 `pair(token)` 用法、自动重连与状态监听说明。代码示例：

```ts
import { PrintClient, WormPrintError } from '@worm-vue3-print/client'

const client = new PrintClient()
client.onStatusChange(s => console.log('客户端状态：', s))
await client.connect()

const printers = await client.listPrinters()
// 模板 paperSize 已设为 CONTINUOUS（customWidth 80mm）：无需传 paperSize，客户端按内容自动推导纸高
await client.print(templateJson, { orderNo: 'A001' }, {
  printerName: printers[0]?.name,
  copies: 1,
})
// 需要固定纸长（逃生门）时：paperSize: { height: 200000 }；改纸宽：{ width: 58000 }
```

- [ ] **Step 7: 提交**

```bash
git add packages/print-client-sdk
git commit -m "feat(client-sdk)：新增对外 PrintClient 门面与集成文档"
```

---

## Task 4: Electron 工程骨架与配置模块

**Files:**
- Create: `clients/print-client/package.json`
- Create: `clients/print-client/tsconfig.json`
- Create: `clients/print-client/tsconfig.node.json`
- Create: `clients/print-client/electron.vite.config.ts`
- Create: `clients/print-client/vitest.config.ts`
- Create: `clients/print-client/src/main/config.ts`
- Create: `clients/print-client/src/main/config.test.ts`
- Create: `clients/print-client/src/main/index.ts`（本任务仅最小可启动入口，Task 6 扩充）

**Interfaces:**
- Consumes: 无（首个客户端任务）。
- Produces（后续任务依赖）：
  - `type LogLevel = 'debug' | 'info' | 'warn' | 'error'`
  - `interface AppConfig { port: number; autoStart: boolean; logLevel: LogLevel; securityEnabled: boolean; allowedOrigins: string[]; pairingToken: string }`
  - `DEFAULT_CONFIG: AppConfig`（`port = 17521, autoStart = false, logLevel = 'info', securityEnabled = false, allowedOrigins = [], pairingToken = ''`）
  - `parseConfig(raw: unknown): AppConfig`（与默认值合并、非法值回退、`port` 钳制 1024–65535）
  - `generatePairingToken(): string`（32 字节 hex，用 `node:crypto`）
  - `class ConfigStore { constructor(filePath: string); load(): AppConfig; save(cfg: AppConfig): void; update(patch: Partial<AppConfig>): AppConfig }`（构造时不读盘，`load()` 读不到文件返回默认值并落盘一次）

- [ ] **Step 1: 创建包与安装依赖**

`clients/print-client/package.json`（版本号先写，随后安装时 npm 自动补齐 lock）：

```json
{
  "name": "@worm-vue3-print/print-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "worm-vue3-print 跨平台静默打印桌面客户端（Electron，本地 WebSocket + core 同构渲染）",
  "license": "MIT",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@worm-vue3-print/client": "*",
    "@worm-vue3-print/core": "*",
    "ws": "^8.18.0"
  },
  "devDependencies": {}
}
```

执行（electron 取安装时最新稳定大版本，不硬编码）：

```bash
npm install -w @worm-vue3-print/print-client
npm install -D -w @worm-vue3-print/print-client electron@latest electron-vite vite vitest typescript~5.9.3 @types/node@^22 @types/ws@^8 vue@^3.5 @vitejs/plugin-vue@^6
```

- [ ] **Step 2: 写失败测试 `src/main/config.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigStore, DEFAULT_CONFIG, parseConfig, generatePairingToken } from './config.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wpc-config-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('parseConfig', () => {
  it('空值返回默认配置', () => {
    expect(parseConfig(undefined)).toEqual(DEFAULT_CONFIG)
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(parseConfig('x')).toEqual(DEFAULT_CONFIG)
  })

  it('合法字段合并，非法/越界字段回退默认', () => {
    const cfg = parseConfig({ port: 9090, autoStart: true, logLevel: 'debug', securityEnabled: true, allowedOrigins: ['https://a.com'], pairingToken: 'tok' })
    expect(cfg).toMatchObject({ port: 9090, autoStart: true, logLevel: 'debug', securityEnabled: true })
    expect(cfg.allowedOrigins).toEqual(['https://a.com'])

    const fallback = parseConfig({ port: 80, logLevel: 'verbose', autoStart: 'yes', allowedOrigins: ['x', 12] })
    expect(fallback.port).toBe(DEFAULT_CONFIG.port)
    expect(fallback.logLevel).toBe('info')
    expect(fallback.autoStart).toBe(false)
    expect(fallback.allowedOrigins).toEqual([])
  })
})

describe('generatePairingToken', () => {
  it('返回 64 位十六进制且两次不同', () => {
    const a = generatePairingToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(generatePairingToken())
  })
})

describe('ConfigStore', () => {
  it('文件不存在时 load 返回默认值并落盘', () => {
    const file = join(dir, 'config.json')
    const store = new ConfigStore(file)
    expect(store.load()).toEqual(DEFAULT_CONFIG)
    expect(existsSync(file)).toBe(true)
  })

  it('update 合并并持久化，新实例可读到', () => {
    const file = join(dir, 'config.json')
    const store = new ConfigStore(file)
    store.load()
    store.update({ port: 18000, autoStart: true })
    const again = new ConfigStore(file)
    expect(again.load()).toMatchObject({ port: 18000, autoStart: true })
    // 文件是合法 JSON
    expect(() => JSON.parse(readFileSync(file, 'utf-8'))).not.toThrow()
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: FAIL，`Cannot find module './config.js'`。

- [ ] **Step 4: 实现 `src/main/config.ts`**

```ts
// 客户端配置：userData/config.json。纯逻辑 + 文件读写，不直接依赖 electron，便于单测。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AppConfig {
  /** 监听端口；默认 17521，启动时若被占用自动递增（实际端口见运行态） */
  port: number
  autoStart: boolean
  logLevel: LogLevel
  /** 安全开关：Origin 白名单 + 配对 token */
  securityEnabled: boolean
  allowedOrigins: string[]
  pairingToken: string
}

export const DEFAULT_CONFIG: AppConfig = {
  port: 17521,
  autoStart: false,
  logLevel: 'info',
  securityEnabled: false,
  allowedOrigins: [],
  pairingToken: '',
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']

/** 生成 32 字节随机十六进制配对 token */
export function generatePairingToken(): string {
  return randomBytes(32).toString('hex')
}

/** 把任意外部输入解析为合法配置；逐字段校验，非法值回退默认 */
export function parseConfig(raw: unknown): AppConfig {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const portNum = Number(src.port)
  const port = Number.isInteger(portNum) && portNum >= 1024 && portNum <= 65535
    ? portNum
    : DEFAULT_CONFIG.port
  const logLevel = typeof src.logLevel === 'string' && (LOG_LEVELS as readonly string[]).includes(src.logLevel)
    ? (src.logLevel as LogLevel)
    : DEFAULT_CONFIG.logLevel
  const allowedOrigins = Array.isArray(src.allowedOrigins)
    ? src.allowedOrigins.filter((o): o is string => typeof o === 'string' && o.length > 0)
    : []
  return {
    port,
    autoStart: src.autoStart === true,
    logLevel,
    securityEnabled: src.securityEnabled === true,
    allowedOrigins,
    pairingToken: typeof src.pairingToken === 'string' ? src.pairingToken : DEFAULT_CONFIG.pairingToken,
  }
}

export class ConfigStore {
  private cfg: AppConfig | null = null

  constructor(private readonly filePath: string) {}

  load(): AppConfig {
    try {
      if (existsSync(this.filePath)) {
        this.cfg = parseConfig(JSON.parse(readFileSync(this.filePath, 'utf-8')))
      } else {
        this.cfg = { ...DEFAULT_CONFIG }
        this.persist(this.cfg)
      }
    } catch {
      this.cfg = { ...DEFAULT_CONFIG }
    }
    return this.cfg
  }

  save(cfg: AppConfig): void {
    this.cfg = parseConfig(cfg)
    this.persist(this.cfg)
  }

  update(patch: Partial<AppConfig>): AppConfig {
    const base = this.cfg ?? this.load()
    this.save({ ...base, ...patch })
    return this.cfg!
  }

  get current(): AppConfig {
    return this.cfg ?? this.load()
  }

  private persist(cfg: AppConfig): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(cfg, null, 2), 'utf-8')
  }
}
```

- [ ] **Step 5: TS / Vite / Vitest 配置**

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "jsx": "preserve",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

`electron.vite.config.ts`（main/preload/renderer 三环境；worker 作为 renderer 第二入口，Task 10 用到，先配好）：

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          'worker-preload': resolve(__dirname, 'src/preload/worker-preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src',
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          worker: resolve(__dirname, 'src/worker/index.html'),
        },
      },
    },
  },
})
```

`vitest.config.ts`（只测主进程纯逻辑，node 环境，排除 electron API 模块）：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 6: 最小可启动入口与渲染占位文件**

`src/main/index.ts`（本任务只验证应用能启动；Task 6 替换为完整装配）：

```ts
import { app, BrowserWindow } from 'electron'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 800, height: 600 })
    win.loadURL('data:text/html,<meta charset="utf-8">worm-vue3-print 客户端骨架启动成功')
  })
}
```

创建占位文件（后续任务填充，保证 build 入口存在）：
- `src/preload/index.ts`：`// Task 13 实现`
- `src/preload/worker-preload.ts`：`// Task 9 实现`
- `src/renderer/index.html`：最小 HTML 骨架（`<div id="app"></div><script type="module" src="./main.ts"></script>`，charset utf-8）
- `src/renderer/main.ts`：`// Task 13 实现`
- `src/worker/index.html`：与 renderer 同构的最小 HTML，引用 `./worker.ts`
- `src/worker/worker.ts`：`// Task 9 实现`

- [ ] **Step 7: 运行测试与构建**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: config 用例全绿。

Run: `npm run build -w @worm-vue3-print/print-client`
Expected: electron-vite 构建 main/preload（含 worker-preload）/renderer（含 worker）成功，`out/` 三个子目录齐备，无 TS/打包报错。

- [ ] **Step 8: 提交**

```bash
git add clients package-lock.json
git commit -m "feat(print-client)：搭建 Electron 工程骨架与配置模块"
```

---

## Task 5: 日志与任务记录模块

**Files:**
- Create: `clients/print-client/src/main/logger.ts`
- Create: `clients/print-client/src/main/job-history.ts`
- Create: `clients/print-client/src/main/job-history.test.ts`

**Interfaces:**
- Consumes: Task 4 `LogLevel`。
- Produces:
  - `class Logger`：
    - `constructor(opts: { level: LogLevel; filePath?: string; stdout?: (line: string) => void })`
    - `setLevel(level: LogLevel): void`
    - `debug/info/warn/error(msg: string, meta?: Record<string, unknown>): void`（meta 序列化进同一行 JSON）
    - `onLog(cb: (entry: LogEntry) => void): () => void`（供配置窗口实时查看；`LogEntry = { ts: string; level: LogLevel; message: string; meta?: Record<string, unknown> }`）
  - `type JobOutcome = 'success' | 'failed'`
  - `interface JobRecord { jobId: string; ts: string; templateName: string; printerName: string; copies: number; paperMicrometers: { width: number; height: number }; paperHeightSource: 'config' | 'derived'; outcome: JobOutcome; errorCode?: string; errorMessage?: string }`
  - `class JobHistoryStore`：
    - `constructor(filePath: string, limit = 500)`
    - `append(record: JobRecord): JobRecord[]`（写一行 JSON，超出上限重写文件只保留最新 limit 条；文件损坏时以空列表自愈）
    - `list(): JobRecord[]`（读盘解析，坏行跳过）

- [ ] **Step 1: 写失败测试 `src/main/job-history.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JobHistoryStore, type JobRecord } from './job-history.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wpc-history-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function makeRec(jobId: string): JobRecord {
  return {
    jobId, ts: new Date().toISOString(), templateName: '销售小票',
    printerName: '热敏-80', copies: 1,
    paperMicrometers: { width: 80000, height: 120000 },
    paperHeightSource: 'derived', outcome: 'success',
  }
}

describe('JobHistoryStore', () => {
  it('append 落盘为 JSONL 且 list 可读回', () => {
    const file = join(dir, 'jobs.jsonl')
    const store = new JobHistoryStore(file)
    store.append(makeRec('j1'))
    store.append({ ...makeRec('j2'), outcome: 'failed', errorCode: 'PRINT_FAILED', errorMessage: '脱机' })

    const lines = readFileSync(file, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const list = store.list()
    expect(list.map(r => r.jobId)).toEqual(['j1', 'j2'])
    expect(list[1]!.errorCode).toBe('PRINT_FAILED')
  })

  it('超过上限环形裁剪，只保留最新 limit 条（按写入顺序）', () => {
    const file = join(dir, 'jobs.jsonl')
    const store = new JobHistoryStore(file, 3)
    for (let i = 1; i <= 5; i++) store.append(makeRec(`j${i}`))
    expect(store.list().map(r => r.jobId)).toEqual(['j3', 'j4', 'j5'])
  })

  it('文件不存在时 list 返回空数组；坏行被跳过', () => {
    const store = new JobHistoryStore(join(dir, 'none.jsonl'))
    expect(store.list()).toEqual([])
    const file2 = join(dir, 'bad.jsonl')
    const store2 = new JobHistoryStore(file2)
    store2.append(makeRec('ok'))
    const fd = require('node:fs').appendFileSync(file2, 'not-json\n')
    expect(store2.list().map(r => r.jobId)).toEqual(['ok'])
  })
})
```

实现时第三条用例把 `require('node:fs')` 改为顶部 `import { appendFileSync } from 'node:fs'` 使用（ESM 无 require）。

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: FAIL，`Cannot find module './job-history.js'`。

- [ ] **Step 3: 实现 `src/main/job-history.ts`**

```ts
// 任务记录：userData/jobs.jsonl，每行一条 JSON，环形保留最新 limit 条。
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type JobOutcome = 'success' | 'failed'

export interface JobRecord {
  jobId: string
  ts: string
  templateName: string
  printerName: string
  copies: number
  paperMicrometers: { width: number; height: number }
  /** 纸高来源：config=任务显式指定，derived=按内容测量高度推导 */
  paperHeightSource: 'config' | 'derived'
  outcome: JobOutcome
  errorCode?: string
  errorMessage?: string
}

export class JobHistoryStore {
  constructor(
    private readonly filePath: string,
    private readonly limit = 500,
  ) {}

  append(record: JobRecord): JobRecord[] {
    mkdirSync(dirname(this.filePath), { recursive: true })
    appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf-8')

    const all = this.list()
    if (all.length > this.limit) {
      const kept = all.slice(all.length - this.limit)
      writeFileSync(this.filePath, kept.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8')
      return kept
    }
    return all
  }

  list(): JobRecord[] {
    if (!existsSync(this.filePath)) return []
    const records: JobRecord[] = []
    const lines = readFileSync(this.filePath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        records.push(JSON.parse(trimmed) as JobRecord)
      } catch {
        // 跳过损坏行
      }
    }
    return records
  }
}
```

- [ ] **Step 4: 实现 `src/main/logger.ts`**

```ts
// 分级日志：stdout + 可选文件（每行一条 JSON）+ 订阅广播（配置窗口实时日志）。
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LogLevel } from './config.js'

export interface LogEntry {
  ts: string
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LoggerOptions {
  level: LogLevel
  filePath?: string
  stdout?: (line: string) => void
}

export class Logger {
  private level: LogLevel
  private readonly cbs = new Set<(entry: LogEntry) => void>()

  constructor(private readonly opts: LoggerOptions) {
    this.level = opts.level
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  onLog(cb: (entry: LogEntry) => void): () => void {
    this.cbs.add(cb)
    return () => this.cbs.delete(cb)
  }

  debug(message: string, meta?: Record<string, unknown>): void { this.write('debug', message, meta) }
  info(message: string, meta?: Record<string, unknown>): void { this.write('info', message, meta) }
  warn(message: string, meta?: Record<string, unknown>): void { this.write('warn', message, meta) }
  error(message: string, meta?: Record<string, unknown>): void { this.write('error', message, meta) }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return
    const entry: LogEntry = { ts: new Date().toISOString(), level, message, ...(meta ? { meta } : {}) }
    const line = JSON.stringify(entry)
    ;(this.opts.stdout ?? console.log)(line)
    if (this.opts.filePath) {
      try {
        mkdirSync(dirname(this.opts.filePath), { recursive: true })
        appendFileSync(this.opts.filePath, line + '\n', 'utf-8')
      } catch {
        // 日志写盘失败不影响主流程
      }
    }
    for (const cb of this.cbs) cb(entry)
  }
}
```

- [ ] **Step 5: 运行测试与构建**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: job-history 与既有 config 用例全绿。
Run: `npm run build -w @worm-vue3-print/print-client`
Expected: 构建通过。

- [ ] **Step 6: 提交**

```bash
git add clients/print-client
git commit -m "feat(print-client)：新增分级日志与 JSONL 任务记录模块"
```

---

## Task 6: 安全校验与本地 WebSocket 服务（hello/printers.list 通道）

**Files:**
- Create: `clients/print-client/src/main/security.ts`
- Create: `clients/print-client/src/main/security.test.ts`
- Create: `clients/print-client/src/main/protocol-error.ts`
- Create: `clients/print-client/src/main/ws-server.ts`
- Create: `clients/print-client/src/main/ws-server.test.ts`
- Modify: `packages/print-client-sdk/src/transport.ts`（鉴权拒绝时中止端口探测）
- Modify: `packages/print-client-sdk/src/transport.test.ts`（补对应用例）

**Interfaces:**
- Consumes: Task 4 `AppConfig`；Task 5 `Logger`；SDK 包的协议常量与类型（`@worm-vue3-print/client`，workspace 依赖，被 electron-vite 外置）。
- Produces:
  - `checkAccess(input: { origin?: string; token?: string }, cfg: Pick<AppConfig, 'securityEnabled' | 'allowedOrigins' | 'pairingToken'>): { ok: true } | { ok: false; code: 'UNAUTHORIZED'; message: string }`
  - `class ProtocolFailure extends Error { code: ServerErrorCode }`（业务处理器用它返回协议错误码）
  - `type MessageHandler = (type: string, payload: unknown) => Promise<unknown>`
  - `class WsServer`：
    - `constructor(opts: { preferredPort: number; scanLimit?: number; host?: string; handler: MessageHandler; checkAccess: (input: { origin?: string; token?: string }) => { ok: true } | { ok: false; code: 'UNAUTHORIZED'; message: string }; logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> })`
    - `start(): Promise<number>`（返回实际监听端口；EADDRINUSE 自动 +1 至 scanLimit）
    - `stop(): Promise<void>`

- [ ] **Step 0: 修订 SDK transport——鉴权拒绝立即中止探测**

`transport.ts` 中 `tryPort` 的 `onmessage` 分支：握手阶段收到 `ok:false` 且 `error.code === 'UNAUTHORIZED'` 时，reject 一个带标记的错误；`connect` 的探测循环识别标记后立即抛出 `WormPrintError('UNAUTHORIZED', ...)`，不再尝试后续端口。

在 `WsTransport` 类外新增：

```ts
/** 探测期间的内部信号：服务端明确拒绝鉴权，应停止端口探测 */
class AuthRejectedError extends Error {
  readonly code = 'UNAUTHORIZED' as const
  constructor(message: string) { super(message); this.name = 'AuthRejectedError' }
}
```

`tryPort` 的握手消息分支改为：

```ts
      ws.onmessage = (ev: MessageEvent) => {
        const msg = decodeServerMessage(String(ev.data))
        if ('malformed' in msg) return
        if (msg.ok && isHello(msg.payload)) {
          if (settled) return
          settled = true
          this.bindLifecycle(ws)
          resolve(msg.payload as HelloResponsePayload)
        } else if (!msg.ok && msg.error.code === 'UNAUTHORIZED') {
          if (settled) return
          settled = true
          reject(new AuthRejectedError(msg.error.message))
        } else if (!settled) {
          settled = true
          reject(new Error('握手失败'))
        }
      }
```

`connect` 探测循环的 catch 改为：

```ts
      } catch (err) {
        if (err instanceof AuthRejectedError) {
          this.setStatus('disconnected')
          throw new WormPrintError('UNAUTHORIZED', err.message || '配对 token 无效或来源未授权')
        }
        // 该端口无客户端，继续探测下一个
      }
```

补测试（`transport.test.ts`，替身 `send` 中增加：收到 hello 帧且 url 含 `token=bad` 时回 `{ id, ok:false,error:{code:'UNAUTHORIZED',message:'denied'} }`）：

```ts
  it('服务端返回 UNAUTHORIZED 时立即中止探测，不透传为 CLIENT_NOT_RUNNING', async () => {
    const t = setupTransport({ token: 'bad' })
    const p = t.connect()
    const pending = Promise.resolve().then(() => {
      FakeWebSocket.instances[0]!.open()
    })
    await pending
    await expect(p).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    // 没有继续开启第二个端口的探测连接
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
```

Run: `npm run test -w @worm-vue3-print/client`，Expected: PASS 后提交：

```bash
git add packages/print-client-sdk
git commit -m "fix(client-sdk)：鉴权拒绝时中止端口探测并透传 UNAUTHORIZED"
```

- [ ] **Step 1: 写失败测试 `src/main/security.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { checkAccess } from './security.js'

const off = { securityEnabled: false, allowedOrigins: [], pairingToken: '' }
const on = { securityEnabled: true, allowedOrigins: ['https://erp.example.com'], pairingToken: 'tok-1' }

describe('checkAccess', () => {
  it('开关关闭时一律放行（含无 Origin、无 token）', () => {
    expect(checkAccess({}, off)).toEqual({ ok: true })
    expect(checkAccess({ origin: 'https://evil.com' }, off)).toEqual({ ok: true })
  })

  it('开关开启：token 错误拒绝', () => {
    const r = checkAccess({ origin: 'https://erp.example.com', token: 'wrong' }, on)
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('应拒绝')
    expect(r.code).toBe('UNAUTHORIZED')
  })

  it('开关开启：Origin 不在白名单拒绝（即使 token 正确）', () => {
    expect(checkAccess({ origin: 'https://evil.com', token: 'tok-1' }, on).ok).toBe(false)
  })

  it('开关开启：白名单非空且浏览器连接无 Origin 拒绝；token+Origin 均正确放行', () => {
    expect(checkAccess({ token: 'tok-1' }, on).ok).toBe(false)
    expect(checkAccess({ origin: 'https://erp.example.com', token: 'tok-1' }, on)).toEqual({ ok: true })
  })

  it('开关开启但白名单为空时：仅校验 token，非浏览器客户端（无 Origin）可用', () => {
    const cfg = { securityEnabled: true, allowedOrigins: [], pairingToken: 'tok-1' }
    expect(checkAccess({ token: 'tok-1' }, cfg)).toEqual({ ok: true })
    expect(checkAccess({ origin: 'https://x.com', token: 'tok-1' }, cfg)).toEqual({ ok: true })
    expect(checkAccess({}, cfg).ok).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: FAIL，`Cannot find module './security.js'`。

- [ ] **Step 3: 实现 `src/main/security.ts` 与 `src/main/protocol-error.ts`**

`security.ts`：

```ts
// 本地 WebSocket 访问控制。开关默认关闭；开启后校验配对 token，白名单非空时再校验 Origin。
import type { AppConfig } from './config.js'

type AccessConfig = Pick<AppConfig, 'securityEnabled' | 'allowedOrigins' | 'pairingToken'>

export type AccessResult =
  | { ok: true }
  | { ok: false; code: 'UNAUTHORIZED'; message: string }

export function checkAccess(
  input: { origin?: string; token?: string },
  cfg: AccessConfig,
): AccessResult {
  if (!cfg.securityEnabled) return { ok: true }

  if (!input.token || input.token !== cfg.pairingToken) {
    return { ok: false, code: 'UNAUTHORIZED', message: '配对 token 无效' }
  }
  if (cfg.allowedOrigins.length > 0) {
    if (!input.origin) {
      return { ok: false, code: 'UNAUTHORIZED', message: '缺少来源 Origin' }
    }
    if (!cfg.allowedOrigins.includes(input.origin)) {
      return { ok: false, code: 'UNAUTHORIZED', message: `来源 ${input.origin} 不在白名单` }
    }
  }
  return { ok: true }
}
```

`protocol-error.ts`：

```ts
import type { ServerErrorCode } from '@worm-vue3-print/client'

/** 处理器抛出本错误时，WS 层以其 code 回协议错误帧；其他异常统一为 INTERNAL */
export class ProtocolFailure extends Error {
  constructor(readonly code: ServerErrorCode, message: string) {
    super(message)
    this.name = 'ProtocolFailure'
  }
}
```

- [ ] **Step 4: 实现 `src/main/ws-server.ts`**

```ts
// 仅绑定回环地址的 WebSocket 服务：端口递增、握手鉴权、JSON 协议帧分发。
import { WebSocketServer, WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import type { Logger } from './logger.js'

export type AccessFn = (input: { origin?: string; token?: string }) =>
  | { ok: true }
  | { ok: false; code: 'UNAUTHORIZED'; message: string }

export type MessageHandler = (type: string, payload: unknown) => Promise<unknown>

export interface WsServerOptions {
  preferredPort: number
  scanLimit?: number
  host?: string
  handler: MessageHandler
  checkAccess: AccessFn
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>
}

const UNAUTHORIZED_CLOSE_CODE = 4401

export class WsServer {
  private wss: WebSocketServer | null = null
  private actualPort = 0

  constructor(private readonly opts: WsServerOptions) {}

  /** 启动服务；端口被占用时自动 +1；全部失败抛错 */
  async start(): Promise<number> {
    const limit = this.opts.scanLimit ?? 20
    let lastErr: unknown
    for (let offset = 0; offset < limit; offset++) {
      const port = this.opts.preferredPort + offset
      try {
        await this.listen(port)
        this.actualPort = port
        this.opts.logger?.info(`WebSocket 服务已监听 ws://127.0.0.1:${port}`)
        return port
      } catch (err) {
        lastErr = err
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
      }
    }
    throw new Error(`端口 ${this.opts.preferredPort}–${this.opts.preferredPort + limit - 1} 均被占用`)
  }

  get port(): number {
    return this.actualPort
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve()
      this.wss.close(() => resolve())
      for (const ws of this.wss.clients) ws.terminate()
    })
    this.wss = null
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: this.opts.host ?? '127.0.0.1', port })
      this.wss = wss
      wss.once('listening', () => resolve())
      wss.once('error', reject)
      wss.on('connection', (ws, req) => {
        // 鉴权：token 走查询参数，Origin 来自握手头
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const access = this.opts.checkAccess({
          origin: req.headers.origin,
          token: url.searchParams.get('token') ?? undefined,
        })
        if (!access.ok) {
          ws.send(JSON.stringify({
            id: '', ok: false,
            error: { code: access.code, message: access.message },
          }))
          ws.close(UNAUTHORIZED_CLOSE_CODE, access.code)
          return
        }
        this.bindConnection(ws)
      })
    })
  }

  private bindConnection(ws: WebSocket): void {
    ws.on('message', async (raw) => {
      let frame: { id?: unknown; type?: unknown; payload?: unknown }
      try {
        frame = JSON.parse(raw.toString())
      } catch {
        ws.send(JSON.stringify({ id: '', ok: false, error: { code: 'INVALID_REQUEST', message: '非法 JSON' } }))
        return
      }
      if (typeof frame.id !== 'string' || typeof frame.type !== 'string' || typeof frame.payload !== 'object') {
        ws.send(JSON.stringify({
          id: typeof frame.id === 'string' ? frame.id : '',
          ok: false,
          error: { code: 'INVALID_REQUEST', message: '帧必须包含字符串 id/type 与对象 payload' },
        }))
        return
      }
      try {
        const result = await this.opts.handler(frame.type, frame.payload)
        ws.send(JSON.stringify({ id: frame.id, ok: true, payload: result ?? {} }))
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: import('@worm-vue3-print/client').ServerErrorCode }).code
          : 'INTERNAL'
        const message = err instanceof Error ? err.message : '内部错误'
        this.opts.logger?.error('消息处理失败', { type: frame.type, code, message })
        ws.send(JSON.stringify({ id: frame.id, ok: false, error: { code, message } }))
      }
    })
  }
}

// 供外部读取监听地址（保留以备排查）
export function describeAddress(wss: WebSocketServer): number {
  return (wss.address() as AddressInfo).port
}
```

- [ ] **Step 5: 写集成测试 `src/main/ws-server.test.ts`**（真实回环 socket + ws 客户端）

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { WebSocket as WsClient } from 'ws'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { WsServer } from './ws-server.js'
import { ProtocolFailure } from './protocol-error.js'

const servers: WsServer[] = []
afterEach(async () => {
  for (const s of servers) await s.stop().catch(() => {})
  servers.length = 0
})

function makeServer(handler: WsServer extends never ? never : (type: string, payload: unknown) => Promise<unknown>, check?: Parameters<WsServer['constructor']>[0] extends never ? never : ReturnType<WsServer['start']> extends never ? never : (input: { origin?: string; token?: string }) => { ok: true } | { ok: false; code: 'UNAUTHORIZED'; message: string }) {
  const server = new WsServer({
    preferredPort: 17900 + Math.floor(Math.random() * 500),
    handler,
    checkAccess: check ?? (() => ({ ok: true })),
  })
  servers.push(server)
  return server
}

function rpc(ws: WsClient, type: string, payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = 't-' + Math.random()
    const onMsg = (data: unknown) => {
      const msg = JSON.parse(String(data))
      if (msg.id === id) {
        ws.off('message', onMsg)
        resolve(msg)
      }
    }
    ws.on('message', onMsg)
    ws.on('close', (code) => reject(new Error('连接关闭 code=' + code)))
    ws.send(JSON.stringify({ id, type, payload }))
  })
}

function connect(port: number, opts: { token?: string; origin?: string } = {}): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const url = new URL(`ws://127.0.0.1:${port}`)
    if (opts.token) url.searchParams.set('token', opts.token)
    const ws = new WsClient(url.toString().replace(/\/$/, ''), {
      headers: opts.origin ? { Origin: opts.origin } : undefined,
    })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

describe('WsServer', () => {
  it('请求响应往返：hello 与 printers.list', async () => {
    const server = makeServer(async (type) => {
      if (type === 'hello') return { app: 'worm-print-client', version: '0.1.0', port: server.port }
      if (type === 'printers.list') return { printers: [{ name: 'PDF', isDefault: true, status: 'idle' }] }
      throw new ProtocolFailure('INVALID_REQUEST', '未知消息')
    })
    const port = await server.start()
    const ws = await connect(port)

    expect(await rpc(ws, 'hello', {})).toMatchObject({ ok: true, payload: { app: 'worm-print-client' } })
    expect(await rpc(ws, 'printers.list', {})).toMatchObject({ ok: true })
    const bad = await rpc(ws, 'nope', {})
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    ws.close()
  })

  it('鉴权失败：先收 UNAUTHORIZED 错误帧再关闭连接', async () => {
    const server = makeServer(async () => ({}), () => ({ ok: false, code: 'UNAUTHORIZED', message: 'denied' }))
    const port = await server.start()

    const errorFrame = await new Promise<unknown>((resolve, reject) => {
      const ws = new WsClient(`ws://127.0.0.1:${port}`)
      ws.on('message', (data) => resolve(JSON.parse(String(data))))
      ws.on('close', (code) => code === 4401 ? resolve(null) : reject(new Error('code=' + code)))
    })
    expect(errorFrame).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })
  })

  it('首选端口被占用时自动递增到下一端口', async () => {
    const occupied = await new Promise<number>((resolve) => {
      const tcp = createServer()
      tcp.listen(0, '127.0.0.1', () => resolve((tcp.address() as AddressInfo).port))
    })
    const server = makeServer(async () => ({}))
    const port = await server.start.call({ constructor: WsServer }, ) // 占位，下行替换
    void occupied
    void port
  })
})
```

第三条用例上面的占位写法作废，实现时以如下完整用例替换（用固定端口 18501，先占后启）：

```ts
  it('首选端口被占用时自动递增到下一端口', async () => {
    const tcp = createServer()
    await new Promise<void>((resolve) => tcp.listen(18501, '127.0.0.1', resolve))
    try {
      const server = new WsServer({
        preferredPort: 18501,
        handler: async () => ({ ok: true }),
        checkAccess: () => ({ ok: true }),
      })
      servers.push(server)
      const port = await server.start()
      expect(port).toBe(18502)
    } finally {
      await new Promise<void>((resolve) => tcp.close(() => resolve()))
    }
  }, 10000)
```

同时把文件顶部过度设计的 `makeServer` 类型注解简化为：

```ts
function makeServer(
  handler: (type: string, payload: unknown) => Promise<unknown>,
  check?: (input: { origin?: string; token?: string }) => { ok: true } | { ok: false; code: 'UNAUTHORIZED'; message: string },
): WsServer {
  const server = new WsServer({
    preferredPort: 17900 + Math.floor(Math.random() * 500),
    handler,
    checkAccess: check ?? (() => ({ ok: true })),
  })
  servers.push(server)
  return server
}
```

- [ ] **Step 6: 运行测试与构建**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: security 5 条 + ws-server 3 条及既有用例全绿。
Run: `npm run build -w @worm-vue3-print/print-client`
Expected: 构建通过（ws 为外置依赖，不打进产物）。

- [ ] **Step 7: 提交**

```bash
git add clients/print-client
git commit -m "feat(print-client)：新增回环 WebSocket 服务与访问控制（端口递增/鉴权/协议帧）"
```

---

## Task 7: 打印机服务（枚举/状态归一化/存在性校验）

**Files:**
- Create: `clients/print-client/src/main/printer-service.ts`
- Create: `clients/print-client/src/main/printer-service.test.ts`

**Interfaces:**
- Consumes: SDK 协议类型 `PrinterInfo`；Task 6 `ProtocolFailure`。
- Produces:
  - `type NormalizedPrinterStatus = 'idle' | 'printing' | 'offline' | 'error' | 'unknown'`
  - `describePrinterStatus(code: number, platform: NodeJS.Platform = process.platform): NormalizedPrinterStatus`（纯函数）
  - `normalizePrinters(raw: Array<{ name: string; isDefault?: boolean; status?: number }>, platform?: NodeJS.Platform): PrinterInfo[]`
  - `class PrinterService`：
    - `constructor(fetchRaw: () => Promise<Array<{ name: string; isDefault?: boolean; status?: number }>>)`（生产环境传入 `() => someWebContents.getPrintersAsync()`；测试传假数据）
    - `list(): Promise<PrinterInfo[]`
    - `resolve(printerName?: string): Promise<{ name: string; isDefault: boolean }>`（未指定名称时取系统默认；找不到抛 `ProtocolFailure('PRINTER_NOT_FOUND', ...)`；归一化状态为 offline 时不拦截——出纸失败由 PRINT_FAILED/PRINTER_OFFLINE 回调体现）

- [ ] **Step 1: 写失败测试 `src/main/printer-service.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  PrinterService,
  describePrinterStatus,
  normalizePrinters,
} from './printer-service.js'

const RAW = [
  { name: '针式-发票', isDefault: false, status: 0 },
  { name: '热敏-80', isDefault: true, status: 0 },
]

describe('describePrinterStatus', () => {
  it('非 Windows 平台只区分 idle 与 unknown', () => {
    expect(describePrinterStatus(0, 'darwin')).toBe('idle')
    expect(describePrinterStatus(0, 'linux')).toBe('idle')
    expect(describePrinterStatus(99, 'darwin')).toBe('unknown')
  })

  it('Windows 按位掩码识别 offline/error/printing/idle', () => {
    // PRINTER_STATUS_ERROR = 0x2，OFFLINE = 0x80，PRINTING = 0x400
    expect(describePrinterStatus(0x00000002, 'win32')).toBe('error')
    expect(describePrinterStatus(0x00000080, 'win32')).toBe('offline')
    expect(describePrinterStatus(0x00000400, 'win32')).toBe('printing')
    expect(describePrinterStatus(0, 'win32')).toBe('idle')
  })
})

describe('normalizePrinters', () => {
  it('映射为协议 PrinterInfo（名称/默认/状态字符串）', () => {
    expect(normalizePrinters(RAW, 'darwin')).toEqual([
      { name: '针式-发票', isDefault: false, status: 'idle' },
      { name: '热敏-80', isDefault: true, status: 'idle' },
    ])
  })
})

describe('PrinterService.resolve', () => {
  it('未指定打印机时返回系统默认', async () => {
    const svc = new PrinterService(async () => RAW)
    expect(await svc.resolve()).toEqual({ name: '热敏-80', isDefault: true })
  })

  it('指定名称精确匹配', async () => {
    const svc = new PrinterService(async () => RAW)
    expect(await svc.resolve('针式-发票')).toEqual({ name: '针式-发票', isDefault: false })
  })

  it('指定的打印机不存在时抛 PRINTER_NOT_FOUND', async () => {
    const svc = new PrinterService(async () => RAW)
    await expect(svc.resolve('不存在')).rejects.toMatchObject({ code: 'PRINTER_NOT_FOUND' })
  })

  it('无默认打印机且未指定名称时抛 PRINTER_NOT_FOUND', async () => {
    const svc = new PrinterService(async () => [{ name: 'A', status: 0 }])
    await expect(svc.resolve()).rejects.toMatchObject({ code: 'PRINTER_NOT_FOUND' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: FAIL，`Cannot find module './printer-service.js'`。

- [ ] **Step 3: 实现 `src/main/printer-service.ts`**

```ts
// 打印机枚举与选择：Electron getPrintersAsync 结果归一化为协议结构。
// Electron API 通过构造函数注入，本文件除 fetchRaw 外均为纯逻辑，可在 Node 环境单测。
import type { PrinterInfo } from '@worm-vue3-print/client'
import { ProtocolFailure } from './protocol-error.js'

export interface RawPrinter {
  name: string
  isDefault?: boolean
  /** Windows 为 PRINTER_STATUS_* 位掩码；macOS/CUPS 通常为 0 */
  status?: number
}

export type NormalizedPrinterStatus = 'idle' | 'printing' | 'offline' | 'error' | 'unknown'

/** Windows 打印机状态位掩码（winspool PRINTER_STATUS_*） */
const WIN_STATUS = {
  ERROR: 0x00000002,
  OFFLINE: 0x00000080,
  PRINTING: 0x00000400,
} as const

export function describePrinterStatus(
  code: number,
  platform: NodeJS.Platform = process.platform,
): NormalizedPrinterStatus {
  if (platform !== 'win32') {
    return code === 0 ? 'idle' : 'unknown'
  }
  // 按严重度优先：硬件错误 → 脱机 → 打印中 → 空闲
  if (code & WIN_STATUS.ERROR) return 'error'
  if (code & WIN_STATUS.OFFLINE) return 'offline'
  if (code & WIN_STATUS.PRINTING) return 'printing'
  return code === 0 ? 'idle' : 'unknown'
}

export function normalizePrinters(
  raw: RawPrinter[],
  platform: NodeJS.Platform = process.platform,
): PrinterInfo[] {
  return raw.map(p => ({
    name: p.name,
    isDefault: p.isDefault === true,
    status: describePrinterStatus(p.status ?? 0, platform),
  }))
}

export class PrinterService {
  constructor(private readonly fetchRaw: () => Promise<RawPrinter[]>) {}

  async list(): Promise<PrinterInfo[]> {
    return normalizePrinters(await this.fetchRaw())
  }

  /** 解析实际打印目标；未指定名称时取系统默认打印机 */
  async resolve(printerName?: string): Promise<{ name: string; isDefault: boolean }> {
    const printers = await this.fetchRaw()
    if (printerName !== undefined) {
      const hit = printers.find(p => p.name === printerName)
      if (!hit) {
        throw new ProtocolFailure('PRINTER_NOT_FOUND', `打印机不存在：${printerName}`)
      }
      return { name: hit.name, isDefault: hit.isDefault === true }
    }
    const def = printers.find(p => p.isDefault === true)
    if (!def) {
      throw new ProtocolFailure('PRINTER_NOT_FOUND', '系统未设置默认打印机，请在打印参数中指定 printerName')
    }
    return { name: def.name, isDefault: true }
  }
}
```

- [ ] **Step 4: 运行测试与构建**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: 新增 8 条断言全绿，既有用例不回归。
Run: `npm run build -w @worm-vue3-print/print-client`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add clients/print-client
git commit -m "feat(print-client)：新增打印机服务（枚举/状态归一化/打印目标解析）"
```

---

## Task 8: core 与设计器支持「连续纸」页面属性

> 背景：连续纸（热敏 58/80mm、标签）需要模板级声明——设计高度固定 297mm（设计/预览画布），可配连续纸底边距；打印时（Task 9/11）按渲染测量总高推导实际纸高。底边距不新增字段，直接使用模板既有 `margins.bottom`（切到连续纸时默认置 0，可改），测量文档 `scrollHeight` 天然含 padding-bottom，推导纸高自动包含底边距。

**Files:**
- Modify: `packages/print-core/src/render/types.ts`（`PaperSize`、`PAPER_DIMENSIONS`、`getPaperDimensions`）
- Modify: `packages/print-core/src/designer/types.ts`（设计器侧 `PaperSize`、`TemplateData` 注释）
- Modify: `packages/print-core/src/designer/utils/default-config.ts`（设计器侧 `PAPER_PRESETS`、`getPaperDimensions`）
- Modify: `packages/print-core/src/render/pagination-engine.ts`（连续纸不分页）
- Modify: `packages/print-core/src/render/css-builder.ts`（连续纸 CSS：页面随内容撑开、页脚文档流化）
- Modify: `packages/print-canvas/src/components/PropertyPanel.vue`（纸张下拉新增「连续纸」选项、连续纸专属字段）
- Create: `packages/print-core/src/render/__tests__/continuous-paper.test.ts`

**Interfaces:**
- Consumes: 无新依赖。
- Produces:
  - 两处 `PaperSize` 联合类型新增 `'CONTINUOUS'`。
  - `PAPER_DIMENSIONS.CONTINUOUS` 与 `PAPER_PRESETS.CONTINUOUS` = `{ width: 80, height: 297 }`（默认 80mm 热敏；高度仅为设计/预览画布高度）。
  - `getPaperDimensions` 对 CONTINUOUS 的解析与 CUSTOM 同构：`width = customWidth ?? 80`、`height = customHeight ?? 297`，方向强制 portrait（横向对连续纸无意义）。
  - 导出判定函数 `isContinuousPaper(template): boolean`（放 `render/types.ts`，designer 侧从同构位置复制/复用 designer 版）。
  - 连续纸模板：分页引擎恒定单页；最终 HTML 不强制最小纸高、页脚不钉在 297mm 底部。

- [ ] **Step 1: 写失败测试 `continuous-paper.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { getPaperDimensions, isContinuousPaper } from './types.js'
import { paginate } from './pagination-engine.js'
import { buildPageCss } from './css-builder.js'
import type { TemplateData, TemplateElement } from './types.js'

function continuousTemplate(over: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'CONTINUOUS',
    orientation: 'portrait',
    margins: { top: 5, right: 5, bottom: 0, left: 5 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    customWidth: 80,
    ...over,
  } as TemplateData
}

const tallEl = (top: number, height: number): TemplateElement => ({
  id: `el-${top}-${height}`, type: 'text',
  options: { top, left: 0, width: 70, height },
})

describe('CONTINUOUS 纸型', () => {
  it('默认尺寸 80×297，宽度取 customWidth', () => {
    expect(getPaperDimensions(continuousTemplate())).toEqual({ width: 80, height: 297 })
    expect(getPaperDimensions(continuousTemplate({ customWidth: 58 }))).toEqual({ width: 58, height: 297 })
  })

  it('isContinuousPaper 判定', () => {
    expect(isContinuousPaper(continuousTemplate())).toBe(true)
    expect(isContinuousPaper(continuousTemplate({ paperSize: 'A4' } as Partial<TemplateData>))).toBe(false)
  })

  it('内容累计超过 297mm 也只产生一页（不按设计高度分页）', () => {
    const t = continuousTemplate({
      elements: Array.from({ length: 20 }, (_, i) => tallEl(i * 30, 28)),
    })
    const measured = new Map(t.elements.map(el => [el.id, { id: el.id, measuredHeight: 28 }]))
    const pages = paginate(t, measured)
    expect(pages).toHaveLength(1)
  })

  it('CSS：连续纸页面不强制最小高度，页脚不绝对定位', () => {
    const css = buildPageCss(continuousTemplate({ footer: { height: 10, elements: [] } }))
    // 连续纸标记类
    expect(css).toContain('continuous')
    // 普通规则仍输出 @page；连续纸覆盖规则必须存在
    expect(css).toMatch(/\.continuous\b[\s\S]*min-height:\s*auto/)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/core -- continuous`
Expected: FAIL（类型上 `'CONTINUOUS'` 不能赋给 PaperSize；`isContinuousPaper` 不存在）。

- [ ] **Step 3: 修改 render/types.ts**

a. 第 7 行类型改为：

```ts
export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'CUSTOM' | 'CONTINUOUS'
```

b. `PAPER_DIMENSIONS` 增加：

```ts
  CONTINUOUS: { width: 80, height: 297 }, // 连续纸：默认 80mm 热敏；高度仅为设计画布高度，出纸按内容推导
```

c. `getPaperDimensions` 改为 CUSTOM/CONTINUOUS 同分支：

```ts
export function getPaperDimensions(template: TemplateData): { width: number; height: number } {
  const base = template.paperSize === 'CUSTOM' || template.paperSize === 'CONTINUOUS'
    ? {
        width: template.customWidth ?? (template.paperSize === 'CONTINUOUS' ? 80 : 210),
        height: template.customHeight ?? 297,
      }
    : PAPER_DIMENSIONS[template.paperSize]
  // 连续纸只有纵向
  if (template.orientation === 'landscape' && template.paperSize !== 'CONTINUOUS') {
    return { width: base.height, height: base.width }
  }
  return { ...base }
}

/** 是否连续纸（热敏/标签）：出纸高度按渲染内容推导 */
export function isContinuousPaper(template: { paperSize: string }): boolean {
  return template.paperSize === 'CONTINUOUS'
}
```

- [ ] **Step 4: 修改 designer/types.ts 与 default-config.ts**

a. `designer/types.ts` 第 8 行：

```ts
/** 纸张尺寸；CONTINUOUS=连续纸（热敏/标签，设计高度固定 297mm，出纸高度按内容推导，底边距用 margins.bottom） */
export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'CUSTOM' | 'CONTINUOUS'
```

并在 `customHeight` 注释旁补充：CONTINUOUS 时 customWidth 为纸宽（默认 80），customHeight 不使用（固定 297 设计画布）。

b. `default-config.ts`：

```ts
export const PAPER_PRESETS: Record<string, { width: number; height: number }> = {
  A4:  { width: 210, height: 297 },
  A3:  { width: 297, height: 420 },
  A5:  { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  CONTINUOUS: { width: 80, height: 297 },
}
```

`getPaperDimensions` 同步：

```ts
  const isFree = t.paperSize === 'CUSTOM' || t.paperSize === 'CONTINUOUS'
  if (isFree) {
    base = {
      width: t.customWidth ?? (t.paperSize === 'CONTINUOUS' ? 80 : 210),
      height: t.customHeight ?? 297,
    }
  } else {
    base = PAPER_PRESETS[t.paperSize] || PAPER_PRESETS['A4']!
  }
  return t.orientation === 'landscape' && t.paperSize !== 'CONTINUOUS'
    ? { width: base.height, height: base.width }
    : base
```

- [ ] **Step 5: 分页引擎——连续纸不分页**

`pagination-engine.ts` 的 `paginate()` 中，计算 `contentHeight` 处改为：

```ts
  const continuous = template.paperSize === 'CONTINUOUS'
  // 连续纸：不按设计高度分页，单页承载全部内容（纸高在打印侧按测量高度推导）
  const contentHeight = continuous
    ? Number.POSITIVE_INFINITY
    : paper.height - mt - mb - headerH - footerH
  if (!continuous && contentHeight <= 0) {
    throw new Error(
      `页面可用高度不足: paper=${paper.height}mm, margins=${mt + mb}mm, header=${headerH}mm, footer=${footerH}mm`,
    )
  }
```

验证 Infinity 与各分页分支兼容：`remaining = Infinity - ...`、所有「放不下」判断恒为 false；表格切片同理不切。逐行检查 `paginateTable/paginateNonTable` 内对 `contentHeight` 的算术不产生 NaN（Infinity - 有限值 = Infinity）；若存在乘法/除法分支，对连续纸提前走单页路径并在评审中说明。

- [ ] **Step 6: CSS——连续纸页面随内容撑开**

`css-builder.ts` 的 `buildPageCss` 返回模板中增加连续纸覆盖块（插在测量模式规则之前）：

```ts
${template.paperSize === 'CONTINUOUS' ? `
/* ── 连续纸：单页随内容撑开；出纸高度由打印侧按测量总高设置 ── */
body.continuous .print-page { min-height: auto; page-break-after: auto; }
body.continuous .page-footer { position: static; }
@page { size: ${mm(paper.width)} auto; }
` : ''}
```

最终页容器需要连续纸标记类供高级样式/调试：修改 `html-generator.ts` 的 `generateFinalHtml`，body 输出：

```ts
<body${template.paperSize === 'CONTINUOUS' ? ' class="continuous"' : ''}>
```

（普通模板保持无 class。）

- [ ] **Step 7: 运行 core 全量测试与构建**

Run: `npm run test -w @worm-vue3-print/core`
Expected: 新用例 4 条 + 既有用例全绿。
Run: `npm run build -w @worm-vue3-print/core`
Expected: 构建通过。

- [ ] **Step 8: 设计器页面属性面板**

修改 `packages/print-canvas/src/components/PropertyPanel.vue`：

a. 纸张尺寸下拉：CONTINUOUS 已在 Task 8 Step 4 加入 core 的 `PAPER_PRESETS`，现有 `v-for="(_ps, key) in paperPresets"` 会自动遍历到它，**不要**再在 CUSTOM option 旁手写重复 option；改为给 key 加中文显示名。下拉改为：

```html
            <select :value="paperSizeModel" class="pd-select" @change="onPaperSizeChange(($event.target as HTMLSelectElement).value)" style="width: 100%">
              <option v-for="key in paperPresetKeys" :key="key" :value="key">{{ paperPresetLabel(key) }}</option>
              <option value="CUSTOM">自定义</option>
            </select>
```

script 区增加（`paperPresets` 常量保留给尺寸查询）：

```ts
const paperPresetKeys = Object.keys(paperPresets)
function paperPresetLabel(key: string): string {
  return key === 'CONTINUOUS' ? '连续纸' : key
}
```

b. 自定义宽高区块条件改为同时覆盖 CUSTOM 与 CONTINUOUS，但连续纸只显示宽度：

```html
          <div class="pd-field" v-if="paperSizeModel === 'CUSTOM' || paperSizeModel === 'CONTINUOUS'">
            <span class="pd-label">{{ paperSizeModel === 'CONTINUOUS' ? '纸宽 (mm)' : '自定义宽高 (mm)' }}</span>
            <div class="custom-size-grid">
              <StepperInput :model-value="customWidth" :min="25" :max="2000"
                @update:model-value="onCustomWidthChange" />
              <template v-if="paperSizeModel === 'CUSTOM'">
                <span class="custom-size-x">×</span>
                <StepperInput :model-value="customHeight" :min="25" :max="2000"
                  @update:model-value="onCustomHeightChange" />
              </template>
            </div>
          </div>
```

c. 方向区块对连续纸隐藏（连续纸强制纵向）：给方向 `.pd-field` 加 `v-if="paperSizeModel !== 'CONTINUOUS'"`。

d. 边距 UI：连续纸时把「下」边距输入标签语义改为底边距（现有 margin-grid 是四向 StepperInput，只需在连续纸时在区块旁显示提示文案「底部边距即连续纸走纸留白」，不改控件结构）。`marginBottom` 计算属性与 `onMarginBottomChange` 复用，:max 放宽到 100（若当前为 50）。

e. `onPaperSizeChange` 增加切换归一化（script 区）：

```ts
function onPaperSizeChange(size: string) {
  if (size === 'CONTINUOUS') {
    // 连续纸默认：80mm 宽、纵向、底边距 0（走纸留白由用户配置）
    emitUpdate({
      paperSize: 'CONTINUOUS',
      customWidth: props.templateData?.customWidth ?? 80,
      orientation: 'portrait',
      margins: { ...props.templateData!.margins, bottom: props.templateData?.margins.bottom ?? 0 },
    })
    return
  }
  if (size === 'CUSTOM') { emitUpdate({ paperSize: 'CUSTOM' }); return }
  emitUpdate({ paperSize: size as TemplateData['paperSize'] })
}
```

替换原有同名函数（原 CUSTOM/预设两分支逻辑并入）。

f. `customWidth` 计算属性缺省值对连续纸为 80：

```ts
const customWidth = computed(() => props.templateData?.customWidth ?? (paperSizeModel.value === 'CONTINUOUS' ? 80 : 210))
```

- [ ] **Step 9: canvas 回归与设计器手工验证**

Run: `npm run test -w @worm-vue3-print/canvas`
Expected: 全绿。
Run: `npm run dev`（仓库 demo，若根脚本为其它名以 package.json 为准）
Expected（手工）：
1. 页面属性纸张下拉出现「连续纸」；选中后画布变为 80×297，方向控件隐藏，只显示纸宽；
2. 改纸宽为 58 画布跟随；底边距改 3mm 后预览底部留白；
3. 切回 A4 一切正常，原模板打开不受影响（旧 JSON 无 CONTINUOUS，类型扩展不破坏迁移）。

- [ ] **Step 10: 提交**

```bash
git add packages/print-core packages/print-canvas
git commit -m "feat(core,canvas)：新增连续纸页面属性（CONTINUOUS，默认80×297，不分页，底边距可配）"
```

---

## Task 9: 渲染 worker（沙箱 preload）与纸高推导（复用 core `/browser` 管线）

**Files:**
- Modify: `packages/print-core/src/browser/browser-pagination.ts`（`BrowserRenderResult` 增量返回 `contentHeightMm`）
- Create: `clients/print-client/src/shared/render-protocol.ts`（main ↔ worker IPC 契约类型）
- Create: `clients/print-client/src/preload/worker-preload.ts`（worker 专用沙箱 preload）
- Create: `clients/print-client/src/worker/worker.ts`（填充 Task 4 占位；运行在 contextIsolation 主世界，经 `window.wormRender` 桥通信）
- Create: `clients/print-client/src/worker/index.html`（填充 Task 4 占位）
- Create: `clients/print-client/src/main/paper.ts`
- Create: `clients/print-client/src/main/paper.test.ts`
- Modify: `clients/print-client/electron.vite.config.ts`（preload 增加 worker-preload 第二入口）
- Modify: `clients/print-client/package.json`（确认不引入 bwip-js；条码由 core/browser 承担）

**Interfaces:**
- Consumes: `@worm-vue3-print/core/browser` 的 `renderHtmlPages`、`browserCodeRenderer`；`@worm-vue3-print/core` 的 `getPaperDimensions`、`isContinuousPaper`；SDK 协议类型 `PrintOptions`。
- Produces:
  - core 侧 `BrowserRenderResult` 新增 `contentHeightMm: number`（测量文档连续内容总高，mm，**已含模板 padding 底边距**；增量字段，canvas 既有消费不受影响）。
  - shared：`RenderJobSpec = { templateJson: Record<string, unknown>; printData?: Record<string, unknown>; baseUrl?: string }`；`RenderJobResult = { html: string; pageCount: number; contentHeightMm: number; templatePaperMm: { width: number; height: number }; continuous: boolean }`；IPC 通道常量 `RENDER_REQUEST_CHANNEL = 'worm:render-request'`、`RENDER_RESPONSE_CHANNEL = 'worm:render-response'`。
  - `resolvePaper(input: { print: PrintOptions; templatePaperMm: { width: number; height: number }; contentHeightMm: number; continuous: boolean }): { paper: { width: number; height: number }; heightSource: 'config' | 'derived' }`（纯函数，单位微米）。连续纸由**模板 `paperSize==='CONTINUOUS'` 标志**判定，与调用方是否传 paperSize 无关。
  - worker-preload 暴露 `window.wormRender = { onRequest(cb), respond(id, response) }`；worker 页面注册渲染回调（Task 10 的 renderer-pool 负责配对与超时）。

- [ ] **Step 1: core 增量返回内容总高**

修改 `packages/print-core/src/browser/browser-pagination.ts`：

a. `BrowserRenderResult` 增加字段：

```ts
export interface BrowserRenderResult {
  /** 最终多页 HTML 字符串 */
  html: string
  /** 总页数 */
  pageCount: number
  /** 分页布局（调试/高级用途） */
  pageLayouts: PageLayout[]
  /** 测量文档连续内容总高（mm），供连续纸（热敏/标签）推导纸高 */
  contentHeightMm: number
}
```

b. `measureElements` 改为同时返回总高（在读取逐元素高度的同一文档上取连续内容总高）：

```ts
async function measureElements(
  template: PrintTemplateData,
  codeRenderer?: CodeRenderer,
): Promise<{ measured: Map<string, MeasuredElement>; contentHeightMm: number }> {
```

在 `readMeasurements(doc)` 之后、`finally` 之前增加：

```ts
    // 连续内容总高：测量文档为单页连续区域，取文档实际滚动高度（mm）
    const contentHeightMm = Math.max(
      doc.documentElement.scrollHeight,
      doc.body?.scrollHeight ?? 0,
    ) / PX_PER_MM
```

返回 `{ measured: measuredMap, contentHeightMm }`；`renderHtmlPages` 中改为：

```ts
  const { measured: measuredElements, contentHeightMm } = await measureElements(boundTemplate, codeRenderer)
  const pageLayouts = paginate(boundTemplate, measuredElements)
  const html = generateHtml(boundTemplate, pageLayouts, printData as Record<string, any>, {
    codeRenderer,
  })
  return { html, pageCount: pageLayouts.length, pageLayouts, contentHeightMm }
```

c. 验证 core 不回归（happy-dom 下 iframe 布局不真实，不为该字段强写伪单测；字段正确性由 Task 10 Electron 真机渲染验证）：

Run: `npm run test -w @worm-vue3-print/core`
Expected: 既有测试全绿。
Run: `npm run build -w @worm-vue3-print/core`
Expected: 类型与构建通过。

- [ ] **Step 2: 写失败测试 `src/main/paper.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolvePaper } from './paper.js'

const A4 = { width: 210, height: 297 }
const CONT = { width: 80, height: 297 } // 连续纸模板尺寸（设计高度 297）

describe('resolvePaper', () => {
  it('普通模板未传 paperSize：宽高取模板纸张（微米），来源 config', () => {
    const r = resolvePaper({ print: {}, templatePaperMm: A4, contentHeightMm: 120, continuous: false })
    expect(r.paper).toEqual({ width: 210000, height: 297000 })
    expect(r.heightSource).toBe('config')
  })

  it('连续纸模板未传 paperSize：宽度取模板 80mm，高度按测量内容（含底边距）推导', () => {
    const r = resolvePaper({ print: {}, templatePaperMm: CONT, contentHeightMm: 123.456, continuous: true })
    expect(r.paper.width).toBe(80000)
    expect(r.paper.height).toBe(123456)
    expect(r.heightSource).toBe('derived')
  })

  it('连续纸显式传 height：配置覆盖，不走推导', () => {
    const r = resolvePaper({
      print: { paperSize: { height: 200000 } },
      templatePaperMm: CONT, contentHeightMm: 50, continuous: true,
    })
    expect(r.paper).toEqual({ width: 80000, height: 200000 })
    expect(r.heightSource).toBe('config')
  })

  it('连续纸显式传 width+height：全部以配置为准', () => {
    const r = resolvePaper({
      print: { paperSize: { width: 58000, height: 150000 } },
      templatePaperMm: CONT, contentHeightMm: 50, continuous: true,
    })
    expect(r.paper).toEqual({ width: 58000, height: 150000 })
    expect(r.heightSource).toBe('config')
  })

  it('连续纸推导高度最小钳制 25.4mm（1 英寸）', () => {
    const r = resolvePaper({ print: {}, templatePaperMm: CONT, contentHeightMm: 0, continuous: true })
    expect(r.paper.width).toBe(80000)
    expect(r.paper.height).toBe(25400)
    expect(r.heightSource).toBe('derived')
  })

  it('连续纸显式高度为 0/负数视为未传，走推导', () => {
    const r = resolvePaper({
      print: { paperSize: { height: 0 } },
      templatePaperMm: CONT, contentHeightMm: 90, continuous: true,
    })
    expect(r.paper.height).toBe(90000)
    expect(r.heightSource).toBe('derived')
  })

  it('非连续纸传了 paperSize.height：以配置覆盖（自定义纸场景）', () => {
    const r = resolvePaper({
      print: { paperSize: { width: 100000, height: 150000 } },
      templatePaperMm: A4, contentHeightMm: 50, continuous: false,
    })
    expect(r.paper).toEqual({ width: 100000, height: 150000 })
    expect(r.heightSource).toBe('config')
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: FAIL，`Cannot find module './paper.js'`。

- [ ] **Step 4: 实现 `src/main/paper.ts` 与 `src/shared/render-protocol.ts`**

`paper.ts`：

```ts
// 打印纸张解析：连续纸（模板 paperSize==='CONTINUOUS'）按渲染测量高度推导，显式配置可覆盖；其余取模板纸张。
// 单位：微米。
import type { PrintOptions } from '@worm-vue3-print/client'

/** 连续纸推导高度下限：1 英寸（25.4mm），避免 0 高度被驱动拒绝 */
const MIN_CONTINUOUS_HEIGHT_UM = 25400
const MM_TO_UM = 1000

export interface ResolvedPaper {
  paper: { width: number; height: number }
  heightSource: 'config' | 'derived'
}

export function resolvePaper(input: {
  print: PrintOptions
  templatePaperMm: { width: number; height: number }
  contentHeightMm: number
  /** 模板是否连续纸（来自渲染结果 RenderJobResult.continuous） */
  continuous: boolean
}): ResolvedPaper {
  const { print, templatePaperMm, contentHeightMm, continuous } = input
  const ps = print.paperSize
  const overrideWidth = typeof ps?.width === 'number' && ps.width > 0 ? ps.width : undefined
  const overrideHeight = typeof ps?.height === 'number' && ps.height > 0 ? ps.height : undefined

  const templateWidthUm = Math.round(templatePaperMm.width * MM_TO_UM)

  if (continuous) {
    const width = overrideWidth ?? templateWidthUm
    // 显式高度覆盖；否则用测量总高（含模板底边距）推导
    if (overrideHeight) {
      return { paper: { width, height: overrideHeight }, heightSource: 'config' }
    }
    const derived = Math.max(MIN_CONTINUOUS_HEIGHT_UM, Math.round(contentHeightMm * MM_TO_UM))
    return { paper: { width, height: derived }, heightSource: 'derived' }
  }

  // 普通纸：显式覆盖优先，否则取模板纸张
  return {
    paper: {
      width: overrideWidth ?? templateWidthUm,
      height: overrideHeight ?? Math.round(templatePaperMm.height * MM_TO_UM),
    },
    heightSource: 'config',
  }
}
```

`src/shared/render-protocol.ts`：

```ts
// 主进程 ↔ 隐藏渲染 worker 的 IPC 契约（仅类型与通道常量，main / worker-preload 共用）。

export const RENDER_REQUEST_CHANNEL = 'worm:render-request'
export const RENDER_RESPONSE_CHANNEL = 'worm:render-response'

export interface RenderJobSpec {
  templateJson: Record<string, unknown>
  printData?: Record<string, unknown>
  baseUrl?: string
}

export interface RenderJobResult {
  /** 最终 HTML */
  html: string
  pageCount: number
  /** 连续内容总高（mm，含模板底边距），用于连续纸纸高推导 */
  contentHeightMm: number
  /** 模板声明的纸张尺寸（mm，已含方向；连续纸为 纸宽×297 设计高度） */
  templatePaperMm: { width: number; height: number }
  /** 模板是否连续纸 */
  continuous: boolean
}

export type RenderResponse =
  | { ok: true; result: RenderJobResult }
  | { ok: false; message: string }
```

- [ ] **Step 5: 实现 worker 沙箱 preload 与页面**

a. `electron.vite.config.ts` 的 preload 改为多入口（数组形式）：

```ts
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          'worker-preload': resolve(__dirname, 'src/preload/worker-preload.ts'),
        },
      },
    },
  },
```

b. `src/preload/worker-preload.ts`（沙箱 preload 可用最小 Electron API：`ipcRenderer.on/send`）：

```ts
// worker 专用 preload：sandbox=true 下仅暴露渲染请求/响应桥，不泄露其它 ipcRenderer 能力。
import { contextBridge, ipcRenderer } from 'electron'
import { RENDER_REQUEST_CHANNEL, RENDER_RESPONSE_CHANNEL } from '../shared/render-protocol.js'
import type { RenderJobSpec, RenderResponse } from '../shared/render-protocol.js'

contextBridge.exposeInMainWorld('wormRender', {
  /** 注册主进程渲染请求回调，回调返回响应（异步） */
  onRequest(cb: (id: string, spec: RenderJobSpec) => Promise<RenderResponse>): void {
    ipcRenderer.on(RENDER_REQUEST_CHANNEL, (_event, id: string, spec: RenderJobSpec) => {
      void cb(id, spec).then(response => {
        ipcRenderer.send(RENDER_RESPONSE_CHANNEL, id, response)
      })
    })
  },
})
```

> 注意：沙箱 preload 中只能 `require('electron')` 的有限 API；`contextBridge` 与 `ipcRenderer` 均在白名单内。禁止在 preload 里 import core（core 由主世界 worker.ts 打包加载）。

c. `src/worker/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>print-worker</title></head>
  <body style="margin:0">
    <script type="module" src="./worker.ts"></script>
  </body>
</html>
```

d. `src/worker/worker.ts`（**主世界**代码，无 Node API，core 由 vite 打包进 renderer 产物；经桥通信）：

```ts
// 隐藏渲染 worker（contextIsolation 主世界）：跑 core 浏览器侧两遍渲染，经 wormRender 桥返回结果。
import { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'
import { getPaperDimensions, isContinuousPaper } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import type { RenderJobSpec, RenderResponse } from '../shared/render-protocol.js'

declare global {
  interface Window {
    wormRender: {
      onRequest(cb: (id: string, spec: RenderJobSpec) => Promise<RenderResponse>): void
    }
  }
}

window.wormRender.onRequest(async (_id, spec) => {
  try {
    const template = spec.templateJson as PrintTemplateData
    const rendered = await renderHtmlPages(
      template,
      spec.printData,
      spec.baseUrl,
      browserCodeRenderer,
    )
    return {
      ok: true,
      result: {
        html: rendered.html,
        pageCount: rendered.pageCount,
        contentHeightMm: rendered.contentHeightMm,
        templatePaperMm: getPaperDimensions(template),
        continuous: isContinuousPaper(template),
      },
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : '渲染失败' }
  }
})
```

- [ ] **Step 6: 确认构建（worker 沙箱化 + core 打包）**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: paper 7 条及既有用例全绿。
Run: `npm run build -w @worm-vue3-print/print-client`
Expected:
1. `out/preload/worker-preload.js` 与 `out/preload/index.js` 均产出；
2. worker 入口把 `@worm-vue3-print/core`、`@worm-vue3-print/core/browser` 打包进 renderer 产物（若被 `externalizeDepsPlugin` 外置导致主世界 `import` 失败，在 renderer 配置中覆盖：`build.rollupOptions.external = id => /node_modules\/electron|^electron$/.test(id)` 即只外置 electron，其余 workspace 依赖全部打包——以实际产物验证为准）；
3. worker.ts 中**不得出现**任何 `from 'electron'`（lint 检查：`grep -n "from 'electron'" src/worker/*.ts` 应无输出）。

- [ ] **Step 7: 提交**

```bash
git add packages/print-core clients/print-client package-lock.json
git commit -m "feat(print-client)：沙箱 worker 接入 core 浏览器管线，连续纸按测量高度推导纸高"
```

---

## Task 10: 渲染窗口池、渲染引擎与打印参数映射

**Files:**
- Create: `clients/print-client/src/main/renderer-pool.ts`
- Create: `clients/print-client/src/main/render-engine.ts`
- Create: `clients/print-client/src/main/render-engine.test.ts`

**Interfaces:**
- Consumes: Task 9 shared 契约（`RenderJobSpec/RenderJobResult/RENDER_*_CHANNEL`）、`resolvePaper`；SDK 类型 `PrintOptions`；Task 6 `ProtocolFailure`。
- Produces:
  - `interface PreparedPrint { html: string; pageCount: number; paper: { width: number; height: number }; heightSource: 'config' | 'derived' }`
  - `buildWebPrintSettings(print: PrintOptions, paper: { width: number; height: number }): WebPrintSettings`（纯函数；`WebPrintSettings` 为不依赖 electron 类型的本地结构，字段与 Electron `webContents.print` 的 options 对齐）
  - `class RendererPool`：
    - `init(): Promise<void>`（幂等；创建常驻 worker 隐藏窗口，等待 worker 就绪；注册一次 `wormprint://` 字符串协议与渲染进程崩溃重建）
    - `render(spec: RenderJobSpec, timeoutMs?: number): Promise<RenderJobResult>`（经 IPC 配对，超时/失败抛 `ProtocolFailure('RENDER_TIMEOUT' | 'INTERNAL', ...)`）
    - `loadPrintHtml(html: string): Promise<BrowserWindow>`（把 HTML 存入内存 Map，经 `wormprint://print/job/<id>` 载入新建隐藏打印窗口，等待 `did-finish-load`；返回窗口供调用方打印与关闭）
    - `dispose(): Promise<void>`
  - `class RenderEngine`：`constructor(pool: RendererPool)`；`prepare(spec, print): Promise<PreparedPrint>`（worker 渲染 + `resolvePaper`）。

- [ ] **Step 1: 写失败测试 `src/main/render-engine.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildWebPrintSettings } from './render-engine.js'

describe('buildWebPrintSettings', () => {
  it('最小参数：静默、打印背景、自定义纸（微米）、零边距（HTML 自控边距）', () => {
    const s = buildWebPrintSettings({}, { width: 80000, height: 120000 })
    expect(s).toMatchObject({
      silent: true,
      printBackground: true,
      pageSize: { width: 80000, height: 120000 },
      margins: { marginType: 'none' },
      copies: 1,
    })
    expect(s.deviceName).toBeUndefined()
  })

  it('指定打印机/份数/方向/颜色', () => {
    const s = buildWebPrintSettings(
      { printerName: '热敏-80', copies: 3, landscape: true, color: false },
      { width: 80000, height: 120000 },
    )
    expect(s).toMatchObject({
      deviceName: '热敏-80', copies: 3, landscape: true, color: false,
    })
  })

  it('paperName 优先于自定义 pageSize（针式驱动纸型）', () => {
    const s = buildWebPrintSettings({ paperName: 'A4' }, { width: 80000, height: 120000 })
    expect(s.pageSize).toBe('A4')
  })

  it('自定义边距（微米）透传；pageRanges 透传', () => {
    const s = buildWebPrintSettings(
      { margins: { top: 5000, bottom: 5000, left: 4000, right: 4000 }, pageRanges: [{ from: 1, to: 2 }] },
      { width: 210000, height: 297000 },
    )
    expect(s.margins).toEqual({ marginType: 'custom', top: 5000, bottom: 5000, left: 4000, right: 4000 })
    expect(s.pageRanges).toEqual([{ from: 1, to: 2 }])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: FAIL，`Cannot find module './render-engine.js'`。

- [ ] **Step 3: 实现 `src/main/render-engine.ts`**

```ts
// 渲染编排：worker 两遍渲染 + 纸张推导 + Electron 打印参数映射。
import type { PrintOptions } from '@worm-vue3-print/client'
import { resolvePaper } from './paper.js'
import type { RendererPool } from './renderer-pool.js'
import type { RenderJobSpec, RenderJobResult } from '../shared/render-protocol.js'

export interface PreparedPrint {
  html: string
  pageCount: number
  paper: { width: number; height: number }
  heightSource: 'config' | 'derived'
}

/** 与 Electron webContents.print 的 WebPreferences 打印选项对齐（不引 electron 类型以便单测） */
export interface WebPrintSettings {
  silent: boolean
  printBackground: boolean
  copies: number
  deviceName?: string
  landscape?: boolean
  color?: boolean
  pageSize: string | { width: number; height: number }
  margins:
    | { marginType: 'none' | 'default' }
    | { marginType: 'custom'; top: number; bottom: number; left: number; right: number }
  pageRanges?: Array<{ from: number; to: number }>
}

/** 协议打印参数 → Electron 打印设置；core HTML 以 padding 自控边距，故默认零边距 */
export function buildWebPrintSettings(
  print: PrintOptions,
  paper: { width: number; height: number },
): WebPrintSettings {
  const settings: WebPrintSettings = {
    silent: true,
    printBackground: true,
    copies: print.copies && print.copies > 0 ? Math.trunc(print.copies) : 1,
    pageSize: print.paperName ?? { width: paper.width, height: paper.height },
    margins: print.margins
      ? { marginType: 'custom', ...print.margins }
      : { marginType: 'none' },
  }
  if (print.printerName) settings.deviceName = print.printerName
  if (typeof print.landscape === 'boolean') settings.landscape = print.landscape
  if (typeof print.color === 'boolean') settings.color = print.color
  if (print.pageRanges && print.pageRanges.length > 0) settings.pageRanges = print.pageRanges
  return settings
}

export class RenderEngine {
  constructor(private readonly pool: RendererPool) {}

  async prepare(spec: RenderJobSpec, print: PrintOptions): Promise<PreparedPrint> {
    const result: RenderJobResult = await this.pool.render(spec)
    const { paper, heightSource } = resolvePaper({
      print,
      templatePaperMm: result.templatePaperMm,
      contentHeightMm: result.contentHeightMm,
      continuous: result.continuous,
    })
    return {
      html: result.html,
      pageCount: result.pageCount,
      paper,
      heightSource,
    }
  }
}
```

- [ ] **Step 4: 实现 `src/main/renderer-pool.ts`**

```ts
// 隐藏窗口管理：常驻 worker 跑 core 渲染；每任务新建打印窗口承载最终 HTML 静默打印。
import { BrowserWindow, app, protocol } from 'electron'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import {
  RENDER_REQUEST_CHANNEL,
  RENDER_RESPONSE_CHANNEL,
  type RenderJobSpec,
  type RenderJobResult,
  type RenderResponse,
} from '../shared/render-protocol.js'
import { ProtocolFailure } from './protocol-error.js'
import type { Logger } from './logger.js'

const RENDER_TIMEOUT_MS = 30_000
const SCHEME = 'wormprint'

/** 打印窗口 HTML 内存暂存（wormprint:// 协议读取） */
const htmlStore = new Map<string, string>()

interface PendingRender {
  resolve: (r: RenderJobResult) => void
  reject: (e: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

export class RendererPool {
  private worker: BrowserWindow | null = null
  private readonly pendings = new Map<string, PendingRender>()
  private initialized = false
  private protocolRegistered = false

  constructor(private readonly logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>) {}

  /** 幂等初始化：注册协议、创建 worker、绑定响应与崩溃重建 */
  async init(): Promise<void> {
    if (this.initialized) return

    if (!this.protocolRegistered) {
      // 安全协议必须在 app ready 前注册；init 在 whenReady 中调用，此处用 registerSchemesAsPrivileged 的等价兜底：
      // ready 后字符串协议仍可注册，仅需支持 fetch/contentType。
      protocol.registerStringProtocol(SCHEME, (request) => {
        const id = request.url.replace(`${SCHEME}://print/job/`, '')
        const html = htmlStore.get(id)
        if (!html) {
          return { statusCode: 404, data: 'job html not found', mimeType: 'text/plain' }
        }
        return { data: html, mimeType: 'text/html;charset=utf-8' }
      })
      this.protocolRegistered = true
    }

    ipcResponseBridge((id, response) => this.onWorkerResponse(id, response))
    await this.createWorker()
    this.initialized = true
  }

  private async createWorker(): Promise<void> {
    const worker = new BrowserWindow({
      show: false,
      webPreferences: {
        // 沙箱化：worker 主世界页面经 worker-preload 暴露的 wormRender 桥通信
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: join(__dirname, '../preload/worker-preload.js'),
      },
    })
    worker.webContents.on('render-process-gone', (_e, details) => {
      this.logger?.error('渲染 worker 进程崩溃', { reason: details.reason })
      this.failAll(new ProtocolFailure('INTERNAL', '渲染进程崩溃'))
      this.worker = null
      this.initialized = false
      void this.init()
    })
    await worker.loadURL(workerUrl())
    this.worker = worker
  }

  private onWorkerResponse(id: string, response: RenderResponse): void {
    const pending = this.pendings.get(id)
    if (!pending) return
    this.pendings.delete(id)
    clearTimeout(pending.timer)
    if (response.ok) pending.resolve(response.result)
    else pending.reject(new ProtocolFailure('INTERNAL', response.message))
  }

  /** 请求 worker 执行两遍渲染，配对响应；超时返回 RENDER_TIMEOUT */
  render(spec: RenderJobSpec, timeoutMs = RENDER_TIMEOUT_MS): Promise<RenderJobResult> {
    if (!this.worker) {
      return Promise.reject(new ProtocolFailure('INTERNAL', '渲染 worker 未就绪'))
    }
    const id = randomUUID()
    return new Promise<RenderJobResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendings.delete(id)
        reject(new ProtocolFailure('RENDER_TIMEOUT', `渲染超过 ${timeoutMs}ms`))
      }, timeoutMs)
      this.pendings.set(id, { resolve, reject, timer })
      this.worker!.webContents.send(RENDER_REQUEST_CHANNEL, id, spec)
    })
  }

  /** 新建隐藏打印窗口承载最终 HTML；调用方负责打印完成后 win.close() */
  async loadPrintHtml(html: string): Promise<BrowserWindow> {
    const id = randomUUID()
    htmlStore.set(id, html)
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    })
    win.on('closed', () => htmlStore.delete(id))
    await win.loadURL(`${SCHEME}://print/job/${id}`)
    return win
  }

  async dispose(): Promise<void> {
    this.failAll(new ProtocolFailure('INTERNAL', '客户端正在关闭'))
    this.worker?.destroy()
    this.worker = null
    this.initialized = false
  }

  private failAll(err: unknown): void {
    for (const [, p] of this.pendings) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pendings.clear()
  }
}

/** 集中绑定一次 IPC 响应（避免重复注册） */
let bridgeBound = false
function ipcResponseBridge(handler: (id: string, response: RenderResponse) => void): void {
  if (bridgeBound) return
  bridgeBound = true
  // 延迟 require 风格的 import 由打包处理：直接顶层导入 ipcMain
  // （见文件顶部补充 import { ipcMain } from 'electron'）
  ipcMainBridge(handler)
}

// worker 页面构建产物路径（dev 与 build 均由 electron-vite 输出到 out/renderer/worker.html）
function workerUrl(): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/worker.html`
  }
  return pathToFileURL(join(__dirname, '../renderer/worker.html')).toString()
}
```

注意按上面注释补全：文件顶部增加 `import { app as _app, ipcMain, type IpcMainEvent } from 'electron'`（`app` 实际未使用则不导入），并把 `ipcResponseBridge`/`ipcMainBridge` 的占位写法直接实现为：

```ts
import { BrowserWindow, ipcMain, protocol } from 'electron'
```

init 中直接绑定一次：

```ts
    if (!bridgeBound) {
      ipcMain.on(RENDER_RESPONSE_CHANNEL, (_event: IpcMainEvent, id: string, response: RenderResponse) => {
        this.onWorkerResponse(id, response)
      })
      bridgeBound = true
    }
```

删除 `ipcResponseBridge`/`ipcMainBridge` 两个过渡函数；`bridgeBound` 提升为模块级 `let bridgeBound = false`。最终以「测试 + electron-vite build 通过」为准消除未使用导入（`app`、`_app` 不导入）。

- [ ] **Step 5: 运行测试与构建**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: render-engine 4 条及既有用例全绿。
Run: `npm run build -w @worm-vue3-print/print-client`
Expected: main/renderer 构建通过；`out/renderer/worker.html` 与 worker 资源存在（`ls out/renderer` 人工确认）。

- [ ] **Step 6: 提交**

```bash
git add clients/print-client
git commit -m "feat(print-client)：新增渲染窗口池、渲染引擎与打印参数映射"
```

---

## Task 11: 串行锁、请求校验与打印引擎

**Files:**
- Create: `clients/print-client/src/main/serial-gate.ts`
- Create: `clients/print-client/src/main/serial-gate.test.ts`
- Create: `clients/print-client/src/main/request-validation.ts`
- Create: `clients/print-client/src/main/request-validation.test.ts`
- Create: `clients/print-client/src/main/print-engine.ts`

**Interfaces:**
- Consumes: Task 7 `PrinterService`；Task 9 `RenderJobSpec`；Task 10 `RendererPool/RenderEngine/buildWebPrintSettings`；Task 5 `JobHistoryStore/JobRecord`；SDK 类型 `PrintSubmitRequest/PrintOptions`；Task 6 `ProtocolFailure`。
- Produces:
  - `class SerialGate`：`run<T>(fn: () => Promise<T>): Promise<T>`（进入时忙则抛 `ProtocolFailure('BUSY', ...)`；finally 释放）；`get isBusy(): boolean`。
  - `parsePrintSubmit(raw: unknown): { spec: RenderJobSpec; print: PrintOptions }`（纯函数；校验失败抛 `ProtocolFailure('INVALID_REQUEST', ...)`；`print` 缺省时给 `{}`）。
  - `class PrintEngine`：`constructor(deps: { printerService: PrinterService; renderEngine: RenderEngine; pool: RendererPool; history: JobHistoryStore; logger: Pick<Logger,'info'|'warn'|'error'> })`；`submit(raw: unknown): Promise<{ jobId: string }>`。

- [ ] **Step 1: 写失败测试 `serial-gate.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { SerialGate } from './serial-gate.js'

describe('SerialGate', () => {
  it('任务进行中第二个任务被拒绝为 BUSY，结束后恢复可执行', async () => {
    const gate = new SerialGate()
    let release: () => void = () => {}
    const first = gate.run(() => new Promise<void>(r => { release = r }))
    await expect(gate.run(async () => 'x')).rejects.toMatchObject({ code: 'BUSY' })
    expect(gate.isBusy).toBe(true)
    release()
    await first
    expect(gate.isBusy).toBe(false)
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok')
  })

  it('任务抛错后锁必须释放', async () => {
    const gate = new SerialGate()
    await expect(gate.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok')
  })
})
```

- [ ] **Step 2: 写失败测试 `request-validation.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { parsePrintSubmit } from './request-validation.js'

describe('parsePrintSubmit', () => {
  it('合法请求拆分为渲染 spec 与打印参数', () => {
    const r = parsePrintSubmit({
      templateJson: { paperSize: 'A4' },
      printData: { a: 1 },
      baseUrl: 'http://x',
      print: { printerName: 'P', copies: 2, paperSize: { width: 80000 } },
    })
    expect(r.spec).toEqual({ templateJson: { paperSize: 'A4' }, printData: { a: 1 }, baseUrl: 'http://x' })
    expect(r.print).toMatchObject({ printerName: 'P', copies: 2 })
  })

  it('print 缺省合法（走默认打印机/模板纸张）', () => {
    expect(parsePrintSubmit({ templateJson: {} }).print).toEqual({})
  })

  it.each([
    ['非对象', null],
    ['缺 templateJson', { printData: {} }],
    ['templateJson 非对象', { templateJson: 1 }],
    ['print 非对象', { templateJson: {}, print: 1 }],
    ['copies 非法', { templateJson: {}, print: { copies: 0 } }],
    ['paperSize 非对象', { templateJson: {}, print: { paperSize: 1 } }],
    ['paperSize.width 非法', { templateJson: {}, print: { paperSize: { width: -1 } } }],
    ['margins 缺字段', { templateJson: {}, print: { margins: { top: 1 } } }],
  ])('%s → INVALID_REQUEST', (_name, raw) => {
    expect(() => parsePrintSubmit(raw)).toThrowErrorMatchingObject({ code: 'INVALID_REQUEST' })
  })
})
```

`toThrowErrorMatchingObject` 不是 vitest 内建匹配器，实现时改为：

```ts
  ])('%s → INVALID_REQUEST', (_name, raw) => {
    expect(() => parsePrintSubmit(raw)).toThrow()
    try {
      parsePrintSubmit(raw)
      throw new Error('应抛错')
    } catch (err) {
      expect((err as { code?: string }).code).toBe('INVALID_REQUEST')
    }
  })
```

- [ ] **Step 3: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: FAIL，找不到两个模块。

- [ ] **Step 4: 实现 `serial-gate.ts`**

```ts
// 打印任务串行锁：客户端同一时刻只处理一个打印任务，并发直接拒绝（不排队）。
import { ProtocolFailure } from './protocol-error.js'

export class SerialGate {
  private running = false

  get isBusy(): boolean {
    return this.running
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running) {
      throw new ProtocolFailure('BUSY', '客户端正在处理其他打印任务，请稍后重试')
    }
    this.running = true
    try {
      return await fn()
    } finally {
      this.running = false
    }
  }
}
```

- [ ] **Step 5: 实现 `request-validation.ts`**

```ts
// print.submit payload 校验：边界在进入打印引擎前收敛，错误一律 INVALID_REQUEST。
import type { PrintOptions } from '@worm-vue3-print/client'
import { ProtocolFailure } from './protocol-error.js'
import type { RenderJobSpec } from '../shared/render-protocol.js'

function invalid(message: string): never {
  throw new ProtocolFailure('INVALID_REQUEST', message)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

export function parsePrintSubmit(raw: unknown): { spec: RenderJobSpec; print: PrintOptions } {
  if (!isRecord(raw)) invalid('请求体必须是对象')
  if (!isRecord(raw.templateJson)) invalid('templateJson 必须是对象')

  const printRaw = raw.print === undefined ? {} : raw.print
  if (!isRecord(printRaw)) invalid('print 必须是对象')

  const print: PrintOptions = {}
  if (printRaw.printerName !== undefined) {
    if (typeof printRaw.printerName !== 'string') invalid('print.printerName 必须是字符串')
    print.printerName = printRaw.printerName
  }
  if (printRaw.copies !== undefined) {
    if (!isPositiveInt(printRaw.copies)) invalid('print.copies 必须是正整数')
    print.copies = printRaw.copies
  }
  if (printRaw.paperName !== undefined) {
    if (typeof printRaw.paperName !== 'string') invalid('print.paperName 必须是字符串')
    print.paperName = printRaw.paperName
  }
  if (printRaw.landscape !== undefined) {
    if (typeof printRaw.landscape !== 'boolean') invalid('print.landscape 必须是布尔值')
    print.landscape = printRaw.landscape
  }
  if (printRaw.color !== undefined) {
    if (typeof printRaw.color !== 'boolean') invalid('print.color 必须是布尔值')
    print.color = printRaw.color
  }
  if (printRaw.paperSize !== undefined) {
    if (!isRecord(printRaw.paperSize)) invalid('print.paperSize 必须是对象')
    const width = printRaw.paperSize.width
    if (width !== undefined && (!isPositiveInt(width))) invalid('print.paperSize.width 必须是正整数（微米）')
    const height = printRaw.paperSize.height
    if (height !== undefined && (!isPositiveInt(height) && height !== 0)) invalid('print.paperSize.height 必须是正整数或 0（0 表示推导）')
    print.paperSize = { width: width as number | undefined, height: height as number | undefined }
  }
  if (printRaw.margins !== undefined) {
    const m = printRaw.margins
    if (!isRecord(m)) invalid('print.margins 必须是对象')
    for (const k of ['top', 'bottom', 'left', 'right'] as const) {
      if (typeof m[k] !== 'number' || m[k] < 0) invalid(`print.margins.${k} 必须是非负数字（微米）`)
    }
    print.margins = { top: m.top as number, bottom: m.bottom as number, left: m.left as number, right: m.right as number }
  }
  if (printRaw.pageRanges !== undefined) {
    if (!Array.isArray(printRaw.pageRanges)) invalid('print.pageRanges 必须是数组')
    print.pageRanges = printRaw.pageRanges.map((r, i) => {
      if (!isRecord(r) || !isPositiveInt(r.from) || !isPositiveInt(r.to) || r.to < r.from) {
        invalid(`print.pageRanges[${i}] 非法`)
      }
      return { from: r.from as number, to: r.to as number }
    })
  }

  const spec: RenderJobSpec = { templateJson: raw.templateJson }
  if (raw.printData !== undefined) {
    if (!isRecord(raw.printData) && !Array.isArray(raw.printData)) invalid('printData 必须是对象或数组')
    spec.printData = raw.printData as Record<string, unknown>
  }
  if (raw.baseUrl !== undefined) {
    if (typeof raw.baseUrl !== 'string') invalid('baseUrl 必须是字符串')
    spec.baseUrl = raw.baseUrl
  }
  return { spec, print }
}

/** 从模板 JSON 中尽力读取模板名（兼容不同字段） */
export function readTemplateName(templateJson: Record<string, unknown>): string {
  const v = templateJson.templateName ?? templateJson.name ?? templateJson.title
  return typeof v === 'string' && v.length > 0 ? v : '未命名模板'
}
```

- [ ] **Step 6: 实现 `print-engine.ts`**（含 webContents.print 回调，真机验证，不写单测）

```ts
// 打印引擎：串行执行「校验目标打印机 → 两遍渲染 → 载入打印窗口 → 静默出纸 → 记录」。
import { randomUUID } from 'node:crypto'
import type { PrintOptions } from '@worm-vue3-print/client'
import type { Logger } from './logger.js'
import type { JobHistoryStore } from './job-history.js'
import type { PrinterService } from './printer-service.js'
import type { RenderEngine } from './render-engine.js'
import type { RendererPool } from './renderer-pool.js'
import { SerialGate } from './serial-gate.js'
import { ProtocolFailure } from './protocol-error.js'
import { parsePrintSubmit, readTemplateName } from './request-validation.js'
import type { RenderJobSpec } from '../shared/render-protocol.js'

const FONTS_READY_TIMEOUT_MS = 5000

export class PrintEngine {
  private readonly gate = new SerialGate()

  constructor(
    private readonly deps: {
      printerService: PrinterService
      renderEngine: RenderEngine
      pool: RendererPool
      history: JobHistoryStore
      logger: Pick<Logger, 'info' | 'warn' | 'error'>
    },
  ) {}

  get isBusy(): boolean {
    return this.gate.isBusy
  }

  /** 处理 print.submit 原始 payload；成功在出纸回调后才 resolve */
  submit(raw: unknown): Promise<{ jobId: string }> {
    return this.gate.run(() => this.runJob(raw))
  }

  private async runJob(raw: unknown): Promise<{ jobId: string }> {
    const { spec, print } = parsePrintSubmit(raw)
    const jobId = randomUUID()
    const { printerService, renderEngine, pool, history, logger } = this.deps

    const target = await printerService.resolve(print.printerName)
    const settings_input: PrintOptions = { ...print, printerName: target.name }
    const prepared = await renderEngine.prepare(spec as RenderJobSpec, settings_input)

    logger.info('开始打印', {
      jobId, template: readTemplateName(spec.templateJson), printer: target.name,
      paper: prepared.paper, heightSource: prepared.heightSource, pages: prepared.pageCount,
    })

    const win = await pool.loadPrintHtml(prepared.html)
    try {
      await this.waitReady(win.webContents)
      const settings = buildSettings(settings_input, prepared)
      await this.silentPrint(win.webContents, settings)
      history.append({
        jobId, ts: new Date().toISOString(),
        templateName: readTemplateName(spec.templateJson),
        printerName: target.name,
        copies: settings.copies,
        paperMicrometers: prepared.paper,
        paperHeightSource: prepared.heightSource,
        outcome: 'success',
      })
      logger.info('打印完成', { jobId })
      return { jobId }
    } catch (err) {
      const code = err instanceof ProtocolFailure ? err.code : 'PRINT_FAILED'
      const message = err instanceof Error ? err.message : '打印失败'
      history.append({
        jobId, ts: new Date().toISOString(),
        templateName: readTemplateName(spec.templateJson),
        printerName: target.name,
        copies: settings_input.copies ?? 1,
        paperMicrometers: prepared.paper,
        paperHeightSource: prepared.heightSource,
        outcome: 'failed', errorCode: code, errorMessage: message,
      })
      throw err instanceof ProtocolFailure ? err : new ProtocolFailure('PRINT_FAILED', message)
    } finally {
      if (!win.isDestroyed()) win.close()
    }
  }

  /** 等待字体与图片就绪（带兜底超时，不阻塞打印） */
  private async waitReady(wc: Electron.WebContents): Promise<void> {
    await Promise.race([
      wc.executeJavaScript(
        `Promise.all([document.fonts ? document.fonts.ready : true,`
        + ` Promise.all(Array.from(document.images).filter(i => !i.complete)`
        + `   .map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })))])`,
      ),
      new Promise<void>(r => setTimeout(r, FONTS_READY_TIMEOUT_MS)),
    ])
  }

  private silentPrint(
    wc: Electron.WebContents,
    settings: import('./render-engine.js').WebPrintSettings,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      wc.print(settings as Electron.WebContentsPrintOptions, (success, failureReason) => {
        if (success) {
          resolve()
          return
        }
        const reason = String(failureReason ?? '').toLowerCase()
        const code = reason.includes('offline') || reason.includes('unavailable') || reason.includes('not available')
          ? 'PRINTER_OFFLINE'
          : 'PRINT_FAILED'
        reject(new ProtocolFailure(code, `打印失败：${failureReason || '未知原因'}`))
      })
    })
  }
}

// 避免循环导入风险：buildWebPrintSettings 从 render-engine 直接导入
import { buildWebPrintSettings } from './render-engine.js'
import type { PreparedPrint } from './render-engine.js'
function buildSettings(print: PrintOptions, prepared: PreparedPrint) {
  return buildWebPrintSettings(print, prepared.paper)
}
```

实现时把文件底部的 `import { buildWebPrintSettings }` 上移到文件顶部常规 import 区（ESM 静态导入提升，放底部可运行但风格不允许），删除仅做转发的 `buildSettings`，在 `runJob` 中直接调用 `buildWebPrintSettings(settings_input, prepared.paper)`。`Electron.WebContents` / `Electron.WebContentsPrintOptions` 命名空间类型由 electron 包提供（main 进程测试不加载本文件，vitest 不会触发 electron 导入问题——本文件无测试且 vitest 为 node 环境，确认测试收集时本文件不出现在 import 链上：serial-gate/request-validation 测试不导入 print-engine）。

- [ ] **Step 7: 运行测试与构建**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: 新增 10 条断言全绿，既有不回归。
Run: `npm run build -w @worm-vue3-print/print-client`
Expected: 构建通过（TypeScript 对 electron 类型检查通过；若 `wc.print` 的 options 类型与 `WebPrintSettings` 结构不兼容，以 `Electron.WebContentsPrintOptions` 为准微调字段——以 tsc 实际报错为准，不得用 any 绕过命名不匹配）。

- [ ] **Step 8: 提交**

```bash
git add clients/print-client
git commit -m "feat(print-client)：新增串行打印引擎（校验/静默出纸/结果落盘）"
```

---

## Task 12: 协议分发、测试模板、托盘与应用装配

**Files:**
- Create: `clients/print-client/src/main/test-template.ts`
- Create: `clients/print-client/src/main/protocol-handler.ts`
- Create: `clients/print-client/src/main/protocol-handler.test.ts`
- Create: `clients/print-client/src/main/tray.ts`
- Create: `clients/print-client/scripts/smoke.mjs`（真机冒烟脚本，随包提供）
- Modify: `clients/print-client/src/main/renderer-pool.ts`（暴露 `getPrintersAsync()`）
- Modify: `clients/print-client/src/main/index.ts`（替换 Task 4 骨架为完整装配；本任务暂不挂配置窗口，Task 13 接入）

**Interfaces:**
- Consumes: Task 5–10 全部模块；SDK 的 `APP_ID`、`MESSAGE_TYPES`。
- Produces:
  - `TEST_TEMPLATE: Record<string, unknown>`（A4、静态标题 + 当前时间表达式，字段满足 core `TemplateData`：`unit/paperSize/orientation/margins/header/footer/firstPageOverlay/elements`）。
  - `makeMessageHandler(deps: { appId: string; version: string; getPort: () => number; printerService: PrinterService; printEngine: PrintEngine }): MessageHandler`。

- [ ] **Step 1: RendererPool 暴露打印机枚举**

`renderer-pool.ts` 增加方法（复用 worker 的 WebContents，任何 WebContents 均可枚举系统打印机）：

```ts
  /** 枚举系统打印机（委托 worker WebContents） */
  async getPrintersAsync(): Promise<Array<{ name: string; isDefault?: boolean; status?: number }>> {
    if (!this.worker) throw new ProtocolFailure('INTERNAL', '渲染 worker 未就绪')
    return this.worker.webContents.getPrintersAsync()
  }
```

- [ ] **Step 2: 写失败测试 `protocol-handler.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { APP_ID, MESSAGE_TYPES } from '@worm-vue3-print/client'
import { makeMessageHandler } from './protocol-handler.js'

function makeDeps(overrides: { busy?: boolean } = {}) {
  return makeMessageHandler({
    appId: APP_ID,
    version: '0.1.0',
    getPort: () => 17521,
    printerService: {
      list: async () => [{ name: 'PDF', isDefault: true, status: 'idle' }],
    } as any,
    printEngine: {
      submit: async () => ({ jobId: 'j-1' }),
    } as any,
  })
}

describe('makeMessageHandler', () => {
  it('hello 返回应用信息与实际端口', async () => {
    const h = makeDeps()
    await expect(h(MESSAGE_TYPES.HELLO, {})).resolves.toEqual({
      app: APP_ID, version: '0.1.0', port: 17521,
    })
  })

  it('printers.list 返回打印机数组', async () => {
    const h = makeDeps()
    await expect(h(MESSAGE_TYPES.PRINTERS_LIST, {})).resolves.toEqual({
      printers: [{ name: 'PDF', isDefault: true, status: 'idle' }],
    })
  })

  it('print.submit 原样转交打印引擎', async () => {
    const h = makeDeps()
    await expect(h(MESSAGE_TYPES.PRINT_SUBMIT, { templateJson: {} })).resolves.toEqual({ jobId: 'j-1' })
  })

  it('未知 type 返回 INVALID_REQUEST', async () => {
    const h = makeDeps()
    await expect(h('nope', {})).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: FAIL，`Cannot find module './protocol-handler.js'`。

- [ ] **Step 4: 实现 `protocol-handler.ts`**

```ts
// 协议消息分发：type → 业务处理。未知消息按协议返回 INVALID_REQUEST。
import { MESSAGE_TYPES } from '@worm-vue3-print/client'
import type { PrinterService } from './printer-service.js'
import type { PrintEngine } from './print-engine.js'
import { ProtocolFailure } from './protocol-error.js'
import type { MessageHandler } from './ws-server.js'

export interface MessageHandlerDeps {
  appId: string
  version: string
  getPort: () => number
  printerService: PrinterService
  printEngine: PrintEngine
}

export function makeMessageHandler(deps: MessageHandlerDeps): MessageHandler {
  return async (type, payload) => {
    switch (type) {
      case MESSAGE_TYPES.HELLO:
        return { app: deps.appId, version: deps.version, port: deps.getPort() }
      case MESSAGE_TYPES.PRINTERS_LIST:
        return { printers: await deps.printerService.list() }
      case MESSAGE_TYPES.PRINT_SUBMIT:
        return deps.printEngine.submit(payload)
      default:
        throw new ProtocolFailure('INVALID_REQUEST', `未知消息类型：${type}`)
    }
  }
}
```

- [ ] **Step 5: 实现 `src/main/test-template.ts`**

```ts
// 内置测试打印模板：A4 竖版，静态标题 + {printDate} 系统变量，无外部资源，用于「测试打印」全链路自检。
export const TEST_TEMPLATE: Record<string, unknown> = {
  unit: 'mm',
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  elements: [
    {
      id: 'test-title',
      type: 'text',
      options: {
        left: 0, top: 0, width: 180, height: 12,
        formatter: 'worm-vue3-print 客户端测试页',
        fontSize: 16, fontWeight: 'bold', textAlign: 'center',
      },
      printElementType: { type: 'text', title: '文本' },
    },
    {
      id: 'test-time',
      type: 'text',
      options: {
        left: 0, top: 20, width: 180, height: 8,
        formatter: '打印日期：{printDate}',
        fontSize: 11, textAlign: 'center',
      },
      printElementType: { type: 'text', title: '文本' },
    },
    {
      id: 'test-tip',
      type: 'text',
      options: {
        left: 0, top: 34, width: 180, height: 8,
        formatter: '若能看到本页，说明渲染与静默打印链路正常。',
        fontSize: 10, textAlign: 'center',
      },
      printElementType: { type: 'text', title: '文本' },
    },
  ],
}
```

`{printDate}` 是 core 已内置的系统变量（`packages/print-core/src/render/data-binder.ts` 的 `injectSystemVariables`，渲染时替换为 `YYYY-MM-DD`），无需自行注入；不要使用不存在的 `{now}`。

- [ ] **Step 6: 实现 `tray.ts`**

```ts
// 系统托盘：显示端口状态、测试打印、设置（Task 13 接入）、退出。
import { Tray, Menu, nativeImage } from 'electron'

export interface TrayDeps {
  getPort: () => number
  testPrint: (printerName?: string) => Promise<void>
  showSettings: () => void
  quit: () => void
}

export function createTray(deps: TrayDeps): Tray {
  // 1x1 透明图标占位；正式图标资源后续补充（各平台建议 16/32@2x png 或 Template 图）
  const icon = nativeImage.createFromEmpty ? nativeImage.createFromEmpty() : nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  )
  const tray = new Tray(icon)
  tray.setToolTip('worm-vue3-print 静默打印客户端')

  const rebuild = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `监听端口：${deps.getPort()}`, enabled: false },
      { type: 'separator' },
      { label: '测试打印（默认打印机）', click: () => { void deps.testPrint().catch(() => {}) } },
      { label: '设置…', click: () => deps.showSettings() },
      { type: 'separator' },
      { label: '退出', click: () => deps.quit() },
    ]))
  }
  rebuild()
  return { tray, rebuild } as unknown as Tray & { rebuild: () => void }
}
```

实现时按 Electron 实际 API 校正：`nativeImage.createFromEmpty()` 若当前版本不存在则只用 dataURL 分支；返回值保持 `Tray` 类型（rebuild 菜单逻辑直接闭包，测试打印后无需重建则不返回 rebuild）。

- [ ] **Step 7: 完整装配 `src/main/index.ts`**

```ts
// 应用入口：单实例 → 加载配置/日志 → 渲染池 → 打印引擎 → 回环 WS 服务 → 托盘驻留。
import { app } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ID, MESSAGE_TYPES } from '@worm-vue3-print/client'
import { ConfigStore, generatePairingToken } from './config.js'
import { Logger } from './logger.js'
import { JobHistoryStore } from './job-history.js'
import { RendererPool } from './renderer-pool.js'
import { RenderEngine } from './render-engine.js'
import { PrinterService } from './printer-service.js'
import { PrintEngine } from './print-engine.js'
import { WsServer } from './ws-server.js'
import { checkAccess } from './security.js'
import { makeMessageHandler } from './protocol-handler.js'
import { TEST_TEMPLATE } from './test-template.js'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // 窗口全部关闭也驻留托盘（Task 13 设置窗口关闭同理）
  app.on('window-all-closed', (e: Event) => e.preventDefault())

  app.whenReady().then(async () => {
    const userData = app.getPath('userData')
    const configStore = new ConfigStore(join(userData, 'config.json'))
    const cfg = configStore.load()
    if (cfg.securityEnabled && !cfg.pairingToken) {
      configStore.update({ pairingToken: generatePairingToken() })
    }

    const logger = new Logger({
      level: configStore.current.logLevel,
      filePath: join(userData, 'logs', 'client.log'),
    })

    const history = new JobHistoryStore(join(userData, 'jobs.jsonl'), 500)
    const pool = new RendererPool(logger)
    await pool.init()
    const printerService = new PrinterService(() => pool.getPrintersAsync())
    const renderEngine = new RenderEngine(pool)
    const printEngine = new PrintEngine({ printerService, renderEngine, pool, history, logger })

    const server = new WsServer({
      preferredPort: configStore.current.port,
      handler: makeMessageHandler({
        appId: APP_ID,
        version: app.getVersion(),
        getPort: () => server.port,
        printerService,
        printEngine,
      }),
      checkAccess: input => checkAccess(input, configStore.current),
      logger,
    })
    const port = await server.start()

    const testPrint = async (printerName?: string) => {
      await printEngine.submit({ templateJson: TEST_TEMPLATE, printData: {}, print: { printerName } })
    }

    // Task 13 将替换此占位为创建配置窗口
    const showSettings = () => { logger.info('设置窗口将在后续版本提供') }
    const tray = createTrayQuiet({ getPort: () => server.port, testPrint, showSettings, quit: () => app.quit() })
    void tray
    void MESSAGE_TYPES

    app.setLoginItemSettings({ openAtLogin: configStore.current.autoStart })
    logger.info('客户端启动完成', { port, version: app.getVersion() })

    app.on('before-quit', async () => {
      await server.stop()
      await pool.dispose()
    })
  }).catch((err) => {
    console.error('启动失败：', err)
    app.quit()
  })
}
```

补 `createTrayQuiet` 的导入：直接 `import { createTray } from './tray.js'` 并调用（删除占位函数名与多余的 `void MESSAGE_TYPES`）；`fileURLToPath` 未使用则不导入。before-quit 是同步事件，异步清理用 `event.preventDefault()` + 清理完成后再 `app.exit(0)` 的模式实现：

```ts
    app.on('before-quit', (e) => {
      e.preventDefault()
      void (async () => {
        await server.stop().catch(() => {})
        await pool.dispose().catch(() => {})
        app.exit(0)
      })()
    })
```

注意防止退出重入（模块级 `let quitting = false` 守卫）。

- [ ] **Step 8: 真机冒烟脚本 `scripts/smoke.mjs`**

```js
#!/usr/bin/env node
// 真机冒烟：node scripts/smoke.mjs [printerName]
// 依次发 hello → printers.list → print.submit（内置 A4 测试模板到默认或指定打印机）
import { WebSocket } from 'ws'

const port = Number(process.env.PORT || 17521)
const printerName = process.argv[2]
const ws = new WebSocket(`ws://127.0.0.1:${port}`)
let seq = 0
function rpc(type, payload) {
  return new Promise((resolve, reject) => {
    const id = 'smoke-' + ++seq
    const onMsg = (data) => {
      const msg = JSON.parse(String(data))
      if (msg.id === id) { ws.off('message', onMsg); msg.ok ? resolve(msg.payload) : reject(Object.assign(new Error(msg.error.message), { code: msg.error.code })) }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, type, payload }))
  })
}
ws.on('open', async () => {
  try {
    console.log('hello =>', await rpc('hello', {}))
    const { printers } = await rpc('printers.list', {})
    console.log('printers =>', printers.map(p => `${p.name}${p.isDefault ? '（默认）' : ''}[${p.status}]`).join('、') || '（无）')
    const print = { printerName }
    Object.keys(print).forEach(k => print[k] === undefined && delete print[k])
    console.log('print =>', await rpc('print.submit', {
      templateJson: TEST_TEMPLATE_JSON,
      printData: {},
      print,
    }))
    ws.close()
  } catch (e) { console.error('冒烟失败：', e.code ?? '', e.message); process.exitCode = 1; ws.close() }
})
ws.on('error', (e) => { console.error('无法连接客户端：', e.message); process.exit(1) })
```

`TEST_TEMPLATE_JSON` 通过读取编译产物获取，避免重复维护：脚本内改为

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const TEST_TEMPLATE_JSON = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/main/test-template.ts'), 'utf-8')) // TS 不可直接 JSON.parse
```

上述不可行，最终做法：把测试模板的**数据**抽到 `src/main/test-template.json`（纯 JSON），`test-template.ts` 改为 `import data from './test-template.json' with { type: 'json' }` 并 `export const TEST_TEMPLATE = data as Record<string, unknown>`（electron-vite/TS 支持 JSON 导入，tsconfig 已开 resolveJsonModule）；冒烟脚本 `readFileSync` 该 JSON。Step 5 相应改为创建 `test-template.json` + 一行 re-export 的 `test-template.ts`。

- [ ] **Step 9: 手工真机验证（macOS，本机执行）**

Run: `npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/client && npm run dev -w @worm-vue3-print/print-client`
Expected: 应用启动，日志输出 `客户端启动完成 { port: 17521 }`，托盘出现图标。

另开终端：

Run: `node clients/print-client/scripts/smoke.mjs`
Expected: 打印出 A4 测试页（无默认打印机时先在 系统设置→打印机 中确认有可用打印机，或传打印机名参数）；记录输出到 PR 描述。再次快速连跑两次验证第二次返回 `BUSY`（若任务已结束则不会 BUSY——并发拒绝的逻辑由单测保证，手工仅验证正常链路）。

- [ ] **Step 10: 运行全部测试、构建并提交**

Run: `npm run test -w @worm-vue3-print/print-client && npm run build -w @worm-vue3-print/print-client`
Expected: 全绿、构建通过。

```bash
git add clients/print-client
git commit -m "feat(print-client)：装配应用（协议分发/托盘/测试打印/真机冒烟脚本）"
```

---

## Task 13: 配置窗口（preload 桥、IPC、Vue 设置/记录/日志界面）

**Files:**
- Create: `clients/print-client/src/main/main-window.ts`
- Create: `clients/print-client/src/preload/index.ts`（填充 Task 4 占位）
- Create: `clients/print-client/src/preload/preload.api.ts`（窗口 API 类型，renderer 引用）
- Create: `clients/print-client/src/renderer/index.html`（填充占位）
- Create: `clients/print-client/src/renderer/main.ts`（填充占位）
- Create: `clients/print-client/src/renderer/App.vue`
- Create: `clients/print-client/src/renderer/style.css`
- Modify: `clients/print-client/src/main/print-engine.ts`（增加任务落盘事件）
- Modify: `clients/print-client/src/main/index.ts`（接入设置窗口、日志/任务推送、配置热应用）

**Interfaces:**
- Consumes: `ConfigStore`、`Logger`、`JobHistoryStore`、`PrinterService`、`PrintEngine`、`WsServer`。
- Produces:
  - `PrintEngine.onSettled(cb: (record: JobRecord) => void): () => void`
  - preload 暴露 `window.wormPrint`：
    - `getState(): Promise<{ config: AppConfig; port: number; version: string }>`
    - `saveConfig(patch: Partial<AppConfig>): Promise<AppConfig>`
    - `listPrinters(): Promise<PrinterInfo[]>`
    - `testPrint(printerName?: string): Promise<void>`
    - `listHistory(): Promise<JobRecord[]>`
    - `onLog(cb: (entry: LogEntry) => void): () => void`
    - `onJob(cb: (record: JobRecord) => void): () => void`
  - IPC 通道常量集中在 `preload.api.ts` 旁的 `src/shared/settings-protocol.ts`（main/preload 共用）。

- [ ] **Step 1: PrintEngine 增加落盘事件**

`print-engine.ts` 中：

a. 构造器旁增加：

```ts
  private readonly settledCbs = new Set<(record: JobRecord) => void>()

  /** 订阅任务最终结果（成功/失败均回调，已含落盘记录） */
  onSettled(cb: (record: JobRecord) => void): () => void {
    this.settledCbs.add(cb)
    return () => this.settledCbs.delete(cb)
  }

  private emitSettled(record: JobRecord): void {
    for (const cb of this.settledCbs) cb(record)
  }
```

b. 两处 `history.append(...)` 后分别调用 `this.emitSettled(记录对象)`——重构为先构造 `record` 变量、`history.append(record)`、`this.emitSettled(record)`，避免重复字面量。需要 import `JobRecord` 类型。

- [ ] **Step 2: 共享 IPC 契约 `src/shared/settings-protocol.ts`**

```ts
// 主进程 ↔ 配置窗口 IPC 通道（main 与 preload 共用常量）。
export const SETTINGS_IPC = {
  GET_STATE: 'worm:settings:get-state',
  SAVE_CONFIG: 'worm:settings:save-config',
  LIST_PRINTERS: 'worm:settings:list-printers',
  TEST_PRINT: 'worm:settings:test-print',
  LIST_HISTORY: 'worm:settings:list-history',
  LOG_EVENT: 'worm:settings:log-event',
  JOB_EVENT: 'worm:settings:job-event',
} as const
```

- [ ] **Step 3: preload 安全桥**

`src/preload/index.ts`：

```ts
// 配置窗口唯一桥接层：contextIsolation 开启，白名单暴露最小 API。
import { contextBridge, ipcRenderer } from 'electron'
import { SETTINGS_IPC } from '../shared/settings-protocol.js'

const api = {
  getState: () => ipcRenderer.invoke(SETTINGS_IPC.GET_STATE),
  saveConfig: (patch: unknown) => ipcRenderer.invoke(SETTINGS_IPC.SAVE_CONFIG, patch),
  listPrinters: () => ipcRenderer.invoke(SETTINGS_IPC.LIST_PRINTERS),
  testPrint: (printerName?: string) => ipcRenderer.invoke(SETTINGS_IPC.TEST_PRINT, printerName),
  listHistory: () => ipcRenderer.invoke(SETTINGS_IPC.LIST_HISTORY),
  onLog: (cb: (entry: unknown) => void) => {
    const listener = (_e: unknown, entry: unknown) => cb(entry)
    ipcRenderer.on(SETTINGS_IPC.LOG_EVENT, listener)
    return () => ipcRenderer.off(SETTINGS_IPC.LOG_EVENT, listener)
  },
  onJob: (cb: (record: unknown) => void) => {
    const listener = (_e: unknown, record: unknown) => cb(record)
    ipcRenderer.on(SETTINGS_IPC.JOB_EVENT, listener)
    return () => ipcRenderer.off(SETTINGS_IPC.JOB_EVENT, listener)
  },
}

contextBridge.exposeInMainWorld('wormPrint', api)
export type WormPrintApi = typeof api
```

`src/preload/preload.api.ts`：

```ts
// renderer 通过三斜线指令或直接 import 获取窗口 API 类型（仅类型，无运行时代码）。
import type { AppConfig, LogLevel } from '../main/config.js'
import type { LogEntry } from '../main/logger.js'
import type { JobRecord } from '../main/job-history.js'
import type { PrinterInfo } from '@worm-vue3-print/client'
import type typeApi from './index.js'

declare global {
  interface Window {
    wormPrint: {
      getState: () => Promise<{ config: AppConfig; port: number; version: string }>
      saveConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>
      listPrinters: () => Promise<PrinterInfo[]>
      testPrint: (printerName?: string) => Promise<void>
      listHistory: () => Promise<JobRecord[]>
      onLog: (cb: (entry: LogEntry) => void) => () => void
      onJob: (cb: (record: JobRecord) => void) => () => void
    }
  }
}
export type { LogLevel }
```

若 `import type typeApi from './index.js'` 引起循环/构建问题，删除该行——全局声明已自足。

- [ ] **Step 4: 主进程窗口管理 `src/main/main-window.ts`**

```ts
// 配置窗口：注册设置 IPC、推送实时日志与任务事件；单例窗口。
import { BrowserWindow, ipcMain, app } from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { SETTINGS_IPC } from '../shared/settings-protocol.js'
import type { ConfigStore, AppConfig } from './config.js'
import { generatePairingToken } from './config.js'
import type { Logger, LogEntry } from './logger.js'
import type { JobHistoryStore, JobRecord } from './job-history.js'
import type { PrinterService } from './printer-service.js'
import type { PrintEngine } from './print-engine.js'
import { TEST_TEMPLATE } from './test-template.js'

export interface MainWindowDeps {
  configStore: ConfigStore
  logger: Logger
  history: JobHistoryStore
  printerService: PrinterService
  printEngine: PrintEngine
  getPort: () => number
}

export class MainWindowManager {
  private win: BrowserWindow | null = null

  constructor(private readonly deps: MainWindowDeps) {}

  registerIpc(): void {
    ipcMain.handle(SETTINGS_IPC.GET_STATE, () => ({
      config: this.deps.configStore.current,
      port: this.deps.getPort(),
      version: app.getVersion(),
    }))

    ipcMain.handle(SETTINGS_IPC.SAVE_CONFIG, (_e, patch: Partial<AppConfig>) => {
      const next = { ...patch }
      // 首次开启安全开关时自动生成 token
      if (next.securityEnabled && !this.deps.configStore.current.pairingToken) {
        next.pairingToken = generatePairingToken()
      }
      // 端口变更需重启生效：仍保存，UI 展示提示
      const saved = this.deps.configStore.update(next)
      this.deps.logger.setLevel(saved.logLevel)
      app.setLoginItemSettings({ openAtLogin: saved.autoStart })
      this.deps.logger.info('配置已更新', { restartNeeded: next.port !== undefined && next.port !== this.deps.getPort() })
      return saved
    })

    ipcMain.handle(SETTINGS_IPC.LIST_PRINTERS, () => this.deps.printerService.list())

    ipcMain.handle(SETTINGS_IPC.TEST_PRINT, async (_e, printerName?: string) => {
      await this.deps.printEngine.submit({
        templateJson: TEST_TEMPLATE, printData: {}, print: { printerName },
      })
    })

    ipcMain.handle(SETTINGS_IPC.LIST_HISTORY, () =>
      this.deps.history.list().slice(-200).reverse())
  }

  /** 实时事件推送到已打开的窗口 */
  bindPushEvents(): void {
    this.deps.logger.onLog((entry: LogEntry) => {
      this.win?.webContents.send(SETTINGS_IPC.LOG_EVENT, entry)
    })
    this.deps.printEngine.onSettled((record: JobRecord) => {
      this.win?.webContents.send(SETTINGS_IPC.JOB_EVENT, record)
    })
  }

  show(): void {
    if (this.win) {
      if (this.win.isMinimized()) this.win.restore()
      this.win.focus()
      return
    }
    this.win = new BrowserWindow({
      width: 860, height: 640, minWidth: 720, minHeight: 520,
      title: 'worm-vue3-print 打印客户端设置',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
    this.win.on('closed', () => { this.win = null })
    const url = process.env.ELECTRON_RENDERER_URL
      ? `${process.env.ELECTRON_RENDERER_URL}/index.html`
      : pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
    void this.win.loadURL(url)
  }
}
```

- [ ] **Step 5: renderer 页面**

`src/renderer/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>打印客户端设置</title></head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/renderer/main.ts`：

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import '../../preload/preload.api.js'

createApp(App).mount('#app')
```

若该类型侧导入导致构建入口异常，删除该行，改为在 `env.d.ts`（新建 `src/renderer/env.d.ts`，内容 `/// <reference path="../../preload/preload.api.ts" />`）声明。

`src/renderer/style.css`（系统字体、紧凑表单风格，不依赖 UI 库；包含 `.tabs/.tab/.panel/.row/.log/.jobs table/.muted/.danger` 基础样式）：

```css
:root { color-scheme: light dark; font-size: 13px; }
body { margin: 0; font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
#app { padding: 16px 20px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--divider, #ddd); margin-bottom: 16px; }
.tab { padding: 8px 16px; cursor: pointer; border: none; background: none; font-size: 13px; border-bottom: 2px solid transparent; }
.tab.active { border-bottom-color: #2563eb; color: #2563eb; font-weight: 600; }
.row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.row label { width: 110px; flex: none; color: var(--muted, #666); }
.row input[type="number"], .row input[type="text"], .row select, .row textarea {
  padding: 5px 8px; border: 1px solid var(--divider, #ccc); border-radius: 4px; min-width: 240px;
}
.row textarea { width: 360px; height: 64px; font-family: ui-monospace, monospace; }
button { padding: 6px 14px; border: 1px solid var(--divider, #ccc); background: var(--btn, #f5f5f5); border-radius: 4px; cursor: pointer; }
button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
.muted { color: var(--muted, #888); font-size: 12px; }
.danger { color: #dc2626; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--divider, #eee); }
.log { font-family: ui-monospace, monospace; font-size: 11px; height: 420px; overflow: auto;
  background: rgba(127,127,127,0.08); border-radius: 6px; padding: 8px; white-space: pre-wrap; }
.log .error { color: #dc2626; } .log .warn { color: #d97706; }
```

`src/renderer/App.vue`（三个标签页；script setup TS，全部走 `window.wormPrint`）：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AppConfig } from '../main/config.js'
import type { PrinterInfo } from '@worm-vue3-print/client'
import type { JobRecord } from '../main/job-history.js'
import type { LogEntry } from '../main/logger.js'

const tab = ref<'settings' | 'jobs' | 'logs'>('settings')
const config = ref<AppConfig | null>(null)
const port = ref(0)
const version = ref('')
const printers = ref<PrinterInfo[]>([])
const testPrinter = ref('')
const saveMsg = ref('')
const testMsg = ref('')
const jobs = ref<JobRecord[]>([])
const logs = ref<LogEntry[]>([])
const originsText = ref('')

onMounted(async () => {
  const state = await window.wormPrint.getState()
  config.value = state.config
  port.value = state.port
  version.value = state.version
  originsText.value = state.config.allowedOrigins.join('\n')
  printers.value = await window.wormPrint.listPrinters()
  jobs.value = await window.wormPrint.listHistory()
  window.wormPrint.onLog(e => { logs.value.push(e); if (logs.value.length > 1000) logs.value.shift() })
  window.wormPrint.onJob(r => { jobs.value.unshift(r) })
})

async function save() {
  if (!config.value) return
  const patch: Partial<AppConfig> = {
    ...config.value,
    allowedOrigins: originsText.value.split('\n').map(s => s.trim()).filter(Boolean),
  }
  config.value = await window.wormPrint.saveConfig(patch)
  saveMsg.value = '已保存（端口变更需重启客户端生效）'
  setTimeout(() => (saveMsg.value = ''), 3000)
}

async function doTestPrint() {
  testMsg.value = '打印中…'
  try {
    await window.wormPrint.testPrint(testPrinter.value || undefined)
    testMsg.value = '已发送到打印机'
  } catch (e) {
    testMsg.value = `失败：${(e as Error).message}`
  }
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <div>
    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'settings' }" @click="tab = 'settings'">设置</button>
      <button class="tab" :class="{ active: tab === 'jobs' }" @click="tab = 'jobs'">任务记录</button>
      <button class="tab" :class="{ active: tab === 'logs' }" @click="tab = 'logs'">日志</button>
      <span class="muted" style="margin-left:auto;align-self:center">v{{ version }}　端口 {{ port }}</span>
    </div>

    <div v-if="tab === 'settings' && config">
      <div class="row"><label>监听端口</label>
        <input type="number" v-model.number="config.port" min="1024" max="65535" /></div>
      <div class="row"><label>开机自启</label>
        <input type="checkbox" v-model="config.autoStart" /></div>
      <div class="row"><label>日志级别</label>
        <select v-model="config.logLevel">
          <option value="debug">debug</option><option value="info">info</option>
          <option value="warn">warn</option><option value="error">error</option>
        </select></div>
      <div class="row"><label>安全开关</label>
        <input type="checkbox" v-model="config.securityEnabled" />
        <span class="muted">开启后校验配对 token，Origin 白名单非空时同时校验来源</span></div>
      <template v-if="config.securityEnabled">
        <div class="row"><label>配对 token</label>
          <input type="text" :value="config.pairingToken" readonly style="min-width:360px" />
          <span class="muted">首次开启自动生成</span></div>
        <div class="row" style="align-items:flex-start"><label>Origin 白名单</label>
          <textarea v-model="originsText" placeholder="https://erp.example.com（每行一个；留空仅校验 token）"></textarea></div>
      </template>
      <div class="row"><label></label><button class="primary" @click="save">保存设置</button>
        <span class="muted">{{ saveMsg }}</span></div>

      <hr style="margin:18px 0;border:none;border-top:1px solid var(--divider,#eee)" />
      <div class="row"><label>测试打印</label>
        <select v-model="testPrinter">
          <option value="">系统默认打印机</option>
          <option v-for="p in printers" :key="p.name" :value="p.name">
            {{ p.name }}{{ p.isDefault ? '（默认）' : '' }} [{{ p.status }}]
          </option>
        </select>
        <button @click="doTestPrint">打印测试页</button></div>
      <div class="row"><label></label><span class="muted">{{ testMsg }}</span></div>
    </div>

    <div v-else-if="tab === 'jobs'">
      <table>
        <thead><tr><th>时间</th><th>模板</th><th>打印机</th><th>份数</th><th>纸宽×纸高(μm)</th><th>纸高</th><th>结果</th></tr></thead>
        <tbody>
          <tr v-for="j in jobs" :key="j.jobId">
            <td>{{ fmtTime(j.ts) }}</td><td>{{ j.templateName }}</td><td>{{ j.printerName }}</td>
            <td>{{ j.copies }}</td><td>{{ j.paperMicrometers.width }}×{{ j.paperMicrometers.height }}</td>
            <td>{{ j.paperHeightSource === 'derived' ? '推导' : '配置' }}</td>
            <td :class="j.outcome === 'failed' ? 'danger' : ''">
              {{ j.outcome === 'success' ? '成功' : `失败：${j.errorCode ?? ''} ${j.errorMessage ?? ''}` }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else>
      <div class="log">
        <div v-for="(l, i) in logs" :key="i" :class="l.level">
          [{{ fmtTime(l.ts) }}] {{ l.level.toUpperCase() }} {{ l.message }}{{ l.meta ? ' ' + JSON.stringify(l.meta) : '' }}
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 6: 入口接入窗口管理**

修改 `src/main/index.ts`：

a. 新增 import：`import { MainWindowManager } from './main-window.js'`；删除 `createTray` 的占位调用方式，统一在装配区创建。

b. 在 `server.start()` 之后：

```ts
    const mainWindow = new MainWindowManager({
      configStore, logger, history, printerService, printEngine,
      getPort: () => server.port,
    })
    mainWindow.registerIpc()
    mainWindow.bindPushEvents()
```

c. 托盘的 `showSettings` 改为 `() => mainWindow.show()`；单实例第二个实例启动时也唤起窗口：

```ts
  app.on('second-instance', () => mainWindow.show())
```

（`mainWindow` 需声明在 whenReady 回调外层可访问的外层变量，或把 second-instance 注册移到 whenReady 内部。）

- [ ] **Step 7: 构建与手工验证**

Run: `npm run build -w @worm-vue3-print/print-client`
Expected: main/preload/renderer 三环境构建通过，无 Vue 模板类型错误。

Run: `npm run dev -w @worm-vue3-print/print-client`
Expected: 托盘「设置…」打开窗口；三项逐一手工验证：
1. 设置页展示端口 17521、可改日志级别保存后日志页出现新级别过滤效果；安全开关打开后出现 token 与白名单；
2. 任务记录初始为空，点「打印测试页」成功后记录实时出现一行；
3. 日志页实时滚动，打印过程可见「开始打印/打印完成」。

- [ ] **Step 8: 运行全量测试并提交**

Run: `npm run test -w @worm-vue3-print/print-client`
Expected: 既有用例全绿（本任务无新增自动化测试，UI 以手工清单验证）。

```bash
git add clients/print-client
git commit -m "feat(print-client)：新增配置窗口（设置/任务记录/日志/测试打印）"
```

---

## Task 14: 绿色目录打包、全仓接线与文档

**Files:**
- Create: `clients/print-client/electron-builder.yml`
- Modify: `clients/print-client/package.json`（pack 脚本、build 配置字段、electron-builder devDep）
- Modify: `package.json`（根 build/test 纳入 sdk 与 client）
- Create: `clients/print-client/README.md`
- Modify: `README.md`（根 README 增加客户端与 SDK 章节；若根 README 结构不便，则在其中「生态/包列表」处追加两行）

**Interfaces:**
- Consumes: 前 12 个任务的全部产物。
- Produces: `npm run pack:dir -w @worm-vue3-print/print-client` 产出**不安装即可运行**的绿色目录（mac: `dist/mac/<App>.app`；win: `dist/win-unpacked/`；linux: `dist/linux-unpacked/`），三平台只能在对应系统上构建对应产物（electron-builder 限制，不做跨平台编译）。

- [ ] **Step 1: 安装 electron-builder 并加脚本**

```bash
npm install -D -w @worm-vue3-print/print-client electron-builder
```

`clients/print-client/package.json` 的 `scripts` 调整为：

```json
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "pack:dir": "electron-vite build && electron-builder --dir"
```

- [ ] **Step 2: electron-builder 配置 `electron-builder.yml`**

```yaml
appId: com.worm-vue3-print.client
productName: WormPrintClient
copyright: MIT
directories:
  output: dist
  buildResources: build
# 绿色目录版：--dir 只产出 unpacked 目录，不产出安装包
files:
  - out/**/*
  - package.json
# workspace 依赖（@worm-vue3-print/client）与 ws 需从其 dist 打进 asar：
# electron-builder 自动收集 dependencies；要求打包前 sdk 已 build（见 pack:dir 前置）
asar: true
mac:
  target:
    - target: dir
  category: public.app-category.utilities
win:
  target:
    - target: dir
linux:
  target:
    - target: dir
  category: Utility
```

`pack:dir` 前置依赖 SDK 与 core 的 dist（workspace 包以 dist 形式被收集）。脚本改为：

- macOS/Linux shell 与跨平台兼容写法直接在 package.json 中用顺序命令（不依赖 rimraf）：

```json
    "pack:dir": "npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/client && electron-vite build && electron-builder --dir"
```

（在 workspace 包内执行 `npm run build -w <name>` 需要 npm 7+，当前环境满足；如执行者验证该写法在包目录下不可用，降级为根目录统一打包脚本根 package.json：`"pack:client:dir": "npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/client && npm run pack:dir -w @worm-vue3-print/print-client"`，二选一以实测为准。）

- [ ] **Step 3: 根仓库构建/测试接线**

修改根 `package.json`：

```json
  "scripts": {
    "build": "npm run build -w @worm-vue3-print/core && npm run build -w @worm-vue3-print/canvas && npm run build -w @worm-vue3-print/render && npm run build -w @worm-vue3-print/client && npm run build -w @worm-vue3-print/print-client",
    "test": "npm run test -w @worm-vue3-print/core && npm run test -w @worm-vue3-print/canvas && npm run test -w @worm-vue3-print/client && npm run test -w @worm-vue3-print/print-client"
  }
```

注意：print-client 的 `build` 是 electron-vite 构建（非 tsc 库构建），纳入根 build 前确认其无交互、无残留进程；`electron-builder` 不纳入根 build。

- [ ] **Step 4: 全量回归**

Run: `npm test`
Expected: core / canvas / client(sdk) / print-client 全部测试通过。

Run: `npm run build`
Expected: 五个工作区构建全部成功。

- [ ] **Step 5: macOS 绿色目录打包并运行验证**

Run: `npm run pack:dir -w @worm-vue3-print/print-client`（或 Step 2 确定的根脚本）
Expected: `clients/print-client/dist/mac/WormPrintClient.app` 生成。

验证：
1. 双击启动 `.app`（未签名时右键→打开），托盘出现，设置窗口可用；
2. `node clients/print-client/scripts/smoke.mjs` 走通 hello/枚举/测试页；
3. 开启安全开关保存后，不带 token 的 smoke 连接被拒（`UNAUTHORIZED`），带 token（URL 加 `?token=`，临时改 smoke 或用 wscat）成功——验证开关闭环后恢复默认关闭状态；
4. 配置与记录文件位于 `~/Library/Application Support/worm-vue3-print-client/`（`app.getPath('userData')` 实际名以 productName/name 实测为准，在 README 写明三平台路径）。

- [ ] **Step 6: 客户端 README**

`clients/print-client/README.md` 必须包含：

1. 功能简介与架构图（WS 回环 → 协议层 → 渲染 worker（core/browser）→ webContents.print 静默出纸）；
2. 目录结构说明（main / preload / renderer / worker / shared / scripts）；
3. 开发：`npm run dev`、`npm test`、`npm run build`；
4. 绿色版打包：`npm run pack:dir`，三平台产物目录与「各平台需在本系统构建」说明；
5. WebSocket 协议：帧格式、三类消息、错误码表、端口发现（17521 起 +1）、`print.submit` payload 字段表（单位微米）；
6. 安全：默认仅回环；开关开启后 token（连接 URL `?token=`）+ Origin 白名单语义；宿主 SDK `pair(token)`；
7. 纸长策略：仅对模板「连续纸」（paperSize=CONTINUOUS）生效——显式 height 优先，否则按渲染测量总高（含模板底边距）推导（最小 1 英寸）；普通纸使用模板纸张；真机连续纸精度需现场验证；
8. 连续纸设计：设计器页面属性选择「连续纸」，默认纸宽 80mm（可改 58/76 等）、设计高度固定 297mm、强制纵向、底边距即末尾走纸留白（默认 0）；
9. 配置/日志/任务记录文件位置（mac `~/Library/Application Support/<userData>/`、Win `%APPDATA%\<userData>\`、Linux `~/.config/<userData>/`）；
10. 平台注意：mac 未签名右键打开；Linux 依赖 CUPS（`libgtk-3-0` 等 electron-builder 提示的系统库按报错安装）；针式打印机优先用驱动纸型 `paperName`；字体需客户机已装；
11. 真机验证清单（枚举 → A4 测试页 → 指定打印机/份数 → 连续纸 58/80 推导纸长与底边距 → 脱机报错 → 安全开关），标注 macOS 已验证、Win/Linux 待验证项。

- [ ] **Step 7: 根 README 生态章节**

在根 `README.md` 的包列表/生态位置追加（保持原有排版风格）：

```md
- `@worm-vue3-print/client`（packages/print-client-sdk）：静默打印客户端的浏览器端 SDK（WebSocket 连接、打印机枚举、打印调用）。
- `@worm-vue3-print/print-client`（clients/print-client）：跨平台（Win/Linux/macOS）Electron 静默打印桌面客户端，本地复用同构渲染管线出纸。详见 clients/print-client/README.md。
```

- [ ] **Step 8: 提交**

```bash
git add package.json clients/print-client package-lock.json README.md
git commit -m "feat(print-client)：绿色目录打包、全仓构建接线与客户端文档"
```

---

## 真机验证总清单（交付前勾选）

自动化测试覆盖协议、编解码、校验、串行锁、连续纸分页/CSS、纸高推导、安全纯函数、WS 回环集成；以下为必须在真实系统确认的事项：

- [ ] macOS：绿色版启动、托盘、设置窗口三个标签页、A4 测试页（含 `{printDate}` 替换）出纸、指定打印机、任务记录与日志实时刷新（Task 13/14 执行）。
- [ ] macOS：安全开关开/关两路径（Task 14 Step 5）。
- [ ] Windows 10/11：绿色目录启动、默认打印机、`getPrintersAsync` 中文打印机名、针式驱动纸型 `paperName`。
- [ ] Linux（Ubuntu 桌面）：绿色目录启动、CUPS 打印、缺系统库时按 README 安装。
- [ ] 连续纸 58/80mm：设计器配置「连续纸」（默认 80×297、可改纸宽与底边距），客户端按测量总高（含底边距）推导纸高出纸，检查末尾留白/走纸长度公差（即原 p4 问题，开发后真机验证）；不满足时宿主显式传 `print.paperSize.height` 覆盖，结论补记客户端 README。
- [ ] 脱机/缺纸：返回 `PRINTER_OFFLINE`/`PRINT_FAILED` 且任务记录可查、锁已释放可再次打印。

Win/Linux/连续纸三项若当次无法验证，在 PR 描述中明确列为待验证项，不得声称已通过。

## Self-Review 记录（计划作者自检，执行者无需操作）

- spec 覆盖：协议三消息 ✓、八类错误码均有产生点 ✓、端口发现（SDK 探测 + 服务端递增）✓、安全开关（默认关/token/Origin/UI/pair）✓、连续纸（core CONTINUOUS 纸型/设计器配置/测量推导/显式覆盖/最小钳制）✓、JSONL 500 条 ✓、分级日志与窗口推送 ✓、托盘/设置/记录/日志/测试打印 ✓、单实例/驻留/自启 ✓、worker 崩溃重建 ✓、worker 沙箱 preload ✓、绿色版三平台 ✓、SDK README ✓。
- 既有包改动有两处，均安排全量回归：Task 8 给 core/canvas 增加 CONTINUOUS（纯增量联合类型，旧 JSON 不受影响）；Task 9 给 core/browser 增加 `contentHeightMm` 增量字段。
- 连续纸判定只看模板 `paperSize==='CONTINUOUS'`（worker 回传 `continuous` 标志），与宿主是否传 `print.paperSize` 解耦；`resolvePaper` 单一判定点。
- 底边距不新增字段，复用模板 `margins.bottom`；测量文档 scrollHeight 含 padding-bottom，推导高度自动包含走纸留白。
- 类型一致性：`PrintOptions.paperSize.width/height` 均为可选（Task 1），Task 11 校验逐字段校验、height 允许 0，Task 9 `resolvePaper` 以 `>0` 判定显式值，三处语义一致。
- 已知执行期校正点（已在对应任务内写明，不是占位）：tray 图标 API、electron-vite 对 core 的外置处理（worker 主世界必须打包 core）、print 选项以 Electron 实际类型微调、pack 脚本位置。
