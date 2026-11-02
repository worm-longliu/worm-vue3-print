import { describe, it, expect } from 'vitest'
import { APP_ID, MESSAGE_TYPES } from '@worm-vue3-print/core/client'
import type { WebSocket } from 'ws'
import { makeMessageHandler } from './protocol-handler.js'
import type { TemplateSessionRegistry } from './template-sessions.js'

let attachCalls = 0
const fakeRegistry = {
  attach: async () => {
    attachCalls++
    return { sessionId: 'sid' }
  },
  detach: async () => ({}),
} as unknown as TemplateSessionRegistry

function makeDeps() {
  return {
    handler: makeMessageHandler({
      appId: APP_ID,
      version: '0.1.0',
      getPort: () => 17521,
      printerService: {
        list: async () => [{ name: 'PDF', isDefault: true, status: 'idle' }],
      } as any,
      printEngine: {
        submit: async () => ({ jobId: 'j-1' }),
        submitHtml: async () => ({ jobId: 'jh-1' }),
      } as any,
      templateSessions: fakeRegistry,
    }),
  }
}

const ctx = { ws: {} as WebSocket, origin: 'http://localhost:9303' }

describe('makeMessageHandler', () => {
  it('hello 返回应用信息与实际端口', async () => {
    const { handler } = makeDeps()
    await expect(handler(MESSAGE_TYPES.HELLO, {}, ctx)).resolves.toEqual({
      app: APP_ID, version: '0.1.0', port: 17521,
    })
  })

  it('printers.list 返回打印机数组', async () => {
    const { handler: h } = makeDeps()
    await expect(h(MESSAGE_TYPES.PRINTERS_LIST, {}, ctx)).resolves.toEqual({
      printers: [{ name: 'PDF', isDefault: true, status: 'idle' }],
    })
  })

  it('print.submit 原样转交打印引擎', async () => {
    const { handler: h } = makeDeps()
    await expect(h(MESSAGE_TYPES.PRINT_SUBMIT, { templateJson: {} }, ctx)).resolves.toEqual({ jobId: 'j-1' })
  })

  it('print.submitHtml 原样转交打印引擎', async () => {
    const { handler: h } = makeDeps()
    await expect(h(MESSAGE_TYPES.PRINT_SUBMIT_HTML, { html: '<html></html>' }, ctx)).resolves.toEqual({ jobId: 'jh-1' })
  })

  it('template.attach/detach 路由到模板会话注册表（携带连接上下文）', async () => {
    const { handler: h } = makeDeps()
    await expect(
      h(MESSAGE_TYPES.TEMPLATE_ATTACH, { sessionId: 's'.repeat(20), name: 'x', url: 'http://a/' }, ctx),
    ).resolves.toEqual({ sessionId: 'sid' })
    expect(attachCalls).toBe(1)
    await expect(h(MESSAGE_TYPES.TEMPLATE_DETACH, {}, ctx)).resolves.toEqual({})
  })

  it('未知 type 返回 INVALID_REQUEST（template.get/apply 只能由桌面端发起）', async () => {
    const { handler: h } = makeDeps()
    await expect(h('nope', {}, ctx)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(h(MESSAGE_TYPES.TEMPLATE_GET, {}, ctx)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(h(MESSAGE_TYPES.TEMPLATE_APPLY, {}, ctx)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})
