import './style.css'
import { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'

/** 渲染入参类型直接取自管线签名，避免额外引入类型包 */
type RenderTemplate = Parameters<typeof renderHtmlPages>[0]
type RenderResult = Awaited<ReturnType<typeof renderHtmlPages>>

const MM_TO_PX = 3.7795
const NAMES = ['螺栓 M6×20', '垫片 φ8', '弹簧垫圈', '螺母 M6', '轴承 6203']
const UNITS = ['个', '箱', '包', '套', '件', '卷']
const UNIT_SEGMENT = 7 // 每 7 行一个单位段

function buildItems(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const qty = (i * 7) % 9 + 1
    const price = 0.5 + ((i * 13) % 20) / 10
    return {
      unit: UNITS[Math.floor(i / UNIT_SEGMENT) % UNITS.length]!,
      batch: 'A' + String(Math.floor(i / 5) + 1).padStart(2, '0'),
      name: NAMES[i % NAMES.length]!,
      qty,
      price,
      amount: qty * price,
    }
  })
}

function buildTemplate(rowHeight: number, merge: boolean): RenderTemplate {
  return {
    unit: 'mm',
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [
      {
        id: 'title',
        type: 'text',
        options: { left: 0, top: 0, width: 190, height: 8, formatter: '明细（单位列按值合并）', fontSize: 12, fontWeight: 'bold' },
        printElementType: { type: 'text', title: '文本' },
      },
      {
        id: 'tbl',
        type: 'table',
        options: {
          left: 0,
          top: 12,
          width: 190,
          height: 24,
          dataSource: 'items',
          tableDefaultFontSize: 9,
          tableColWidths: [20, 26, 82, 20, 20, 22],
          tableRows: [
            { id: 'r1', type: 'header', height: 8, repeatOnPage: true, cells: [
              { id: 'c1', formatter: '单位', align: 'center' },
              { id: 'c2', formatter: '批次', align: 'center' },
              { id: 'c3', formatter: '品名', align: 'center' },
              { id: 'c4', formatter: '数量', align: 'center' },
              { id: 'c5', formatter: '单价', align: 'center' },
              { id: 'c6', formatter: '金额', align: 'center' },
            ] },
            { id: 'r2', type: 'data', height: rowHeight, cells: [
              { id: 'c7', formatter: '{unit}', align: 'center', ...(merge ? { mergeSameValue: true } : {}) },
              { id: 'c8', formatter: '{batch}', align: 'center' },
              { id: 'c9', formatter: '{name}' },
              { id: 'c10', formatter: '{qty}', align: 'center' },
              { id: 'c11', formatter: '{MONEY(price)}', align: 'right' },
              { id: 'c12', formatter: '{MONEY(amount)}', align: 'right' },
            ] },
          ],
        },
        printElementType: { type: 'table', title: '表格' },
      },
    ],
  } as RenderTemplate
}

const rowInput = document.querySelector<HTMLInputElement>('#row-count')!
const rowCountValue = document.querySelector<HTMLOutputElement>('#row-count-value')!
const rowHeightSelect = document.querySelector<HTMLSelectElement>('#row-height')!
const zoomSelect = document.querySelector<HTMLSelectElement>('#zoom')!
const rerenderButton = document.querySelector<HTMLButtonElement>('#rerender')!
const busyOverlay = document.querySelector<HTMLDivElement>('#busy-overlay')!

const leftFrame = document.querySelector<HTMLIFrameElement>('#frame-left')!
const rightFrame = document.querySelector<HTMLIFrameElement>('#frame-right')!

const statRows = document.querySelector<HTMLElement>('#stat-rows')!
const statPagesLeft = document.querySelector<HTMLElement>('#stat-pages-left')!
const statPagesRight = document.querySelector<HTMLElement>('#stat-pages-right')!
const statRowsLeft = document.querySelector<HTMLElement>('#stat-rows-left')!
const statRowsRight = document.querySelector<HTMLElement>('#stat-rows-right')!
const statSpansLeft = document.querySelector<HTMLElement>('#stat-spans-left')!
const statSpansRight = document.querySelector<HTMLElement>('#stat-spans-right')!
const statMergedCells = document.querySelector<HTMLElement>('#stat-merged-cells')!
const statVerdict = document.querySelector<HTMLElement>('#stat-verdict')!

let renderSeq = 0
let debounceTimer: ReturnType<typeof setTimeout> | undefined

interface PreviewMetrics {
  /** 每页数据行数 */
  rowsPerPage: number[]
  /** 每页 td[rowspan] 的跨度序列 */
  spansPerPage: string[][]
}

function setBusy(busy: boolean): void {
  busyOverlay.hidden = !busy
}

/** 等 iframe 装载完 srcdoc，再按纸张宽度定宽、按内容定高，返回每页行数与合并跨度 */
function mountPreview(frame: HTMLIFrameElement, result: RenderResult, zoom: number): Promise<PreviewMetrics> {
  frame.style.width = `${result.paperMm.width * MM_TO_PX}px`
  frame.style.zoom = String(zoom)

  return new Promise<PreviewMetrics>(resolve => {
    const onLoad = () => {
      const doc = frame.contentDocument
      // 首次 about:blank 的 load 早于 srcdoc 生效，忽略没有纸张的文档
      if (!doc || doc.querySelectorAll('.print-page').length === 0) return
      frame.removeEventListener('load', onLoad)
      frame.style.height = `${doc.documentElement.scrollHeight}px`
      resolve({
        rowsPerPage: countDataRowsPerPage(doc),
        spansPerPage: readRowSpans(doc),
      })
    }
    frame.addEventListener('load', onLoad)
    // srcdoc 内容未变时浏览器可能不重新导航，先清空以强制重载
    if (frame.srcdoc === result.html) frame.srcdoc = ''
    frame.srcdoc = result.html
  })
}

/** 每页行数 = 该页 tr 数 - 1（重复表头） */
function countDataRowsPerPage(doc: Document): number[] {
  return Array.from(doc.querySelectorAll('.print-page')).map(page =>
    Math.max(page.querySelectorAll('tr').length - 1, 0),
  )
}

/** 每页按值合并产生的 td[rowspan] 跨度序列 */
function readRowSpans(doc: Document): string[][] {
  return Array.from(doc.querySelectorAll('.print-page')).map(page =>
    Array.from(page.querySelectorAll('td[rowspan]')).map(td => td.getAttribute('rowspan') ?? ''),
  )
}

function formatRowCounts(counts: number[]): string {
  return counts.length > 0 ? counts.join(' / ') : '—'
}

function formatSpans(spansPerPage: string[][]): string {
  if (spansPerPage.length === 0) return '—'
  return spansPerPage.map(spans => (spans.length > 0 ? spans.join('·') : '—')).join(' / ')
}

function updateStats(
  rowCount: number,
  leftResult: RenderResult,
  rightResult: RenderResult,
  leftMetrics: PreviewMetrics,
  rightMetrics: PreviewMetrics,
): void {
  statRows.textContent = String(rowCount)
  statPagesLeft.textContent = String(leftResult.pageCount)
  statPagesRight.textContent = String(rightResult.pageCount)
  statRowsLeft.textContent = formatRowCounts(leftMetrics.rowsPerPage)
  statRowsRight.textContent = formatRowCounts(rightMetrics.rowsPerPage)

  // 左栏未开启合并，没有 rowspan
  statSpansLeft.textContent = '—'
  statSpansRight.textContent = formatSpans(rightMetrics.spansPerPage)
  statMergedCells.textContent = String(
    rightMetrics.spansPerPage.reduce((sum, spans) => sum + spans.length, 0),
  )

  const same = leftResult.pageCount === rightResult.pageCount
  statVerdict.textContent = same ? '分页一致 ✓' : '页数不一致 ✗'
  statVerdict.classList.toggle('is-ok', same)
  statVerdict.classList.toggle('is-bad', !same)
}

function showError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  statVerdict.textContent = `渲染失败：${message}`
  statVerdict.classList.remove('is-ok')
  statVerdict.classList.add('is-bad')
}

async function render(): Promise<void> {
  const requestId = ++renderSeq
  const rowCount = Number(rowInput.value)
  const rowHeight = Number(rowHeightSelect.value)
  const zoom = Number(zoomSelect.value)

  rowCountValue.textContent = String(rowCount)
  setBusy(true)

  try {
    // 同一份数据两栏共用，只生成一次
    const items = buildItems(rowCount)
    const [leftResult, rightResult] = await Promise.all([
      renderHtmlPages(buildTemplate(rowHeight, false), { items }, '', browserCodeRenderer),
      renderHtmlPages(buildTemplate(rowHeight, true), { items }, '', browserCodeRenderer),
    ])
    if (requestId !== renderSeq) return

    const [leftMetrics, rightMetrics] = await Promise.all([
      mountPreview(leftFrame, leftResult, zoom),
      mountPreview(rightFrame, rightResult, zoom),
    ])
    if (requestId !== renderSeq) return

    updateStats(rowCount, leftResult, rightResult, leftMetrics, rightMetrics)
  } catch (err) {
    if (requestId !== renderSeq) return
    showError(err)
  } finally {
    if (requestId === renderSeq) setBusy(false)
  }
}

function scheduleRender(delay: number): void {
  if (debounceTimer !== undefined) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined
    void render()
  }, delay)
}

rowInput.addEventListener('input', () => {
  rowCountValue.textContent = rowInput.value
  scheduleRender(200)
})
rowHeightSelect.addEventListener('change', () => scheduleRender(0))
zoomSelect.addEventListener('change', () => scheduleRender(0))
rerenderButton.addEventListener('click', () => scheduleRender(0))

void render()
