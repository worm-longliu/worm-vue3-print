import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../../', import.meta.url))
const previewPath = new URL('preview.html', import.meta.url)
const server = await createServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
})
await server.listen()
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage()
  const origin = server.resolvedUrls?.local[0]
  assert.ok(origin, 'Vite 未提供验证地址')
  await page.goto(new URL('/examples/payment-request-pagination/verify.html', origin).href)
  await page.waitForFunction(() => (window as any).verification?.status !== 'running')
  const state = await page.evaluate(() => (window as any).verification)
  assert.equal(state.status, 'done', state.error)
  const result = state.result

  assert.equal(result.pageCount, 3, '10 条明细应输出三页')
  assert.equal(result.paperMm.width, 240)
  assert.equal(result.paperMm.height, 140)
  const slices = result.pageLayouts.map((layout: any) =>
    layout.sections.find((section: any) => section.elementId === 'payment-table' && section.type === 'table-slice'),
  )
  const firstDataRowIndex = 5
  assert.deepEqual(
    slices.map((slice: any) => slice.endRow - Math.max(slice.startRow, firstDataRowIndex)),
    [4, 4, 2],
  )
  assert.ok(slices.every((slice: any) => slice.subtotal), '每页都应包含本页合计')
  assert.ok(result.pageLayouts.every((layout: any) => (layout.warnings ?? []).length === 0), '不应存在出纸裁切提示')

  const unfixedAttachmentSections = result.unfixed.pageLayouts.flatMap((layout: any) =>
    layout.sections
      .filter((section: any) => section.elementId === 'attachments')
      .map((section: any) => ({ pageIndex: layout.pageIndex, renderTop: section.renderTop })),
  )
  assert.deepEqual(unfixedAttachmentSections, [{ pageIndex: 0, renderTop: 41.5 }])

  const previewHtml = result.html.split('\n').map(line => line.trimEnd()).join('\n')
  await writeFile(previewPath, previewHtml, 'utf8')
  await page.setContent(result.html, { waitUntil: 'load' })
  const pages = page.locator('.print-page')
  assert.equal(await pages.count(), 3)

  const expectedSubtotals = ['43,520.50', '33,040.75', '21,100.00']
  const expectedRowCounts = [10, 10, 8] // 5 行重复表头 + 4/4/2 行明细 + 1 行本页合计
  for (let index = 0; index < 3; index += 1) {
    const current = pages.nth(index)
    const text = (await current.textContent()) ?? ''
    assert.match(text, /付款申请单/)
    assert.match(text, /供应链管理部/)
    assert.match(text, /上海示例供应链有限公司/)
    assert.match(text, /领导批示/)
    assert.match(text, new RegExp(`第 ${index + 1} 页 / 共 3 页`))
    assert.ok(text.includes(expectedSubtotals[index]), `第 ${index + 1} 页小计不正确`)
    assert.equal(await current.locator('tbody tr').count(), expectedRowCounts[index])
  }

  const firstPageSpans = await pages.nth(0).locator('td[rowspan]').evaluateAll(cells =>
    cells.map(cell => ({ text: cell.textContent, rowspan: cell.getAttribute('rowspan') })),
  )
  const secondPageSpans = await pages.nth(1).locator('td[rowspan]').evaluateAll(cells =>
    cells.map(cell => ({ text: cell.textContent, rowspan: cell.getAttribute('rowspan') })),
  )
  assert.ok(firstPageSpans.some(cell => cell.text === '电汇' && cell.rowspan === '3'))
  assert.ok(secondPageSpans.some(cell => cell.text === '现金' && cell.rowspan === '2'))
  assert.match((await pages.nth(0).textContent()) ?? '', /支票/)
  assert.match((await pages.nth(1).textContent()) ?? '', /支票/)
  assert.match((await pages.nth(1).textContent()) ?? '', /承兑/)
  assert.match((await pages.nth(2).textContent()) ?? '', /承兑/)

  await page.setContent(result.unfixed.html, { waitUntil: 'load' })
  const unfixedPages = page.locator('.print-page')
  assert.equal(await unfixedPages.count(), 3)
  const attachmentCounts = await unfixedPages.evaluateAll(pageNodes => pageNodes.map(pageNode =>
    [...pageNode.querySelectorAll('.print-element')]
      .filter(element => element.textContent?.includes('附件单据')).length,
  ))
  assert.deepEqual(attachmentCounts, [1, 0, 0], '取消固定后附件应只显示在第一页')

  console.log(JSON.stringify({
    页数: result.pageCount,
    每页明细行数: [4, 4, 2],
    每页小计: expectedSubtotals,
    合并验证: ['第 1 页电汇 rowspan=3', '第 2 页现金 rowspan=2', '支票与承兑跨页重显'],
    预览文件: fileURLToPath(previewPath),
  }, null, 2))
} finally {
  await browser.close()
  await server.close()
}
