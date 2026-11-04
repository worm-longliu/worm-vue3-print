import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'

/**
 * 直接复用 SDK 的结果类型：它带索引签名与 task 变体，
 * 自定义的窄形状在 strict 模式下无法赋给 setRequestHandler 的返回类型。
 */
export type ToolResult = CallToolResult

/** 工具注册表条目：handler 与 SDK 解耦，便于直接单测而无需启动桌面服务 */
export interface ToolDef {
  name: string
  description: string
  /**
   * MCP 工具注解：宿主据此判断是否需要用户审批（readOnlyHint / openWorldHint），并可取 title 作可读名。
   * 注意 OpenCode 对无参工具打的 `⚙ <工具名> Unknown` 里，Unknown 在参数列，与 title 无关。
   */
  annotations?: ToolAnnotations
  /** JSON Schema（由 zod 的 z.toJSONSchema 生成），MCP 的 inputSchema 要 JSON Schema 而非 zod 实例 */
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
}

export function asText(payload: unknown): ToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}

export function asError(message: string): ToolResult {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}
