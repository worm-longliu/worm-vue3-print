// 端到端：动态流式列表在真实 Chromium 中的分页、边框、跨列与跟随区。
// 跑完整管线：绑定 → 测量趟（逐行真实高度）→ 分页引擎切片 → 最终 HTML；再在浏览器里读取每页几何。
import { describe, it, expect } from 'vitest'
import { createDomHostRuntime, prepareDocument } from '@worm-vue3-print/core'
import type { PageLayout, PageSection, PrintTemplateData, PrintTemplateElement } from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import type { Page } from 'playwright'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

const MM_PX = 96 / 25.4
const FLOW_ID = 'flow'
const FLOW_TOP = 10
const FLOW_HEIGHT = 271
const FOLLOW_TOP = 281
const PAGE_MARGIN = 10
const PAPER_HEIGHT = 297

/** 长文本约 10 个汉字，按 12pt 估算超过单列宽度、但不超过两列，稳定触发 span=2 */
function recordName(index: number): string {
  const no = String(index + 1).padStart(2, '0')
  return index % 5 === 0 ? `复方药材详细名称说明${no}` : `药材${no}`
}

const RECORDS = Array.from({ length: 40 }, (_, i) => ({ name: recordName(i) }))
const DATA = { items: RECORDS }
const EXPECTED_TEXTS = RECORDS.map(r => r.name)
const EXPECTED_SPAN2 = RECORDS.filter((_, i) => i % 5 === 0).map(r => r.name)

function dynamicFlowTemplate(paperSize: 'A4' | 'CONTINUOUS'): PrintTemplateData {
  const flow: PrintTemplateElement = {
    id: FLOW_ID,
    type: 'flowList',
    printElementType: { type: 'flowList' },
    options: {
      left: 10,
      top: FLOW_TOP,
      width: 180,
      height: FLOW_HEIGHT,
      fontSize: 12,
      formatter: '{name}',
      dataSource: 'items',
      flowLayoutMode: 'dynamic',
      flowColumns: 4,
      flowGapX: 4,
      flowRowHeight: 22,
      flowAutoSpan: true,
      flowMaxSpan: 2,
      flowPaddingTop: 2,
      flowPaddingRight: 3,
      flowPaddingBottom: 4,
      flowPaddingLeft: 5,
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#000',
    },
  }
  const total: PrintTemplateElement = {
    id: 'total',
    type: 'text',
    printElementType: { type: 'text' },
    options: {
      left: 10,
      top: FOLLOW_TOP,
      width: 80,
      height: 10,
      fontSize: 12,
      formatter: '合计：40 条药材',
    },
  }
  return {
    paperSize,
    orientation: 'portrait',
    ...(paperSize === 'CONTINUOUS' ? { customWidth: 210, customHeight: PAPER_HEIGHT } : {}),
    margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [flow, total],
  }
}

interface ListSlice {
  pageIndex: number
  section: PageSection
  start: number
  end: number
}

/** 动态列表切片既可能是独立 flow-list-slice，也可能在末页升级为承载跟随区的 flow-group */
function collectListSlices(pageLayouts: PageLayout[]): ListSlice[] {
  const slices: ListSlice[] = []
  for (const page of pageLayouts) {
    for (const section of page.sections) {
      if (section.elementId !== FLOW_ID) continue
      const hasRows = section.type === 'flow-list-slice'
        || (section.type === 'flow-group' && section.startFlowRow !== undefined && section.endFlowRow !== undefined)
      if (!hasRows) continue
      const start = section.startFlowRow ?? 0
      const end = section.endFlowRow ?? 0
      if (end <= start) continue
      slices.push({ pageIndex: page.pageIndex, section, start, end })
    }
  }
  return slices
}

const pool = BrowserPool.getInstance()
const runtime = createDomHostRuntime(
  createPlaywrightDriverFactory(pool),
  loadExecutorBundle(),
)

async function openPrintPage(page: Page, html: string): Promise<void> {
  await page.setViewportSize({ width: 1200, height: 1400 })
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready
  })
}

interface DomCell {
  text: string
  height: number
  top: number
  bottom: number
}

interface DomRow {
  index: number
  top: number
  bottom: number
  height: number
  cells: DomCell[]
}

interface DomSlice {
  rect: { top: number; bottom: number; left: number; right: number }
  borderStyles: string[]
  borderWidths: number[]
  borderColors: string[]
  padding: number[]
  rows: DomRow[]
}

interface DomPage {
  pageIndex: number
  slices: DomSlice[]
  follow: { top: number; bottom: number; text: string } | null
}

interface DomSnapshot {
  pages: DomPage[]
  texts: string[]
  spanCells: Array<{ text: string; span: number }>
  followCount: number
}

async function readDomSnapshot(page: Page): Promise<DomSnapshot> {
  return page.evaluate(() => {
    const pages: DomPage[] = Array.from(document.querySelectorAll('.print-page')).map((pageEl, pageIndex) => {
      const pageRect = pageEl.getBoundingClientRect()
      const slices: DomSlice[] = Array.from(pageEl.querySelectorAll('.print-flowlist-slice')).map(sliceEl => {
        const cs = getComputedStyle(sliceEl)
        const rect = sliceEl.getBoundingClientRect()
        const rows: DomRow[] = Array.from(sliceEl.querySelectorAll('.print-flow-row')).map(rowEl => {
          const rowRect = rowEl.getBoundingClientRect()
          const cells: DomCell[] = Array.from(rowEl.querySelectorAll('.print-flow-cell')).map(cellEl => {
            const cellRect = cellEl.getBoundingClientRect()
            return {
              text: (cellEl.textContent ?? '').trim(),
              height: cellRect.height,
              top: cellRect.top - pageRect.top,
              bottom: cellRect.bottom - pageRect.top,
            }
          })
          return {
            index: Number(rowEl.getAttribute('data-flow-row-index')),
            top: rowRect.top - pageRect.top,
            bottom: rowRect.bottom - pageRect.top,
            height: rowRect.height,
            cells,
          }
        })
        return {
          rect: {
            top: rect.top - pageRect.top,
            bottom: rect.bottom - pageRect.top,
            left: rect.left - pageRect.left,
            right: rect.right - pageRect.left,
          },
          borderStyles: [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle],
          borderWidths: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth]
            .map(v => Number.parseFloat(v)),
          borderColors: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor],
          padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft]
            .map(v => Number.parseFloat(v)),
          rows,
        }
      })
      const followEl = pageEl.querySelector('.flow-follow')
      const followRect = followEl?.getBoundingClientRect()
      return {
        pageIndex,
        slices,
        follow: followEl && followRect
          ? {
              top: followRect.top - pageRect.top,
              bottom: followRect.bottom - pageRect.top,
              text: (followEl.textContent ?? '').trim(),
            }
          : null,
      }
    })

    const allCells = Array.from(document.querySelectorAll('.print-flowlist-slice .print-flow-cell'))
    const spanCells = allCells.map(cellEl => {
      const style = cellEl.getAttribute('style') ?? ''
      const matched = /grid-column\s*:\s*span\s+(\d+)/.exec(style)
      return {
        text: (cellEl.textContent ?? '').trim(),
        span: matched ? Number(matched[1]) : 1,
      }
    })

    return {
      pages,
      texts: allCells.map(cellEl => (cellEl.textContent ?? '').trim()),
      spanCells,
      followCount: document.querySelectorAll('.flow-follow').length,
    }
  })
}

function expectClose(actual: number, expected: number, label: string, tolerance = 0.6): void {
  expect(Math.abs(actual - expected), `${label}: actual=${actual}, expected=${expected}`).toBeLessThanOrEqual(tolerance)
}

function expectSliceGeometry(slice: DomSlice, expectedPageIndex: number, paperHeightMm: number): void {
  expect(slice.rect.top).toBeGreaterThanOrEqual(-0.6)
  expect(slice.rect.bottom).toBeLessThanOrEqual((paperHeightMm - PAGE_MARGIN) * MM_PX + 0.6)
  expect(slice.borderStyles, `第 ${expectedPageIndex + 1} 页边框线型`).toEqual(['solid', 'solid', 'solid', 'solid'])
  for (const width of slice.borderWidths) expect(width).toBeGreaterThan(0)
  for (const color of slice.borderColors) expect(color).toBe('rgb(0, 0, 0)')
  const expectedPadding = [2, 3, 4, 5].map(mm => mm * MM_PX)
  for (let i = 0; i < 4; i++) {
    expectClose(slice.padding[i]!, expectedPadding[i]!, `第 ${expectedPageIndex + 1} 页 padding[${i}]`)
  }
  expect(slice.rows.length).toBeGreaterThan(0)

  // 每一行都必须完整落在本片边框与内边距以内，跨列单元也不得越过所属行。
  const innerTop = slice.rect.top + slice.borderWidths[0]! + slice.padding[0]!
  const innerBottom = slice.rect.bottom - slice.borderWidths[2]! - slice.padding[2]!
  for (const row of slice.rows) {
    expect(row.top).toBeGreaterThanOrEqual(innerTop - 0.6)
    expect(row.bottom).toBeLessThanOrEqual(innerBottom + 0.6)
    for (const cell of row.cells) {
      expect(cell.top).toBeGreaterThanOrEqual(row.top - 0.6)
      expect(cell.bottom).toBeLessThanOrEqual(row.bottom + 0.6)
      expect(cell.height).toBeGreaterThan(0)
    }
  }
}

describe('动态流式列表真实 Chromium 分页', () => {
  it('A4 多页：切片连续、每片完整边框与四边 padding、跨列不拆行、跟随区只在末片页', async () => {
    const prepared = await prepareDocument({ templateJson: dynamicFlowTemplate('A4'), printData: DATA }, runtime)
    expect(prepared.pageCount).toBeGreaterThan(1)
    expect(prepared.pageLayouts.every(page => page.overflow !== true)).toBe(true)

    const layoutSlices = collectListSlices(prepared.pageLayouts)
    expect(layoutSlices.length).toBeGreaterThan(1)
    expect(layoutSlices[0]!.start).toBe(0)
    expect(layoutSlices[0]!.section.renderTop).toBe(FLOW_TOP)
    expect(layoutSlices.at(-1)!.end).toBeGreaterThan(layoutSlices[0]!.end)
    for (let i = 1; i < layoutSlices.length; i++) {
      expect(layoutSlices[i]!.start, `第 ${i + 1} 片起点应衔接上一片终点`).toBe(layoutSlices[i - 1]!.end)
    }
    for (const slice of layoutSlices) {
      if (slice.pageIndex > 0) expect(slice.section.renderTop).toBe(0)
    }

    const page = await pool.acquire()
    let snapshot: DomSnapshot
    try {
      await openPrintPage(page, prepared.html)
      snapshot = await readDomSnapshot(page)
    } finally {
      await pool.release(page)
    }

    expect(snapshot.pages).toHaveLength(prepared.pageCount)
    expect(snapshot.followCount).toBe(1)

    // 布局切片与 DOM 逐页对齐：行区间连续，DOM 中无重复、无遗漏。
    const slicesByPage = new Map<number, ListSlice[]>()
    for (const slice of layoutSlices) {
      const arr = slicesByPage.get(slice.pageIndex) ?? []
      arr.push(slice)
      slicesByPage.set(slice.pageIndex, arr)
    }
    for (const pageDom of snapshot.pages) {
      const expectedSlices = slicesByPage.get(pageDom.pageIndex) ?? []
      expect(pageDom.slices.length, `第 ${pageDom.pageIndex + 1} 页切片数`).toBe(expectedSlices.length)
      pageDom.slices.forEach((domSlice, index) => {
        const expected = expectedSlices[index]!
        expect(domSlice.rows.map(row => row.index)).toEqual(
          Array.from({ length: expected.end - expected.start }, (_, i) => expected.start + i),
        )
        expectSliceGeometry(domSlice, pageDom.pageIndex, prepared.paperMm.height)
      })
    }

    expect(snapshot.texts).toEqual(EXPECTED_TEXTS)
    expect(new Set(snapshot.texts).size).toBe(EXPECTED_TEXTS.length)

    const span2Texts = snapshot.spanCells.filter(cell => cell.span === 2).map(cell => cell.text)
    expect(span2Texts.length).toBeGreaterThan(0)
    expect(span2Texts.sort()).toEqual([...EXPECTED_SPAN2].sort())
    expect(snapshot.spanCells.every(cell => cell.span <= 2)).toBe(true)

    const followPages = snapshot.pages.filter(pageDom => pageDom.follow !== null)
    expect(followPages).toHaveLength(1)
    const lastSlicePage = Math.max(...layoutSlices.map(slice => slice.pageIndex))
    expect(followPages[0]!.pageIndex).toBe(lastSlicePage)
    expect(followPages[0]!.pageIndex).toBe(snapshot.pages.length - 1)

    const lastPage = snapshot.pages[lastSlicePage]!
    const lastSlice = lastPage.slices[lastPage.slices.length - 1]!
    expect(lastPage.follow!.top).toBeGreaterThanOrEqual(lastSlice.rect.bottom - 0.6)
    expect(lastPage.follow!.text).toContain('合计')
  }, 120000)

  it('连续纸：同一数据只有一片列表切片，文本仍按原顺序无重复无遗漏', async () => {
    const prepared = await prepareDocument({ templateJson: dynamicFlowTemplate('CONTINUOUS'), printData: DATA }, runtime)
    expect(prepared.continuous).toBe(true)
    expect(prepared.pageCount).toBe(1)

    const layoutSlices = collectListSlices(prepared.pageLayouts)
    expect(layoutSlices).toHaveLength(1)
    expect(layoutSlices[0]!.pageIndex).toBe(0)
    expect(layoutSlices[0]!.start).toBe(0)
    expect(layoutSlices[0]!.end).toBeGreaterThan(0)

    const page = await pool.acquire()
    let snapshot: DomSnapshot
    try {
      await openPrintPage(page, prepared.html)
      snapshot = await readDomSnapshot(page)
    } finally {
      await pool.release(page)
    }

    expect(snapshot.pages).toHaveLength(1)
    expect(snapshot.pages[0]!.slices).toHaveLength(1)
    expect(snapshot.followCount).toBe(1)
    const domSlice = snapshot.pages[0]!.slices[0]!
    expect(domSlice.rows.map(row => row.index)).toEqual(
      Array.from({ length: layoutSlices[0]!.end }, (_, i) => i),
    )
    expectSliceGeometry(domSlice, 0, prepared.paperMm.height)
    expect(snapshot.texts).toEqual(EXPECTED_TEXTS)
    expect(new Set(snapshot.texts).size).toBe(EXPECTED_TEXTS.length)
  }, 120000)
})
