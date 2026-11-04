# MCP 协作工作流

## 生成新模板

1. 明确场景、纸张、业务字段与样例数据。
2. `print_element_kinds` 获取当前契约。
3. 用 `print_draft_template` 生成草稿，检查其 issues 和 expressionErrors。
4. 对草稿运行 `print_validate_template` 与 `print_inspect_layout`。
5. 需要真实分页时，在 stdio 下配置 render 服务并调用 `print_render_preview`。
6. 交付模板与独立示例数据，列出实际校验结果。

## 修改已有模板

先保存原始 JSON，只改用户要求的元素。stdio 大文件使用 `templatePath`；桌面实时画布先读快照。修改后重新执行校验与体检，不能把修改前的通过结果复用为本次结果。

## 表达式与表格

表达式错误先调用 `print_check_expression`。表格数据字段是数组，列绑定使用当前行字段路径；静态体检无法证明长文本、自动行高或真实页数正确，这些必须使用真实渲染。

## 真实 PDF 降级

未配置 `PRINT_RENDER_BASE_URL` 时，`print_render_preview` 返回无法取得真实分页与 PDF 的错误。此时可以交付已通过静态校验的模板，但必须明确“未做真实 PDF 验证”，不得伪造 `pdfPath` 或页数。

## 离线替代

MCP 工具不可用时，使用技能 `scripts/build_template.py` 和 `scripts/validate_template.py`。脚本结果只代表离线规则检查；用户要求 MCP 或真实渲染验证时，说明能力未配置并给出接入步骤。
