# AI 接入 · 第二阶段交接（设计定稿，未开发）

> ← 返回 [文档总览](../文档总览.md) · 前置：[AI 接入（第一阶段）](./AI接入.md) · 实施计划：[第一阶段计划](../../superpowers/plans/2026-11-01-ai-contract-local-mcp-plan.md)

**状态**：第二阶段**只到设计定稿，未写一行实现代码**。本文是给下一个接手者（人或 agent）的唯一交接件：目标、边界、接口规范、画布侧已知缺口、待裁决项、拆解建议、验收口径。

## 一、已完成的地基（第一阶段，勿重复实现）

| 工件 | 位置 | 作用 |
|---|---|---|
| 模板契约层 | `packages/print-contract`（`@worm-vue3-print/contract`） | zod schema、`validateTemplateJson`、`checkExpression`、`inspectTemplate`、`draftTemplate`、`ELEMENT_KINDS`、`EXPRESSION_FUNCTIONS`、`SYSTEM_VARIABLES` |
| 本地连接器 | `packages/print-mcp`（bin `worm-vue3-print-mcp`） | stdio MCP，6 工具：`print_element_kinds` / `print_validate_template` / `print_check_expression` / `print_inspect_layout` / `print_draft_template` / `print_render_preview` |
| 边界守卫 | `scripts/check-print-architecture.mjs` | `packages/print-mcp/src` 已纳入，禁止连接器自带测量/码制/出图实现 |
| 真实模板回归 | `packages/print-contract/src/__tests__/real-templates.test.ts` | 13 份在用最模板必须零 error，防契约层判死生产模板 |

第一阶段已确立且第二阶段**不得违背**的三条裁决：MCP 仅本地 stdio；模型 key 只在服务端；**本仓库不实现服务端代理，只出接口规范**（工具循环能交宿主就交宿主）。

## 二、第二阶段目标与非目标

**目标**：在 `@worm-vue3-print/canvas` 的 `PrintDesigner` 里提供可选 AI 面板，让「没有 MCP 宿主」的用户也能在设计器内直接起草/修模板，且不与宿主已有 AI 重复。

**非目标**（明确不做）：
- 不新增服务包 / 镜像 / CI（服务端 key 代理由宿主实现，见 `endpoint` 态）。
- 不做远程 MCP、不做 OAuth。
- 不做「AI 直接改写画布且不留痕迹」：所有落画布的动作必须进 undo 栈、必须经用户确认。
- 不在 canvas 包里出现任何模型域名的请求代码路径。

## 三、宿主能力三态与循环归属

| 态 | 宿主已有 | 本仓库出什么 | 工具循环 | 面板可用 |
|---|---|---|---|---|
| `agent` | 自己的 AI agent / 会话 | 工具契约（MCP stdio 或 JS bridge） | 宿主 | 否（面板不挂载或不显示入口） |
| `endpoint` | 服务端模型代理（key 在服务端） | 面板 + 注入式 transport + 我们的工具循环 | 本仓库 | 是 |
| `none` | 什么都没有 | 面板 + **本文件的接口规范** | 本仓库 | 仅当宿主自备代理后可用 |

挂载时按顺序探测：`props.ai` → `window.__WORM_PRINT_AI__`（bridge）→ 都没有即 `none`。**探测到就不自己发请求**，这是「不重复浪费」的唯一落地位置。

## 四、接口规范草案（第二阶段的交付核心）

### 4.1 transport（`endpoint` 态，宿主注入）

```ts
/** 宿主注入的模型通道。本仓库只调用它，绝不接触 key */
export interface AiTransport {
  /** 宿主服务端点，OpenAI 兼容 chat/completions 语义；鉴权头由宿主自己加 */
  request: (req: AiRequest, signal?: AbortSignal) => Promise<AsyncIterable<AiEvent>>
  /** 供面板展示的能力标签，如 ['gpt-4o','qwen-max']；仅展示用 */
  models?: readonly string[]
}

export interface AiRequest {
  messages: readonly AiMessage[]        // role: 'system' | 'user' | 'assistant' | 'tool'
  tools: readonly AiToolSpec[]          // 即 MCP 那 6 个工具的 name/description/inputSchema(JSON Schema)
  toolChoice?: 'auto' | 'none'
  signal?: AbortSignal
}

/** 四类事件——少一类都会导致面板无法判定循环是否真的结束 */
export type AiEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'done'; finishReason: 'stop' | 'tool_calls' | 'length' }
  | { type: 'error'; message: string }
```

约束：`request` 必须是流式（`AsyncIterable`），不允许一次性返回；`done` 之前不得假定循环结束；`error` 后立刻终止并保留已生成内容。工具执行器复用 `@worm-vue3-print/contract` 的导出，**禁止**在浏览器侧另写一份校验逻辑。

### 4.2 bridge（`agent` 态，宿主注入）

宿主已有 agent 时，本仓库只暴露工具与画布句柄，不起循环：

```ts
// window.__WORM_PRINT_AI__（iframe 场景用 postMessage 传同构 JSON-RPC）
interface PrintAiBridge {
  listTools(): AiToolSpec[]                                     // 与 MCP tools/list 同源
  callTool(name: string, args: unknown): Promise<ToolResult>     // 与 MCP tools/call 同源
  getTemplateJson(): string                                     // 已有：PrintDesigner.vue:501
  applyDraft(json: string, opts: { undoable: true }): void        // 缺，见第五节
}
```

工具名与入参说明必须与 MCP 侧同一来源（把 `packages/print-mcp/src/tools.ts` 的 `TOOLS` 提到 contract 层或共享包，浏览器与 stdio 共用一份定义），否则两条链路的提示词会漂移。

## 五、画布侧已知缺口（实现前必须先补，否则面板无处落地）

1. **没有写入型 expose API**。`PrintDesigner` 目前只暴露 `getTemplateJson` / `validateTemplate` / `getGeometryWarnings`（[PrintDesigner.vue:501-510](file:///Users/worm/worm/worm-vue3-print/packages/print-canvas/src/components/PrintDesigner.vue#L501)），模板只能在挂载时经 `initialTemplate` prop 注入（[:181](file:///Users/worm/worm/worm-vue3-print/packages/print-canvas/src/components/PrintDesigner.vue#L181)）。AI 草稿要落画布，必须新增 `applyDraft(json, { undoable: true })`，且走画布内部状态而非外部重挂载。
2. **undo 归属未定**：`applyDraft` 必须一次入栈（整份草稿算一步），否则用户 Ctrl+Z 会碎成十几步。需确认 canvas 的 `useDesignerState` 与 `print-common` 的 `DesignerStore` 是两套状态外壳（canvas 不依赖 common），面板只能挂 canvas 这一套。
3. **能力注入沿用 props 约定**：设计器已有 `uploadImage` / `uploadDesignBackground` 适配器式 props（[:186-188](file:///Users/worm/worm/worm-vue3-print/packages/print-canvas/src/components/PrintDesigner.vue#L186)），AI 入口按同一形状加 `ai?: AiTransport`，不引入 provide/inject 新机制。
4. **面板挂载位置**：画布无可插拔侧栏注册表，需要新增面板容器并处理折叠/宽度（参考属性面板与图层面板的现有实现方式），属 UI 结构性改动，工作量别按「加个按钮」估。

## 六、待裁决（下一个接手者开工前必须问清）

1. `applyDraft` 的语义边界：整份替换 / 增量插入元素 / 逐元素 diff 三选一（我推荐「整份替换 + 预览态」，实现最薄且 undo 语义清晰）。
2. AI 是否允许改 `paperSize`/`margins` 这类页面级设置（改纸型会让既有元素坐标集体失配；建议默认禁止，需用户显式勾选）。
3. 面板是否内置（进 `@worm-vue3-print/canvas` 主包）还是独立可选包（如 `print-canvas-ai`）。主包已有体积与依赖洁癖（无 UI 组件库），引入 zod/AI 依赖会传染给所有宿主。
4. 多轮上下文里放什么：整份模板 JSON（token 大、易被模型改坏）还是只放 diff 所需片段（我推荐后者 + 强制工具回查 `print_validate_template`）。

## 七、实施拆解建议（顺序，不含代码）

1. 抽公共工具注册表：把 `TOOLS` 定义从 `print-mcp` 提到 contract 层，MCP 与浏览器共用（消除两份描述漂移）。
2. 画布补 `applyDraft` + 单测（含 undo 单步语义）。
3. 定 `AiTransport`/`AiEvent` 类型（放 contract，纯类型无依赖）。
4. demo 里写一个假 transport（固定脚本化事件流）驱动面板，先验交互与 undo，再接真模型。
5. 面板 UI（侧栏容器 + 折叠 + 流式渲染 + 工具调用可视化）。
6. bridge（`agent` 态）与探测顺序；文档补宿主接入样例。
7. 回归：`npm test`、`npm run lint:print-architecture`、MCP 全流程手测（下一节）。

## 八、验收口径

- 单元/集成：`npm test`（含 contract 真实模板回归 13 份零 error）。
- 架构：`npm run lint:print-architecture` 通过；`grep -rn "https://api\." packages/print-canvas/src` 必须为空（面板不许直连模型域名）。
- 全流程（第一阶段的实测基线，第二阶段必须保持）：
  1. `print_element_kinds` 返回 13 类 + `systemVariables = [printDate, printTime, pageIndex, totalPages]`；
  2. 真实业务模板 `validate ok=true`；
  3. AI 典型错写各有明确反馈：`Text` → 枚举 error；`width:"60"`、`printerDpi:"203"` → 类型 error；`title` → warning；臆造键 `fontShadow` → warning；`${total}` → error 并给出改法；`{constructor.name}` → 拒；
  4. 几何两档：纸张占位 195–210 → warning；210–225 → `OUT_OF_PAPER` error；
  5. 闭环：`print_draft_template` 起草 60×40 标签（text + barcode + qrcode）→ validate 零 error → inspect 零 finding → `print_render_preview` 出真实 PDF（实测 16723 字节 / 1 页）。
- 面板侧新增：草稿落画布后 Ctrl+Z **一步**回到原模板；取消/超时能中断流且不留半成品元素。

## 九、已知坑（第一阶段实测，别再踩）

- `engine.render()` 收**带花括号的模板串**，`engine.evaluate()` 才收裸表达式——用错会让沙箱探测静默失效（我们踩过）。
- 系统变量真实名单是 `pageIndex/totalPages/printDate/printTime`（[data-binder.ts:344-353](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/render/data-binder.ts#L344)），**不是** `pageNo/pageCount`。
- 渲染分派按 `el.type || printElementType.type || 'text'`（[html-generator.ts:437](file:///Users/worm/worm/worm-vue3-print/packages/print-core/src/render/html-generator.ts#L437)），所以两者不一致时 `type` 优先。
- `printerDpi` 是 **number**；`barWidth/qrQuietZone/flowColumns` 是模块数/列数，不能按长度换算。
- 表达式是 `{field}`，`${field}` 会打出字面 `$`。
- core 元素工厂自带废弃键（`title`/`tableMode`/`fields`），草稿必然带 warning，不要把 warning 当失败。
- 门禁基线：跑测试前先 `npm run build`，`canvas`/`common` 的类型检查与样式包都依赖 core 的 `dist`，过期 dist 会造成一批假红。
