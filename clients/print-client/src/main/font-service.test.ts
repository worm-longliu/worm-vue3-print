// clients/print-client/src/main/font-service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { makeFontService } from './font-service.js'

describe('FontService', () => {
  it('缓存命中时只采集一次', async () => {
    const run = vi.fn(async () => ({ stdout: 'SimSun\n' }))
    const service = makeFontService(run, 'linux')
    await service.list()
    await service.list()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('采集成功返回 available:true 与归一化后的字体名', async () => {
    const run = async () => ({ stdout: 'SimSun\nKaiTi\nSimSun\n' })
    const report = await makeFontService(run, 'linux').list()
    expect(report).toEqual({ available: true, fonts: ['KaiTi', 'SimSun'] })
  })

  it('采集失败不缓存，下次调用重试', async () => {
    const run = vi
      .fn<() => Promise<{ stdout: string }>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ stdout: 'SimSun\n' })
    const service = makeFontService(run, 'linux')
    await expect(service.list()).resolves.toEqual({ available: false, fonts: [] })
    await expect(service.list()).resolves.toEqual({ available: true, fonts: ['SimSun'] })
    expect(run).toHaveBeenCalledTimes(2)
  })
})
