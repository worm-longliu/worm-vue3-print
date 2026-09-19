import { describe, it, expect } from 'vitest'
import { prepareDocument, renderPdf, renderScreenshot } from '../pipeline.js'
import { createDomHostRuntime } from '../dom-host-runtime.js'
import { EXECUTOR, createFakeDriverFactory } from './fake-driver.js'
import type { FakeDriverOptions } from './fake-driver.js'
import type { PrintJob } from '../types.js'
import type { TemplateData } from '../../render/types.js'

function template(overrides: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [{ id: 'a', type: 'text', options: { left: 0, top: 0, width: 50, height: 10 } }],
    ...overrides,
  } as TemplateData
}

function runtimeOf(options: FakeDriverOptions = {}) {
  const fake = createFakeDriverFactory(options)
  return { fake, runtime: createDomHostRuntime(fake.factory, EXECUTOR) }
}

describe('prepareDocument', () => {
  it('普通纸：返回分页 HTML、页数、纸张与 config 来源', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    const result = await prepareDocument({ templateJson: template() }, runtime)
    expect(result.pageCount).toBe(1)
    expect(result.continuous).toBe(false)
    expect(result.heightSource).toBe('config')
    expect(result.paperMm).toEqual({ width: 210, height: 297 })
    expect(result.html).toContain('data-page="1"')
    expect(fake.calls.filter(call => call === 'evaluate:readContentBottom')).toHaveLength(0)
  })

  it('连续纸：探针推导纸高，@page 高度与返回纸高一致', async () => {
    const { fake, runtime } = runtimeOf({
      measurements: [{ id: 'a', heightPx: 38 }],
      contentBottomPx: 76,
    })
    const job: PrintJob = {
      templateJson: template({
        paperSize: 'CONTINUOUS',
        customWidth: 80,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    }
    const result = await prepareDocument(job, runtime)
    expect(result.continuous).toBe(true)
    expect(result.heightSource).toBe('derived')
    expect(fake.calls).toContain('evaluate:readContentBottom')
    expect(result.html).toContain(`@page { size: 80mm ${result.paperMm.height}mm`)
  })

  it('连续纸带纸高逃生门：不再走探针', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    const result = await prepareDocument(
      { templateJson: template({ paperSize: 'CONTINUOUS', customWidth: 80 }), paperHeightMm: 150 },
      runtime,
    )
    expect(result.paperMm.height).toBe(150)
    expect(result.heightSource).toBe('config')
    expect(fake.calls.filter(call => call === 'evaluate:readContentBottom')).toHaveLength(0)
  })

  it('连续纸仅覆盖宽度：高度仍取推导值，来源仍为 derived', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }], contentBottomPx: 76 })
    const result = await prepareDocument(
      { templateJson: template({ paperSize: 'CONTINUOUS', customWidth: 80 }), paperOverride: { width: 58 } },
      runtime,
    )
    expect(result.paperMm.width).toBe(58)
    expect(result.heightSource).toBe('derived')
  })

  it('含码模板：先收集再渲染，最终 HTML 内嵌真实 SVG', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'b', heightPx: 114 }] })
    const job: PrintJob = {
      templateJson: template({
        elements: [
          { id: 'b', type: 'barcode', options: { left: 0, top: 0, width: 40, height: 20, formatter: '12345678' } },
        ],
      }),
    }
    const result = await prepareDocument(job, runtime)
    expect(fake.calls.filter(call => call === 'evaluate:renderCodes')).toHaveLength(1)
    expect(result.html).toContain('data:image/svg+xml')
    expect(result.html).not.toContain('<span>12345678</span>')
  })
})

describe('批量 printData（数组）', () => {
  it('对象入参 copies=1 且无 copyPaperMm', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    const result = await prepareDocument({ templateJson: template(), printData: { x: 1 } }, runtime)
    expect(result.copies).toBe(1)
    expect(result.copyPaperMm).toBeUndefined()
  })

  it('2 条数组：合并为一个文档，copies=2，pageCount 为各份之和', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    const result = await prepareDocument(
      { templateJson: template(), printData: [{ x: 1 }, { x: 2 }] },
      runtime,
    )
    expect(result.copies).toBe(2)
    expect(result.copyPaperMm).toHaveLength(2)
    expect(result.pageCount).toBe(2)
    expect((result.html.match(/<section class="print-copy">/g) ?? []).length).toBe(2)
    expect(result.html).toContain('.print-copy:not(:last-child)')
  })

  it('空数组抛中文错误', async () => {
    const { runtime } = runtimeOf()
    await expect(
      prepareDocument({ templateJson: template(), printData: [] }, runtime),
    ).rejects.toThrow('批量打印数据必须是非空对象数组')
  })

  it('数组含非对象项报告项序号', async () => {
    const { runtime } = runtimeOf()
    await expect(
      prepareDocument(
        { templateJson: template(), printData: [{}, null] as unknown as Record<string, unknown>[] },
        runtime,
      ),
    ).rejects.toThrow('批量打印数据第 2 项必须是对象')
  })

  it('连续纸 2 份：输出命名页与两份纸高', async () => {
    const { runtime } = runtimeOf({
      measurements: [{ id: 'a', heightPx: 38 }],
      contentBottomPx: 76,
    })
    const result = await prepareDocument(
      { templateJson: template({ paperSize: 'CONTINUOUS', customWidth: 80 }), printData: [{}, {}] },
      runtime,
    )
    expect(result.copies).toBe(2)
    expect(result.html).toContain('print-copy print-copy-0')
    expect(result.html).toContain('@page copy1')
    expect(result.copyPaperMm?.[0].height).toBe(result.copyPaperMm?.[1].height)
  })

  it('某一份失败时错误带份序（第 2 份）', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 38 }] })
    // fake-driver 无一次性钩子：包装 driver，让第二次测量（第 2 份）抛错
    const originalCreate = fake.factory.createDriver.bind(fake.factory)
    let measureCalls = 0
    fake.factory.createDriver = async () => {
      const driver = await originalCreate()
      const originalEvaluate = driver.evaluate.bind(driver)
      driver.evaluate = (method, args) => {
        if (method === 'readMeasurements') {
          measureCalls += 1
          if (measureCalls === 2) throw new Error('模拟测量失败')
        }
        return originalEvaluate(method, args)
      }
      return driver
    }
    await expect(
      prepareDocument({ templateJson: template(), printData: [{}, {}] }, runtime),
    ).rejects.toThrow(/第 2 份渲染失败：(?:测量失败：)?模拟测量失败/)
  })
})

describe('renderPdf', () => {
  it('同一会话内完成出图，返回 PDF 字节与 prepared', async () => {
    const { fake, runtime } = runtimeOf({
      measurements: [{ id: 'a', heightPx: 38 }],
      pdfBytes: new Uint8Array([7, 7]),
    })
    const result = await renderPdf({ templateJson: template() }, runtime)
    expect(Array.from(result.pdf)).toEqual([7, 7])
    expect(result.prepared.pageCount).toBe(1)
    expect(fake.calls.filter(call => call === 'createDriver')).toHaveLength(1)
    expect(fake.calls[fake.calls.length - 1]).toBe('close')
    expect(fake.calls).toContain('pdf')
  })
})

describe('renderScreenshot', () => {
  it('不分页：只做测量模式 HTML 与截图', async () => {
    const { fake, runtime } = runtimeOf({
      measurements: [{ id: 'a', heightPx: 38 }],
      screenshotBytes: new Uint8Array([5]),
    })
    const shot = await renderScreenshot({ templateJson: template() }, runtime)
    expect(Array.from(shot)).toEqual([5])
    expect(fake.calls.filter(call => call === 'evaluate:readMeasurements')).toHaveLength(0)
    expect(fake.calls.filter(call => call === 'evaluate:readContentBottom')).toHaveLength(0)
    expect(fake.calls).toContain('screenshot')
  })
})

describe('拼版打印', () => {
  const TILING = {
    enabled: true,
    columns: 2,
    gapX: 2,
    gapY: 2,
    sheetPaperSize: 'A4' as const,
    sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
  }
  const labelTpl = (overrides: Partial<TemplateData> = {}) => template({
    paperSize: 'CUSTOM',
    customWidth: 70,
    customHeight: 40,
    margins: { top: 3, right: 3, bottom: 3, left: 3 },
    tiling: TILING,
    ...overrides,
  } as Partial<TemplateData>)
  const list = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `L${i + 1}` }))

  it('拼版关闭 → 与现状结构一致（零回归）', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const result = await prepareDocument({ templateJson: template(), printData: list(3) }, runtime)
    expect(result.copies).toBe(3)
    expect(result.pageCount).toBe(3)
    expect(result.html).toContain('<section class="print-copy">')
    expect(result.html).not.toContain('print-sheet')
  })

  it('开启 + 12 条 → paperMm=目标纸、pageCount=张数(1)、copies=12', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const result = await prepareDocument({ templateJson: labelTpl(), printData: list(12) }, runtime)
    expect(result.copies).toBe(12)
    expect(result.pageCount).toBe(1)
    expect(result.paperMm).toEqual({ width: 210, height: 297 })
    expect(result.html).toContain('<section class="print-sheet">')
    expect((result.html.match(/class="print-tile"/g) ?? []).length).toBe(12)
  })

  it('开启 + 13 条 → 2 张', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const result = await prepareDocument({ templateJson: labelTpl(), printData: list(13) }, runtime)
    expect(result.pageCount).toBe(2)
    expect(result.copies).toBe(13)
  })

  it('单份数据也走拼版（1 条 = 1 格 = 1 张）', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const result = await prepareDocument({ templateJson: labelTpl(), printData: { title: 'L1' } }, runtime)
    expect(result.copies).toBe(1)
    expect(result.pageCount).toBe(1)
    expect((result.html.match(/class="print-tile"/g) ?? []).length).toBe(1)
  })

  it('某份渲染出多页 → 抛错并指出第几份', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 400 }] })
    await expect(
      prepareDocument({ templateJson: labelTpl(), printData: list(2) }, runtime),
    ).rejects.toThrow(/恰好 1 页/)
  })

  it('连续纸 + 拼版 → 抛错', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }], contentBottomPx: 20 })
    const job = {
      templateJson: labelTpl({ paperSize: 'CONTINUOUS', customWidth: 70 } as Partial<TemplateData>),
      printData: list(2),
    }
    await expect(prepareDocument(job, runtime)).rejects.toThrow(/连续纸不支持拼版/)
  })

  it('列数超宽 → 抛错含「最多可放」', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'a', heightPx: 10 }] })
    const job = {
      templateJson: labelTpl({ tiling: { ...TILING, columns: 5 } } as Partial<TemplateData>),
      printData: list(1),
    }
    await expect(prepareDocument(job, runtime)).rejects.toThrow(/最多可放 2 列/)
  })
})

function multiTemplate() {
  const cover = template({ name: '封面', elements: [{ id: 'c', type: 'text', options: { left: 0, top: 0, width: 50, height: 30 } }] })
  const body = template({
    name: '内容',
    elements: [
      // 100mm 高、top 隔 10mm（不重叠）→ 277 内容高可用 275：首页放 2 个（100+100），第 3 个 100>75 换页 → 内容 2 页
      { id: 'b1', type: 'text', options: { left: 0, top: 0, width: 50, height: 100 } },
      { id: 'b2', type: 'text', options: { left: 0, top: 110, width: 50, height: 100 } },
      { id: 'b3', type: 'text', options: { left: 0, top: 220, width: 50, height: 100 } },
    ],
  })
  return { version: 1 as const, pages: [cover, body] }
}

describe('多页面模板', () => {
  it('封面 1 页 + 内容 2 页：pageCount=3，作用域类与全局页码正确', async () => {
    const { runtime } = runtimeOf({ measurements: [] })
    const result = await prepareDocument({ templateJson: multiTemplate() }, runtime)
    expect(result.pageCount).toBe(3)
    expect(result.continuous).toBe(false)
    expect(result.heightSource).toBe('config')
    expect(result.paperMm).toEqual({ width: 210, height: 297 })
    const html = result.html
    expect(html).toContain('class="print-page mt-0"')
    expect(html).toContain('class="print-page mt-1"')
    expect(html).toContain('.mt-1.print-page {')
    expect(html.match(/<section class="print-page/g)).toHaveLength(3)
    expect(result.pageLayouts[2].pageIndex).toBe(2)
  })

  it('批量多模板：每份一份完整文档，页码份内重置', async () => {
    const { runtime } = runtimeOf({ measurements: [] })
    const result = await prepareDocument(
      { templateJson: multiTemplate(), printData: [{ x: 1 }, { x: 2 }] },
      runtime,
    )
    expect(result.pageCount).toBe(6)
    expect(result.copies).toBe(2)
    expect(result.html.match(/<section class="print-copy">/g)).toHaveLength(2)
  })

  it('1 页 wrapper 按单模板渲染（无 mt-0 作用域、无 print-copy 包装）', async () => {
    const { runtime } = runtimeOf({ measurements: [{ id: 'c', heightPx: 38 }] })
    const result = await prepareDocument(
      { templateJson: { version: 1 as const, pages: [template()] } },
      runtime,
    )
    expect(result.pageCount).toBe(1)
    expect(result.html).not.toContain('class="print-page mt-0"')
    expect(result.html).not.toContain('<section class="print-copy">')
  })

  it('截图：多模板按真实分页整份渲染（fullPage）', async () => {
    const { fake, runtime } = runtimeOf({ measurements: [], screenshotBytes: new Uint8Array([7]) })
    const buf = await renderScreenshot({ templateJson: multiTemplate() }, runtime)
    expect(buf).toEqual(new Uint8Array([7]))
    expect(fake.calls).toContain('screenshot')
  })
})
