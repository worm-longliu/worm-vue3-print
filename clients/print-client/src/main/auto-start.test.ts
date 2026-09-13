import { describe, it, expect, vi } from 'vitest'
import { applyAutoStart, type LoginItemHost } from './auto-start.js'

function makeHost(current: boolean) {
  return {
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: current })),
    setLoginItemSettings: vi.fn(),
  } satisfies LoginItemHost
}

describe('applyAutoStart', () => {
  it('状态一致时不做任何写入（避免 macOS 权限报错日志）', () => {
    const host = makeHost(false)
    expect(applyAutoStart(host, false)).toBe(false)
    expect(host.setLoginItemSettings).not.toHaveBeenCalled()
  })

  it('状态不一致时写入', () => {
    const on = makeHost(false)
    expect(applyAutoStart(on, true)).toBe(true)
    expect(on.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })

    const off = makeHost(true)
    expect(applyAutoStart(off, false)).toBe(true)
    expect(off.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false })
  })

  it('系统接口抛错时记录告警且不抛出', () => {
    const host = makeHost(false)
    host.setLoginItemSettings.mockImplementation(() => {
      throw new Error('Operation not permitted')
    })
    const logger = { warn: vi.fn() }
    expect(applyAutoStart(host, true, logger)).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })
})
