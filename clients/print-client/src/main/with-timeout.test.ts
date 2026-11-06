import { describe, it, expect } from 'vitest'
import { setTimeout as sleep } from 'node:timers/promises'
import { withTimeout } from './with-timeout.js'

const boom = (message: string): Error & { code: string } => {
  const err = new Error(message) as Error & { code: string }
  err.code = 'RENDER_TIMEOUT'
  return err
}

describe('withTimeout', () => {
  it('链路在时限内完成：原值透传，不注入超时', async () => {
    const r = await withTimeout(async () => 'ok', {
      timeoutMs: 200, code: 'X', message: '超时',
    })
    expect(r).toBe('ok')
  })

  it('链路超时：拒绝带 code 的错误，且 onTimeout 清理被执行', async () => {
    let cleaned = false
    await expect(withTimeout(() => sleep(300), {
      timeoutMs: 50,
      code: 'RENDER_TIMEOUT',
      message: '渲染超时',
      onTimeout: () => { cleaned = true },
    })).rejects.toMatchObject({ code: 'RENDER_TIMEOUT', message: '渲染超时' })
    expect(cleaned).toBe(true)
  })

  it('超时后链路自身再失败不会冒出未处理 rejection，最终错误仍是超时', async () => {
    const run = sleep(200).then(() => { throw new Error('主链路失败') })
    await expect(withTimeout(() => run, {
      timeoutMs: 50, code: 'RENDER_TIMEOUT', message: '渲染超时',
    })).rejects.toMatchObject({ code: 'RENDER_TIMEOUT' })
    await sleep(250)
  })

  it('链路自身失败（未超时）时原样抛出原始错误而不是超时', async () => {
    await expect(withTimeout(() => sleep(10).then(() => { throw new Error('TEST_FAILED') }), {
      timeoutMs: 1000, code: 'RENDER_TIMEOUT', message: '渲染超时',
    })).rejects.toThrow('TEST_FAILED')
  })

  it('onTimeout 自身抛错不掩盖超时错误', async () => {
    await expect(withTimeout(() => sleep(300), {
      timeoutMs: 50,
      code: 'RENDER_TIMEOUT',
      message: '渲染超时',
      onTimeout: () => { throw boom('清理失败') },
    })).rejects.toMatchObject({ code: 'RENDER_TIMEOUT' })
  })
})
