# MCP 使用与集成指南

> ← 返回 [文档总览](../文档总览.md) · 相关：[AI 接入](./AI接入.md)（设计与边界）、[静默打印](./静默打印.md)、[表达式引擎](./表达式引擎.md)

本文面向**想在自己项目里用上 worm-vue3-print MCP 能力的开发者**：如何把打印模板的生成、校验、版面体检、草稿等能力接入你已有的 AI agent（Claude Desktop / Cursor / Claude Code / 自建 agent 均可）。

设计边界与工具的深度说明见 [AI 接入](./AI接入.md)，本文不重复展开，只讲「怎么接」。

## 一、MCP 能做什么

连接器把本仓库的**模板契约层**暴露成 MCP 工具，让你的 AI 直接具备：

- 认识模板：元素类型、表达式函数白名单、单位口径速查（`print_element_kinds`）
- 生成模板：从需求草稿出合法模板 JSON（`print_draft_template`）
- 自查模板：契约校验 + 静态版面体检（`print_validate_template` / `print_inspect_layout`）
- 校验表达式（`print_check_expression`）
- 真实分页预览：调 render 服务出 PDF（`print_render_preview`，仅 stdio 形态）
- 读写浏览器里**正在编辑**的模板（模板会话三件套，仅桌面客户端形态）

连接器**不调用任何模型、不持有模型密钥**——模型与工具循环都在你已有的 agent 一侧。

## 二、前置准备：获取连接器

`@worm-vue3-print/mcp` 是 monorepo 内的 **private 包，未发布到 npm**。接入前先克隆仓库并构建（连接器消费 core / contract 的构建产物）：

```bash
git clone https://github.com/worm-longliu/worm-vue3-print.git
cd worm-vue3-print
npm install
npm run build
```

构建完成后，stdio 入口在 `packages/print-mcp/dist/stdio.js`（包内 `bin` 名为 `worm-vue3-print-mcp`）。

## 三、场景 A：在 MCP 客户端里配置 stdio 服务

适合：你有 Claude Desktop、Cursor、Claude Code、Cline 或任意支持 stdio MCP 的客户端，想「配一下就能用」。

### 通用配置

```json
{
  "mcpServers": {
    "worm-vue3-print": {
      "command": "node",
      "args": ["/绝对路径/worm-vue3-print/packages/print-mcp/dist/stdio.js"],
      "env": {
        "PRINT_RENDER_BASE_URL": "http://127.0.0.1:3001",
        "RENDER_API_KEY": "dev-render-key"
      }
    }
  }
}
```

要点：

- `env` 两项**都可省略**。省略时 `print_render_preview` 返回降级说明，其余 5 个工具照常工作。
- 需要 `print_render_preview` 出真实 PDF 时，先把渲染服务跑起来：`npm run dev -w @worm-vue3-print/render`（默认 3001，依赖 Playwright Chromium），`RENDER_API_KEY` 与服务端同名环境变量一致（服务端缺省 `dev-render-key`）。
- **只支持本地 stdio**：没有远程 streamable HTTP、没有 OAuth。需要远程形态请自行加代理，不在本仓库设计边界内。
- 各客户端字段名略有差异（`command/args/env` vs `url/headers`），语义相同，对照你所用客户端的文档填即可。

### Claude Desktop

配置文件位置：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

把上面的通用配置填进 `mcpServers`，重启 Claude Desktop，工具图标里能看到 `worm-vue3-print` 即接入成功。

### Cursor

全局配置 `~/.cursor/mcp.json`，或项目级 `.cursor/mcp.json`（随仓库共享给团队），结构与通用配置一致：

```json
{
  "mcpServers": {
    "worm-vue3-print": {
      "command": "node",
      "args": ["/绝对路径/worm-vue3-print/packages/print-mcp/dist/stdio.js"]
    }
  }
}
```

### Claude Code

命令行一步注册（`--scope user` 全局，`--scope project` 写入项目 `.mcp.json`）：

```bash
claude mcp add --scope user worm-vue3-print -- node /绝对路径/worm-vue3-print/packages/print-mcp/dist/stdio.js
```

### 配置后验证

重启客户端看到服务上线，或手工握手验证工具列表：

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node packages/print-mcp/dist/stdio.js
```

返回的 `tools` 数组应包含 6 个 `print_*` 工具。

## 四、场景 B：桌面客户端内置 MCP（读写正在编辑的模板）

适合：你的用户在浏览器设计器里画模板，希望 AI **直接改画布上的实时模板**，而不是对一份静态 JSON。

1. 安装并打开桌面打印客户端（`clients/print-client`），在设置页开启「AI 助手」（`mcpEnabled`，默认关）。
2. 设置页会直接生成并展示一段接入 JSON（端口被占用时自动递增，以设置页实际展示为准）：

```json
{
  "mcpServers": {
    "worm-vue3-print": {
      "url": "http://127.0.0.1:17521/mcp",
      "headers": { "Authorization": "Bearer <设置页展示的配对 token>" }
    }
  }
}
```

3. 把这段 JSON 贴进你的 MCP 客户端即可。此形态提供 **8 个工具**：5 个纯计算工具 + 3 个模板会话工具（`print_list_open_templates` / `print_get_open_template` / `print_apply_open_template`），**没有** `print_render_preview`，也不接受 `templatePath` 入参（模板内容来自打开的设计器页面或由 AI 本次生成）。

### 你的 Web 页面要做什么

会话工具读写的是**浏览器正在编辑的实时模板**，宿主页面需要用浏览器 SDK（`@worm-vue3-print/core/client`）注册处理函数并签到。demo 已有完整实现，直接照抄 `demo/src/template-session.ts`：

```ts
import { PrintClient, WormPrintError } from '@worm-vue3-print/core/client'
import { findBlockedElementPaths } from '@worm-vue3-print/core/designer'

const client = new PrintClient()
client.setRequestHandler(async (type, payload) => {
  if (type === 'template.get') {
    const templateJson = designer.getTemplateJson()
    return { sessionId, revision: await revisionOf(templateJson), templateJson }
  }
  if (type === 'template.apply') {
    // payload.baseRevision 不匹配当前 revision → throw new WormPrintError('REVISION_CONFLICT', …)
    // 模板含 html 等封禁元素 → throw new WormPrintError('INVALID_TEMPLATE', …)
    // 通过后写回画布（设计器记录一步历史），重新读取并返回 { revision, templateJson }
  }
  throw new WormPrintError('INVALID_REQUEST', '浏览器侧不支持处理请求')
})
client.attachTemplate({ sessionId, name: document.title, url: location.href })
```

关键语义：

- `apply` 是**整份替换**且要求携带读取时返回的 `revision`（防覆盖他人修改，冲突返回 `REVISION_CONFLICT`）；一次撤销可恢复。
- 会话快照实时、无缓存；**页面关闭或客户端退出即失效**，不落盘。
- 鉴权只认 `Authorization: Bearer <配对 token>`，与客户端安全开关无关。

## 五、场景 C：在自己的 agent / Node 服务里编程式嵌入

适合：你有自建 agent 框架或 MCP 网关，不想多起一个 stdio 子进程，想把工具直接嵌进自己的进程。

`@worm-vue3-print/mcp` 的**库入口（`dist/index.js`）无任何副作用**（stdio 启动在单独的 `dist/stdio.js`），可以在 workspace 内直接 import：

```ts
import { createPrintMcpServer } from '@worm-vue3-print/mcp'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

// 默认注册 stdio 形态的 6 个工具；transport 由你决定
const server = createPrintMcpServer()
await server.connect(new StdioServerTransport())
```

`createPrintMcpServer(options)` 支持三个可选项：

| 选项 | 说明 |
|---|---|
| `tools` | 工具注册表，缺省为 stdio 的 6 个工具（`TOOLS`） |
| `name` | MCP server 名称，缺省 `worm-vue3-print` |
| `version` | 版本号，缺省取包版本 |

transport 不限于 stdio——接 `StreamableHTTPServerTransport` 挂到你的 HTTP 服务、或用 `InMemoryTransport` 做进程内测试都可以。

### 组装自己的工具集

工具定义（`ToolDef`：`name` / `description` / `inputSchema` / `annotations` / `handler`）都是导出的，可按需拼装：

```ts
import {
  TOOLS,                                    // stdio 全量 6 个
  createDesktopPrintTools,                  // 桌面安全集：5 个纯计算工具（剔除 render_preview 与 templatePath）
  createTemplateSessionTools,               // 模板会话三件套，需注入 bridge
} from '@worm-vue3-print/mcp'

// 例：自建「只读校验」服务，只暴露三个纯计算工具
const readOnlyTools = TOOLS.filter(t =>
  ['print_element_kinds', 'print_validate_template', 'print_check_expression'].includes(t.name))
```

`inputSchema` 是现成的 JSON Schema（zod 现场生成），**不用 MCP、走 function calling 的 agent** 也可以直接把它复制进自己的 tool 定义，再调 `tool.handler(args)` 拿 `ToolResult`（`content` 文本 + `isError`）。

### 自建模板会话（进阶）

`createTemplateSessionTools(bridge)` 把三个会话工具接到你自己的会话源，`bridge` 实现 `TemplateSessionBridge` 接口：

```ts
interface TemplateSessionBridge {
  listSessions(): OpenTemplateSession[]
  getTemplate(sessionId: string): Promise<GetOpenTemplateResult>
  applyTemplate(input: {
    sessionId: string; baseRevision: string; templateJson: unknown; reason?: string
  }): Promise<{ revision: string; templateJson: unknown; issues?: unknown[]; warnings?: unknown[] }>
}
```

bridge 实现方负责 get / apply 的超时与串行化，工具层只做门禁与文案。桌面客户端就是这么用的（bridge 连到浏览器 SDK 的实时通道），你可以把它接到任意「正在编辑模板」的宿主上。

## 六、场景 D：跳过 MCP，直接 import 契约层

你的 agent 框架自带 function calling（LangChain / 自建循环）时，不必经过 MCP，直接依赖 `@worm-vue3-print/contract`（同为 workspace 内包）——同一份判据，两种消费方式：

```ts
import {
  validateTemplateJson, checkExpression, inspectTemplate, draftTemplate, ELEMENT_KINDS,
} from '@worm-vue3-print/contract'

const draft = draftTemplate({
  elements: [{ type: 'text', options: { left: 10, top: 10, width: 60, height: 8 }, formatter: '{orderNo}' }],
})
const layout = inspectTemplate(draft.template)
if (!layout.ok) console.warn(layout.findings)
```

选型建议：**宿主已有 MCP 客户端 → 走场景 A/B（零代码）；agent 是代码自建 → 场景 C/D 二选一**（要标准协议就嵌 server，不要协议就直接调契约层）。

## 七、工具一览

| 工具 | stdio | 桌面客户端 | 一句话 |
|---|:---:|:---:|---|
| `print_element_kinds` | ✅ | ✅ | 13 种元素类型 + 函数白名单 + 单位口径速查 |
| `print_draft_template` | ✅ | ✅ | 按规格草稿出模板 JSON（自带设计器默认值） |
| `print_validate_template` | ✅ | ✅ | 契约校验，issues 带 `elements[0].options.width` 式路径 |
| `print_check_expression` | ✅ | ✅ | 表达式语法/函数白名单/未知字段判定 |
| `print_inspect_layout` | ✅ | ✅ | 静态版面体检：纸张外（error）/侵入页边距（warning）等 |
| `print_render_preview` | ✅ | ❌ | 调 render 服务出真实 PDF，需配置 `PRINT_RENDER_BASE_URL` |
| `print_list_open_templates` | ❌ | ✅ | 列出浏览器里打开的模板会话 |
| `print_get_open_template` | ❌ | ✅ | 读某个会话的实时模板快照（带 `revision`） |
| `print_apply_open_template` | ❌ | ✅ | 整份写回画布，须带 `baseRevision`，冲突报 `REVISION_CONFLICT` |

各工具的入参、返回结构与能力边界详见 [AI 接入 · 六个工具](./AI接入.md)。所有工具声明带 MCP `annotations`（`readOnlyHint` 等），只读纯计算工具宿主可据此免审批放行。

**给 agent 的一句话用法**：先用 `print_element_kinds` 认类型，草稿一律走 `print_draft_template`，改完自查 `print_validate_template` + `print_inspect_layout`，需要看真实分页再调 `print_render_preview`。

## 八、常见问题

- **npm 上搜不到 `@worm-vue3-print/mcp`？** 该包为 private，随仓库分发。克隆 + `npm run build` 后按场景 A 使用；workspace 内项目可直接依赖。
- **模板很大，参数塞不下？** 三个吃模板的工具（validate / inspect / render_preview）都接受 `templatePath`（本地 `.json` 路径，≤5MB，UTF-8）代替 `templateJson`，实测能把上万字符入参压到不足百字符。桌面端形态**没有** `templatePath`，伪造传入会被 `isError` 拒绝。
- **为什么桌面端没有 `print_render_preview`？** 桌面安全集不访问渲染服务、不落临时文件（见 `DESKTOP_BLOCKED_TOOL_NAMES`）。真实分页预览走 stdio 形态 + render 服务，或在设计器里预览。
- **表达式用 `${total}` 不生效？** 语法是 `{total}`，`${...}` 会打出字面 `$` 且校验必失败；系统变量是 `printDate/printTime/pageIndex/totalPages`，没有 `pageNo`/`pageCount`。
- **单位换算总踩坑？** 坐标/宽高是 mm，`fontSize`/`lineHeight`/`borderWidth` 是 pt，条码 `barWidth` 等是模块数（无量纲）。新模板记得写 `unit: 'mm'`。
- **想给团队远程共享一个 MCP 服务？** 当前设计只支持本地 stdio 与客户端本机 HTTP，无 OAuth；需要远程请自行加代理层。
- **宿主 AI 还想要「生成模板」的提示词知识？** 仓库 `skills/` 目录自带两个可分发技能：`print-template-json`（打印模板 JSON 生成与校验）与 `worm-vue3-print-integration`（库集成指引），可直接装进支持技能的 agent。

## 九、验收

```bash
npm run test -w @worm-vue3-print/contract      # 契约层：schema / 表达式 / 体检 / 草稿
npm run test -w @worm-vue3-print/mcp           # 连接器：配置白名单 / 工具门禁 / 渲染客户端
npm run test -w @worm-vue3-print/core          # 浏览器 SDK 双向协议（template.get/apply）
npm run test -w @worm-vue3-print/print-client  # 客户端：WS/HTTP 共端口、/mcp 鉴权、模板会话注册表
```

接入后建议做一次端到端冒烟：让 agent 执行「速查元素 → 草稿一张 A5 单据 → 校验 → 体检」全链路，各工具均应正常返回且 `print_validate_template` 最终 `ok=true`。
