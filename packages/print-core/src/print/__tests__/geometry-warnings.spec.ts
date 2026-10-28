// 编辑期出纸裁切提示（不依赖 DOM）：把分页引擎已算好的 warnings 收敛成一个公开入口，
// 供两宿主的保存闸门与预览提示共用同一实现（spec 2026-10-27 契约三第 3 条：顶越界单列告警）。
import { describe, it, expect } from 'vitest'
import { collectPrintWarnings, collectLayoutWarnings } from '../geometry-warnings.js'
import type { TemplateData } from '../../render/types.js'

function a4(elements: TemplateData['elements'], over: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements,
    ...over,
  } as TemplateData
}

const el = (id: string, options: Record<string, any>) => ({ id, type: 'text', options })

describe('collectPrintWarnings', () => {
  it('干净模板无提示', () => {
    const warnings = collectPrintWarnings(a4([el('t1', { left: 20, top: 100, width: 100, height: 20 })]))
    expect(warnings).toEqual([])
  })

  it('旋转顶越界给一条专条提示（含元素 id 与越界 mm 数）', () => {
    const warnings = collectPrintWarnings(a4([el('t1', { left: 20, top: 10, width: 100, height: 20, rotate: 45 })]))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('t1')
    expect(warnings[0]).toContain('22.43')
  })

  it('横向越界给提示（左边距 10 + 150 + 100 − 纸宽 210 = 50mm）', () => {
    const warnings = collectPrintWarnings(a4([el('t1', { left: 150, top: 100, width: 100, height: 20 })]))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('50')
  })

  it('多页模板按页汇总并去重（同一条文案只报一次）', () => {
    const single = a4([el('t1', { left: 150, top: 100, width: 100, height: 20 })])
    const multi = { pages: [single, single] } as unknown as TemplateData
    expect(collectPrintWarnings(multi)).toHaveLength(1)
  })

  it('未旋转且不越界 → 空数组（不因本函数产生新噪声）', () => {
    expect(collectPrintWarnings(a4([]))).toEqual([])
  })

  it('collectLayoutWarnings 对真实分页结果去重并跳过无提示页', () => {
    const layouts = [
      { pageIndex: 0, sections: [], warnings: ['A', 'A'] },
      { pageIndex: 1, sections: [] },
      { pageIndex: 2, sections: [], warnings: ['B'] },
    ]
    expect(collectLayoutWarnings(layouts as never)).toEqual(['A', 'B'])
  })
})
