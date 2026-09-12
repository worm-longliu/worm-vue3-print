import { describe, it, expect } from 'vitest'
import {
  APP_ID,
  DEFAULT_PORT,
  encodeRequest,
  decodeServerMessage,
} from './protocol.js'

describe('encodeRequest', () => {
  it('生成带唯一 id 的 JSON 帧', () => {
    const a = JSON.parse(encodeRequest('hello', {}))
    const b = JSON.parse(encodeRequest('hello', {}))
    expect(a).toMatchObject({ type: 'hello', payload: {} })
    expect(typeof a.id).toBe('string')
    expect(a.id.length).toBeGreaterThan(0)
    expect(a.id).not.toBe(b.id)
  })
})

describe('decodeServerMessage', () => {
  it('解析成功响应', () => {
    const msg = decodeServerMessage(
      JSON.stringify({ id: '1', ok: true, payload: { app: APP_ID, version: '0.1.0', port: DEFAULT_PORT } }),
    )
    expect(msg).toEqual({
      id: '1',
      ok: true,
      payload: { app: 'worm-print-client', version: '0.1.0', port: 17521 },
    })
  })

  it('解析失败响应', () => {
    const msg = decodeServerMessage(
      JSON.stringify({ id: '2', ok: false, error: { code: 'BUSY', message: '打印中' } }),
    )
    expect(msg).toMatchObject({ id: '2', ok: false })
    if (!('ok' in msg) || msg.ok) throw new Error('应为失败响应')
    expect(msg.error.code).toBe('BUSY')
  })

  it('非法 JSON 或结构缺失返回 malformed，不抛异常', () => {
    expect(decodeServerMessage('not-json')).toEqual({ malformed: true })
    expect(decodeServerMessage(JSON.stringify({ id: '3' }))).toEqual({ malformed: true })
    expect(decodeServerMessage(JSON.stringify({ ok: true, payload: {} }))).toEqual({ malformed: true })
  })
})
