---
name: worm-vue3-print-mcp
description: Use when 用户需要通过 worm-vue3-print MCP 生成、校验、体检或修改打印模板，读写桌面客户端中正在编辑的画布，或在没有 MCP 时生成可导入设计器的模板 JSON。
---

# worm-vue3-print MCP 协作

先确认宿主实际提供的工具和传输形态，再选择调用流程。不要凭文档猜测工具已经配置，也不要在没有真实调用结果时声称模板已通过 MCP 校验。

## 1. 判断使用形态

| 形态 | 能力 | 适用 |
| --- | --- | --- |
| stdio | 5 个纯计算工具 + `print_render_preview` | 静态 JSON 生成/校验、大模板文件、真实 PDF 分页 |
| 桌面客户端本机 HTTP | 5 个纯计算工具 + 3 个模板会话工具 | 读写浏览器中正在编辑的实时画布 |
| 无可用 MCP | 本技能 Python 构建与校验脚本 | 离线生成模板，不能伪称已完成 MCP 或 PDF 验证 |

配置与真实工具边界见 [stdio 接入](references/stdio.md) 和 [桌面客户端接入](references/desktop.md)。

## 2. MCP 可用时的主流程

1. 通过 MCP 客户端的 `tools/list` 核对工具，不使用目标形态没有的工具。
2. 生成或修改前调用 `print_element_kinds`，以返回的元素、函数和单位为准。
3. 新模板优先用 `print_draft_template` 生成草稿；已有模板保留用户业务字段与未要求修改的布局。
4. 调用 `print_validate_template`，修复全部 `level=error`，直到 `ok=true`；存量兼容 warning 不必机械清零。
5. 调用 `print_inspect_layout` 检查纸张越界、边距、交叠和表格结构。静态体检不等于真实分页。
6. 需要真实页数、长文本换行或 PDF 时，仅在 stdio 形态调用 `print_render_preview`。
7. 交付模板 JSON 和必要的示例数据，说明实际执行过哪些校验以及未覆盖的风险。

具体调用顺序与异常处理见 [协作工作流](references/workflows.md)。

## 3. 大模板与实时画布

- stdio 的 validate / inspect / render_preview 接受 `templatePath`（UTF-8 `.json`，不超过 5MB），大模板优先传路径，避免消耗上下文。
- 桌面 HTTP 不接受 `templatePath`，也没有 `print_render_preview`。
- 实时画布按 `print_list_open_templates` → `print_get_open_template` → 修改 JSON → `print_apply_open_template` 执行。
- `print_apply_open_template` 必须携带读取时的 `baseRevision`。出现 `REVISION_CONFLICT` 时重新读取最新快照并请用户确认差异，不自动覆盖。

## 4. MCP 不可用时的离线流程

1. 收集场景、纸张、字段和样例数据；缺失项采用常见默认值并说明假设。
2. 按 [离线生成指南](references/offline-generator.md) 编写简写 `scene.json`。
3. 在技能目录执行：

```bash
python3 scripts/build_template.py scene.json -o 输出.template.json
python3 scripts/validate_template.py 输出.template.json
```

4. 修到 0 ERROR 后交付 `.template.json` 与同名 `.data.json`。离线静态校验不能代替 MCP 契约校验或真实 PDF 渲染。

精细字段、单位和元素约束见 [模板 Schema](references/template-schema.md)，常见纸张与布局见 [布局配方](references/layout-recipes.md)。

## 5. 硬约束

- 坐标和尺寸使用 mm；`fontSize`、`lineHeight`、`borderWidth` 使用 pt；条码模块数不是长度。
- 表达式写 `{order.no}` 或 `{MONEY(amount)}`，不写 `${...}` 或 JavaScript 控制流。
- 模板只描述版式，业务数据单独提供；宿主元信息不塞入模板。
- MCP 不调用模型、不持有模型密钥；模型和工具循环归宿主 Agent。
- 真实 PDF 依赖独立 `print-render` 服务。未配置或调用失败时如实报告，不生成虚假成功结论。
