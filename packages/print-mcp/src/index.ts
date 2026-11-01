import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createPrintMcpServer } from './server.js'

const server = createPrintMcpServer()
const transport = new StdioServerTransport()

server.connect(transport).catch((e) => {
  // stdio 被协议占用，诊断信息一律走 stderr
  console.error('worm-vue3-print MCP 启动失败:', e)
  process.exit(1)
})
