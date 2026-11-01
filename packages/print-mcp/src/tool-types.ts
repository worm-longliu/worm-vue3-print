import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/**
 * 直接复用 SDK 的结果类型：它带索引签名与 task 变体，
 * 自定义的窄形状在 strict 模式下无法赋给 setRequestHandler 的返回类型。
 */
export type ToolResult = CallToolResult

export function asText(payload: unknown): ToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}
