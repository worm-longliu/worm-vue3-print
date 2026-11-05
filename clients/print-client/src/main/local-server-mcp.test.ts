import { describe, it, expect, afterEach, vi } from 'vitest'
import { request as httpRequest } from 'node:http'
import { WebSocket as WsClient, type WebSocket as WsConn } from 'ws'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { MESSAGE_TYPES } from '@worm-vue3-print/core/client'
import { WsServer } from './ws-server.js'
import { TemplateSessionRegistry } from './template-sessions.js'
import { createMcpRequestHandler } from './mcp-host.js'
import type { Logger } from './logger.js'

const silentLogger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> = {
  debug() {}, info() {}, warn() {}, error() {},
}

const servers: WsServer[] = []
const openSockets: WsConn[] = []

afterEach(async () => {
  for (const ws of openSockets) { try { ws.close() } catch { /* ignore */ } }
  openSockets.length = 0
  for (const s of servers) await s.stop().catch(() => {})
  servers.length = 0
})

interface Frame {
  id?: string
  type?: string
  payload?: unknown
  ok?: boolean
  error?: { code: string; message: string }
}

/** 组装完整栈：HTTP+WS 共端口 + 模板会话注册表 + /mcp，接线与 index.ts 一致 */
async function buildStack(opts: {
  enabled?: boolean
  token?: string
  maxPayloadBytes?: number
  /** 记录 MCP 工具进入注册表的顺序：证明并发请求确实同时到达 bridge */
  bridgeEvents?: string[]
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>
} = {}) {
  const state = { enabled: opts.enabled ?? true, token: opts.token ?? 'pair-token-1' }
  const registry = new TemplateSessionRegistry(opts.logger ?? silentLogger)
  let actualPort = 0
  const server = new WsServer({
    preferredPort: 17900 + Math.floor(Math.random() * 400),
    ...(opts.maxPayloadBytes !== undefined ? { maxPayloadBytes: opts.maxPayloadBytes } : {}),
    handler: async (type, payload, ctx) => {
      switch (type) {
        case MESSAGE_TYPES.HELLO:
          return { app: 'x', version: '0', port: actualPort }
        case MESSAGE_TYPES.TEMPLATE_ATTACH:
          return registry.attach(payload, ctx)
        case MESSAGE_TYPES.TEMPLATE_DETACH:
          return registry.detach(payload, ctx)
        default:
          return {}
      }
    },
    checkAccess: () => ({ ok: true }),
    handleMcp: createMcpRequestHandler({
      isMcpEnabled: () => state.enabled,
      getPairingToken: () => state.token,
      version: '0',
      templateSessions: {
        listSessions: () => registry.listSessions(),
        getTemplate: (id: string) => {
          opts.bridgeEvents?.push('get-enter')
          return registry.getTemplate(id)
        },
        applyTemplate: (input: { sessionId: string; baseRevision: string; templateJson: unknown }) => {
          opts.bridgeEvents?.push('apply-enter')
          return registry.applyTemplate(input)
        },
      },
      // 本文件只覆盖会话工具链路；渲染通路需要真实窗口，stub 直接拒绝
      renderBridge: {
        renderTemplatePage: async () => {
          throw new Error('测试 stub 未接线渲染通路')
        },
      },
      // 图像读取同样需要真实 Electron，stub 直接拒绝
      imageReader: {
        readGrayImage: async () => {
          throw new Error('测试 stub 未接线图片读取')
        },
        decodePngBase64: async () => {
          throw new Error('测试 stub 未接线图片解码')
        },
      },
      logger: opts.logger ?? silentLogger,
    }),
    onConnectionClose: ws => registry.handleDisconnect(ws),
    logger: silentLogger,
  })
  servers.push(server)
  actualPort = await server.start()
  if (actualPort === 0) throw new Error('端口未启动')
  const port = actualPort
  registry.connectBroker({
    request: (ws, type, payload, timeoutMs) => server.requestClient(ws, type, payload, timeoutMs),
    rejectPendingsOf: (ws, message) => server.rejectPendingsOf(ws, message),
  })
  return { server, registry, port, state }
}

/** 假浏览器：握手后自动应答桌面端 template.get/apply 请求帧 */
async function fakeBrowser(
  port: number,
  behavior: {
    revision?: string
    strictRevision?: boolean
    /** 挂起 apply 应答直到该 Promise 就绪（验证注册表串行链，不靠延时赌时序） */
    applyGate?: Promise<void>
    /** 事件流水：apply-req / apply-reply / get-req，用于断言时序 */
    events?: string[]
  } = {},
): Promise<WsConn> {
  const ws = await connectWs(port, { Origin: 'http://localhost:9303' })
  const current = () => behavior.revision ?? 'rev-1'
  ws.on('message', raw => {
    const frame = JSON.parse(String(raw)) as Frame
    if (typeof frame.ok === 'boolean') return
    const id = frame.id as string
    const reply = (payload: unknown) => ws.send(JSON.stringify({ id, ok: true, payload }))
    if (frame.type === MESSAGE_TYPES.TEMPLATE_GET) {
      behavior.events?.push('get-req')
      reply({ sessionId: 'unknown', revision: current(), templateJson: { placeholder: true } })
      return
    }
    if (frame.type === MESSAGE_TYPES.TEMPLATE_APPLY) {
      behavior.events?.push('apply-req')
      const finish = () => {
        behavior.events?.push('apply-reply')
        reply({ revision: 'rev-2', templateJson: frame.payload, warnings: [] })
      }
      if (behavior.strictRevision !== false
        && (frame.payload as { baseRevision?: string }).baseRevision !== current()) {
        ws.send(JSON.stringify({
          id,
          ok: false,
          error: { code: 'REVISION_CONFLICT', message: '模板已被修改，禁止覆盖' },
        }))
        return
      }
      behavior.revision = 'rev-2'
      if (behavior.applyGate) {
        void behavior.applyGate.then(finish)
        return
      }
      finish()
      return
    }
    ws.send(JSON.stringify({ id, ok: false, error: { code: 'INTERNAL', message: '未知请求' } }))
  })
  return ws
}

function connectWs(
  port: number,
  headers: Record<string, string> = {},
): Promise<WsConn> {
  return new Promise((resolve, reject) => {
    const ws = new WsClient(`ws://127.0.0.1:${port}`, { headers: Object.keys(headers).length ? headers : undefined })
    ws.once('open', () => {
      openSockets.push(ws as WsConn)
      resolve(ws as WsConn)
    })
    ws.once('error', reject)
  })
}

/** attach：发送浏览器请求帧并等待响应帧 */
type AttachReply = { ok: true; payload: unknown } | { ok: false; error: { code: string; message: string } }

function attach(
  ws: WsConn,
  payload: unknown,
): Promise<AttachReply> {
  return new Promise(resolve => {
    const onMsg = (raw: unknown) => {
      const f = JSON.parse(String(raw)) as Frame
      if (typeof f.ok === 'boolean') {
        ws.off('message', onMsg)
        resolve(
          f.ok
            ? { ok: true, payload: f.payload }
            : { ok: false, error: f.error ?? { code: 'INTERNAL', message: '' } },
        )
      }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id: 'browser-1', type: MESSAGE_TYPES.TEMPLATE_ATTACH, payload }))
  })
}

async function mcpClient(port: number, token: string): Promise<Client> {
  const client = new Client({ name: 'test-agent', version: '0' })
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  return client
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content
  return String(content?.[0]?.text ?? '')
}

/** 轮询等待条件成立；超时直接失败，避免「静默等满」把并发用例退化成顺序用例 */
async function waitFor(pred: () => boolean, timeoutMs = 3000, message = '等待条件超时'): Promise<void> {
  const startedAt = Date.now()
  while (!pred()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(message)
    await new Promise(r => setTimeout(r, 10))
  }
}

const validTemplate = {
  paperSize: 'A4', orientation: 'portrait', unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [{ id: 'e1', type: 'text', options: { left: 10, top: 10, width: 60, height: 8, formatter: '{no}' }, printElementType: { type: 'text' } }],
}

describe('共端口 HTTP 层', () => {
  it('未知 HTTP 路径返回 404，Host 不合法返回 403', async () => {
    const { port } = await buildStack({ enabled: false })
    const res = await fetch(`http://127.0.0.1:${port}/nope`)
    expect(res.status).toBe(404)
    // fetch(undici) 会按 URL 重写 Host，须用原生 http.request 才能伪造 Host
    const badHost = await new Promise<number>(resolve => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path: '/anything', headers: { Host: `localhost:${port}` } },
        () => { /* 拿不到 response 时以 destroy 收口 */ },
      )
      req.on('response', r => { resolve(r.statusCode ?? 0); r.resume() })
      req.on('error', () => resolve(0))
      req.end()
    })
    expect(badHost).toBe(403)
  })

  it('MCP 未启用时 /mcp 一律 404（带正确 token 也一样）', async () => {
    const { port } = await buildStack({ enabled: false, token: 't' })
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(res.status).toBe(404)
  })

  it('启用后缺 Bearer / 错 Bearer 一律 401（与 securityEnabled 无关）', async () => {
    const { port } = await buildStack({ token: 'pair-token-1' })
    const noAuth = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', body: '{}' })
    expect(noAuth.status).toBe(401)
    const wrong = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST', headers: { Authorization: 'Bearer other', 'content-type': 'application/json' }, body: '{}',
    })
    expect(wrong.status).toBe(401)
  })

  it('GET/DELETE /mcp 返回 405（不提供 SSE 与会话删除）', async () => {
    const { port } = await buildStack({ token: 'pair-token-1' })
    const get = await fetch(`http://127.0.0.1:${port}/mcp`, {
      headers: { Authorization: 'Bearer pair-token-1' },
    })
    expect(get.status).toBe(405)
    const del = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'DELETE', headers: { Authorization: 'Bearer pair-token-1' },
    })
    expect(del.status).toBe(405)
  })

  it('POST /mcp 体超过 4MiB 返回 413', async () => {
    const { port } = await buildStack({ token: 'pair-token-1' })
    const fat = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'print_apply_open_template', arguments: { blob: 'x'.repeat(5 * 1024 * 1024) } },
    })
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer pair-token-1', 'content-type': 'application/json' },
      body: fat,
    })
    expect(res.status).toBe(413)
  })

  it('WebSocket upgrade 的 Host 校验：错 Host 直接销毁，连接失败', async () => {
    const { port } = await buildStack()
    const ws = new WsClient(`ws://localhost:${port}`, { setHost: false, headers: { Host: `localhost:${port}` } })
    const outcome = new Promise<'closed'>(resolve => {
      ws.on('close', () => resolve('closed'))
      ws.on('error', () => { /* 由 close 收口 */ })
    })
    await expect(outcome).resolves.toBe('closed')
  })
})

describe('MCP HTTP 集成（SDK Client 连真实 /mcp）', () => {
  it('tools/list 恰好 12 个工具：5 个桌面安全工具 + 4 个模板会话工具 + 1 个预览 + 2 个参考图工具', async () => {
    const { port, state } = await buildStack()
    const client = await mcpClient(port, state.token)
    const { tools } = await client.listTools()
    const names = tools.map(t => t.name).sort()
    expect(names).toEqual([
      'print_analyze_reference_image', 'print_apply_open_template', 'print_check_expression',
      'print_compare_with_reference', 'print_draft_template', 'print_element_kinds',
      'print_get_open_template', 'print_inspect_layout', 'print_list_open_templates',
      'print_patch_open_template', 'print_preview_template', 'print_validate_template',
    ])
    await client.close()
  })

  it('fake 浏览器全链路：attach → list → get → apply → 陈旧 revision 冲突 → html 元素被拒', async () => {
    const { port, state, registry } = await buildStack({ token: 'pair-token-1' })
    const client = await mcpClient(port, state.token)
    const ws = await fakeBrowser(port, { revision: 'rev-1' })

    const attachReply = await attach(ws, {
      sessionId: 'sess-page-00000001',
      name: '综合示例模板',
      url: 'http://localhost:9303/?utm=1#frag',
    })
    expect(attachReply.ok).toBe(true)
    expect(((attachReply as { payload: unknown }).payload as { sessionId?: string }).sessionId).toBe('sess-page-00000001')

    const listed = await client.callTool({ name: 'print_list_open_templates', arguments: {} })
    const sessions = JSON.parse(textOf(listed)).sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].url).toBe('http://localhost:9303/')
    expect(sessions[0].name).toBe('综合示例模板')

    const got = await client.callTool({ name: 'print_get_open_template', arguments: {} })
    expect(JSON.parse(textOf(got)).revision).toBe('rev-1')
    expect(JSON.parse(textOf(got)).session.sessionId).toBe('sess-page-00000001')

    const applied = await client.callTool({
      name: 'print_apply_open_template',
      arguments: { baseRevision: 'rev-1', templateJson: validTemplate, reason: 'AI 调整布局' },
    })
    expect(applied.isError).toBeFalsy()
    expect(JSON.parse(textOf(applied)).revision).toBe('rev-2')

    // fake 浏览器现处 rev-2：陈旧 baseRevision → REVISION_CONFLICT，且不含堆栈
    const stale = await client.callTool({
      name: 'print_apply_open_template',
      arguments: { baseRevision: 'rev-1', templateJson: validTemplate },
    })
    expect(stale.isError).toBe(true)
    const staleText = textOf(stale)
    expect(staleText).toContain('重新读取')
    expect(staleText.toLowerCase()).not.toContain('stack')
    expect(staleText).not.toContain('at Object')

    // 封禁门禁：html 元素 → isError 且浏览器没收到 template.apply
    let applyRequests = 0
    const spy = (raw: unknown) => {
      const f = JSON.parse(String(raw)) as Frame
      if (f.type === MESSAGE_TYPES.TEMPLATE_APPLY) applyRequests++
    }
    ws.on('message', spy)
    const blocked = await client.callTool({
      name: 'print_apply_open_template',
      arguments: {
        baseRevision: 'rev-2',
        templateJson: {
          ...validTemplate,
          elements: [{ ...validTemplate.elements[0], type: 'html', printElementType: { type: 'html' } }],
        },
      },
    })
    expect(blocked.isError).toBe(true)
    expect(JSON.parse(textOf(blocked)).stage).toBe('blocked-elements')
    expect(applyRequests).toBe(0)

    expect(registry.size).toBe(1)
    ws.close()
    await client.close()
  })

  it('多会话未指定 sessionId → 候选清单；带 sessionId → 只查目标；断开移除会话', async () => {
    const { port, registry } = await buildStack()
    const client = await mcpClient(port, 'pair-token-1')
    const wsA = await fakeBrowser(port)
    const wsB = await fakeBrowser(port)
    expect((await attach(wsA, {
      sessionId: 'sess-multi-000001', name: '页面甲', url: 'http://localhost:9303/a',
    })).ok).toBe(true)
    expect((await attach(wsB, {
      sessionId: 'sess-multi-000002', name: '页面乙', url: 'http://localhost:9303/b',
    })).ok).toBe(true)

    const noId = await client.callTool({ name: 'print_get_open_template', arguments: {} })
    expect(noId.isError).toBe(true)
    const hint = textOf(noId)
    expect(hint).toContain('sess-multi-000001')
    expect(hint).toContain('sess-multi-000002')
    expect(hint).toContain('sessionId')

    const named = await client.callTool({
      name: 'print_get_open_template', arguments: { sessionId: 'sess-multi-000002' },
    })
    expect(JSON.parse(textOf(named)).session.name).toBe('页面乙')

    wsA.close()
    // close 事件异步送达主进程：等 handleDisconnect 完成后再查
    await new Promise(r => setTimeout(r, 80))
    const died = await client.callTool({
      name: 'print_get_open_template', arguments: { sessionId: 'sess-multi-000001' },
    })
    expect(died.isError).toBe(true)
    expect(textOf(died)).toContain('会话不存在')
    expect(registry.size).toBe(1)

    wsB.close()
    await new Promise(r => setTimeout(r, 50))
    const gone = await client.callTool({ name: 'print_list_open_templates', arguments: {} })
    expect(JSON.parse(textOf(gone)).sessions).toHaveLength(0)
    await client.close()
  })

  it('attach 门禁：缺 Origin UNAUTHORIZED；sessionId 形状非法 INVALID_REQUEST；超上限 BUSY', async () => {
    const { port, registry } = await buildStack()
    // 缺 Origin：attach 收到错误帧（响应帧无 type，按 ok 判）
    const noOrigin = new Promise<{ ok?: boolean; error?: { code: string } }>(resolve => {
      const t = new WsClient(`ws://127.0.0.1:${port}`)
      t.once('open', () => {
        t.send(JSON.stringify({
          id: 'b0', type: MESSAGE_TYPES.TEMPLATE_ATTACH,
          payload: { sessionId: 'sess-noorigin-00001', name: 'x', url: 'http://x/' },
        }))
      })
      t.on('message', raw => {
        const f = JSON.parse(String(raw)) as Frame
        if (typeof f.ok === 'boolean') {
          resolve(f as { ok: boolean; error?: { code: string } })
          t.close()
        }
      })
    })
    await expect(noOrigin).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })

    // sessionId 形状非法
    const ws = await connectWs(port, { Origin: 'http://a.example.com' })
    const bad = await attach(ws, { sessionId: 'too-short', name: 'x', url: 'http://x/' })
    expect(!bad.ok && bad.error.code).toBe('INVALID_REQUEST')

    // 上限 32
    for (let i = 0; i < 32; i++) {
      const w = await connectWs(port, { Origin: `http://tab-${i}.example.com` })
      expect((await attach(w, {
        sessionId: `sess-limit-${String(i).padStart(14, '0')}`,
        name: `页面${i}`, url: 'http://x/',
      })).ok).toBe(true)
    }
    expect(registry.size).toBe(32)
    const extra = await attach(ws as WsConn, {
      sessionId: 'sess-limit-exhausted-09', name: '多余页面', url: 'http://x/',
    })
    expect(!extra.ok && extra.error.code).toBe('BUSY')
  })

  it('同 sessionId 跨 Origin 重连被拒；同 Origin 重连可替换旧连接', async () => {
    const { port, registry } = await buildStack()
    const a = await connectWs(port, { Origin: 'http://a.example.com' })
    const b = await connectWs(port, { Origin: 'http://b.example.com' })
    const again = await connectWs(port, { Origin: 'http://a.example.com' })

    expect((await attach(a, {
      sessionId: 'sess-xorigin-00001', name: 'x', url: 'http://x/',
    })).ok).toBe(true)

    const hijack = await attach(b, { sessionId: 'sess-xorigin-00001', name: 'x', url: 'http://x/' })
    expect(!hijack.ok && hijack.error.code).toBe('UNAUTHORIZED')

    const reagain = await attach(again, { sessionId: 'sess-xorigin-00001', name: 'x', url: 'http://x/' })
    expect(reagain.ok, JSON.stringify(reagain)).toBe(true)
    expect(registry.size).toBe(1)
  })

  it('template.get/apply 未签到会话 → SESSION_NOT_FOUND，不挂起', async () => {
    const { port } = await buildStack()
    const client = await mcpClient(port, 'pair-token-1')
    const noSession = await client.callTool({ name: 'print_list_open_templates', arguments: {} })
    expect(JSON.parse(textOf(noSession)).sessions).toHaveLength(0)

    // 先挂一个真实会话，再查不存在的 sessionId
    const ws = await fakeBrowser(port)
    expect((await attach(ws, {
      sessionId: 'sess-page-00000001', name: 'x', url: 'http://x/',
    })).ok).toBe(true)
    const missing = await client.callTool({
      name: 'print_get_open_template', arguments: { sessionId: 'sess-gone-000000001' },
    })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toContain('会话不存在')
    await client.close()
  })

  it('每个连接最多绑定一个会话：换 sessionId 直接拒绝且不新增不覆盖', async () => {
    const { port, registry } = await buildStack()
    const ws = await connectWs(port, { Origin: 'http://localhost:9303' })
    expect((await attach(ws, {
      sessionId: 'sess-one-conn-00001', name: '页面甲', url: 'http://x/',
    })).ok).toBe(true)

    // 同连接不同 sessionId → INVALID_REQUEST，且会话表不变
    const second = await attach(ws, { sessionId: 'sess-one-conn-00002', name: '页面乙', url: 'http://x/' })
    expect(!second.ok && second.error.code).toBe('INVALID_REQUEST')
    expect(!second.ok && second.error.message).toContain('一个连接只能绑定')
    expect(registry.size).toBe(1)
    expect(JSON.stringify(registry.listSessions())).not.toContain('sess-one-conn-00002')

    // 拒绝之后原会话仍正常可用（本连接重签同 sessionId 也允许）
    expect((await attach(ws, {
      sessionId: 'sess-one-conn-00001', name: '页面甲改名', url: 'http://x/',
    })).ok).toBe(true)
    expect(registry.size).toBe(1)
    expect(JSON.stringify(registry.listSessions())).toContain('页面甲改名')
  })

  it('32 上限只卡新增会话：满员时同 sessionId 同源重连必须能替换', async () => {
    const { port, registry } = await buildStack()
    const wss: WsConn[] = []
    const origins: string[] = []
    for (let i = 0; i < 32; i++) {
      origins.push(`http://full-${i}.example.com`)
      wss.push(await connectWs(port, { Origin: origins[i]! }))
      expect((await attach(wss[i]!, {
        sessionId: `sess-full-${String(i).padStart(14, '0')}`,
        name: `页面${i}`, url: 'http://x/',
      })).ok).toBe(true)
    }
    expect(registry.size).toBe(32)

    // 新 sessionId → BUSY
    const fresh = await connectWs(port, { Origin: 'http://fresh.example.com' })
    const busy = await attach(fresh, { sessionId: 'sess-full-exhausted-001', name: '第33个', url: 'http://x/' })
    expect(!busy.ok && busy.error.code).toBe('BUSY')

    // 第 0 号会话的同源重连：不算新增，必须成功替换且总数仍 32
    const reconnect = await connectWs(port, { Origin: 'http://full-0.example.com' })
    const r = await attach(reconnect, {
      sessionId: 'sess-full-00000000000000', name: '页面0重连', url: 'http://x/',
    })
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(registry.size).toBe(32)
    expect(JSON.stringify(registry.listSessions())).toContain('页面0重连')

    // 重连后的连接只能绑这一个会话（一连接一会话语义仍生效）
    const extra = await attach(reconnect, {
      sessionId: 'sess-full-00000000000001', name: '页面1', url: 'http://x/',
    })
    expect(!extra.ok && extra.error.code).toBe('INVALID_REQUEST')
  })

  it('get 与 apply 共用会话串行链：apply 未结束时 get 不会先发往浏览器', async () => {
    const bridgeEvents: string[] = []
    const { port } = await buildStack({ bridgeEvents })
    const client = await mcpClient(port, 'pair-token-1')
    const events: string[] = []
    let releaseApply!: () => void
    const applyGate = new Promise<void>(r => { releaseApply = r })
    const ws = await fakeBrowser(port, { revision: 'rev-1', applyGate, events })
    expect((await attach(ws, {
      sessionId: 'sess-serial-00000001', name: '页面甲', url: 'http://x/',
    })).ok).toBe(true)

    const applyP = client.callTool({
      name: 'print_apply_open_template',
      arguments: { baseRevision: 'rev-1', templateJson: validTemplate },
    })
    await waitFor(() => events.includes('apply-req'), 3000, 'apply 未发往浏览器')

    // 确认 get 已到达桌面端并排入会话链，再断言它尚未触达被 apply 占用的浏览器
    const getP = client.callTool({
      name: 'print_get_open_template', arguments: { sessionId: 'sess-serial-00000001' },
    })
    await waitFor(() => bridgeEvents.includes('get-enter'), 3000, 'get 未到达桌面会话桥')
    expect(events).not.toContain('get-req')

    releaseApply()
    const [applied, got] = await Promise.all([applyP, getP])
    expect(applied.isError).toBeFalsy()
    expect(got.isError).toBeFalsy()
    expect(events).toEqual(['apply-req', 'apply-reply', 'get-req'])
    await client.close()
  })
})

  it('记录 MCP 总耗时和会话排队/往返分段，不记录模板内容', async () => {
    const debug = vi.fn()
    const logger = { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const { port } = await buildStack({ logger })
    const client = await mcpClient(port, 'pair-token-1')
    const ws = await fakeBrowser(port)
    expect((await attach(ws, {
      sessionId: 'sess-metrics-000001', name: '埋点页面', url: 'http://x/',
    })).ok).toBe(true)
    const result = await client.callTool({
      name: 'print_get_open_template', arguments: { sessionId: 'sess-metrics-000001' },
    })
    expect(result.isError).toBeFalsy()
    const requestLog = debug.mock.calls.find(call => call[0] === 'MCP 请求完成')
    expect(requestLog?.[1]).toMatchObject({ tool: 'print_get_open_template', ok: true })
    expect(requestLog?.[1].durationMs).toEqual(expect.any(Number))
    expect(requestLog?.[1].serverSetupMs).toEqual(expect.any(Number))
    expect(requestLog?.[1].payloadBytes).toEqual(expect.any(Number))
    console.info('MCP 请求分段基准', JSON.stringify(requestLog?.[1]))
    const sessionLog = debug.mock.calls.find(call => call[0] === '模板会话请求完成')
    expect(sessionLog?.[1]).toMatchObject({ operation: 'get', sessionId: 'sess-metrics-000001' })
    expect(sessionLog?.[1].queueMs).toEqual(expect.any(Number))
    expect(sessionLog?.[1].roundTripMs).toEqual(expect.any(Number))
    expect(JSON.stringify(debug.mock.calls)).not.toContain('placeholder')
    await client.callTool({
      name: 'print_get_open_template', arguments: { sessionId: 'sess-missing-000001' },
    })
    const failedLog = debug.mock.calls.filter(call => call[0] === 'MCP 请求完成').at(-1)
    expect(failedLog?.[1].ok).toBe(false)
    await client.close()
  })

describe('WS maxPayload 上限', () => {
  it('超限帧以 1009 关闭且 handler 不被调用；未超限帧正常处理', async () => {
    const seen: Frame[] = []
    let actualPort = 0
    const server = new WsServer({
      preferredPort: 17900 + Math.floor(Math.random() * 400),
      maxPayloadBytes: 64,
      handler: async type => { seen.push({ type }); return {} },
      checkAccess: () => ({ ok: true }),
      onConnectionClose: () => { /* 通知注册表的权利在别处 */ },
      logger: silentLogger,
    })
    servers.push(server)
    actualPort = await server.start()
    const port = actualPort

    // 超限：单帧 100 字节
    const ws = await connectWs(port, { Origin: 'http://x.example.com' })
    const closed = new Promise<number>(resolve => {
      ws.on('close', code => resolve(code))
      ws.on('error', () => { /* close 收口 */ })
    })
    ws.send(Buffer.alloc(100, 'a'))
    await expect(closed).resolves.toBe(1009)
    await new Promise(r => setTimeout(r, 50))
    expect(seen).toHaveLength(0)

    // 未超限：合法小帧照常进 handler
    const ws2 = await connectWs(port, { Origin: 'http://x.example.com' })
    const helloReply = new Promise<Record<string, unknown>>(resolve => {
      ws2.on('message', raw => resolve(JSON.parse(String(raw)) as Record<string, unknown>))
    })
    ws2.send(JSON.stringify({ id: 'small-1', type: MESSAGE_TYPES.PRINTERS_LIST, payload: {} }))
    const reply = await helloReply
    expect(reply.ok).toBe(true)
    expect(seen.filter(f => f.type === MESSAGE_TYPES.PRINTERS_LIST)).toHaveLength(1)
    ws2.close()
  })
})
