// 生成可直接粘贴进 MCP 客户端配置文件的完整 mcpServers 配置块。
// 服务名称与 docs/中文/指南/AI接入.md 的示例一致；它只是配置文件里的 key，
// 与 MCP 协议层 serverInfo.name（worm-vue3-print-client）不是同一个概念。
export const MCP_SERVICE_NAME = 'worm-vue3-print'

/** 连接区只跟随已保存开关；草稿开启但未保存时先提示保存。 */
export function resolveMcpConnectionView(
  draftEnabled: boolean,
  savedEnabled: boolean,
): 'disabled' | 'save-required' | 'details' {
  if (savedEnabled) return 'details'
  return draftEnabled ? 'save-required' : 'disabled'
}

export function buildMcpConfigJson(url: string, pairingToken: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVICE_NAME]: {
          url,
          headers: { Authorization: `Bearer ${pairingToken}` },
        },
      },
    },
    null,
    2,
  )
}
