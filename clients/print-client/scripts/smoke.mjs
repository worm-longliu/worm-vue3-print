#!/usr/bin/env node
// 真机冒烟：node scripts/smoke.mjs [printerName]
// 依次发 hello → printers.list → print.submit（内置 A4 测试模板到默认或指定打印机）。
// 前置：客户端已启动（npm run dev -w @worm-vue3-print/print-client）。
import { WebSocket } from 'ws'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const TEST_TEMPLATE_JSON = JSON.parse(
  readFileSync(join(here, '../src/main/test-template.json'), 'utf-8'),
)

const port = Number(process.env.PORT || 17521)
const token = process.env.WORM_TOKEN ? `?token=${encodeURIComponent(process.env.WORM_TOKEN)}` : ''
const printerName = process.argv[2]
const ws = new WebSocket(`ws://127.0.0.1:${port}${token}`)
let seq = 0

function rpc(type, payload) {
  return new Promise((resolve, reject) => {
    const id = 'smoke-' + ++seq
    const onMsg = data => {
      const msg = JSON.parse(String(data))
      if (msg.id === id) {
        ws.off('message', onMsg)
        if (msg.ok) resolve(msg.payload)
        else reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }))
      }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, type, payload }))
  })
}

ws.on('open', async () => {
  try {
    console.log('hello =>', await rpc('hello', {}))
    const { printers } = await rpc('printers.list', {})
    console.log(
      'printers =>',
      printers.map(p => `${p.name}${p.isDefault ? '（默认）' : ''}[${p.status}]`).join('、') || '（无）',
    )
    const print = { printerName }
    for (const k of Object.keys(print)) {
      if (print[k] === undefined) delete print[k]
    }
    console.log(
      'print =>',
      await rpc('print.submit', { templateJson: TEST_TEMPLATE_JSON, printData: {}, print }),
    )
    ws.close()
  } catch (e) {
    console.error('冒烟失败：', e.code ?? '', e.message)
    process.exitCode = 1
    ws.close()
  }
})

ws.on('error', e => {
  console.error('无法连接客户端：', e.message)
  process.exit(1)
})
