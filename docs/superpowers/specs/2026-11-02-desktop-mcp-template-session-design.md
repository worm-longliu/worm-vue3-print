# 桌面客户端内置 MCP 与浏览器模板会话 — 设计说明

日期：2026-11-02　影响包：`@worm-vue3-print/{core,print-client,mcp}`、`demo`

## 一、需求与裁决

用户裁决（2026-11-02）：

- 使用现有桌面打印客户端承载 MCP，不要求用户额外安装 MCP 网关或 Electron 之外的伴生工具。
- 用户本地 AI Agent 通过标准 MCP 连接桌面客户端，读取并修改浏览器中正在编辑的打印模板。
- 允许桌面客户端新增 MCP 依赖；用户安装包不变，依赖随客户端分发。
- 不使用远程 MCP，不把模板内容上传到服务器，不实现服务端模型调用或模型密钥代理。

目标链路：

```text
浏览器 demo / PrintDesigner
  │ 本地 WebSocket（模板会话）
  ▼
桌面客户端回环 HTTP + WebSocket 服务
  ├─ /mcp：MCP Streamable HTTP（AI Agent → 桌面端）
  └─ WebSocket：打印协议 + 模板会话协议（桌面端 ↔ 浏览器）
  ▲
  │
本地 AI Agent
```

## 二、现有事实与边界

- 桌面客户端主进程已启动仅绑定 `127.0.0.1` 的 WebSocket 服务，默认端口 `17521`，被占用时递增。
- 现有 WebSocket 协议是“浏览器请求、桌面响应”，只有 `hello`、`printers.list`、`print.submit`、`print.submitHtml` 四类消息。
- 浏览器 SDK 已具备端口探测、握手鉴权、请求超时和指数退避重连，但只能处理响应，不能处理桌面端主动请求。
- `WsServer` 当前直接使用 `WebSocketServer({ port })` 监听端口，没有可复用的 HTTP 路由层。
- 现有 `@worm-vue3-print/mcp` 已提供 6 个工具：元素清单、模板校验、表达式校验、版面体检、草稿生成、渲染预览；入口目前只启动 stdio。
- 桌面客户端当前只声明依赖 `@worm-vue3-print/core`。本设计经用户批准，调整为：
  - `clients/print-client` 主进程可依赖 `@worm-vue3-print/mcp`，并间接使用 `@worm-vue3-print/contract` 与 `@modelcontextprotocol/sdk`。
  - 桌面客户端仍不得依赖 `@worm-vue3-print/canvas`、`@worm-vue3-print/render` 或重复实现测量、纸高推导、码制渲染与出图逻辑。
  - 渲染进程继续只消费 `@worm-vue3-print/core/client` 的类型与 SDK。

## 三、传输与服务拓扑

### 3.1 单回环端口

把现有 `WsServer` 重构为同时承载 HTTP 与 WebSocket 的本地回环服务，继续保留端口递增与现有鉴权入口：

- `ws://127.0.0.1:<port>/`：现有浏览器 WebSocket 协议。
- `http://127.0.0.1:<port>/mcp`：MCP Streamable HTTP。
- 其余 HTTP 路径返回 404。
- 只监听 `127.0.0.1`，不增加公网绑定、CORS 或远程代理。

实现口径：

- 使用 `node:http` 创建 HTTP Server。
- 使用 `new WebSocketServer({ noServer: true })`，在 `upgrade` 事件中完成 token/Origin 鉴权后 `handleUpgrade`。
- 端口占用时仍按现有 `port + 1` 策略探测，浏览器与 MCP 共用实际端口。
- 不新增 MCP 专用端口，不改变浏览器 SDK 的端口探测区间。
- HTTP 与 WebSocket upgrade 都校验 `Host` 必须是 `127.0.0.1:<实际端口>`；不匹配时 HTTP 返回 403，upgrade 直接销毁 socket，防 DNS rebinding。
- `POST /mcp` 请求体上限 4 MiB，超过返回 413；`maxPayload` 同样限制 WebSocket 帧，避免模板写回造成无界内存占用。
- `stop()` 先拒绝新连接与请求，再终止 WebSocket 客户端、关闭 MCP transport，最后关闭 HTTP Server 及 keep-alive socket。

### 3.2 MCP 传输

- 使用 MCP Streamable HTTP，不使用现有业务 WebSocket JSON 帧直接充当 MCP。
- `POST /mcp` 使用无状态模式：每个请求创建独立 `StreamableHTTPServerTransport` 与低层 `Server`，设置 `sessionIdGenerator: undefined`、`enableJsonResponse: true`，工具状态由主进程内的模板会话注册表提供。
- 请求完成后关闭本次 transport 与 Server；不保留 SSE、GET 长连接或跨请求 MCP 会话状态。
- `GET /mcp`、`DELETE /mcp` 返回 405；本能力不提供服务端主动通知，AI 工具调用均为请求-响应。
- 桌面端工具列表 = 现有工具中 5 个安全工具 + 3 个模板会话工具，共 8 个；`print_render_preview` 仅保留在 stdio 连接器，不进入桌面端。
- MCP Server 名称使用 `worm-vue3-print-client`，版本取 `app.getVersion()`。

### 3.3 开关与鉴权

新增配置项：

```ts
mcpEnabled: boolean // 默认 false
```

- `mcpEnabled=false` 时 `/mcp` 返回 404，WebSocket 打印链路不受影响。
- `mcpEnabled` 可在设置页即时切换，不需要重启；每个 HTTP 请求读取当前配置。
- `mcpEnabled=true` 时，`/mcp` **始终**必须携带 `Authorization: Bearer <pairingToken>`，与 `securityEnabled` 无关；缺失或错误统一返回 401，且不得进入 JSON-RPC 分发。
- 开启 MCP 时若 `pairingToken` 为空则立即生成；token 使用常量时间比较。`securityEnabled` 继续只控制打印 WebSocket 的 token/Origin，不改变 MCP 鉴权。
- 不新增第二个 token；复用现有配对 token，并提供重新生成与复制 MCP 配置的入口。
- 威胁模型明确为：防跨源网页、DNS rebinding 与未持有 token 的本机调用；不宣称防御已取得同用户文件权限的恶意进程。
- 日志不得输出完整 token 或模板正文。

## 四、WebSocket 模板会话协议

### 4.1 帧模型

保留现有请求帧 `{ id, type, payload }` 与响应帧 `{ id, ok, payload | error }`。

新增“桌面端 → 浏览器”的请求帧，形状同样为 `{ id, type, payload }`；浏览器以响应帧回复。由此 WebSocket 变成双向请求-响应，但已有四个消息及 SDK 调用方式不破坏。

实现必须显式区分方向，不能靠复用当前单边派发器：

- 浏览器收到无 `ok` 字段、含 `id/type/payload` 的帧时按桌面端请求处理；现有 `decodeServerMessage()` 保持响应语义不变，另外导出请求解码函数，避免破坏公开返回类型。
- 桌面端收到含布尔 `ok` 的帧时按响应处理并路由到该连接的 pending 表；否则才按现有请求派发。响应 id 不存在时忽略并记 debug，不得当成业务请求。
- 两端请求 id 使用方向前缀（桌面端 `srv-`、浏览器现有格式不变），每个连接维护独立 pending 表；超时、连接关闭、会话替换都要 reject 并清理对应 pending。
- 同一模板会话的 `template.get` / `template.apply` 串行执行；apply 并发时后到请求按 revision 冲突处理，不允许两次写回交错。

新增错误码：

- `SESSION_NOT_FOUND`：模板会话不存在。
- `SESSION_DISCONNECTED`：模板页面已断开。
- `REVISION_CONFLICT`：当前模板已变化，拒绝覆盖。
- `INVALID_TEMPLATE`：AI 写回的模板结构或契约不合法。

### 4.2 浏览器 → 桌面端请求

`template.attach`

```ts
{
  sessionId: string   // 浏览器生成，标签页内重连复用
  name: string        // 例如“综合示例模板”
  url: string         // 页面地址，用于用户识别
  templateName?: string
}
```

响应 `{ sessionId }`。`sessionId` 必须是 16–128 位 `[A-Za-z0-9_-]` 的不透明随机串；`name` 截断到 120 字符，`url` 只保留 origin + pathname 并截断到 512 字符，不保存 query/hash。注册表最多保留 32 个会话，超出拒绝 attach。

同一 `sessionId` 重连时，只有 Origin 与旧连接相同才可替换旧连接；不同 Origin 返回 `UNAUTHORIZED`。未提供 Origin 的模板会话直接拒绝。连接关闭时自动移除会话并拒绝该连接的 pending。

`template.detach`

主动注销当前连接绑定的模板会话，best-effort，页面卸载时调用。

### 4.3 桌面端 → 浏览器请求

`template.get`

```ts
{}
```

响应：

```ts
{
  sessionId: string
  revision: string
  templateJson: unknown
  fields?: unknown[]
  printData?: unknown
  templateName?: string
}
```

`template.apply`

```ts
{
  baseRevision: string
  templateJson: unknown
  reason?: string
}
```

响应：

```ts
{
  revision: string
  templateJson: unknown
  issues?: unknown[]
  warnings?: unknown[]
}
```

浏览器必须先比较当前模板的 revision 与 `baseRevision`：

- 不一致：返回 `REVISION_CONFLICT`，不得修改画布。
- 一致：把新模板写回画布，生成新 revision，作为**一步历史记录**返回。

### 4.4 revision 口径

- revision 是当前模板 JSON 的不透明内容指纹，不是递增计数。
- 浏览器每次执行 `template.get` 或 `template.apply` 时，基于当前 `getTemplateJson()` 重新计算。
- 使用 `crypto.subtle.digest('SHA-256', UTF-8(JSON.stringify(templateJson)))`；环境不支持时退化为稳定的 FNV-1a 十六进制串。
- 服务端不解析 revision 语义，只透传和比较。
- revision 只用于防止覆盖并发修改，不承担安全校验。

### 4.5 多标签页

- 每个浏览器连接最多绑定一个模板会话。
- 每个标签页使用 `sessionStorage` 保存自己的 `sessionId`，重连后复用。
- 桌面端注册表以 `sessionId` 为键，保存连接、名称、URL、最近活跃时间。
- MCP 工具在只存在一个会话时自动选中；存在多个且未传 `sessionId` 时返回可行动错误并列出候选。

## 五、MCP 工具契约

### 5.1 复用现有工具

`packages/print-mcp` 调整为可被其他进程复用：

- `index.ts` 不再在导入时启动 stdio，改为导出工具注册表与 Server 工厂。
- 新增独立 stdio 入口文件 `stdio.ts`，`package.json` 的 `bin` 与 `start` 改指该产物，`main` 保持无副作用库入口。
- `createPrintMcpServer()` 接受可选工具列表、名称与版本；默认仍为现有 6 个工具。
- 新增 `createTemplateSessionTools(bridge)`，bridge 是宿主注入的模板会话接口，避免 MCP 包依赖 Electron。
- 新增桌面安全工具集工厂：从现有工具中剔除 `print_render_preview`，并对三个接受 `templatePath` 的工具同时移除 schema 字段与运行时入参；伪造传入时返回 `isError=true`，不读取文件。

桌面端组合：

```ts
const tools = [
  ...createDesktopPrintTools(),
  ...createTemplateSessionTools(templateSessionRegistry),
]
```

### 5.2 新增工具

`print_list_open_templates`

- 入参：无。
- 返回：`{ sessions: Array<{ sessionId, name, url, templateName?, lastActiveAt }> }`。
- 注解：只读、无副作用、不访问外界。

`print_get_open_template`

- 入参：`sessionId?`。
- 返回：`{ session, revision, templateJson, fields?, printData? }`。
- 行为：向浏览器发送 `template.get` 并等待实时快照，不返回启动时缓存。
- 注解：只读、无副作用、不访问外界。

`print_apply_open_template`

- 入参：`sessionId?`、`baseRevision`、`templateJson`、`reason?`。
- 行为：
  1. 先调用契约层 `validateTemplateJson`；存在 error 直接拒绝，不触达浏览器。
  2. 拒绝 `html` 等 core `BLOCKED_ELEMENT_TYPES` 元素，检查范围覆盖所有页及 header/footer；该门禁不能只存在于 `print_draft_template`。
  3. 序列化后超过 4 MiB 直接拒绝；校验通过后使用契约层返回的规范化数据。
  4. 通过模板会话 bridge 发送 `template.apply`。
  5. 返回浏览器确认后的新 revision、模板快照与 warnings。
- 注解：非只读、`destructiveHint: true`、不访问外界，宿主应要求用户批准。
- 描述必须明确：整份替换当前画布模板，用户可用一次撤销恢复。

### 5.3 工具错误

MCP 工具结果使用 `isError=true` 与可行动中文文本，不向 AI 泄漏堆栈：

- 没有打开的模板页面。
- 多标签页但未指定 `sessionId`。
- 会话断开或请求超时。
- revision 冲突。
- 模板契约 error。
- MCP 未启用或鉴权失败由 HTTP 层处理，不进入工具处理器。

## 六、浏览器 SDK 与 demo 接入

### 6.1 `@worm-vue3-print/core/client`

- `decodeServerMessage()` 扩展为可识别响应帧与桌面端请求帧。
- `WsTransport` 新增单请求处理器注册能力：收到桌面端请求后调用处理器，并自动发送成功或失败响应。
- 未注册处理器时，对桌面端请求回复 `INVALID_REQUEST`，不静默挂起。
- `PrintClient` 透传 `onRequest()`；新增带类型的模板会话辅助方法或以泛型请求方法承载。
- 现有 `print()`、`printHtml()`、打印机枚举与重连行为保持不变。
- 浏览器 SDK 不依赖 Vue，不引入 MCP 包或 Node API。

### 6.2 demo 模板会话

新增 demo 侧 `template-session` 模块：

- 页面加载后尝试连接桌面客户端；客户端未启动时按固定退避重试，不阻塞设计器使用。
- 连接成功及每次重连后发送 `template.attach`。
- 处理 `template.get`：读取 `designerRef.getTemplateJson()`、字段树、当前打印数据，计算 revision 后返回。
- 处理 `template.apply`：
  1. 计算当前 revision 并与 `baseRevision` 比较。
  2. 再次拒绝 `html` 等封禁类型，并校验多页/单页模板外壳与 `paperSize`、`margins`、`elements` 关键结构。
  3. 深拷贝写回 `templateData`，由 `PrintDesigner` 的 `initialTemplate` 监听重载画布。
  4. 等待 `nextTick` 后重新读取模板并计算新 revision。
  5. 返回 apply 结果；写回只产生一次历史记录。
- 写回成功后清空当前示例标识，并给用户可见提示“AI 已修改模板，可撤销”。
- 页面卸载时 best-effort 发送 `template.detach`。
- demo 顶栏显示 AI 连接状态，区分“未启动客户端 / 已连接 / 有模板会话 / 写入冲突”。

### 6.3 非 demo 宿主

- 模板会话能力不绑定 demo；宿主只需使用浏览器 SDK 注册请求处理器并实现 `getTemplateJson` / 写回。
- 本次不实现画布内 AI 面板，不引入模型 SDK，不直连模型域名。

## 七、桌面客户端设置与启动

### 7.1 配置

- `AppConfig` 新增 `mcpEnabled: boolean`，默认 `false`。
- 旧配置文件缺少该字段时回退默认值，不迁移、不报错。
- `parseConfig` 必须显式保留该字段；新增 config round-trip 测试，防设置页开启后下一次保存被静默写回 false。
- 端口变更仍按现有规则提示重启；MCP 开关即时生效。

### 7.2 设置页

新增“AI 助手”区：

- 启用 AI 助手连接开关。
- 展示实际 MCP URL：`http://127.0.0.1:<实际端口>/mcp`。
- 展示已连接模板会话数量；多会话时列出名称与 URL。
- 提供复制 JSON 配置的按钮或等价说明。
- 启用 MCP 后展示 Bearer token 与完整 headers 配置；不依赖 `securityEnabled`。不回显模板内容。
- 关闭状态下显示“未启用”，不暴露无效 endpoint 为可用状态。
- 端口漂移导致实际 URL 与上次不同时显示醒目提示“请更新 AI Agent 的 MCP 配置”，不把旧地址标成可用。

### 7.3 启动与关闭

- 本地 HTTP + WebSocket 服务启动后即可处理模板会话。
- `/mcp` 是否可用按当前配置每次请求判断。
- 应用退出前关闭所有浏览器连接和 MCP 传输，拒绝未完成请求。
- 模板会话仅驻留内存；客户端退出或页面关闭后不持久化，不写入模板文件。

## 八、打包与依赖

- `clients/print-client` 新增运行时依赖 `@worm-vue3-print/mcp`。
- `@worm-vue3-print/mcp` 保持 `private`，随 Electron 安装包分发，不新增用户安装步骤。
- 根脚本与 `pack:client:dir`、`pack:client`、`pack:client:linux` 在构建客户端前显式构建 `core`、`contract`、`mcp`，禁止依赖本机旧 `dist`。
- `print-mcp` 的 `tsup` 同时产出库入口与 stdio 入口；`files` 与 bin 指向必须一致。
- `npm run pack:client:dir`、macOS/Windows 打包、Linux 打包均需实际启动验证 MCP 模块被装入；至少在 `--dir` 产物中确认 `print-mcp`、`contract`、`@modelcontextprotocol/sdk` 均在 asar 内。
- 若 electron-builder 对 workspace 私有包打包异常，优先把 `print-mcp` 及其纯 JS 传递依赖作为主进程依赖打包；不得复制工具实现到客户端。
- 更新 README、AI 接入文档与客户端 README，写明“客户端内置 MCP、仅本机回环、页面需保持打开”。

## 九、错误处理与安全

| 场景 | 行为 |
|---|---|
| 未启用的 MCP | `/mcp` 404 |
| MCP 已启用但 Bearer 缺失/错误 | 401，不调用工具；与 `securityEnabled` 无关 |
| 无打开页面 | 工具返回“请先打开模板页面并保持连接” |
| 多标签页未指定 | 返回会话列表与 `sessionId` 选择提示 |
| 请求浏览器超时 | 默认 5 秒；apply 10 秒；返回可重试错误 |
| 会话中途断开 | 立即拒绝 pendings，返回 `SESSION_DISCONNECTED` |
| revision 冲突 | 不改画布，返回 `REVISION_CONFLICT` 与重新读取建议 |
| 模板契约 error | 工具层拒绝，浏览器不收到写请求 |
| 畸形 WebSocket/JSON-RPC | 现有 `INVALID_REQUEST`，不抛未捕获异常 |

安全要求：

- 本地服务只绑定回环地址，禁止监听 `0.0.0.0`。
- 不添加 CORS 头；MCP 面向本地 Agent，不面向浏览器网页。
- 校验 `Host` 与请求体上限，拒绝 DNS rebinding 与无界请求。
- `destructiveHint` 只是宿主提示，不作为服务端授权；服务端授权由 Bearer token 保证。页面同时提供撤销与可见提示。
- token、字段数据和模板正文不进日志。
- 模板只存在于内存；桌面 MCP 工具集不读取 `templatePath`、不调用远程渲染、不新增模板文件落盘面。

## 十、测试与验收

### 10.1 自动化测试

- `core/client`：响应帧兼容、桌面端请求解码、处理器成功/失败回复、超时、未注册处理器。
- `print-client`：HTTP + WebSocket 共端口、端口递增、WS 鉴权、双向请求-响应、会话注册/替换/断开、revision 冲突、MCP 开关与 Bearer 鉴权、设置 IPC。
- `print-mcp`：组合工具列表、三个模板会话工具入参/错误路径、apply 前契约与 html 封禁拦截、`templatePath` 运行时拒绝、stdio 入口行为不回退。
- MCP HTTP 集成：使用 SDK Client 连接本地 `/mcp`，验证 `tools/list` 包含 8 个工具，且 `print_apply_open_template` 能经假浏览器连接完成一次写回。
- `print-client`：Host 校验、4 MiB 上限、401 时不进入工具处理器、MCP 开关即使 `securityEnabled=false` 仍要求 Bearer、config round-trip。
- `core/client`：双向帧方向判定、响应路由、并发 apply 串行、旧响应解码行为不变。
- demo：`typecheck`、`build`；浏览器 SDK 与 demo 模板会话模块的类型检查。
- 架构：`npm run lint:print-architecture` 通过。

### 10.2 手工验收

1. 不启用 MCP 时，`/mcp` 404，现有打印链路不受影响。
2. 设置页启用 MCP，复制地址与 Bearer 配置；客户端重启后若端口变化，设置页必须提示更新 Agent 配置。
3. 打开 demo，顶栏显示已连接桌面客户端；设置页显示 1 个模板会话。
4. AI 调用 `print_list_open_templates`、`print_get_open_template`，拿到当前模板、字段、打印数据和 revision。
5. AI 修改模板后调用 `print_apply_open_template`，画布立即更新，一次 Ctrl+Z 回到修改前。
6. AI 使用旧 revision 再写一次，返回 `REVISION_CONFLICT`，画布不变。
7. 打开两个 demo 标签页，不传 `sessionId` 时返回候选；指定后只修改目标标签页。
8. 关闭页面后调用工具，返回会话不存在或已断开，不挂起。
9. 不开启打印安全开关、仅启用 MCP 时，不带 Bearer 调用 `/mcp` 仍返回 401；带正确 token 可正常使用。
10. 打包后的 macOS/Windows/Linux 客户端启动即包含 MCP 能力，无额外安装步骤。
11. 从 HTTPS 宿主页用 Chrome/Edge/Firefox/Safari 实测连接 `ws://127.0.0.1:<port>`；被混合内容策略拦截时记录为浏览器限制，不得标记通过。

## 十一、明确不做

- 不做远程 MCP、公网 WSS、OAuth、多人共享会话。
- 不做服务端模型调用、模型密钥管理或画布内 AI 聊天面板。
- 不做模板持久化、云端同步或文件自动保存。
- 不把浏览器页面本身作为 MCP Server。
- 不支持页面关闭后继续修改模板。
- 不新增独立 MCP 端口，不改变现有打印 WebSocket 端口探测行为。
- 不在桌面端复制 `print-mcp` 的工具实现；工具契约仍由 `packages/print-mcp` 单一维护。
- 桌面端不提供 `print_render_preview`、远程模板渲染或 `templatePath` 文件读取。
