import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/**
 * 直接复用 SDK 的结果类型：它带索引签名与 task 变体，
 * 自定义的窄形状在 strict 模式下无法赋给 setRequestHandler 的返回类型。
 */
export type ToolResult = CallToolResult

/** 工具注册表条目：handler 与 SDK 解耦，便于直接单测而无需起 stdio 服务 */
export interface ToolDef {
  name: string
  description: string
  /** JSON Schema（由 zod 的 z.toJSONSchema 生成），MCP 的 inputSchema 要 JSON Schema 而非 zod 实例 */
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
}

export function asText(payload: unknown): ToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}
