// services/print-render/src/subtotal.integration.test.ts
// 端到端：含小计行/汇总行的跨页表格，经 测量→分页→PDF 完整链路正常渲染。
import { describe, it, expect } from 'vitest'
import { renderPdf } from './pdf-render.js'
import type { PrintTemplateData as TemplateData } from '@worm-vue3-print/core'

function makeSubtotalTemplate(): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [{
      id: 'tbl-1', type: 'table',
      options: {
        left: 0, top: 10, width: 120,
        tableMode: 'dynamic',
        tableColWidths: [60, 60],
        dataSource: 'items',
        tableRows: [
          { id: 'h', type: 'header', height: 8, repeatOnPage: true, cells: [
            { id: 'h0', formatter: '品名' }, { id: 'h1', formatter: '金额' },
          ] },
          { id: 'd', type: 'data', height: 8, cells: [
            { id: 'd0', formatter: '{name}' }, { id: 'd1', formatter: '{amount}' },
          ] },
          { id: 's', type: 'subtotal', height: 8, cells: [
            { id: 's0', formatter: '本页小计：' }, { id: 's1', formatter: '{MONEY(SUM(amount))}' },
          ] },
          { id: 'g', type: 'summary', height: 8, cells: [
            { id: 'g0', formatter: '合计：' }, { id: 'g1', formatter: '{MONEY(SUM(amount))}' },
          ] },
        ],
      },
    }],
  }
}

describe('小计行端到端渲染', () => {
  it('跨页表格含小计行/汇总行正常生成 PDF', async () => {
    // 60 行 × 8mm 跨多页，每页末尾渲染当前页小计、末页渲染整表汇总
    const items = Array.from({ length: 60 }, (_, i) => ({ name: `商品${i}`, amount: 100 }))
    const buf = await renderPdf({
      templateJson: makeSubtotalTemplate(),
      printData: { items },
    })
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
