export interface McpConfig {
  /** print-render 服务 base；未配置则 print_render_preview 工具降级为「仅提示」 */
  renderBaseUrl: string | null
  /** 渲染服务鉴权 key，与服务端 RENDER_API_KEY 同值（services/print-render/src/server.ts:29） */
  renderKey: string | null
}

/**
 * 连接器只允许读这两项：本包不调用模型，因此不存在任何模型密钥入口。
 * src/__tests__/server.test.ts 会扫本文件源码，出现模型密钥类字样即红。
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const base = env.PRINT_RENDER_BASE_URL?.trim()
  return {
    renderBaseUrl: base ? base.replace(/\/+$/, '') : null,
    renderKey: env.RENDER_API_KEY?.trim() || null,
  }
}
