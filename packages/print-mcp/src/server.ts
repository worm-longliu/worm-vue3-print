import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { TOOLS } from './tools.js'

/**
 * 本地 stdio 连接器：只声明 tools 能力。
 * 不调用模型、不读取模型密钥——工具循环与模型都归宿主 agent（本阶段的设计前提）。
 */
export function createPrintMcpServer(): Server {
  const server = new Server(
    { name: 'worm-vue3-print', version: '1.4.4' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      // 注解随 tools/list 下发：宿主据此决定只读工具是否免审批
      ...(t.annotations ? { annotations: t.annotations } : {}),
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS.find(t => t.name === request.params.name)
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
