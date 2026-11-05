# MCP 协作工作流

## 生成并写入新模板

1. 明确场景、纸张、业务字段与样例数据。
2. 通过 `print_list_open_templates` 选择目标页面，再用 `print_get_open_template` 读取会话上下文。
3. 调用 `print_element_kinds` 获取当前契约。
4. 用 `print_draft_template` 生成草稿，检查其 issues 和 expressionErrors。
5. 对草稿运行 `print_validate_template` 与 `print_inspect_layout`，修复全部 error。
6. 小改使用 `print_patch_open_template` 一次提交全部操作，连续 Patch 使用上次返回的新 revision；复杂重排才整份写回。
7. 在设计器中核对预览；交付时列出实际校验和写回结果。

## 修改已有模板

先用摘要读取元素索引，只改用户要求的元素。`updateElement` 浅合并 `options`，`moveElement` 使用 mm 单位的 `x/y`。一次调用提交全部修改，成功后以返回的 revision 继续；不要为每个属性单独调用。复杂修改仍重新执行校验与体检，不能复用修改前的通过结果。

## 表达式与表格

表达式错误先调用 `print_check_expression`。表格数据字段是数组，列绑定使用当前行字段路径。静态体检无法证明长文本、自动行高或真实页数正确，这些必须在设计器或打印预览中核对。

## 冲突与断连

- `REVISION_CONFLICT`：重新读取最新快照，向用户说明差异后再修改，不覆盖他人变更。
- `SESSION_NOT_FOUND` / `SESSION_DISCONNECTED`：重新列出会话；页面未恢复前停止写回。
- `INVALID_TEMPLATE`：按返回路径修复契约或封禁元素问题，再重新校验。
- `CLIENT_TIMEOUT`：确认页面未卡顿且仍连接后重试，不声称已写回。
