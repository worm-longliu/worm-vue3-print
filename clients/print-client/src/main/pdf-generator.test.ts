import { describe, it, expect } from 'vitest'
import {
  buildPrintToPdfOptions,
  micrometersToInches,
  renderPdf,
  type PrintToPdfOptions,
} from './pdf-generator.js'

/** 录下入参、按需返回/抛错的 printToPDF 假实现 */
function fakeSource(impl: (options: PrintToPdfOptions) => Promise<Buffer>) {
  const calls: PrintToPdfOptions[] = []
  return {
    calls,
    source: {
      printToPDF: (options: PrintToPdfOptions) => {
        calls.push(options)
        return impl(options)
      },
    },
  }
}

describe('buildPrintToPdfOptions', () => {
  it('纸张微米换算为英寸（printToPDF 的 pageSize 单位是英寸，不是微米）', () => {
    const options = buildPrintToPdfOptions({ width: 210000, height: 297000 })
    expect(options.pageSize.width).toBeCloseTo(8.2677, 4)
    expect(options.pageSize.height).toBeCloseTo(11.6929, 4)
    // 回归：误把微米当英寸会产出 210000 英寸（约 5.3km）的荒诞纸张
    expect(options.pageSize.width).toBeLessThan(100)
  })

  it('零边距 + 保留背景（水印层依赖 printBackground）', () => {
    const options = buildPrintToPdfOptions({ width: 80000, height: 120000 })
    expect(options.margins).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
    expect(options.printBackground).toBe(true)
    expect(options.scale).toBe(1)
  })

  it('连续纸推导高度同样按英寸换算', () => {
    expect(micrometersToInches(25400)).toBe(1)
    expect(buildPrintToPdfOptions({ width: 80000, height: 705090 }).pageSize.height).toBeCloseTo(27.7594, 4)
  })
})

describe('renderPdf', () => {
  it('用换算后的英寸纸张调用 printToPDF，并返回 PDF 字节', async () => {
    const payload = Buffer.from('%PDF-1.4 test')
    const { calls, source } = fakeSource(async () => payload)

    await expect(renderPdf(source, { width: 210000, height: 297000 }, 1000)).resolves.toEqual(payload)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.pageSize.width).toBeCloseTo(8.2677, 4)
  })

  it('printToPDF 拒绝时抛 PRINT_FAILED 并保留原始原因（不再静默等超时）', async () => {
    const { source } = fakeSource(async () => {
      throw new Error('Failed to generate PDF: Printing failed')
    })

    await expect(renderPdf(source, { width: 210000, height: 297000 }, 1000)).rejects.toMatchObject({
      code: 'PRINT_FAILED',
      message: expect.stringContaining('Failed to generate PDF: Printing failed'),
    })
  })

  it('printToPDF 永不 settle 时按超时失败，保证串行锁不被长期占用', async () => {
    const { source } = fakeSource(() => new Promise<Buffer>(() => {}))
    const startedAt = Date.now()

    await expect(renderPdf(source, { width: 210000, height: 297000 }, 30)).rejects.toMatchObject({
      code: 'PRINT_FAILED',
      message: expect.stringContaining('PDF 生成超过'),
    })
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })
})
