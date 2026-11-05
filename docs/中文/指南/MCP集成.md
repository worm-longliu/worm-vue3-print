# MCP 使用与集成指南

> ← 返回 [文档总览](../文档总览.md) · 相关：[AI 接入](./AI接入.md)、[静默打印](./静默打印.md)、[表达式引擎](./表达式引擎.md)

本文说明如何通过“浏览器设计器 ↔ 桌面客户端 ↔ AI Agent”链路，让 AI 生成、校验并修改用户正在编辑的打印模板。

## 一、链路与前置条件

三个组件缺一不可：

1. **浏览器设计器**：通过 `@worm-vue3-print/core/client` 提供实时模板快照和写回处理器。
2. **桌面客户端**：在本机提供 `/mcp`，负责鉴权、工具执行和浏览器请求转发。
3. **AI Agent 所在 MCP 客户端**：使用桌面客户端设置页生成的配置，运行模型与工具循环。

MCP 不调用模型、不持有模型密钥，也不替代宿主业务接口。真实分页、长文本换行和出纸效果仍通过设计器或打印预览确认。

## 二、开启桌面客户端 MCP

1. 安装并启动桌面客户端，打开设置页。
2. 开启「AI 助手」（`mcpEnabled`，默认关闭）。
3. 点击「复制 JSON 配置」，将条目合并到 MCP 客户端现有的 `mcpServers` 中。

默认配置示例如下，端口被占用时会递增，实际端口和 token 以设置页为准：

```json
{
  "mcpServers": {
    "worm-vue3-print": {
      "url": "http://127.0.0.1:17521/mcp",
      "headers": {
        "Authorization": "Bearer <设置页展示的配对 token>"
      }
    }
  }
}
```

配置后重启或重新连接 MCP 客户端。`/mcp` 仅接受 POST，使用无状态 JSON 响应；鉴权恒为 `Authorization: Bearer <配对 token>`，与打印链路的「安全开关」无关。

## 三、注册浏览器模板会话

只配置 MCP 客户端还不能读写画布。宿主页面必须注册 `template.get` / `template.apply` 处理器并签到。仓库完整实现见 [`demo/src/template-session.ts`](../../../demo/src/template-session.ts)，核心结构如下：

```ts
import { PrintClient, WormPrintError } from '@worm-vue3-print/core/client'
import { findBlockedElementPaths } from '@worm-vue3-print/core/designer'

const client = new PrintClient({ token })
const sessionId = crypto.randomUUID().replaceAll('-', '')

client.setRequestHandler(async (type, payload) => {
  if (type === 'template.get') {
    const templateJson = designer.getTemplateJson()
    return {
      sessionId,
      revision: await revisionOf(templateJson),
      templateJson,
      fields,
      printData,
      templateName,
    }
  }

  if (type === 'template.apply') {
    const request = payload as {
      baseRevision: string
      templateJson: unknown
    }
    const current = designer.getTemplateJson()
    if (request.baseRevision !== await revisionOf(current)) {
      throw new WormPrintError('REVISION_CONFLICT', '模板已变化，请重新读取后再应用')
    }
    const blocked = findBlockedElementPaths(request.templateJson)
    if (blocked.length) {
      throw new WormPrintError('INVALID_TEMPLATE', `包含封禁元素：${blocked.join('、')}`)
    }

    await applyTemplateToDesigner(request.templateJson)
    const fresh = designer.getTemplateJson()
    return { revision: await revisionOf(fresh), templateJson: fresh }
  }

  throw new WormPrintError('INVALID_REQUEST', `不支持的请求：${type}`)
})

await client.connect()
await client.attachTemplate({
  sessionId,
  name: document.title,
  url: location.href,
  templateName,
})
```

其中 `revisionOf`、`applyTemplateToDesigner`、`designer`、`fields`、`printData` 和 `templateName` 由宿主实现。Vue 3 宿主写回 `initial-template` 时应赋深拷贝的新引用并等待组件更新，再从设计器重新读取实际模板；不要直接回显请求对象。

页面卸载时清理会话：

```ts
await client.detachTemplate(sessionId)
client.close()
```

同时取消状态监听。重连成功后需要重新 `attachTemplate`；页面关闭或客户端退出后，原会话不再有效。

## 四、工具与推荐流程

| 工具 | 用途 |
| --- | --- |
| `print_element_kinds` | 元素类型、表达式函数、系统变量和单位速查 |
| `print_draft_template` | 按结构化 spec 生成草稿并附校验结果 |
| `print_validate_template` | 契约校验，issues 带可定位路径 |
| `print_check_expression` | 表达式语法、函数白名单和未知字段检查 |
| `print_inspect_layout` | 纸张越界、边距、交叠和表格结构等静态体检 |
| `print_list_open_templates` | 列出仍打开且已签到的设计器页面 |
| `print_get_open_template` | 默认读取完整实时快照；`view=summary` 时精简为元素索引，支持字段过滤 |
| `print_patch_open_template` | 按元素 ID 原子批量更新/移动，返回可链式使用的新 revision |
| `print_apply_open_template` | 校验后整份写回画布，必须携带 `baseRevision` |

推荐让 Agent 按以下顺序操作：

1. `print_list_open_templates`，有多个页面时明确目标 `sessionId`。
2. 小范围修改用 `print_get_open_template` 的 `view=summary`，保存元素索引及本次 revision；复杂修改再读取完整快照。
3. `print_element_kinds`，以当前返回的元素、函数和单位为准。
4. 新模板用 `print_draft_template` 起草；已有模板只修改用户要求的部分。
5. `print_validate_template` 修到 `ok=true`，再执行 `print_inspect_layout`；表达式问题用 `print_check_expression` 定位。
6. 小改优先用 `print_patch_open_template` 携带 `baseRevision` 一次提交全部操作；后续 Patch 直接使用上次返回的新 revision。整份替换才用 `print_apply_open_template`。
7. 在设计器中核对预览，并说明实际执行过的校验与写回结果。

纯计算工具只接收内存中的 `templateJson`。静态体检不计算真实行高或页数，不能把它描述成真实出纸验证。

## 五、写回安全与异常处理

- **原子 Patch**：`updateElement` 浅合并 `options.changes`，`moveElement` 的 `x/y` 写入 `options.left/top`；任何操作失败都不写回。
- **整份替换**：`print_apply_open_template` 不是增量 patch，未要求修改的字段和布局必须保留。
- **防覆盖**：`REVISION_CONFLICT` 表示读取后用户或另一客户端又修改了画布。重新读取并协调差异，不循环强制写回。
- **封禁元素**：`html` 等元素在草稿和写回两侧都被拦截，返回 `INVALID_TEMPLATE` 时按路径修复。
- **会话失效**：`SESSION_NOT_FOUND` / `SESSION_DISCONNECTED` 时重新列出会话，页面恢复前不要声称已写回。
- **超时**：`CLIENT_TIMEOUT` 时确认页面仍连接且未卡顿，再决定是否重试。
- **传输安全**：仅绑定回环地址，校验 Host 与 Bearer token；请求体和 WebSocket 帧上限均为 4 MiB。

## 六、验证与故障排查

```bash
npm run test -w @worm-vue3-print/contract
npm run test -w @worm-vue3-print/mcp
npm run test -w @worm-vue3-print/core
npm run test -w @worm-vue3-print/print-client
```

端到端冒烟：打开 demo 设计器并确认已签到 → 开启客户端「AI 助手」→ Agent 列出会话 → 读取模板 → 做一次最小修改 → 校验与体检 → 写回 → 在设计器确认画布更新且可撤销。

常见问题：

- **工具列表没有 9 个工具**：使用设置页当前配置重新连接，确认桌面客户端版本已更新。
- **列表为空**：检查浏览器是否已连接客户端并调用 `attachTemplate`，页面刷新后是否重新签到。
- **401**：使用设置页最新配对 token，请求头必须是 `Authorization: Bearer <token>`。
- **404**：确认「AI 助手」已开启，地址和实际端口与设置页一致。
- **写回后画布未更新**：检查宿主 `template.apply` 是否真正更新设计器，并在写回后重新读取实际模板返回。
