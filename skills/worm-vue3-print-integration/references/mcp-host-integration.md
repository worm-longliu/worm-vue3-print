# 宿主端 MCP 集成

仅通过桌面客户端把 AI Agent 接入浏览器里的 `PrintDesigner` 实时画布；只配置 MCP 客户端而不完成页面接线，不能读写当前模板。

1. 工位电脑启动桌面客户端，在设置页开启「AI 助手」并完成配对。
2. 将设置页生成的本机 HTTP MCP 配置交给宿主已有的 MCP 客户端。
3. Vue 3 页面通过 `@worm-vue3-print/core/client` 响应 `template.get/apply` 并 `attachTemplate`。
4. 组件卸载时 detach、取消状态监听并关闭 WebSocket。

### Vue 3 会话骨架

下面是宿主组合式函数的骨架，不是 canvas 公开的 `createTemplateSession`：

```ts
import { nextTick, onMounted, onUnmounted } from 'vue'
import { PrintClient, WormPrintError } from '@worm-vue3-print/core/client'
import { findBlockedElementPaths } from '@worm-vue3-print/core/designer'

async function revisionOf(value: unknown) {
  const text = JSON.stringify(value)
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  }
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function assertTemplateShape(value: any) {
  const single = (page: any) => page && typeof page === 'object'
    && typeof page.paperSize === 'string'
    && page.margins && typeof page.margins === 'object'
    && Array.isArray(page.elements)
  if (!single(value) && !(value && Array.isArray(value.pages) && value.pages.every(single))) {
    throw new WormPrintError('INVALID_TEMPLATE', '模板缺少 paperSize / margins / elements')
  }
}

export function usePrintTemplateSession({ designerRef, templateData, readExtras, token }: any) {
  const client = new PrintClient({ token })
  const sessionId = crypto.randomUUID().replaceAll('-', '')
  const readSnapshot = () => ({
    templateJson: designerRef.value?.getTemplateJson() ?? templateData.value,
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
      const request = payload as any
      const currentRevision = await revisionOf(readSnapshot().templateJson)
      if (request.baseRevision !== currentRevision) {
        throw new WormPrintError('REVISION_CONFLICT', '模板已变化，请重新读取后再应用')
      }
      assertTemplateShape(request.templateJson)
      const blocked = findBlockedElementPaths(request.templateJson)
      if (blocked.length) {
        throw new WormPrintError('INVALID_TEMPLATE', `包含封禁元素：${blocked.join('、')}`)
      }

      templateData.value = structuredClone(request.templateJson)
      await nextTick()
      const freshTemplateJson = designerRef.value?.getTemplateJson()
      if (!freshTemplateJson) throw new WormPrintError('INTERNAL', '写回后无法读取设计器')
      return { revision: await revisionOf(freshTemplateJson), templateJson: freshTemplateJson }
    }
    throw new WormPrintError('INVALID_REQUEST', `不支持的请求：${type}`)
  })

  const offStatus = client.onStatusChange(status => {
    if (status === 'connected') void attach().catch(() => {})
  })
  onMounted(() => { void client.connect().catch(() => {}) })
  onUnmounted(() => {
    offStatus()
    void client.detachTemplate(sessionId).catch(() => {})
    client.close()
  })
}
```

`templateData` 就是传给 `PrintDesigner` 的 `initial-template` 响应式引用。必须赋深拷贝的新引用并等待 `nextTick()`，不能只修改嵌套字段。`readExtras()` 返回最新 `fields`、`printData`、`templateName`，避免闭包捕获首次渲染的旧数据。

当前 canvas 对新的 `initial-template` 引用记录一次历史，MCP 写回可由设计器撤销一步；宿主不要重复赋值造成第二条历史。
