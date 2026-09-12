import { describe, it, expect } from 'vitest'
import { SerialGate } from './serial-gate.js'

describe('SerialGate', () => {
  it('任务进行中第二个任务被拒绝为 BUSY，结束后恢复可执行', async () => {
    const gate = new SerialGate()
    let release: () => void = () => {}
    const first = gate.run(() => new Promise<void>(r => { release = r }))
    await expect(gate.run(async () => 'x')).rejects.toMatchObject({ code: 'BUSY' })
    expect(gate.isBusy).toBe(true)
    release()
    await first
    expect(gate.isBusy).toBe(false)
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok')
  })

  it('任务抛错后锁必须释放', async () => {
    const gate = new SerialGate()
    await expect(gate.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok')
  })
})
