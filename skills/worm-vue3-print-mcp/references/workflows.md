# MCP 协作工作流

## 生成并写入新模板

1. 明确场景、纸张、业务字段与样例数据。
2. 通过 `print_list_open_templates` 选择目标页面，再用 `print_get_open_template` 读取会话上下文。
3. 调用 `print_element_kinds` 获取当前契约与 preset 清单，匹配场景就选 preset。
4. 用 `print_draft_template` 生成草稿（preset 优先，手排检查其 issues 和 expressionErrors）。
5. 对草稿运行 `print_validate_template` 与 `print_inspect_layout`，修复全部 error。
6. 调用 `print_preview_template` 看渲染图（附样例 printData），按自评清单核对：
   - 元素对齐与间距是否均匀，有无错位
   - 文字密度：字号过大/过挤、行间是否拥挤
   - 留白是否均衡，内容是否贴边
   - 有无溢出、裁切、越出纸边
   - 条码/二维码是否清晰（热敏纸看 printerDpi 是否给了）
   - `elementBoxes` 里的实际坐标是否等于模板里写的 left/top
7. 发现问题先改模板再预览，收敛后按修改幅度写回：小改用 `print_patch_open_template`
   一次提交全部操作（连续 Patch 用上次返回的新 revision），复杂重排才整份 `print_apply_open_template`。
8. 在设计器中核对最终效果；交付时列出实际校验、预览和写回结果。

## 有参考设计稿时

一张图（扫描件/设计稿/旧模板截图）作为验收基准时：

1. `print_analyze_reference_image` 只传路径 → 得到像素坐标与归一化比例（线条、文本行、表格候选都带 norm），
   确认线条数量与结构符合预期。
2. 同一张图补 `dpi` 或 `paper { widthMm, heightMm, margins }` → 得到毫米坐标，直接用于排版。
   - 只给纸张不给 dpi 时，用「内容区像素宽 ÷ 内容区毫米宽」反推；两者比例不一致会告警。
3. 按测量值生成模板（`print_draft_template` 或手排 elements）。
4. `print_compare_with_reference` 比对：先看 `contentAreaOffset`（内容区在整幅图像中的位置，抓整版平移），
   再用 `items` 看偏差与线长（templateStart/End vs referenceStart/End），
   `extraInTemplate` 抓多余元素（如多画的边框），`missingInTemplate` 抓漏掉的线。
   两侧同时非空多半是「同一位置线长不对」成对出现，按 `norm` 相同、`start/end` 不同配对核对；
   `maxDeviationRatio` 取位置偏差与线长偏差的较大值，不会因位置对得上而显示 0。
   无线可比、置信度低、宽高比不一致或整版平移超容差时返回 `status=inconclusive`，不要当成通过。
5. 修到 `pass: true`（`status: 'pass'`）并渲染预览确认后，再写回画布。

## 修改已有模板

先用摘要（`view=summary`）读取元素索引，只改用户要求的元素，保留业务字段与未要求修改的布局。
`updateElement` 浅合并 `options`，`moveElement` 使用 mm 单位的 `x/y`；一次调用提交全部修改，
成功后以返回的 revision 继续，不要为每个属性单独调用。

复杂修改或大范围重排才读取完整快照，重新执行校验与体检，并逐页 `print_preview_template`
看图核对改动区域；不能复用修改前的通过结果。写回成功后再读取一次快照可作为最终核对。

## 表达式与表格

表达式错误先调用 `print_check_expression`。表格数据字段是数组，列绑定使用当前行字段路径。静态体检无法证明长文本、自动行高或真实页数正确，预览图可以看到真实换行与分页，但仍以设计器打印预览为最终确认。

## 冲突与断连

- `REVISION_CONFLICT`：重新读取最新快照，向用户说明差异后再修改，不覆盖他人变更。
- `SESSION_NOT_FOUND` / `SESSION_DISCONNECTED`：重新列出会话；页面未恢复前停止写回。
- `INVALID_TEMPLATE`：按返回路径修复契约或封禁元素问题，再重新校验。
- `CLIENT_TIMEOUT`：确认页面未卡顿且仍连接后重试，不声称已写回。
- `PAGE_OUT_OF_RANGE`：预览的 page 超出总页数，按返回信息换页号重试。
- `RENDER_TIMEOUT`：模板渲染超时，精简元素或拆页后重试。
