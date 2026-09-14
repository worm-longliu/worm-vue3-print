import { describe, it, expect } from 'vitest'
import { createDomHostRuntime } from '../dom-host-runtime.js'
import { codeSpecKey } from '../codes.js'
import { EXECUTOR, createFakeDriverFactory } from './fake-driver.js'

const viewport = { width: 794, height: 1123 }

describe('createDomHostRuntime', () => {
  it('measure：按 open → setContent → 注入 → 就绪 → 读测量 的顺序调用，并返回原始 px', async () => {
    const raw = [{ id: 'a', heightPx: 38 }]
    const fake = createFakeDriverFactory({ measurements: raw })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    const result = await runtime.withSession({}, session => session.measure('<html/>', viewport))
    expect(result).toEqual(raw)
    expect(fake.calls).toEqual([
      'createDriver', 'open', 'setContent', 'injectExecutor',
      'evaluate:waitReady', 'evaluate:readMeasurements', 'close',
    ])
  })

  it('每次 setContent 后重新注入执行器（文档已重建）', async () => {
    const fake = createFakeDriverFactory({ measurements: [] })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    await runtime.withSession({}, async session => {
      await session.measure('<html/>', viewport)
      await session.measure('<html/>', viewport)
    })
    expect(fake.calls.filter(call => call === 'injectExecutor')).toHaveLength(2)
  })

  it('renderCodes：把页面返回的对象转换为 Map，空规格不触碰 driver', async () => {
    const fake = createFakeDriverFactory({ codeMap: {} })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    const key = codeSpecKey('123', 'barcode', {})
    const map = await runtime.withSession({}, session =>
      session.renderCodes([{ key, value: '123', cellType: 'barcode', opts: {} }]))
    expect(map.get(key)).toBe('<svg id="fake"/>')
    const empty = await runtime.withSession({}, session => session.renderCodes([]))
    expect(empty.size).toBe(0)
    expect(fake.calls.filter(call => call.startsWith('evaluate'))).toHaveLength(1)
  })

  it('宿主不支持 PDF 时抛 UNSUPPORTED_RUNTIME', async () => {
    const fake = createFakeDriverFactory({ supportsPdf: false })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    await expect(
      runtime.withSession({}, session => session.toPdf(
        '<html/>',
        {
          paperMm: { width: 80, height: 100 },
          marginsMm: { top: 0, right: 0, bottom: 0, left: 0 },
          printBackground: true,
          scale: 1,
          preferCSSPageSize: false,
        },
        viewport,
      )),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_RUNTIME' })
  })

  it('宿主异常归一化为对应失败码，且仍释放会话', async () => {
    const fake = createFakeDriverFactory({ failAt: 'evaluate:readMeasurements' })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    await expect(runtime.withSession({}, session => session.measure('<html/>', viewport)))
      .rejects.toMatchObject({ code: 'MEASURE_FAILED' })
    expect(fake.calls).toContain('close')
  })

  it('阶段超过预算时报 RENDER_TIMEOUT', async () => {
    const fake = createFakeDriverFactory({ measurements: [], delayMs: 30 })
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    await expect(
      runtime.withSession({ timeoutMs: 15 }, session => session.measure('<html/>', viewport)),
    ).rejects.toMatchObject({ code: 'RENDER_TIMEOUT' })
  })
})
