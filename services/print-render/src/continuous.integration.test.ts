// 端到端：连续纸模板经 测量 → 分页 → 探针推导 → PDF；服务端此前固定输出 80×297mm
import { describe, it, expect } from 'vitest'
import { createDomHostRuntime, prepareDocument, renderPdf as coreRenderPdf } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'
import { renderPdf } from './pdf-render.js'

function continuousTemplate(): PrintTemplateData {
  return {
    paperSize: 'CONTINUOUS',
    orientation: 'portrait',
    customWidth: 80,
    margins: { top: 2, right: 2, bottom: 2, left: 2 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [
      { id: 't1', type: 'text', options: { left: 0, top: 0, width: 60, height: 8, formatter: '第一行' } },
      { id: 't2', type: 'text', options: { left: 0, top: 20, width: 60, height: 8, formatter: '第二行' } },
    ],
  } as PrintTemplateData
}

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

describe('服务端连续纸渲染', () => {
  it('纸高按内容推导，而不是固定 297mm', async () => {
    const prepared = await prepareDocument({ templateJson: continuousTemplate(), printData: {} }, runtime)
    expect(prepared.continuous).toBe(true)
    expect(prepared.heightSource).toBe('derived')
    expect(prepared.paperMm.width).toBe(80)
    expect(prepared.paperMm.height).toBeGreaterThanOrEqual(25.4)
    expect(prepared.paperMm.height).toBeLessThan(60)
  }, 30000)

  it('纸高逃生门生效且来源记为 config', async () => {
    const prepared = await prepareDocument(
      { templateJson: continuousTemplate(), printData: {}, paperHeightMm: 120 },
      runtime,
    )
    expect(prepared.paperMm.height).toBe(120)
    expect(prepared.heightSource).toBe('config')
  }, 30000)

  it('产物以 %PDF 开头、非空且页数为 1', async () => {
    const { pdf, prepared } = await coreRenderPdf({ templateJson: continuousTemplate(), printData: {} }, runtime)
    expect(Buffer.from(pdf.subarray(0, 4)).toString('latin1')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
    expect(prepared.pageCount).toBe(1)
  }, 30000)

  it('HTTP 层 renderPdf 返回 PDF Buffer（导出兼容）', async () => {
    const buffer = await renderPdf({ templateJson: continuousTemplate(), printData: {} })
    expect(Buffer.from(buffer.subarray(0, 4)).toString('latin1')).toBe('%PDF')
  }, 30000)
})
