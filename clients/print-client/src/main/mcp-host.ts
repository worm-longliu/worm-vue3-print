// /mcp 的 HTTP 接线：开关 → Bearer 鉴权 → 4 MiB 体上限 → 无状态 Streamable HTTP 逐请求分发。
// 无状态模式：每个 POST 新建 transport/server，完成后关闭，不保留 SSE 或跨请求会话。
import { timingSafeEqual, createHash } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  createDesktopPrintMcpServer,
  TOOLS,
  createTemplateSessionTools,
  type TemplateSessionBridge,
} from '@worm-vue3-print/mcp'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from './logger.js'

const BODY_LIMIT_BYTES = 4 * 1024 * 1024
const MCP_SERVER_NAME = 'worm-vue3-print-client'

export interface McpHostDeps {
  /** 即时开关：每次请求读取当前配置，无需重启 */
  isMcpEnabled: () => boolean
  /** 复用配对 token；开启 MCP 前由配置层保证非空 */
  getPairingToken: () => string
  version: string
  templateSessions: TemplateSessionBridge
  logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>
}

/** 常量时间比较：哈希到等长摘要，避免长度信息泄漏 */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

function bearerOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header || typeof header !== 'string') return null
  const m = /^Bearer[ ]+(.+)$/.exec(header.trim())
  return m ? m[1]!.trim() : null
}

export function createMcpRequestHandler(deps: McpHostDeps) {
  return async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startedAt = Date.now()
    const enabled = deps.isMcpEnabled()
    // 未启用的 MCP：与鉴权顺序无关，一律 404，不暴露 endpoint 存在性
    if (!enabled) {
      replyJson(res, 404, { error: '未找到资源' })
      return
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      // 本能力不提供 SSE / 主动通知 / 会话删除：AI 工具调用均为 POST 请求-响应
      replyJson(res, 405, { error: 'MCP 只接受 POST 请求；不提供 GET/DELETE 通道' })
      return
    }
    if (req.method !== 'POST') {
      replyJson(res, 404, { error: '未找到资源' })
      return
    }
    // 鉴权：MCP 恒要求 Bearer pairingToken，与打印链路的 securityEnabled 无关
    const token = bearerOf(req)
    const expected = deps.getPairingToken()
    if (!expected || !token || !constantTimeEqual(token, expected)) {
      deps.logger?.warn('/mcp 鉴权失败（不记录 token）')
      replyJson(res, 401, { error: '鉴权失败：需要 Authorization: Bearer <配对 token>' })
      return
    }

    let body: unknown
    let payloadBytes = 0
    try {
      const parsed = await readJsonBody(req)
      body = parsed.body
      payloadBytes = parsed.bytes
    } catch (err) {
      if ((err as { limited?: boolean }).limited) {
        replyJson(res, 413, { error: `请求体超过 ${Math.floor(BODY_LIMIT_BYTES / 1024 / 1024)}MiB 上限` })
      } else {
        replyJson(res, 400, { error: '请求体不是合法 JSON' })
      }
      return
    }

    const tool = body && typeof body === 'object' && (body as { method?: unknown }).method === 'tools/call'
      && typeof (body as { params?: { name?: unknown } }).params?.name === 'string'
      ? (body as { params: { name: string } }).params.name
      : undefined
    const serverSetupStartedAt = Date.now()
    let serverSetupMs = 0
    let toolOk: boolean | undefined

    // 无状态模式：sessionIdGenerator=undefined 关闭跨请求会话；JSON 响应关闭 SSE
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    const server = createDesktopPrintMcpServer({
      tools: [
        ...TOOLS,
        ...createTemplateSessionTools(deps.templateSessions),
      ].map(definition => ({
        ...definition,
        handler: async (args: Record<string, unknown>) => {
          try {
            const result = await definition.handler(args)
            toolOk = !result.isError
            return result
          } catch (error) {
            toolOk = false
            throw error
          }
        },
      })),
      name: MCP_SERVER_NAME,
      version: deps.version,
    })
    try {
      await server.connect(transport)
      serverSetupMs = Date.now() - serverSetupStartedAt
      await transport.handleRequest(req, res, body)
    } finally {
      // 请求完成后即关闭本次 transport 与 server，不保留长连接
      await transport.close().catch(() => {})
      await server.close().catch(() => {})
      if (tool) {
        deps.logger?.debug('MCP 请求完成', {
          tool,
          durationMs: Date.now() - startedAt,
          serverSetupMs,
          payloadBytes,
          ok: toolOk ?? false,
        })
      }
    }
  }
}

/** 读请求体并按上限截断：超过即抛 { limited: true }，不缓冲无界内存 */
async function readJsonBody(req: IncomingMessage): Promise<{ body: unknown; bytes: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const cleanup = () => {
      req.removeAllListeners('data')
      req.removeAllListeners('end')
      req.removeAllListeners('error')
    }
    req.on('data', (chunk: Buffer) => {
      if (settled) return
      size += chunk.length
      if (size > BODY_LIMIT_BYTES) {
        settled = true
        // 停止缓冲即可，剩余数据回 drain；响应照常送达（413）
        cleanup()
        const e = new Error('body too large') as Error & { limited?: boolean }
        e.limited = true
        reject(e)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      try {
        resolve({ body: JSON.parse(Buffer.concat(chunks).toString('utf-8')), bytes: size })
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', err => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

function replyJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}
