// 端到端：printData 数组 → core 批量合并 → Playwright 出单个 PDF
import { describe, it, expect } from 'vitest'
import {
  prepareDocument,
  renderPdf as coreRenderPdf,
  createDomHostRuntime,
} from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

function fixedTemplate(): PrintTemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [
      { id: 't1', type: 'text', options: { left: 0, top: 0, width: 60, height: 8, formatter: '{title}' } },
    ],
  } as PrintTemplateData
}

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
      { id: 't1', type: 'text', options: { left: 0, top: 0, width: 60, height: 8, formatter: '{title}' } },
    ],
  } as PrintTemplateData
}

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

describe('批量打印（printData 数组）', () => {
  it('固定纸 2 份：copies=2，HTML 含两个 print-copy，合成一个 PDF', async () => {
    const job = {
      templateJson: fixedTemplate(),
      printData: [{ title: '第一份' }, { title: '第二份' }],
    }
    const prepared = await prepareDocument(job, runtime)
    expect(prepared.copies).toBe(2)
    expect(prepared.copyPaperMm).toHaveLength(2)
    expect((prepared.html.match(/<section class="print-copy">/g) ?? []).length).toBe(2)
    expect(prepared.html).toContain('.print-copy:not(:last-child)')
    // 各份数据分别绑定
    expect(prepared.html).toContain('第一份')
    expect(prepared.html).toContain('第二份')

    const { pdf } = await coreRenderPdf(job, runtime)
    expect(Buffer.from(pdf.subarray(0, 4)).toString('latin1')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
  }, 60000)

  it('连续纸 2 份：命名页尺寸规则存在，各份 class 带索引', async () => {
    const job = {
      templateJson: continuousTemplate(),
      printData: [{ title: '一' }, { title: '二' }],
    }
    const prepared = await prepareDocument(job, runtime)
    expect(prepared.copies).toBe(2)
    expect(prepared.continuous).toBe(true)
    expect(prepared.html).toContain('print-copy print-copy-0')
    expect(prepared.html).toContain('print-copy print-copy-1')
    expect(prepared.copyPaperMm).toHaveLength(2)
    expect(prepared.copyPaperMm?.[0].height).toBeGreaterThanOrEqual(25.4)
    expect(prepared.html).toMatch(/@page copy0 \{ size: 80mm [\d.]+mm/)
    expect(prepared.html).toMatch(/@page copy1 \{ size: 80mm [\d.]+mm/)
    expect(prepared.html).toContain('.print-copy-0 { page: copy0; }')

    const { pdf } = await coreRenderPdf(job, runtime)
    expect(Buffer.from(pdf.subarray(0, 4)).toString('latin1')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
  }, 60000)

  it('空数组被拒绝', async () => {
    await expect(
      prepareDocument({ templateJson: fixedTemplate(), printData: [] }, runtime),
    ).rejects.toThrow('批量打印数据必须是非空对象数组')
  }, 30000)
})
