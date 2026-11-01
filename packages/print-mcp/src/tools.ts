import type { ToolResult } from './tool-types.js'

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema（由 zod 的 z.toJSONSchema 生成），MCP 的 inputSchema 要的是 JSON Schema 而非 zod 实例 */
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
}

// 工具实现属 Task 8；此处先立注册表形状，保证 server 接线可独立验证
export const TOOLS: ToolDef[] = []
