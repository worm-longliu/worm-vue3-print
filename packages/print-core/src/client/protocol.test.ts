import { describe, it, expect } from 'vitest'
import {
  APP_ID,
  DEFAULT_PORT,
  encodeRequest,
  decodeServerMessage,
  decodeServerRequest,
  isServerRequestFrame,
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

describe('双向协议：桌面端请求帧', () => {
  it('decodeServerMessage 对桌面端请求帧仍按响应语义判 malformed（公开返回类型不变）', () => {
    expect(decodeServerMessage(JSON.stringify({ id: 'srv-1', type: 'template.get', payload: {} })))
      .toEqual({ malformed: true })
  })

  it('decodeServerRequest 解出 id/type/payload 请求帧', () => {
    const frame = decodeServerRequest(JSON.stringify({ id: 'srv-ab12', type: 'template.apply', payload: { baseRevision: 'r1' } }))
    expect(frame).toMatchObject({ id: 'srv-ab12', type: 'template.apply', payload: { baseRevision: 'r1' } })
  })

  it('响应帧 / 非法输入都不是请求帧', () => {
    for (const raw of [
      '{"id":"1","ok":true,"payload":{}}',
      '{"id":"1","ok":false,"error":{"code":"BUSY","message":"打印中"}}',
      'not-json',
      '{"id":"srv-1","type":"template.get"}',
      '{"id":1,"type":"template.get","payload":{}}',
    ]) {
      expect(decodeServerRequest(raw)).toEqual({ malformed: true })
    }
  })

  it('isServerRequestFrame 精确区分方向', () => {
    expect(isServerRequestFrame({ id: 'srv-1', type: 'template.get', payload: {} })).toBe(true)
    expect(isServerRequestFrame({ id: '1', ok: true, payload: {} })).toBe(false)
    expect(isServerRequestFrame(null)).toBe(false)
  })
})
