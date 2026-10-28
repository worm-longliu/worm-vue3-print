import { describe, it, expect } from 'vitest'
import { bindData } from '../data-binder.js'
import { paginate } from '../pagination-engine.js'
import { readFileSync } from 'node:fs'
import type { TemplateData } from '../types.js'

// Gitee #IKQSRG 修复回归测试
// 根因：xRange() 对线类元素用 options.width（画布编辑盒宽 3.5mm）而非 borderWidth（约 0.26mm），
// vline xRange=[-0.5,3.0] 与表格 [1.25,190.15] 错误横向相交 → vline 全高占了表格所在列版面。
// 修复：vline 的 xRange 改用 borderWidth（pt→mm），border 以中心线向外各半 + 安全余量。

const tplPath = '/Users/worm/worm-vue3-print/.video/tmp-ikqsrg-repro.json'
const repro = JSON.parse(readFileSync(tplPath, 'utf-8')) as TemplateData

function bindAndPaginate(rowCount: number) {
  const data = { list: Array.from({ length: rowCount }, (_, i) => ({ a: `${i + 1}` })) }
  const bound = bindData(repro, data)
  const measured = new Map()
  for (const el of bound.elements) {
    if (el.type === 'table') {
      const rows: any[] = (el as any).options?._renderRows ?? []
      const heights = rows.map((r: any) => r.height)
      const headerH = rows.filter((r: any) => r.type === 'header').reduce((s: number, r: any) => s + r.height, 0)
      measured.set(el.id, {
        id: el.id,
        measuredHeight: heights.reduce((s: number, h: number) => s + h, 0),
        measuredRowHeights: heights,
        repeatHeaderHeight: headerH,
      })
    }
  }
  return { bound, pages: paginate(bound, measured) }
}

describe('Gitee #IKQSRG：vline 不应挤占表格所在列的二维版面', () => {
  it('10 条明细：vline+表格同页（修复前误拆 2 页）', () => {
    const { pages } = bindAndPaginate(10)
    expect(pages).toHaveLength(1)
    expect(pages[0].sections.some(s => s.type === 'element')).toBe(true)
    const slice = pages[0].sections.find(s => s.type === 'table-slice') as any
    expect(slice).toBeTruthy()
    expect(slice.subtotal).toBe(true)
    expect(slice.summary).toBe(true)
  })

  it('60 条明细：拆页但 vline 始终留在第一页', () => {
    const { pages } = bindAndPaginate(60)
    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(pages[0].sections.some(s => s.type === 'element')).toBe(true)
    expect(pages.slice(1).every(p => !p.sections.some(s => s.type === 'element'))).toBe(true)
  })
})
