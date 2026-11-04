// 全栈集成演示（进程内真实件）：真实 WsServer（启用 MCP）+ 真实 demo 浏览器侧
// template-session.ts + 真实 @worm-vue3-print/core/client SDK + 真实 MCP SDK Client。
// 与 local-server-mcp.test.ts 的区别：这里用「真实 demo 逻辑 + 真实 SDK」充当浏览器，
// 证明 demo 接入的 get/apply/冲突/封禁处理经真实协议往返成立。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocket as NodeWs } from 'ws'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { MESSAGE_TYPES, APP_ID } from '@worm-vue3-print/core/client'
import { WsServer } from './ws-server.js'
import { TemplateSessionRegistry } from './template-sessions.js'
import { createMcpRequestHandler } from './mcp-host.js'
import { createTemplateSession } from '../../../../demo/src/template-session.js'
import type { Logger } from './logger.js'

const silent: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> = {
  debug() {}, info() {}, warn() {}, error() {},
}
const MCP_TOKEN = 'demo-live-token'
const DEMO_ORIGIN = 'http://127.0.0.1:9303'

// ── 浏览器环境最小垫片：让真实 demo 逻辑在 node 里跑真实 SDK ──
let forcedPort = 0
function installBrowserShims() {
  const mem = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).sessionStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => mem.set(k, String(v)),
  }
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: () => null, setItem: () => {}, removeItem: () => {},
  }
  ;(globalThis as Record<string, unknown>).window = { location: { href: `${DEMO_ORIGIN}/` } }
  ;(globalThis as Record<string, unknown>).document = { title: 'worm-vue3-print 示例' }
  class ShimSocket {
    readyState = 0
    onopen: (() => void) | null = null
    onmessage: ((ev: { data: string }) => void) | null = null
    onerror: ((ev: unknown) => void) | null = null
    onclose: (() => void) | null = null
    private readonly impl: NodeWs
    constructor(url: string) {
      const u = new URL(url)
      u.port = String(forcedPort) // 强制连到受控服务端口，绕开 SDK 默认端口探测
      this.impl = new NodeWs(u.toString(), { headers: { Origin: DEMO_ORIGIN } })
      this.impl.on('open', () => { this.readyState = 1; this.onopen?.() })
      this.impl.on('message', d => { this.onmessage?.({ data: String(d) }) })
      this.impl.on('error', e => { this.onerror?.(e) })
      this.impl.on('close', () => { this.readyState = 3; this.onclose?.() })
    }
    send(data: string) { this.impl.send(data) }
    close() { this.impl.close() }
  }
  ;(globalThis as Record<string, unknown>).WebSocket = ShimSocket
}

// ── 一个通过契约校验、且无 html 的合法模板（apply 目标）──
const validTemplate = {
  paperSize: 'A4', orientation: 'portrait', unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [{ id: 'e1', type: 'text', options: { left: 10, top: 10, width: 60, height: 8, formatter: '{no}' }, printElementType: { type: 'text' } }],
}

/** 从（可能被契约规范化的）画布快照里取首个文本元素的 formatter，用于断言写回内容 */
function textFormatter(tpl: unknown): unknown {
  const els = (tpl as { elements?: Array<{ options?: { formatter?: unknown } }> })?.elements
  return els?.[0]?.options?.formatter
}

describe('真实 demo + 真实 SDK + 真实 MCP 全栈串测', () => {
  let server: WsServer | null = null
  let mcp: Client | null = null
  let session: ReturnType<typeof createTemplateSession> | null = null
  // 充当设计器画布的宿主存储：readSnapshot 读、writeTemplate 写回
  let canvas: unknown = structuredClone(validTemplate)
  const applyResults: Array<{ kind: string; message: string }> = []

  beforeAll(async () => {
    installBrowserShims()
    const registry = new TemplateSessionRegistry(silent)
    server = new WsServer({
      preferredPort: 17950 + Math.floor(Math.random() * 30),
      handler: async (type, payload, ctx) => {
        switch (type) {
          case MESSAGE_TYPES.HELLO: return { app: APP_ID, version: '0', port: server?.port ?? 0 }
          case MESSAGE_TYPES.TEMPLATE_ATTACH: return registry.attach(payload, ctx)
          case MESSAGE_TYPES.TEMPLATE_DETACH: return registry.detach(payload, ctx)
          default: return {}
        }
      },
      checkAccess: () => ({ ok: true }),
      handleMcp: createMcpRequestHandler({
        isMcpEnabled: () => true,
        getPairingToken: () => MCP_TOKEN,
        version: 'demo',
        templateSessions: {
          listSessions: () => registry.listSessions(),
          getTemplate: id => registry.getTemplate(id),
          applyTemplate: input => registry.applyTemplate(input),
        },
        logger: silent,
      }),
      onConnectionClose: ws => registry.handleDisconnect(ws),
      logger: silent,
    })
    const port = await server.start()
    forcedPort = port
    registry.connectBroker({
      request: (ws, type, payload, timeoutMs) => server!.requestClient(ws, type, payload, timeoutMs),
      rejectPendingsOf: (ws, message) => server!.rejectPendingsOf(ws, message),
    })

    // 真实 demo 浏览器侧：接入本地服务并向其暴露当前画布
    session = createTemplateSession({
      readSnapshot: () => ({ templateJson: canvas, templateName: '综合示例模板' }),
      writeTemplate: async (json: unknown) => {
        canvas = json
        return { freshTemplateJson: canvas }
      },
      onApplyResult: (kind: string, message: string) => applyResults.push({ kind, message }),
    })
    session.start()

    // 真实 MCP Agent：SDK Client 连 /mcp
    mcp = new Client({ name: 'demo-agent', version: '1' })
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${MCP_TOKEN}` } },
    }))
  }, 30_000)

  afterAll(async () => {
    session?.stop()
    await mcp?.close().catch(() => {})
    await server?.stop().catch(() => {})
  })

  const textOf = (r: unknown): string =>
    String((r as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '')

  it('桌面端可见工具集恰为 8 个（含 3 个模板会话工具）', async () => {
    const { tools } = await mcp!.listTools()
    expect(tools.map(t => t.name).sort()).toEqual([
      'print_apply_open_template', 'print_check_expression', 'print_draft_template',
      'print_element_kinds', 'print_get_open_template', 'print_inspect_layout',
      'print_list_open_templates', 'print_validate_template',
    ])
  })

  it('demo attach 后：list 可见会话 → get 拿实时快照 → apply 写回 → 陈旧 revision 冲突 → html 被拒', async () => {
    // 等 attach 完成（真实 SDK 连接 + template.attach 往返）
    const t0 = Date.now()
    let listed: unknown
    while (Date.now() - t0 < 5000) {
      listed = await mcp!.callTool({ name: 'print_list_open_templates', arguments: {} })
      if (JSON.parse(textOf(listed)).sessions?.length) break
      await new Promise(r => setTimeout(r, 50))
    }
    const sessions = JSON.parse(textOf(listed)).sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].name).toBe('worm-vue3-print 示例') // 来自 document.title
    expect(sessions[0].templateName).toBe('综合示例模板') // 来自快照 templateName
    expect(sessions[0].url).toBe(`${DEMO_ORIGIN}/`)

    // get：真实 demo handler 计算 revision 并回传当前画布
    const got = await mcp!.callTool({ name: 'print_get_open_template', arguments: {} })
    const snap = JSON.parse(textOf(got))
    expect(snap.revision).toHaveLength(64) // crypto.subtle SHA-256 十六进制
    expect(snap.templateJson).toEqual(validTemplate)

    // apply：写回一个文本元素不同的新模板 → 真实 handler 深拷贝写回宿主画布
    const edited = structuredClone(validTemplate)
    edited.elements[0]!.options = { ...edited.elements[0]!.options, formatter: 'PO-999' }
    const applied = await mcp!.callTool({
      name: 'print_apply_open_template',
      arguments: { baseRevision: snap.revision, templateJson: edited, reason: 'AI 改单号' },
    })
    expect(applied.isError, textOf(applied)).toBeFalsy()
    const newRev = JSON.parse(textOf(applied)).revision
    expect(newRev).not.toBe(snap.revision)
    // 浏览器写入的是契约规范化后的数据，断言内容而非对象全等
    expect(textFormatter(canvas)).toBe('PO-999')
    expect(applyResults.at(-1)?.kind).toBe('success')

    // 用旧 revision 再写 → 真实 demo handler 判 REVISION_CONFLICT，画布不变
    const stale = await mcp!.callTool({
      name: 'print_apply_open_template',
      arguments: { baseRevision: snap.revision, templateJson: validTemplate },
    })
    expect(stale.isError).toBe(true)
    expect(textOf(stale)).toContain('重新读取')
    expect(textFormatter(canvas)).toBe('PO-999') // 未被覆盖
    expect(applyResults.at(-1)?.kind).toBe('conflict')

    // html 元素：工具层门禁 2（blocked-elements）在触达浏览器前拦截，画布不变
    const blocked = await mcp!.callTool({
      name: 'print_apply_open_template',
      arguments: {
        baseRevision: newRev,
        templateJson: {
          ...edited,
          elements: [{ ...edited.elements[0]!, type: 'html', printElementType: { type: 'html' } }],
        },
      },
    })
    expect(blocked.isError).toBe(true)
    expect(JSON.parse(textOf(blocked)).stage).toBe('blocked-elements')
    expect(textFormatter(canvas)).toBe('PO-999')
  }, 30_000)

  it('无 Bearer 时 MCP 恒 401（即便打印安全开关关闭）', async () => {
    const res = await fetch(`http://127.0.0.1:${forcedPort}/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    expect(res.status).toBe(401)
  })
})
