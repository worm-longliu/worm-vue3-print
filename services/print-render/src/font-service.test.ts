// services/print-render/src/font-service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { makeFontService } from './font-service.js'

describe('render 服务字体清单', () => {
  it('返回 fc-list 解析结果且 available 为 true', async () => {
    const run = vi.fn(async () => ({ stdout: 'DejaVu Sans\nLiberation Serif\n' }))
    const report = await makeFontService(run, 'linux').list()
    expect(report).toEqual({ available: true, fonts: ['DejaVu Sans', 'Liberation Serif'] })
    expect(run).toHaveBeenCalledWith('fc-list', ['--format=%{family}\\n'])
  })

  it('fc-list 缺失时返回 available:false', async () => {
    const run = async () => {
      throw new Error('spawn fc-list ENOENT')
    }
    expect(await makeFontService(run, 'linux').list()).toEqual({ available: false, fonts: [] })
  })

  it('同一进程内只采集一次', async () => {
    const run = vi.fn(async () => ({ stdout: 'DejaVu Sans\n' }))
    const service = makeFontService(run, 'linux')
    await service.list()
    await service.list()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
