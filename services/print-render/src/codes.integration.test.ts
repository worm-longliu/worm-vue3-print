// 端到端：含条形码/二维码的模板经「码值收集 → 执行器 renderCodes → 再生成 → PDF」全链路。
// 回归：宿主曾把 document 当首参传给 renderCodes(specs)，页面内迭代 Document 抛 “t is not iterable”。
import { describe, it, expect } from 'vitest'
import { createDomHostRuntime, prepareDocument } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'
import { renderPdf } from './pdf-render.js'

function codeTemplate(): PrintTemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [
      {
        id: 'code-1',
        type: 'barcode',
        options: { left: 0, top: 10, width: 60, height: 20, formatter: '123456789012', barcodeType: 'CODE128' },
      },
      {
        id: 'code-2',
        type: 'qrcode',
        options: { left: 0, top: 40, width: 30, height: 30, formatter: 'https://example.com', qrCodeLevel: 'M' },
      },
    ],
  } as PrintTemplateData
}

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

describe('服务端码值渲染', () => {
  it('条形码/二维码渲染为 SVG 数据 URI，而不是文本降级占位', async () => {
    const prepared = await prepareDocument({ templateJson: codeTemplate(), printData: {} }, runtime)
    expect(prepared.html).toContain('data:image/svg+xml')
    expect(prepared.html).not.toContain('<span>123456789012</span>')
    expect(prepared.pageCount).toBe(1)
  }, 30000)

  it('HTTP 层 renderPdf 端到端输出 PDF', async () => {
    const buffer = await renderPdf({ templateJson: codeTemplate(), printData: {} })
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 30000)
})
