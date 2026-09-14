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
