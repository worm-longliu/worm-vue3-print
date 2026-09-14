import { describe, it, expect } from 'vitest'
import { PrintFailure, toPrintFailure, withTimeout } from '../errors.js'

describe('PrintFailure', () => {
  it('保留失败码与原因', () => {
    const cause = new Error('底层崩了')
    const err = new PrintFailure('PDF_FAILED', '出图失败', cause)
    expect(err.code).toBe('PDF_FAILED')
    expect(err.message).toBe('出图失败')
    expect(err.cause).toBe(cause)
    expect(err).toBeInstanceOf(Error)
  })

  it('已是 PrintFailure 时原样返回，不重复包装', () => {
    const origin = new PrintFailure('INVALID_PAPER', '纸张不合法')
    expect(toPrintFailure(origin, 'INTERNAL', '渲染')).toBe(origin)
  })

  it('普通异常按上下文包装并保留原始信息', () => {
    const err = toPrintFailure(new Error('boom'), 'MEASURE_FAILED', '测量失败')
    expect(err.code).toBe('MEASURE_FAILED')
    expect(err.message).toBe('测量失败：boom')
  })
})

describe('withTimeout', () => {
  it('超时抛指定失败码', async () => {
    const never = new Promise<never>(() => {})
    await expect(withTimeout(never, 10, 'RENDER_TIMEOUT', '渲染超过 10ms')).rejects.toMatchObject({
      code: 'RENDER_TIMEOUT',
      message: '渲染超过 10ms',
    })
  })

  it('按时完成时透传结果并清理定时器', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'INTERNAL', 'x')).resolves.toBe('ok')
  })

  it('超时后原任务再次失败不会产生未处理拒绝', async () => {
    const late = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('迟到失败')), 20)
    })
    const rejections: unknown[] = []
    const onRejection = (reason: unknown): void => { rejections.push(reason) }
    process.on('unhandledRejection', onRejection)
    await expect(withTimeout(late, 5, 'RENDER_TIMEOUT', '超时')).rejects.toMatchObject({ code: 'RENDER_TIMEOUT' })
    await new Promise(resolve => setTimeout(resolve, 40))
    process.off('unhandledRejection', onRejection)
    expect(rejections).toEqual([])
  })
})
