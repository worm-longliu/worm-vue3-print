// services/print-render/src/fixed-repeat.integration.test.ts
// 端到端：元素 fixed（每页固定重复，真实 Chromium + 真实分页）→ 两页 PDF 每页均含固定标题，
// 正文一/正文二各归其页。与 core 的声明级用例互补：那边钉住 sections 结构，这边钉住真实 PDF 文本。
import { describe, it, expect } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createDomHostRuntime, renderPdf } from '@worm-vue3-print/core'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

/** A4 竖版：固定标题 top=0 h=10；正文 top=0 h=150 与 top=150 h=150 上下相切不聚类，稳定产出两页 */
const templateJson: PrintTemplateData = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  elements: [
    { id: 'fixed', type: 'text', options: { left: 0, top: 0, width: 100, height: 10, fixed: true, formatter: '固定标题' } },
    { id: 'body-1', type: 'text', options: { left: 0, top: 0, width: 100, height: 150, formatter: '正文一' } },
    { id: 'body-2', type: 'text', options: { left: 0, top: 150, width: 100, height: 150, formatter: '正文二' } },
  ],
} as PrintTemplateData

describe('fixed 每页重复（真实 Chromium）', () => {
  it('两页 PDF 均含固定标题且正文各归其页', async () => {
    const { pdf, prepared } = await renderPdf({ templateJson, printData: {} }, runtime)
    expect(prepared.pageCount).toBe(2)
    expect((prepared.html.match(/固定标题/g) ?? []).length).toBe(2)

    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false })
    const doc = await task.promise
    expect(doc.numPages).toBe(2)
    // NFKC：Chromium PDF 的 ToUnicode 会把部分 CJK 字映射到兼容表意字符（如 面→⾯）
    const texts: string[] = []
    for (let i = 1; i <= 2; i++) {
      const content = await (await doc.getPage(i)).getTextContent()
      texts.push(content.items.map((it: any) => ('str' in it ? it.str : '')).join('').normalize('NFKC'))
    }
    await task.destroy()

    expect(texts[0]).toContain('固定标题')
    expect(texts[1]).toContain('固定标题')
    expect(texts[0]).toContain('正文一')
    expect(texts[1]).toContain('正文二')
  }, 60000)
})
