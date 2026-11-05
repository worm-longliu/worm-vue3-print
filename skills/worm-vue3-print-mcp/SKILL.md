---
name: worm-vue3-print-mcp
description: Use when 用户需要通过浏览器设计器、桌面客户端和 AI Agent 的 MCP 链路生成、校验或修改正在编辑的打印模板。
---

# worm-vue3-print 实时画布 MCP 协作

只使用“浏览器设计器 ↔ 桌面客户端 ↔ AI Agent”链路。先确认桌面客户端已开启「AI 助手」、宿主页面已注册模板会话，并通过 `tools/list` 核对工具；不要凭文档猜测连接已经可用。

## 1. 能力边界

桌面客户端提供 5 个纯计算工具和 4 个模板会话工具：

- `print_element_kinds`：元素、表达式函数、系统变量和单位速查。
- `print_draft_template`：生成模板草稿并附校验结果。
- `print_validate_template`：模板契约校验。
- `print_check_expression`：表达式语法、白名单和字段检查。
- `print_inspect_layout`：静态几何与结构体检。
- `print_list_open_templates`：列出已签到的设计器页面。
- `print_get_open_template`：默认读取完整快照；小改优先 `view=summary`，用 `elementIds/includeFields` 精简元素与字段。
- `print_patch_open_template`：按元素 ID 原子批量更新或移动，一次写回并返回新 revision。
- `print_apply_open_template`：校验后整份写回实时画布。

配置见 [桌面客户端接入](references/desktop.md)。模板字段与单位见 [模板 Schema](references/template-schema.md)，常见纸张布局见 [布局配方](references/layout-recipes.md)。

## 2. 实时修改主流程

1. 调用 `print_list_open_templates`；有多个页面时必须选择目标 `sessionId`，不要猜测。
2. 小改调用 `print_get_open_template` 的 `view=summary`，按需要用 `elementIds/includeFields` 过滤并保留 `revision`。
3. 小改把全部 `updateElement/moveElement` 操作一次交给 `print_patch_open_template`；工具内部会执行契约和封禁元素校验。连续修改直接使用上次返回的新 revision，不重复读取完整模板。
4. 新模板或复杂重排才读取完整快照，用 `print_draft_template` 起草并保留宿主业务字段；执行 `print_validate_template` 和 `print_inspect_layout` 后调用 `print_apply_open_template`。
5. 在设计器核对画布与预览。移动元素后若需静态体检，读取最新完整快照再检查；静态体检不等于真实分页。

详细异常处理见 [协作工作流](references/workflows.md)。

## 3. 写回与预览约束

- `updateElement.changes` 浅合并到元素 `options`；`moveElement` 的 `x/y` 对应 `options.left/top`，单位 mm。
- Patch 任一操作失败会整批拒绝；`print_apply_open_template` 仍是带 `baseRevision` 的整份替换。
- `REVISION_CONFLICT` 表示读取后画布又发生变化。重新读取并请用户确认差异，不自动覆盖或循环强制写回。
- 页面关闭或客户端退出后会话失效；先重新列出会话，不向失效会话重试写入。
- 真实页数、长文本换行和 PDF 效果通过设计器或打印预览确认，不属于 MCP 工具结果。
- 交付时说明实际执行过的校验和写回结果，不把静态体检描述成真实出纸验证。

## 4. 硬约束

- 坐标和尺寸使用 mm；`fontSize`、`lineHeight`、`borderWidth` 使用 pt；条码模块数不是长度。
- 表达式写 `{order.no}` 或 `{MONEY(amount)}`，不写 `${...}` 或 JavaScript 控制流。
- 模板只描述版式，业务数据单独提供；保留宿主已有业务字段和未要求修改的布局。
- MCP 不调用模型、不持有模型密钥；模型和工具循环归宿主 Agent。
