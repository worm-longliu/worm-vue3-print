# stdio 接入

## 实现与获取

`@worm-vue3-print/mcp` 是 monorepo 内 private 包，未发布 npm。stdio 入口通过 `StdioServerTransport` 实现，构建产物为 `packages/print-mcp/dist/stdio.js`。

```bash
git clone https://github.com/worm-longliu/worm-vue3-print.git
cd worm-vue3-print
npm install
npm run build
```

在支持 stdio 的 MCP 客户端中配置绝对路径：

```json
{
  "mcpServers": {
    "worm-vue3-print": {
      "command": "node",
      "args": ["/绝对路径/worm-vue3-print/packages/print-mcp/dist/stdio.js"],
      "env": {
        "PRINT_RENDER_BASE_URL": "http://127.0.0.1:3001",
        "RENDER_API_KEY": "dev-render-key"
      }
    }
  }
}
```

两个环境变量都可省略；省略后仅 `print_render_preview` 不可用，其余工具不受影响。密钥只在 MCP 进程与渲染服务端配置，不写进模板或前端 bundle。

## 六个工具

| 工具 | 用途 |
| --- | --- |
| `print_element_kinds` | 元素、表达式函数、系统变量和单位速查 |
| `print_draft_template` | 根据结构化 spec 生成草稿并附校验结果 |
| `print_validate_template` | 模板契约校验，返回带路径的 issues |
| `print_check_expression` | 表达式语法、白名单和可选字段检查 |
| `print_inspect_layout` | 静态几何与结构体检，不计算真实行高 |
| `print_render_preview` | 调渲染服务生成真实 PDF，返回临时 `pdfPath` |

validate、inspect、render_preview 可用 `templatePath` 代替大段 `templateJson`；二者同时提供时以 `templateJson` 为准。文件须为 UTF-8 `.json` 且不超过 5MB。

## 握手验证

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node /绝对路径/worm-vue3-print/packages/print-mcp/dist/stdio.js
```

`tools/list` 应恰好返回上表六个工具。协议输出使用 stdout，启动诊断使用 stderr；不要把日志文本当 JSON-RPC 消息解析。
