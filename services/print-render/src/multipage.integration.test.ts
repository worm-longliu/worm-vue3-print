// 端到端：多页面模板 → 真实 Chromium 出 PDF → pdfjs 断言页数、页尺寸与文本归属
import { describe, it, expect } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { renderPdf as coreRenderPdf, createDomHostRuntime } from '@worm-vue3-print/core'
import type { PrintTemplateData, PrintTemplateElement } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

const PT_PER_MM = 72 / 25.4

const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(BrowserPool.getInstance()),
  loadExecutorBundle(),
)

/** 文本元素，formatter 指向 printData 字段；按 top 顺序堆叠（边相切不重叠） */
function textEl(id: string, top: number, height: number, formatter: string): PrintTemplateElement {
  return { id, type: 'text', options: { left: 10, top, width: 50, height, formatter } }
}

function page(name: string, elements: PrintTemplateElement[]): PrintTemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    name,
    elements,
  }
}

describe('多页面模板渲染（真实 Chromium）', () => {
  it('封面 1 页 + 内容 2 页 → 3 页 PDF，页码与纸张正确', async () => {
    const { pdf } = await coreRenderPdf({
      templateJson: {
        version: 1,
        pages: [
          page('封面', [textEl('cover-e', 10, 30, '{cover}')]),
          // 内容页 4×100mm 顺序堆叠（超出 A4 内容区）→ 分页引擎产出 2 页
          page('内容', [
            textEl('row-1', 10, 100, '{body}'),
            textEl('row-2', 110, 100, '{body}'),
            textEl('row-3', 210, 100, '{body}'),
            textEl('row-4', 310, 100, '{body}'),
          ]),
        ],
      },
      printData: { cover: '封面标题', body: '内容正文' },
    }, runtime)
    const doc = await getDocument({ data: pdf.slice() }).promise
    expect(doc.numPages).toBe(3)
    // 每页 A4（210 × 297mm，容差 ±0.5mm：存在 mm↔pt 舍入，210mm 会读成约 210.2mm）
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i)
      const viewport = p.getViewport({ scale: 1 })
      expect(Math.abs(viewport.width / PT_PER_MM - 210)).toBeLessThan(0.5)
      expect(Math.abs(viewport.height / PT_PER_MM - 297)).toBeLessThan(0.5)
    }
    // 第 1 页封面、第 2/3 页内容（第 2 页起始 = 下一模板新开一页的边界）。
    // NFKC：Chromium PDF 的 ToUnicode 会把部分 CJK 字映射到兼容表意字符（如 面→⾯ U+2FAF）
    const texts: string[] = []
    for (let i = 1; i <= 3; i++) {
      const content = await (await doc.getPage(i)).getTextContent()
      texts.push(content.items.map((it: any) => ('str' in it ? it.str : '')).join('').normalize('NFKC'))
    }
    expect(texts[0]).toContain('封面标题')
    expect(texts[1]).toContain('内容正文')
  })
})