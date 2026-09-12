import { describe, it, expect } from 'vitest'
import { checkAccess } from './security.js'

const off = { securityEnabled: false, allowedOrigins: [], pairingToken: '' }
const on = {
  securityEnabled: true,
  allowedOrigins: ['https://erp.example.com'],
  pairingToken: 'tok-1',
}

describe('checkAccess', () => {
  it('开关关闭时一律放行（含无 Origin、无 token）', () => {
    expect(checkAccess({}, off)).toEqual({ ok: true })
    expect(checkAccess({ origin: 'https://evil.com' }, off)).toEqual({ ok: true })
  })

  it('开关开启：token 错误拒绝', () => {
    const r = checkAccess({ origin: 'https://erp.example.com', token: 'wrong' }, on)
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('应拒绝')
    expect(r.code).toBe('UNAUTHORIZED')
  })

  it('开关开启：Origin 不在白名单拒绝（即使 token 正确）', () => {
    expect(checkAccess({ origin: 'https://evil.com', token: 'tok-1' }, on).ok).toBe(false)
  })

  it('开关开启：白名单非空且浏览器连接无 Origin 拒绝；token+Origin 均正确放行', () => {
    expect(checkAccess({ token: 'tok-1' }, on).ok).toBe(false)
    expect(checkAccess({ origin: 'https://erp.example.com', token: 'tok-1' }, on)).toEqual({
      ok: true,
    })
  })

  it('开关开启但白名单为空时：仅校验 token，非浏览器客户端（无 Origin）可用', () => {
    const cfg = { securityEnabled: true, allowedOrigins: [], pairingToken: 'tok-1' }
    expect(checkAccess({ token: 'tok-1' }, cfg)).toEqual({ ok: true })
    expect(checkAccess({ origin: 'https://x.com', token: 'tok-1' }, cfg)).toEqual({ ok: true })
    expect(checkAccess({}, cfg).ok).toBe(false)
  })
})
