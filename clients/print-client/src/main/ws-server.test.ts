import { describe, it, expect, afterEach } from 'vitest'
import { WebSocket as WsClient } from 'ws'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { WsServer } from './ws-server.js'
import { ProtocolFailure } from './protocol-error.js'

const servers: WsServer[] = []
afterEach(async () => {
  for (const s of servers) await s.stop().catch(() => {})
  servers.length = 0
})

function makeServer(
  handler: (type: string, payload: unknown) => Promise<unknown>,
  check?: (input: { origin?: string; token?: string }) =>
    | { ok: true }
    | { ok: false; code: 'UNAUTHORIZED'; message: string },
): WsServer {
  const server = new WsServer({
    preferredPort: 17900 + Math.floor(Math.random() * 500),
    handler,
    checkAccess: check ?? (() => ({ ok: true })),
  })
  servers.push(server)
  return server
}

function rpc(ws: WsClient, type: string, payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = 't-' + Math.random()
    const onMsg = (data: unknown) => {
      const msg = JSON.parse(String(data))
      if (msg.id === id) {
        ws.off('message', onMsg)
        resolve(msg)
      }
    }
    ws.on('message', onMsg)
    ws.on('close', (code: number) => reject(new Error('连接关闭 code=' + code)))
    ws.send(JSON.stringify({ id, type, payload }))
  })
}

function connect(
  port: number,
  opts: { token?: string; origin?: string } = {},
): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const url = new URL(`ws://127.0.0.1:${port}`)
    if (opts.token) url.searchParams.set('token', opts.token)
    const ws = new WsClient(url.toString().replace(/\/$/, ''), {
      headers: opts.origin ? { Origin: opts.origin } : undefined,
    })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

describe('WsServer', () => {
  it('请求响应往返：hello 与 printers.list', async () => {
    const server = makeServer(async type => {
      if (type === 'hello')
        return { app: 'worm-print-client', version: '0.1.0', port: server.port }
      if (type === 'printers.list')
        return { printers: [{ name: 'PDF', isDefault: true, status: 'idle' }] }
      throw new ProtocolFailure('INVALID_REQUEST', '未知消息')
    })
    const port = await server.start()
    const ws = await connect(port)

    expect(await rpc(ws, 'hello', {})).toMatchObject({
      ok: true,
      payload: { app: 'worm-print-client' },
    })
    expect(await rpc(ws, 'printers.list', {})).toMatchObject({ ok: true })
    const bad = await rpc(ws, 'nope', {})
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    ws.close()
  })

  it('非法 JSON / 帧结构返回 INVALID_REQUEST', async () => {
    const server = makeServer(async () => ({}))
    const port = await server.start()
    const ws = await connect(port)
    const reply = await new Promise<unknown>(resolve => {
      ws.on('message', data => resolve(JSON.parse(String(data))))
      ws.send('not-json')
    })
    expect(reply).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    ws.close()
  })

  it('鉴权失败：先收 UNAUTHORIZED 错误帧再关闭连接', async () => {
    const server = makeServer(
      async () => ({}),
      () => ({ ok: false, code: 'UNAUTHORIZED', message: 'denied' }),
    )
    const port = await server.start()

    const errorFrame = await new Promise<unknown>((resolve, reject) => {
      const ws = new WsClient(`ws://127.0.0.1:${port}`)
      ws.on('message', data => resolve(JSON.parse(String(data))))
      ws.on('close', (code: number) =>
        code === 4401 ? resolve(null) : reject(new Error('code=' + code)),
      )
    })
    expect(errorFrame).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })
  })

  it('首选端口被占用时自动递增到下一端口', async () => {
    const tcp = createServer()
    await new Promise<void>(resolve => tcp.listen(18501, '127.0.0.1', resolve))
    try {
      const server = new WsServer({
        preferredPort: 18501,
        handler: async () => ({ ok: true }),
        checkAccess: () => ({ ok: true }),
      })
      servers.push(server)
      const port = await server.start()
      expect(port).toBe(18502)
    } finally {
      await new Promise<void>(resolve => tcp.close(() => resolve()))
    }
  }, 10000)
})
