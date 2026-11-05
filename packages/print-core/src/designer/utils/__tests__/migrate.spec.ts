// web/src/components/print/__tests__/migrate.spec.ts
import { describe, it, expect } from 'vitest'
import { normalizeTemplateUnits, stripBlockedElements, countBlockedElements } from '../migrate.js'
import type { TemplateData } from '../../types.js'

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

  it('页眉/页脚元素同样换算，并剥离已废弃的首页叠加字段', () => {
    const tpl = {
      header: { height: 10, elements: [{ id: 'h', options: { left: 20, top: 5, width: 100, height: 10 } }] },
      footer: { height: 10, elements: [{ id: 'f', options: { left: 20, top: 5, width: 100, height: 10 } }] },
      firstPageOverlay: { height: 0, elements: [{ id: 'o', options: { left: 20, top: 5, width: 100, height: 10 } }] },
    } as unknown as TemplateData
    const out = normalizeTemplateUnits(tpl)
    expect(out.header!.elements[0]?.options.left).toBeCloseTo(20 * PT_TO_MM, 1)
    expect(out.footer!.elements[0]?.options.top).toBeCloseTo(5 * PT_TO_MM, 1)
    expect('firstPageOverlay' in out).toBe(false)
  })

  it('unit 已是 mm 时同样剥离首页叠加字段（旧模板导入不留废弃键）', () => {
    const tpl = {
      unit: 'mm',
      firstPageOverlay: { height: 10, elements: [] },
      elements: [{ id: '1', options: { left: 10, top: 20, width: 42, height: 8 } }],
    } as unknown as TemplateData
    const out = normalizeTemplateUnits(tpl)
    expect('firstPageOverlay' in out).toBe(false)
    expect(out.elements![0]?.options.left).toBe(10)
  })
})

// 屏蔽类型（html）：出纸永远是空盒子，导入时一律剥离，且要在三个区都剥干净
describe('stripBlockedElements', () => {
  const mixed = () => ({
    unit: 'mm',
    elements: [
      { id: 'a', type: 'text', options: { left: 10 }, printElementType: { type: 'text', title: '文本' } },
      { id: 'b', type: 'html', options: { left: 20 }, printElementType: { type: 'html', title: 'HTML' } },
    ],
    header: { height: 10, elements: [{ id: 'h', type: 'html', options: {}, printElementType: { type: 'html' } }] },
    footer: { height: 10, elements: [{ id: 'f', type: 'html', options: {}, printElementType: { type: 'html' } }] },
  } as unknown as TemplateData)

  it('三区里的 html 元素全部被剥离，其余元素原样保留', () => {
    const out = stripBlockedElements(mixed())
    expect(out.elements).toHaveLength(1)
    expect(out.elements![0]!.id).toBe('a')
    expect(out.header!.elements).toHaveLength(0)
    expect(out.footer!.elements).toHaveLength(0)
  })

  it('反面对照：无屏蔽元素时逐字节不变（证明上一条的剥离不是整体丢弃）', () => {
    const clean = {
      unit: 'mm',
      elements: [{ id: 'a', type: 'text', options: { left: 10 }, printElementType: { type: 'text' } }],
    } as unknown as TemplateData
    expect(stripBlockedElements(clean)).toEqual(clean)
  })

  it('只有 printElementType.type 的运行时元素同样被识别', () => {
    const out = stripBlockedElements({
      unit: 'mm',
      elements: [{ id: 'x', options: {}, printElementType: { type: 'html' } }],
    } as unknown as TemplateData)
    expect(out.elements).toHaveLength(0)
  })

  it('normalizeTemplateUnits 已接剥离：旧模板导入不会带出 html 元素', () => {
    const out = normalizeTemplateUnits(mixed())
    expect(out.elements!.map(e => e.id)).toEqual(['a'])
  })

  it('countBlockedElements 供宿主在装载前计数提示（三区求和）', () => {
    expect(countBlockedElements(mixed())).toBe(3)
    expect(countBlockedElements({ unit: 'mm', elements: [] } as unknown as TemplateData)).toBe(0)
  })
})

describe('元素外边距单位迁移', () => {
  it('旧 pt 模板换算四边距，mm 模板幂等', () => {
    const tpl = {
      elements: [{ id: 'e', options: {
        left: 72, top: 72, width: 72, height: 72,
        marginTop: 36, marginRight: -36, marginBottom: 72, marginLeft: 18,
      } }],
    } as unknown as TemplateData
    const out = normalizeTemplateUnits(tpl)
    expect(out.elements[0]!.options).toMatchObject({
      marginTop: 12.7, marginRight: -12.7, marginBottom: 25.4, marginLeft: 6.35,
    })
    expect(normalizeTemplateUnits(out)).toEqual(out)
  })
})
