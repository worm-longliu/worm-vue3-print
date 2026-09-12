import { describe, it, expect } from 'vitest'
import { APP_ID, MESSAGE_TYPES } from '@worm-vue3-print/client'
import { makeMessageHandler } from './protocol-handler.js'

function makeDeps() {
  return makeMessageHandler({
    appId: APP_ID,
    version: '0.1.0',
    getPort: () => 17521,
    printerService: {
      list: async () => [{ name: 'PDF', isDefault: true, status: 'idle' }],
    } as any,
    printEngine: {
      submit: async () => ({ jobId: 'j-1' }),
    } as any,
  })
}

describe('makeMessageHandler', () => {
  it('hello 返回应用信息与实际端口', async () => {
    const h = makeDeps()
    await expect(h(MESSAGE_TYPES.HELLO, {})).resolves.toEqual({
      app: APP_ID, version: '0.1.0', port: 17521,
    })
  })

  it('printers.list 返回打印机数组', async () => {
    const h = makeDeps()
    await expect(h(MESSAGE_TYPES.PRINTERS_LIST, {})).resolves.toEqual({
      printers: [{ name: 'PDF', isDefault: true, status: 'idle' }],
    })
  })

  it('print.submit 原样转交打印引擎', async () => {
    const h = makeDeps()
    await expect(h(MESSAGE_TYPES.PRINT_SUBMIT, { templateJson: {} })).resolves.toEqual({ jobId: 'j-1' })
  })

  it('未知 type 返回 INVALID_REQUEST', async () => {
    const h = makeDeps()
    await expect(h('nope', {})).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})
