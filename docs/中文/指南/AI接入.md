# AI 接入（模板契约层 + 本地 MCP 连接器）

> ← 返回 [文档总览](../文档总览.md) · 相关：[表达式引擎](./表达式引擎.md)、[渲染管线](./渲染管线.md)、[模板设计器](./模板设计器.md)

本文说明如何用 AI 为 worm-vue3-print 生成与校验打印模板，以及本仓库在 AI 能力上的边界划分。

## 一、定位：我们出契约与工具，不出 agent

设计前提只有一条：**模型与工具循环归宿主，模板知识归本仓库**。

- `@worm-vue3-print/contract`：把模板从「只有 TS 接口」升级为机器可读契约（schema、表达式校验、静态版面体检、草稿生成）。
- `@worm-vue3-print/mcp`：本地 stdio MCP 服务器，把上述契约暴露成 6 个工具。
- 连接器**不调用任何模型、不读取任何模型密钥**，也没有任何模型调用入口。宿主已有的 AI（Claude Desktop / Cursor / Qoder / 自建 agent）自带模型、额度与多轮循环，重复造一套既浪费 token 也浪费维护面。
- 因此本阶段**不实现**画布内 AI 聊天面板。面板属第二阶段，且必须先解决「宿主已有 AI 时谁跑循环」的三态问题（见文末）。

## 二、接入：仅本地 stdio

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
      "args": ["/绝对路径/worm-vue3-print/packages/print-mcp/dist/index.js"],
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

## 三、六个工具

| 工具 | 输入 | 返回 | 能力边界 |
|---|---|---|---|
| `print_element_kinds` | 无 | 13 种元素类型（含每种必填 option 键与打印注意事项）、表达式函数白名单、单位口径、表达式语法提示 | 生成模板前应先调用；`html` 标注 `blocked: true`，不开放给 AI 生成 |
| `print_validate_template` | `templateJson` | `{ ok, issues, deprecatedHits, unknownKeys }` | `error` 必须修；废弃键（`title`/`tableMode`/`fields`）、契约未知键、缺 `unit` 都只出 `warning`，不判死存量模板 |
| `print_check_expression` | `expression`、`knownFields?` | `{ ok, syntax, functions, unknownFields, errors }` | 语法判定走 core 解析器（文案与出纸端同源）；函数名走白名单；原型链探测走词法闸门。`knownFields` 不传时**不做**未知字段判定 |
| `print_inspect_layout` | `templateJson`、`toleranceMm?` | `{ ok, findings[] }`，finding 带 `code`/`level`/`path` | **不做排版测量**：表格真实行高、长文本换行后的占位、真实页数一律不在这里判。几何分两档——占位落在**纸张外**是 `OUT_OF_PAPER`（error，出纸必被裁），只是越出内容区但仍在纸上（侵入页边距）是 `OUT_OF_CONTENT_AREA`（warning）。多页模板逐页体检，路径带 `pages[i]` |
| `print_draft_template` | `spec`（纸张 + 元素列表） | `{ template, issues, expressionErrors }` | 元素走 core 元素工厂，自带设计器默认值；产出 JSON，**不触碰画布状态** |
| `print_render_preview` | `templateJson`、`printData?`、`baseUrl?`、`fontBaseUrl?`、`paperHeightMm?` | `{ ok, pdfPath }` 或降级文案 | 送渲染前先过 `print_validate_template`；真实分页只由 `print-render` 产生，本仓库不在连接器里重复实现排版 |

给宿主 agent 的一句话用法：**先用 `print_element_kinds` 认类型，草稿一律走 `print_draft_template`，改完自查 `print_validate_template` + `print_inspect_layout`，需要看真实分页再调 `print_render_preview`**。

## 四、不经 MCP：直接 import 契约层

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

## 五、单位与语法口径（AI 最常错的地方）

- 元素坐标、宽高、行高、`barHeight`、`maxWidth` 等：**mm**。
- `fontSize`、`lineHeight`、`letterSpacing`、`shrinkMinFontSize`、`borderWidth`、单元格 `padding`：**pt**。
- `barWidth`、`barQuietZone`、`qrQuietZone`、`flowColumns`：**模块数/个数**，无量纲，不能按长度换算。
- 表达式是 `{field}`，**不是** `${field}`；函数白名单见 `EXPRESSION_FUNCTIONS`（`MONEY`/`IF`/`CONCAT`/`PAD` 等，聚合 `SUM`/`AVG`/`COUNT`/`MIN`/`MAX` 由绑定阶段预处理）。
- 新模板 `unit: 'mm'` 必须写；缺 `unit` 的历史模板按 pt 迁移，`print_inspect_layout` 会先要求归一。

## 六、耦合点登记（改 core 时会被这里咬到）

1. **`OPTION_META` 与 `ElementOptions`**：契约层用 `Record<keyof ElementOptions, Meta>` 的必填映射，core 新增 option 键而未在 `packages/print-contract/src/option-meta.ts` 登记，`tsc` 直接报错；反向（工厂实际产出的键没登记）由 `src/__tests__/option-meta.test.ts` 用 core 的 `createDefaultOptions` 逐类型反查。
2. **纸张枚举**：`schema/template.ts` 内对 `PaperSize` 做了双向 `Exclude` 检查，core 增删纸型会编译失败。
3. **`PROBE_TOKENS`**：与 core `evaluator.ts` 的 `DANGEROUS_PROPS` 是**同集合的两份副本**（后者未导出，运行时取不到）。判据单点仍在渲染端，core 调整该集合时这里要人工同步。
4. **表达式求值入口**：必须用 `core/designer` 的 `engine` 单例；裸调 `compileTemplate(t)(ctx)` 的函数表为空，会把合法的 `{MONEY(x)}` 判成未知函数。
5. **core 元素工厂仍写废弃键**：`createDefaultOptions` 给 barcode/qrcode 预置 `title`、给 table 预置 `tableMode` 与 `fields`，因此草稿自带 deprecated warning。属存量口径，本阶段未改 core。
6. **真实模板回归**：`src/__tests__/real-templates.test.ts` 拿仓内在用的模板（`demo/src/template-*.json`、AI 技能资产模板、core 回归 fixture、客户端冒烟模板）逐项过 `validateTemplateJson` 与 `inspectTemplate`，断言零 error。契约层一旦把 `types.ts` 里的 `number` 写成字符串枚举（`printerDpi` 就这么错过 4 份在用模板），这里会先红。

## 七、第二阶段（未实现，接口待定）

画布内 AI 面板的前提是「宿主 key 必须在服务端」，因此面板**不能独立存在**，只能走注入式 transport。落地形态按宿主已有能力分三态，挂载时先探测 bridge：

| 态 | 宿主已有 | 本仓库出什么 | 谁跑工具循环 |
|---|---|---|---|
| `agent` | 自己的 AI agent / 会话 | 只出工具契约（MCP 或 JS bridge） | 宿主 |
| `endpoint` | 只有服务端模型代理 | 面板 + 工具循环，调宿主代理 | 本仓库 |
| `none` | 什么都没有 | 面板 + 参考代理实现 | 本仓库 |

探测到 bridge 就不自己发模型请求——这是「不与宿主重复」的落地位置。服务端 key 代理由本仓库出参考实现、还是只出接口规范，尚未拍板。

## 八、验收

```bash
npm run test -w @worm-vue3-print/contract   # 契约层：schema / 表达式 / 体检 / 草稿
npm run test -w @worm-vue3-print/mcp        # 连接器：配置白名单 / 六个工具 / 渲染客户端
npm run lint:print-architecture             # 守卫已覆盖 packages/print-mcp/src
```

手工验证 stdio 握手与工具列表：

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node packages/print-mcp/dist/index.js
```
