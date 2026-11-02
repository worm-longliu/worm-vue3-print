# AI 接入（模板契约层 + 本地 MCP 连接器）

> ← 返回 [文档总览](../文档总览.md) · 相关：[表达式引擎](./表达式引擎.md)、[渲染管线](./渲染管线.md)、[模板设计器](./模板设计器.md)

本文说明如何用 AI 为 worm-vue3-print 生成与校验打印模板，以及本仓库在 AI 能力上的边界划分。

## 一、定位：我们出契约与工具，不出 agent

设计前提只有一条：**模型与工具循环归宿主，模板知识归本仓库**。

- `@worm-vue3-print/contract`：把模板从「只有 TS 接口」升级为机器可读契约（schema、表达式校验、静态版面体检、草稿生成）。
- `@worm-vue3-print/mcp`：本地 MCP 服务器，把契约暴露成工具。**stdio** 6 个工具（融合渲染预览），桌面客户端内嵌形态 8 个工具（新增模板会话读写，见下）。
- 连接器**不调用任何模型、不读取任何模型密钥**，也没有任何模型调用入口。宿主已有的 AI（Claude Desktop / Cursor / Qoder / 自建 agent）自带模型、额度与多轮循环，重复造一套既浪费 token 也浪费维护面。
- 因此本阶段**不实现**画布内 AI 聊天面板。面板属第二阶段，且必须先解决「宿主已有 AI 时谁跑循环」的三态问题（见文末）。

## 二、接入 A：仅在浏览器里做校验/草稿（stdio 连接器）

先在仓库根构建（连接器与契约层都消费 core 的构建产物）：

```bash
npm install
npm run build
```

在 MCP 客户端配置里加一条 stdio 服务（各家字段名略有差异，语义相同）：

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

- `env` 两项**都可省略**。省略时 `print_render_preview` 直接返回降级说明，其余 5 个工具照常工作。
- `RENDER_API_KEY` 必须与服务端 `services/print-render` 的同名环境变量一致（服务端缺省为 `dev-render-key`）。
- 渲染服务需要起来才能出真实 PDF：`npm run dev -w @worm-vue3-print/render`（默认 3001，依赖 Playwright Chromium）。
- **只支持本地 stdio**：没有远程 streamable HTTP，没有 OAuth，不支持把连接器部署给多人共享。需要远程形态请自行加一层代理，但那不在本仓库的设计边界内。

## 三、接入 B：读写浏览器里正在编辑的模板（桌面客户端内置 MCP）

桌面打印客户端可在设置页开启「AI 助手」（`mcpEnabled`，默认关）：客户端在同一回环端口额外挂出 `/mcp`（MCP Streamable HTTP），Agent 直连配置形如：

```json
{
  "mcpServers": {
    "worm-vue3-print": {
      "url": "http://127.0.0.1:17521/mcp",
      "headers": { "Authorization": "Bearer <客户端设置页展示的配对 token>" }
    }
  }
}
```

（设置页直接生成并复制这段 JSON；端口被占用时客户端会递增，以设置页实际展示为准。）

与 stdio 相比的关键差异：

- 8 个工具 = stdio 的 5 个纯计算工具（`element_kinds` / `draft_template` / `validate_template` / `check_expression` / `inspect_layout`）+ 3 个模板会话工具（`list_open_templates` / `get_open_template` / `apply_open_template`）；**没有 `print_render_preview`**（桌面端不访问渲染服务）。
- 鉴权只认 `Authorization: Bearer <配对 token>`（与安全开关无关）；无状态 JSON 响应模式，`GET/DELETE /mcp` 一律 405。
- `get_open_template` / `apply_open_template` 读写的是**浏览器正在编辑的实时模板**：宿主页面用浏览器 SDK 的 `setRequestHandler` 处理 `template.get/apply`，连接成功后 `attachTemplate` 签到。`apply` 要求携带读取时返回的 `revision`（防覆盖他人修改，冲突返回 `REVISION_CONFLICT`），且 `html` 等封禁元素在桌面端与浏览器侧各拦一道。
- 会话只驻留内存：页面关闭或客户端退出即失效，不落盘。

宿主接入（demo 已实现，可直接照抄 `demo/src/template-session.ts`）：

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
    // 找到 html 等封禁元素 → throw new WormPrintError('INVALID_TEMPLATE', …)
    // 通过后写回画布（设计器记录一步历史），重新读取并返回 { revision, templateJson }
  }
  throw new WormPrintError('INVALID_REQUEST', '浏览器侧不支持处理请求')
})
client.attachTemplate({ sessionId, name: document.title, url: location.href })
```

错误码：会话侧新增 `SESSION_NOT_FOUND`（未签到或已回收）、`SESSION_DISCONNECTED`（页面断开/超时未应答）、`REVISION_CONFLICT`（写回依据已过期）、`INVALID_TEMPLATE`（封禁元素或外壳不合法）。

## 四、六个工具

| 工具 | 输入 | 返回 | 能力边界 |
|---|---|---|---|
| `print_element_kinds` | 无 | 13 种元素类型（含每种必填 option 键与打印注意事项）、表达式函数白名单、单位口径、表达式语法提示 | 生成模板前应先调用；`html` 标注 `blocked: true`，不开放给 AI 生成 |
| `print_validate_template` | `templateJson` 或 `templatePath` | `{ ok, issues, deprecatedHits, unknownKeys, summary }` | `error` 必须修；废弃键（`title`/`tableMode`/`fields`）、契约未知键、缺 `unit` 都只出 `warning`，不判死存量模板 |
| `print_check_expression` | `expression`、`knownFields?` | `{ ok, syntax, functions, unknownFields, errors }` | 语法判定走 core 解析器（文案与出纸端同源）；函数名走白名单；原型链探测走词法闸门。`knownFields` 不传时**不做**未知字段判定 |
| `print_inspect_layout` | `templateJson` 或 `templatePath`、`toleranceMm?` | `{ ok, findings[] }`，finding 带 `code`/`level`/`path` | **不做排版测量**：表格真实行高、长文本换行后的占位、真实页数一律不在这里判。几何分两档——占位落在**纸张外**是 `OUT_OF_PAPER`（error，出纸必被裁），只是越出内容区但仍在纸上（侵入页边距）是 `OUT_OF_CONTENT_AREA`（warning）。多页模板逐页体检，路径带 `pages[i]` |
| `print_draft_template` | `spec`（纸张 + 元素列表） | `{ template, issues, expressionErrors }` | 元素走 core 元素工厂，自带设计器默认值；产出 JSON，**不触碰画布状态** |
| `print_render_preview`（仅 stdio） | `templateJson` 或 `templatePath`、`printData?`、`baseUrl?`、`fontBaseUrl?`、`paperHeightMm?` | `{ ok, pdfPath }` 或降级文案 | 送渲染前先过 `print_validate_template`；真实分页只由 `print-render` 产生，本仓库不在连接器里重复实现排版 |

给宿主 agent 的一句话用法：**先用 `print_element_kinds` 认类型，草稿一律走 `print_draft_template`，改完自查 `print_validate_template` + `print_inspect_layout`，需要看真实分页再调 `print_render_preview`**。

**模板较大时请用 `templatePath` 而不是 `templateJson`。** 三个吃模板的工具（validate / inspect / render_preview）都接受本地 `.json` 路径（≤5MB，UTF-8，自动解包 `{ templateJson, printData }` 外壳）：实测一张采购收货单模板整份 JSON 是 9924 字符，改传路径后入参只有 91 字符。连接器是本地 stdio 进程，读文件放在连接器一侧，契约层保持浏览器/Node 同构、不引入 `fs`。桌面客户端内置的 HTTP 形态没有 `templatePath` 入参（它不读文件），模板直接走 `templateJson` 或模板会话工具。

工具声明带 MCP `annotations`（`title` 中文可读名、`readOnlyHint`、`openWorldHint`）：五个纯计算工具标只读、不碰外界，宿主可据此免审批放行；`print_render_preview` 会打渲染服务并落临时文件，标 `openWorldHint: true`；模板会话侧 `print_apply_open_template` 会改浏览器画布，同样标了写操作。

实测备注：OpenCode 对无参工具会打一行 `⚙ <工具名> Unknown`——`Unknown` 出现在**参数列**（有参工具那行是参数 JSON），与 `title` 无关，别把它当成注解没生效。

## 五、不经 MCP：直接 import 契约层

宿主已经有自己的 agent 框架（LangChain / 自建 function calling）时，不必经过 stdio，直接依赖契约层即可——同一份判据，两种消费方式：

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

工具入参的 JSON Schema 由 `z.toJSONSchema` 现场生成，宿主也可以把 `print_*` 的 schema 复制进自己的 function 定义。

## 六、单位与语法口径（AI 最常错的地方）

- 元素坐标、宽高、行高、`barHeight`、`maxWidth` 等：**mm**。
- `fontSize`、`lineHeight`、`letterSpacing`、`shrinkMinFontSize`、`borderWidth`、单元格 `padding`：**pt**。
- `barWidth`、`barQuietZone`、`qrQuietZone`、`flowColumns`：**模块数/个数**，无量纲，不能按长度换算。
- 表达式是 `{field}`，**不是** `${field}`：`${total}` 会打出字面 `$`，`print_check_expression` 对此判失败。
- 元素类型必须落在 core 的 13 种 `ElementType` 上（`text`/`longText`/`table`/`flowList`/`image`/`hline`/`vline`/`rect`/`oval`/`barcode`/`qrcode`/`html`/`pageNumber`）；`Text`、`tabel` 这类拼写会报 error，而不是静默产出一个渲染端不认识的元素。
- 系统变量是 `printDate` / `printTime` / `pageIndex` / `totalPages`（页码从 1 起），**没有** `pageNo` / `pageCount` 这种写法。
- 函数白名单见 `EXPRESSION_FUNCTIONS`（`MONEY`/`IF`/`CONCAT`/`PAD` 等，聚合 `SUM`/`AVG`/`COUNT`/`MIN`/`MAX` 由绑定阶段预处理，只用于表格 subtotal/summary 单元格）。
- 复合结构不是自由字典：`borders` 的每条边、`pagination`、`tablePagination`、`tableColWidths`、`tableRows[].cells[]`、`fonts[].files[]` 都按 core 类型逐个字段校验（值出现即校验形状，缺省仍兼容存量）。
- 新模板 `unit: 'mm'` 必须写；缺 `unit` 的历史模板按 pt 迁移，`print_inspect_layout` 会先要求归一。

## 七、耦合点登记（改 core 时会被这里咬到）

1. **`OPTION_META` 与 `ElementOptions`**：契约层用 `Record<keyof ElementOptions, Meta>` 的必填映射，core 新增 option 键而未在 `packages/print-contract/src/option-meta.ts` 登记，`tsc` 直接报错；反向（工厂实际产出的键没登记）由 `src/__tests__/option-meta.test.ts` 用 core 的 `createDefaultOptions` 逐类型反查。
2. **纸张枚举**：`schema/template.ts` 内对 `PaperSize` 做了双向 `Exclude` 检查，core 增删纸型会编译失败。
3. **`PROBE_TOKENS`**：与 core `evaluator.ts` 的 `DANGEROUS_PROPS` 是**同集合的两份副本**（后者未导出，运行时取不到）。判据单点仍在渲染端，core 调整该集合时这里要人工同步。
4. **表达式求值入口**：必须用 `core/designer` 的 `engine` 单例；裸调 `compileTemplate(t)(ctx)` 的函数表为空，会把合法的 `{MONEY(x)}` 判成未知函数。
5. **core 元素工厂仍写废弃键**：`createDefaultOptions` 给 barcode/qrcode 预置 `title`、给 table 预置 `tableMode` 与 `fields`，因此草稿自带 deprecated warning。属存量口径，本阶段未改 core。
6. **真实模板回归**：`src/__tests__/real-templates.test.ts` 拿仓内在用的模板（`demo/src/template-*.json`、AI 技能资产模板、core 回归 fixture、客户端冒烟模板）逐项过 `validateTemplateJson` 与 `inspectTemplate`，断言零 error。契约层一旦把 `types.ts` 里的 `number` 写成字符串枚举（`printerDpi` 就这么错过 4 份在用模板），这里会先红。

## 八、第二阶段（未实现；设计已定稿并交接）

完整交接件见 [AI 接入 · 第二阶段交接](./AI接入-第二阶段交接.md)：目标与非目标、三态与循环归属、`AiTransport`/`AiEvent`/bridge 接口规范草案、画布侧已知缺口（无写入型 expose API、undo 归属、面板容器缺失）、待裁决四项、实施拆解顺序与验收口径。

画布内 AI 面板的前提是「宿主 key 必须在服务端」，因此面板**不能独立存在**，只能走注入式 transport。落地形态按宿主已有能力分三态，挂载时先探测 bridge：

| 态 | 宿主已有 | 本仓库出什么 | 谁跑工具循环 |
|---|---|---|---|
| `agent` | 自己的 AI agent / 会话 | 只出工具契约（MCP 或 JS bridge） | 宿主 |
| `endpoint` | 只有服务端模型代理 | 面板 + 工具循环，调宿主代理 | 本仓库 |
| `none` | 什么都没有 | 面板 + 接口规范（服务端代理由宿主自实现） | 本仓库（打到宿主端点） |

探测到 bridge 就不自己发模型请求——这是「不与宿主重复」的落地位置。

**已定：第二阶段只出接口规范，不新增代理服务包。** 由此确定三条边界：

- 本仓库不持有、不转发、不经手任何模型密钥，也不新增服务包与镜像；`none` 态宿主需自备一个 OpenAI 兼容的服务端转发（约百来行）才能启用面板。**不存在 clone 即跑通 AI 的开箱路径**，文档与 demo 只演示「宿主端点已存在」的接法。
- 面板的模型调用一律走注入式 transport（宿主传入的 request 函数或宿主端点 URL）；组件内部不得出现指向任何模型域名的请求代码路径。
- 规范的最小契约：请求体 `messages / tools / stream`；返回事件四类——增量文本、`tool_call`、结束、错误；鉴权由宿主负责；超时与取消走 `AbortSignal`。

## 九、验收

```bash
npm run test -w @worm-vue3-print/contract      # 契约层：schema / 表达式 / 体检 / 草稿
npm run test -w @worm-vue3-print/mcp           # 连接器：配置白名单 / 工具门禁 / 渲染客户端
npm run test -w @worm-vue3-print/core          # 浏览器 SDK 双向协议（template.get/apply）
npm run test -w @worm-vue3-print/print-client  # 客户端：WS/HTTP 共端口、/mcp 鉴权与 413、模板会话注册表
npm run lint:print-architecture                # 守卫已覆盖 packages/print-mcp/src
```

手工验证 stdio 握手与工具列表：

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node packages/print-mcp/dist/stdio.js
```

桌面端 HTTP 形态的手工验证：客户端开启 MCP 后，用 `curl -H 'Authorization: Bearer <token>' http://127.0.0.1:17521/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`（无 token 恒 401、GET 405、关闭时 404）；或直接用任意 MCP 客户端贴入设置页生成的 JSON。
