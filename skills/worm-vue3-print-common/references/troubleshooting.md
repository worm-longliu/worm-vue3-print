# 故障排查

- **设计器高度为 0**：检查宿主与 `print-designer` 是否都为块级并有明确宽高。
- **字段或上传函数不生效**：确认赋的是 property，不是 HTML attribute 字符串；改字段后重新注入。
- **React 保存触发两次或无效**：使用原生事件监听并在 effect 中解绑，不使用 `onSave`。
- **样式异常**：Shadow DOM 不引额外 CSS；light DOM 才引入公开 `style.css` 子路径。
- **浏览器直挂找不到 core 导出**：使用 `window.WormPrintCommon` 暴露的渲染、客户端和纸张工具，不尝试在无打包器环境解析裸包名。
- **保存成功但内容不是 JSON**：`save/preview` 的 detail 需要 JSON.parse；双击元素和单元格事件的 detail 不是同一种载荷。
- **MCP 写回冲突**：重新读取实时快照和 revision，不强制覆盖。
- **生产风险评估**：common 仍为实验性；无法接受的 Vue 3 宿主改用 canvas。
