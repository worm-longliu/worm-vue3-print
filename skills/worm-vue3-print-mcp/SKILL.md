---
name: worm-vue3-print-mcp
description: Use when 用户需要通过浏览器设计器、桌面客户端和 AI Agent 的 MCP 链路生成、校验或修改正在编辑的打印模板。
---

# worm-vue3-print 实时画布 MCP 协作

只使用“浏览器设计器 ↔ 桌面客户端 ↔ AI Agent”链路。先确认桌面客户端已开启「AI 助手」、宿主页面已注册模板会话，并通过 `tools/list` 核对工具；不要凭文档猜测连接已经可用。

## 1. 能力边界

桌面客户端提供 5 个纯计算工具和 3 个模板会话工具：

- `print_element_kinds`：元素、表达式函数、系统变量和单位速查。
- `print_draft_template`：生成模板草稿并附校验结果。
- `print_validate_template`：模板契约校验。
- `print_check_expression`：表达式语法、白名单和字段检查。
- `print_inspect_layout`：静态几何与结构体检。
- `print_list_open_templates`：列出已签到的设计器页面。
- `print_get_open_template`：读取实时模板、字段、打印数据和 revision。
- `print_apply_open_template`：校验后整份写回实时画布。

配置见 [桌面客户端接入](references/desktop.md)。模板字段与单位见 [模板 Schema](references/template-schema.md)，常见纸张布局见 [布局配方](references/layout-recipes.md)。

## 2. 实时修改主流程

1. 调用 `print_list_open_templates`；有多个页面时必须选择目标 `sessionId`，不要猜测。
2. 调用 `print_get_open_template` 读取快照并保留本次 `revision`。
3. 调用 `print_element_kinds` 核对当前契约，在快照副本上完成用户要求的最小修改。
4. 新模板或需要重排时优先用 `print_draft_template` 生成草稿，再合并宿主必须保留的业务字段与布局。
5. 调用 `print_validate_template`，修复全部 `level=error`，直到 `ok=true`；存量兼容 warning 不必机械清零。
6. 调用 `print_inspect_layout` 检查越界、边距、交叠和表格结构。静态体检不等于真实分页。
7. 使用读取时的 revision 作为 `baseRevision` 调用 `print_apply_open_template`，成功后以返回的新 revision 和模板为准。

详细异常处理见 [协作工作流](references/workflows.md)。

## 3. 写回与预览约束

- `print_apply_open_template` 是整份替换，必须携带 `baseRevision`，不是增量 patch。
- `REVISION_CONFLICT` 表示读取后画布又发生变化。重新读取并请用户确认差异，不自动覆盖或循环强制写回。
- 页面关闭或客户端退出后会话失效；先重新列出会话，不向失效会话重试写入。
- 真实页数、长文本换行和 PDF 效果通过设计器或打印预览确认，不属于 MCP 工具结果。
- 交付时说明实际执行过的校验和写回结果，不把静态体检描述成真实出纸验证。

## 4. 硬约束

- 坐标和尺寸使用 mm；`fontSize`、`lineHeight`、`borderWidth` 使用 pt；条码模块数不是长度。
- 表达式写 `{order.no}` 或 `{MONEY(amount)}`，不写 `${...}` 或 JavaScript 控制流。
- 模板只描述版式，业务数据单独提供；保留宿主已有业务字段和未要求修改的布局。
- MCP 不调用模型、不持有模型密钥；模型和工具循环归宿主 Agent。
