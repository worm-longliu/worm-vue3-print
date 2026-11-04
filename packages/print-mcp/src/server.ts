import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { version } from './version.js'
import type { ToolDef } from './tool-types.js'

export interface DesktopPrintMcpServerOptions {
  /** 桌面客户端组合后的纯计算工具与模板会话工具 */
  tools: ToolDef[]
  /** MCP server 名称；桌面端为 worm-vue3-print-client */
  name?: string
  /** MCP server 版本；桌面端取 app.getVersion() */
  version?: string
}

/**
 * 创建低层 MCP Server（仅声明 tools 能力，transport 由调用方 connect）。
 * 不调用模型、不读取模型密钥——工具循环与模型都归宿主 agent（本阶段的设计前提）。
 */
export function createDesktopPrintMcpServer(options: DesktopPrintMcpServerOptions): Server {
  if (!options?.tools?.length) throw new Error('tools 必须显式提供')
  const toolList = options.tools
  const server = new Server(
    { name: options.name ?? 'worm-vue3-print-client', version: options.version ?? version },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolList.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      // 注解随 tools/list 下发：宿主据此决定只读工具是否免审批
      ...(t.annotations ? { annotations: t.annotations } : {}),
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolList.find(t => t.name === request.params.name)
    if (!tool) {
      return { content: [{ type: 'text' as const, text: `未知工具 ${request.params.name}` }], isError: true }
    }
    try {
      return await tool.handler(request.params.arguments ?? {})
    } catch (e) {
      // 工具内部异常不外泄堆栈：agent 需要的是可行动的文本
      return { content: [{ type: 'text' as const, text: `工具执行失败：${(e as Error).message}` }], isError: true }
    }
  })

  return server
}
