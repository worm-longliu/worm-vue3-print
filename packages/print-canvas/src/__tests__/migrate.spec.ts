// web/src/components/print/__tests__/migrate.spec.ts
import { describe, it, expect } from 'vitest'
import { normalizeTemplateUnits } from '../utils/migrate'
import type { TemplateData } from '../types'

const PT_TO_MM = 25.4 / 72

describe('normalizeTemplateUnits', () => {
  it('unit 为 mm 时不做换算', () => {
    const tpl = {
      unit: 'mm',
      elements: [{ id: '1', options: { left: 10, top: 20, width: 42, height: 8 } }],
    } as unknown as TemplateData
    const out = normalizeTemplateUnits(tpl)
    expect(out.elements![0]?.options.left).toBe(10)
    expect(out.elements![0]?.options.width).toBe(42)
  })

  it('旧 pt 数据换算为 mm（content 区）', () => {
    const tpl = {
      elements: [{ id: '1', options: { left: 120, top: 80, width: 425, height: 68 } }],
    } as unknown as TemplateData
    const out = normalizeTemplateUnits(tpl)
    const el = out.elements![0]?.options
    expect(Math.abs(el!.left - 120 * PT_TO_MM)).toBeLessThan(0.01)
    expect(Math.abs(el!.width - 425 * PT_TO_MM)).toBeLessThan(0.01)
  })

  it('页眉/页脚/首页叠加元素同样换算', () => {
    const tpl = {
      header: { height: 10, elements: [{ id: 'h', options: { left: 20, top: 5, width: 100, height: 10 } }] },
      footer: { height: 10, elements: [{ id: 'f', options: { left: 20, top: 5, width: 100, height: 10 } }] },
      firstPageOverlay: { height: 0, elements: [{ id: 'o', options: { left: 20, top: 5, width: 100, height: 10 } }] },
    } as unknown as TemplateData
    const out = normalizeTemplateUnits(tpl)
    expect(out.header!.elements[0]?.options.left).toBeCloseTo(20 * PT_TO_MM, 1)
    expect(out.footer!.elements[0]?.options.top).toBeCloseTo(5 * PT_TO_MM, 1)
    expect(out.firstPageOverlay!.elements[0]?.options.width).toBeCloseTo(100 * PT_TO_MM, 1)
  })
})
