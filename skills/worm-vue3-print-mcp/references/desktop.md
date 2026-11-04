# 桌面客户端接入

## 链路组成

1. 工位电脑运行桌面客户端，在设置页开启「AI 助手」。
2. 浏览器设计器通过 `@worm-vue3-print/core/client` 连接桌面客户端，处理 `template.get` / `template.apply` 并调用 `attachTemplate` 签到。
3. AI Agent 所在 MCP 客户端使用设置页生成的本机 HTTP 配置。

默认配置示例如下，实际端口和 token 以设置页为准：

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

浏览器页面只连接本机桌面客户端。AI Agent 的每次写回经桌面客户端转发到已签到页面，不直接访问宿主业务服务。

## 工具边界

纯计算工具只接收内存中的参数和 `templateJson`，不读取本地模板文件、不访问渲染服务。会话工具读写的是仍打开且已签到的页面；页面关闭或客户端退出后会话失效，不落盘。

## 浏览器接入要点

- `template.get` 返回当前模板、字段、打印数据、模板名称和根据当前内容计算的 revision。
- `template.apply` 先核对 `baseRevision`，再校验模板形状与封禁元素，通过后写回设计器并重新读取实际结果。
- 页面卸载时调用 `detachTemplate`，取消状态监听并关闭连接。
- Vue 3 与 common 的完整宿主骨架分别在对应集成技能的 `references/mcp-host-integration.md` 中。
