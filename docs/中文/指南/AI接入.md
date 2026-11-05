# AI 接入（浏览器 + 桌面客户端 + MCP）

> ← 返回 [文档总览](../文档总览.md) · 相关：[MCP 使用与集成](./MCP集成.md)、[表达式引擎](./表达式引擎.md)

本文说明项目 AI 能力的架构、工具边界和代码职责。具体配置与宿主代码见 [MCP 使用与集成指南](./MCP集成.md)。

## 一、定位：项目提供契约与工具，宿主提供 Agent

模型与工具循环归宿主 AI Agent，项目负责模板知识、校验规则和实时画布通道：

- `@worm-vue3-print/contract`：机器可读模板契约，提供 schema、表达式校验、静态版面体检和草稿生成。
- `@worm-vue3-print/mcp`：桌面客户端 private 内部工具库，组合 5 个纯计算工具与 4 个模板会话工具。
- `@worm-vue3-print/print-client`：在本机 `/mcp` 提供 Streamable HTTP，负责 Bearer 鉴权、请求限制和浏览器会话转发。
- `@worm-vue3-print/core/client`：浏览器 SDK，处理 `template.get` / `template.apply` 并维护模板会话签到。
- 宿主 AI Agent：调用模型、展示审批、执行工具循环并协调用户意图。

连接器不调用模型、不读取模型密钥，不持有宿主业务凭证。

## 二、实时画布数据流

### 读取

```text
AI Agent
  → POST /mcp（print_get_open_template）
  → 桌面客户端模板会话注册表
  → WebSocket template.get
  → 浏览器设计器返回模板、字段、打印数据与 revision
  → 原路返回快照
```

### 写回

```text
AI Agent
  → print_validate_template / print_inspect_layout
  → print_patch_open_template（baseRevision + 白名单操作；复杂重排才整份 apply）
  → 桌面客户端校验契约与封禁元素
  → WebSocket template.apply
  → 浏览器再次核对 revision 并写回设计器
  → 重新读取实际画布，返回新 revision 与模板
```

会话快照实时、无缓存；页面关闭或客户端退出后会话失效，不落盘。写回是整份替换，revision 防止覆盖读取后发生的其他修改。

## 三、工具边界

| 工具 | 只读 | 用途 |
| --- | :---: | --- |
| `print_element_kinds` | 是 | 13 种元素、表达式函数、系统变量和单位速查 |
| `print_draft_template` | 是 | 通过 core 元素工厂生成草稿，并回灌校验与体检 |
| `print_validate_template` | 是 | 模板契约校验，区分 error 与兼容 warning |
| `print_check_expression` | 是 | 表达式语法、函数白名单、字段检查 |
| `print_inspect_layout` | 是 | 静态几何和结构检查，不做浏览器测量 |
| `print_list_open_templates` | 是 | 列出已签到页面 |
| `print_get_open_template` | 是 | 获取实时快照与 revision |
| `print_patch_open_template` | 否 | 原子批量更新/移动元素，返回新 revision，应要求用户批准 |
| `print_apply_open_template` | 否 | 防冲突、校验后整份写回，应要求用户批准 |

纯计算工具不读写本地文件、不访问外部服务。真实分页、自动行高、长文本换行与 PDF 效果由设计器或打印预览确认，不属于 MCP 的返回结论。

## 四、模板契约要点

- 坐标与尺寸使用 mm；`fontSize`、`lineHeight`、`borderWidth` 使用 pt；条码 `barWidth` 等是模块数，不能按长度换算。
- 表达式写 `{field}` 或 `{MONEY(amount)}`，不写 `${field}` 或 JavaScript 控制流。
- 系统变量为 `printDate`、`printTime`、`pageIndex`、`totalPages`。
- 元素类型必须属于 core 的 13 种 `ElementType`；`html` 虽属于历史类型，但在 AI 草稿和实时写回中被封禁。
- 新模板必须写 `unit: 'mm'`；缺 `unit` 的历史模板按迁移规则处理。
- `borders`、`pagination`、`tablePagination`、`tableColWidths`、`tableRows[].cells[]`、`fonts[].files[]` 等复合结构按 core 类型逐字段校验。
- warning 多用于存量兼容，不必机械清零；所有 error 必须在写回前修复。

## 五、宿主浏览器职责

宿主不能把“返回一份 JSON”当成已完成画布写回，必须实现以下语义：

1. `template.get` 每次读取当前设计器，而不是页面加载时的缓存。
2. revision 根据当前实时内容计算；`template.apply` 先核对 `baseRevision`。
3. 写回前检查模板形状并调用 `findBlockedElementPaths`，不能绕过封禁清单。
4. 写回后从设计器重新读取实际模板，计算并返回新 revision。
5. 页面卸载时 `detachTemplate`、取消监听并关闭连接；重连后重新签到。
6. Vue 3 宿主通过新模板引用触发热更新，避免产生重复历史记录；common 宿主按自身历史能力说明撤销边界。

完整实现以 [`demo/src/template-session.ts`](../../../demo/src/template-session.ts) 为准。

## 六、桌面安全边界

- MCP 与浏览器 WebSocket 复用同一回环端口，不监听外部网卡。
- MCP 恒要求 `Authorization: Bearer <配对 token>`，与打印安全开关无关。
- 仅接受 POST 和无状态 JSON 响应；GET / DELETE 返回 405，关闭时返回 404。
- 请求体与 WebSocket 帧上限均为 4 MiB。
- Host 必须等于 `127.0.0.1:<实际端口>`，防止 DNS rebinding。
- 同一 sessionId 不允许跨 Origin 接管；断连后自动回收会话。
- 会话内 get / apply 串行执行，避免写回过程中读到中间状态。

## 七、代码耦合点

1. `OPTION_META` 必须覆盖 `ElementOptions` 全部键；core 新增 option 后需在 contract 登记。
2. contract 的纸张枚举与 core `PaperSize` 双向约束，新增纸型需同步。
3. 表达式静态检查的 `PROBE_TOKENS` 必须与 core `DANGEROUS_PROPS` 同步。
4. 表达式求值使用 `core/designer` 的 `engine`，确保函数表与出纸端一致。
5. core 元素工厂可能带 `title`、`tableMode`、`fields` 等废弃 warning，不能把 warning 误判为失败。
6. 真实模板回归读取 demo 与 core fixtures，防止契约升级误伤在用模板。

## 八、验收

```bash
npm run test -w @worm-vue3-print/contract
npm run test -w @worm-vue3-print/mcp
npm run test -w @worm-vue3-print/core
npm run test -w @worm-vue3-print/print-client
npm run lint:print-architecture
```

端到端验收必须覆盖：真实浏览器签到、9 个工具列表、摘要读取、连续 Patch、最小修改、校验与体检、revision 写回、陈旧 revision 冲突、封禁元素拒绝、页面断连回收。
