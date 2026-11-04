# 桌面客户端接入

桌面客户端在本机提供 HTTP MCP，默认地址由设置页生成；端口可能递增，以页面实际 JSON 为准。开启「AI 助手」后，将配置交给宿主 MCP 客户端：

```json
{
  "mcpServers": {
    "worm-vue3-print": {
      "url": "http://127.0.0.1:17521/mcp",
      "headers": { "Authorization": "Bearer <设置页展示的配对 token>" }
    }
  }
}
```

该形态有 5 个纯计算工具和 3 个会话工具：

- `print_list_open_templates`：列出仍打开并已签到的设计器页面。
- `print_get_open_template`：读取实时模板、字段、打印数据和 revision。
- `print_apply_open_template`：整份写回，必须提供 `baseRevision`。

桌面形态没有 `print_render_preview`，也不接受 `templatePath`。需要真实 PDF 时使用 stdio + render 服务，或使用设计器自身预览。

## 实时修改流程

1. 列出会话；有多个页面时必须使用目标 `sessionId`，不要猜测。
2. 读取快照并保留本次 `revision`。
3. 在快照副本上完成最小修改，调用契约校验和静态体检。
4. 使用读取时的 revision 作为 `baseRevision` 写回。
5. 成功后以返回的新 revision 和模板为准；失败时保留原快照。

`REVISION_CONFLICT` 表示读取后用户或另一客户端又修改了画布。必须重新读取并协调差异，不得循环强制写回。页面关闭或客户端退出后会话失效，不应对已失效会话重试写入。
