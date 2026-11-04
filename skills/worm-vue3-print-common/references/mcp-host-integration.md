# 宿主端 MCP 集成

按目标选择方案，不要把“配置一个外部 MCP 客户端”误当成宿主页面已经具备实时画布读写能力。

## 方案 A：桌面客户端 + 当前画布（优先）

适用于宿主已有 Claude、Cursor 或其他 MCP 客户端，并希望 AI 修改用户正在编辑的模板。

1. 工位电脑启动桌面客户端，在设置页开启「AI 助手」并配对。
2. 把设置页生成的本机 HTTP MCP 配置交给 MCP 客户端。
3. 宿主页面通过 `@worm-vue3-print/core/client` 处理 `template.get/apply` 并签到。
4. 页面卸载时 detach、取消状态监听并关闭连接。

浏览器直挂宿主可从 `WormPrintCommon.PrintClient`、`WormPrintCommon.WormPrintError` 取得同类 API；`findBlockedElementPaths` 在 NPM 宿主从 `@worm-vue3-print/core/designer` 导入。当前 UMD 没有导出这个封禁检查函数：仅直挂且无法增加 core/designer ESM 时保持 MCP 只读，不要复制一份封禁清单后直接开放写回。

### Custom Element 会话骨架

以下是宿主代码，不是 common 新增的公开组件方法：

```js
import { PrintClient, WormPrintError } from '@worm-vue3-print/core/client'
import { findBlockedElementPaths } from '@worm-vue3-print/core/designer'

async function revisionOf(value) {
  const text = JSON.stringify(value)
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  }
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function assertTemplateShape(value) {
  const single = page => page && typeof page === 'object'
    && typeof page.paperSize === 'string'
    && page.margins && typeof page.margins === 'object'
    && Array.isArray(page.elements)
  const valid = single(value) || (value && Array.isArray(value.pages) && value.pages.every(single))
  if (!valid) throw new WormPrintError('INVALID_TEMPLATE', '模板缺少 paperSize / margins / elements')
}

export function startCommonTemplateSession(element, readExtras, token) {
  const client = new PrintClient({ token })
  const sessionId = crypto.randomUUID().replaceAll('-', '')
  const readSnapshot = () => ({
    templateJson: JSON.parse(element.getTemplateJson()),
    ...readExtras(),
  })
  const attach = () => client.attachTemplate({
    sessionId,
    name: document.title,
    url: location.href,
    templateName: readExtras().templateName,
  })

  client.setRequestHandler(async (type, payload) => {
    if (type === 'template.get') {
      const snapshot = readSnapshot()
      return {
        sessionId,
        revision: await revisionOf(snapshot.templateJson),
        templateJson: snapshot.templateJson,
        fields: snapshot.fields,
        printData: snapshot.printData,
        templateName: snapshot.templateName,
      }
    }
    if (type === 'template.apply') {
      const request = payload
      const currentRevision = await revisionOf(readSnapshot().templateJson)
      if (request.baseRevision !== currentRevision) {
        throw new WormPrintError('REVISION_CONFLICT', '模板已变化，请重新读取后再应用')
      }
      assertTemplateShape(request.templateJson)
      const blocked = findBlockedElementPaths(request.templateJson)
      if (blocked.length) {
        throw new WormPrintError('INVALID_TEMPLATE', `包含封禁元素：${blocked.join('、')}`)
      }

      // common 的 template setter 同步调用 applyTemplate；写后立即重读实际画布。
      element.template = structuredClone(request.templateJson)
      const freshTemplateJson = JSON.parse(element.getTemplateJson())
      return {
        revision: await revisionOf(freshTemplateJson),
        templateJson: freshTemplateJson,
      }
    }
    throw new WormPrintError('INVALID_REQUEST', `不支持的请求：${type}`)
  })

  const offStatus = client.onStatusChange(status => {
    if (status === 'connected') void attach().catch(() => {})
  })
  void client.connect().catch(() => {})

  return async () => {
    offStatus()
    await client.detachTemplate(sessionId).catch(() => {})
    client.close()
  }
}
```

`readExtras()` 应返回宿主最新的 `fields`、`printData`、`templateName`，不要捕获首次渲染的旧值。Vue 2.7 在 `beforeDestroy`、React 在 effect cleanup、jQuery 在页面/组件销毁时调用返回的停止函数。

### 写入语义

- `template.apply` 是整份替换，不是增量 patch。
- revision 必须根据当前实时模板重新计算；不能沿用页面加载时的值。
- 写回后返回的是从 element 重新读取的模板，不是直接把请求对象原样回显。
- common 的 `loadTemplate()` 只记录装载后的历史检查点，当前不能承诺撤销到写回前；宿主需要该能力时应自行保留写回前快照。不要额外重复注入同一模板。
- MCP 配对 token 用于本机客户端鉴权，不是模型密钥。模型密钥不得进入前端 bundle。

## 方案 B：宿主 Node 进程嵌入 MCP

适用于自建 Agent 或 MCP 网关。`@worm-vue3-print/mcp` 是 private 包，只能从源码或 workspace 使用，不能写成 `npm install @worm-vue3-print/mcp`。

```js
import { createPrintMcpServer } from '@worm-vue3-print/mcp'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = createPrintMcpServer()
await server.connect(new StdioServerTransport())
```

库入口没有启动 transport 的副作用，transport 由宿主选择。默认注册 stdio 六工具；只需要部分能力时传入筛选后的 `tools`。自有实时会话源使用 `createTemplateSessionTools(bridge)`，bridge 实现 `TemplateSessionBridge` 的 list/get/apply，负责超时、串行化和 revision 语义。

本仓库不提供远程 MCP、OAuth 或宿主模型代理。需要 HTTP 时由宿主明确配置 transport、鉴权和部署边界，不声称这是开箱能力。

## 验收

1. MCP 客户端能看到 5 个纯计算工具与 3 个会话工具。
2. `template.get` 返回当前画布，不是初始模板缓存。
3. AI 写回后画布更新，再次 get 得到新 revision。
4. 读取后手动改一次画布，再以旧 revision 写入，必须得到 `REVISION_CONFLICT`。
5. 页面卸载后会话消失，没有残留状态监听或 WebSocket。
