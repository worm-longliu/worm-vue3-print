// 分页引擎 × 元素级旋转：AABB 结算、换页落点、顶越界警告（spec 第九节判据 3/4/5 的 core 层）
import { describe, expect, it } from 'vitest'
import { paginate, collectFollowMemberIds } from './pagination-engine.js'
import { generateHtml } from './html-generator.js'
import type { TemplateData } from './types.js'

function a4Template(elements: TemplateData['elements']): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    elements,
  }
}

function rotBox(id: string, top: number, rotate: number): TemplateData['elements'][number] {
  return {
    id,
    type: 'text',
    options: { left: 20, top, width: 100, height: 20, rotate, formatter: `R_${id}` },
  }
}

describe('分页 × 旋转：AABB 结算', () => {
  it('假溢出修复：45° 元素实际放得下时不再误报 overflow（判据 3）', () => {
    // aabb 187.5736..272.4264 < 277，旧口径按 220+84.85=304.85 误报
    const pages = paginate(a4Template([rotBox('t1', 220, 45)]), new Map())
    expect(pages).toHaveLength(1)
    expect(pages[0]!.overflow).toBeUndefined()
    expect(pages[0]!.sections[0]!.renderTop).toBe(220)
  })

  it('真溢出保留本页并标 overflow：45° 底边 302.43 越过 277（判据 3 对照面）', () => {
    const pages = paginate(a4Template([rotBox('t1', 250, 45)]), new Map())
    expect(pages).toHaveLength(1)
    expect(pages[0]!.overflow).toBe(true)
    expect(pages[0]!.sections[0]!.renderTop).toBe(250)
  })

  it('换页落点：renderTop = 游标 + (aabbH−h)/2，AABB 顶贴新页 0（判据 4）', () => {
    const tall = {
      id: 'tall',
      type: 'text',
      options: { left: 20, top: 20, width: 100, height: 200, formatter: 'TALL' },
    }
    const pages = paginate(a4Template([tall, rotBox('t1', 250, 45)]), new Map())
    expect(pages).toHaveLength(2)
    // aabbH 84.8528 → shift = (84.8528−20)/2 = 32.4264；新页游标 0
    expect(pages[1]!.sections[0]!.renderTop).toBeCloseTo(32.4264, 3)
  })

  it('顶越界警告：45° 设计盒顶 10mm 时外接盒顶 −22.43mm，warnings 专条文案（判据 5）', () => {
    const pages = paginate(a4Template([rotBox('t1', 10, 45)]), new Map())
    expect(pages).toHaveLength(1)
    expect(pages[0]!.warnings).toHaveLength(1)
    expect(pages[0]!.warnings![0]).toContain('t1')
    expect(pages[0]!.warnings![0]).toContain('45°')
    expect(pages[0]!.warnings![0]).toContain('22.43')
  })

  it('未旋转元素不产生 warnings，sections 与旧口径逐字一致', () => {
    const pages = paginate(a4Template([rotBox('t1', 250, 0)]), new Map())
    expect(pages[0]!.warnings).toBeUndefined()
    expect(pages[0]!.overflow).toBeUndefined()
  })

  it('二维码斜角在低 dpi 元素上吸附为不转：不按 AABB 扩版、不出顶越界警告', () => {
    const mk = (dpi: number): TemplateData => a4Template([
      { id: 'qr', type: 'qrcode', options: { left: 20, top: 10, width: 100, height: 20, rotate: 30, testData: 'ABC', printerDpi: dpi } },
    ])
    // 203dpi：30° 吸附到 0（不旋转）→ 结算盒 = 设计盒，top 10 不越界
    const low = paginate(mk(203), new Map())
    expect(low[0]!.sections[0]!.renderTop).toBe(10)
    expect(low[0]!.warnings).toBeUndefined()
    // 600dpi：30° 放行 → 外接盒顶 −13.66mm 越出页首
    const high = paginate(mk(600), new Map())
    expect(high[0]!.warnings).toHaveLength(1)
  })
})

describe('渲染 × 旋转：rotate 声明出口', () => {
  it('最终趟输出 CSS rotate 属性，测量趟不输出（判据 2）', () => {
    const tpl = a4Template([rotBox('t1', 220, 30)])
    const finalHtml = generateHtml(tpl, paginate(tpl, new Map()), {}, {})
    expect(finalHtml).toContain('rotate:30deg;')
    const measureHtml = generateHtml(tpl, [], {}, { isMeasurementPass: true })
    expect(measureHtml).not.toContain('rotate:')
  })

  it('0/未设不输出 rotate 声明（存量模板 HTML 逐字不变）', () => {
    const tpl = a4Template([rotBox('t1', 220, 0)])
    const html = generateHtml(tpl, paginate(tpl, new Map()), {}, {})
    expect(html).not.toContain('rotate:')
  })

  it('table/flowList 不输出 rotate（v1 排除项）', () => {
    const tableTpl = a4Template([
      {
        id: 'tb',
        type: 'table',
        options: {
          left: 20, top: 20, width: 100, height: 40, rotate: 45,
          tableRows: [{ cells: [{ text: 'A' }] }], tableColWidths: [100],
        },
      },
      { id: 'fl', type: 'flowList', options: { left: 20, top: 80, width: 100, height: 30, rotate: 45, flowColumns: 2, testData: 'a\nb' } },
    ])
    const html = generateHtml(tableTpl, paginate(tableTpl, new Map()), {}, {})
    expect(html).not.toContain('rotate:')
  })

  it('二维码低 dpi 斜角吸附后不输出 rotate 声明（与条码同口径）', () => {
    const mk = (dpi: number): TemplateData => a4Template([
      { id: 'qr', type: 'qrcode', options: { left: 20, top: 100, width: 30, height: 30, rotate: 30, testData: 'ABC', printerDpi: dpi } },
    ])
    expect(generateHtml(mk(203), paginate(mk(203), new Map()), {}, {})).not.toContain('rotate:')
    expect(generateHtml(mk(600), paginate(mk(600), new Map()), {}, {})).toContain('rotate:30deg;')
  })
})

// 横向越界：分页引擎历来只按纵向记账，超出纸面宽度的元素出纸被 .print-page{overflow:hidden} 裁掉
// 且既不算 overflow 也不给告警；整页 90°/270° 出纸时该盲区会翻成纵向裁切（实测 49.99mm）。
describe('分页 × 横向越界：出纸裁切警告', () => {
  const box = (id: string, left: number, width: number, rotate?: number): TemplateData['elements'][number] => ({
    id, type: 'text', options: { left, top: 100, width, height: 20, rotate, formatter: `H_${id}` },
  })

  it('元素右侧超出纸面 50mm（左边距 10 + 150 + 100 − 210）给专条警告', () => {
    const pages = paginate(a4Template([box('t1', 150, 100)]), new Map())
    expect(pages[0]!.warnings).toHaveLength(1)
    expect(pages[0]!.warnings![0]).toContain('t1')
    expect(pages[0]!.warnings![0]).toContain('50')
  })

  it('恰好贴右纸边不告警（对照，防误报）', () => {
    const pages = paginate(a4Template([box('t1', 150, 50)]), new Map())
    expect(pages[0]!.warnings).toBeUndefined()
  })

  it('元素左侧超出纸面（left −20 → 相对纸面 −10mm）给专条警告', () => {
    const pages = paginate(a4Template([box('t1', -20, 100)]), new Map())
    expect(pages[0]!.warnings).toHaveLength(1)
    expect(pages[0]!.warnings![0]).toContain('10')
  })

  it('旋转元素按外接盒判横向越界（45° AABB 右缘 222.43 → 超 12.43mm）', () => {
    const pages = paginate(a4Template([box('t1', 120, 100, 45)]), new Map())
    const warn = pages[0]!.warnings?.[0] ?? ''
    expect(warn).toContain('12.43')
  })

  it('未旋转元素的横向越界不影响 sections 与 overflow（只加提示，不改出纸语义）', () => {
    const pages = paginate(a4Template([box('t1', 150, 100)]), new Map())
    expect(pages[0]!.overflow).toBeUndefined()
    expect(pages[0]!.sections[0]).toMatchObject({ elementId: 't1', renderTop: 100 })
  })
})

// 跟随区归属的公开判据：spec 契约四要求「渲染不转、属性台不出输入框」，
// 设计器（canvas / print-common 画布与属性台）必须与出纸用同一实现，不得各自另抄。
describe('collectFollowMemberIds：跟随区归属单点判据', () => {
  const table = (over: Record<string, any> = {}) => ({
    id: 'tbl',
    type: 'table',
    options: { left: 10, top: 10, width: 100, height: 24, tableColWidths: [40, 60], tableRows: [], ...over },
  })
  const under = (id: string, over: Record<string, any> = {}) => ({
    id,
    type: 'text',
    options: { left: 10, top: 40, width: 40, height: 8, formatter: id, ...over },
  })

  it('表格设计底部以下且与列横向相交 → 收进集合', () => {
    // 底部 = top 10 + max(height 24, 行高和 0) = 34；元素 top 40 在其下且横向相交
    expect(collectFollowMemberIds([table(), under('f1')])).toEqual(new Set(['f1']))
  })

  it('与表格横向零交集 → 不算成员（保持原地绝对定位）', () => {
    const els = [table(), under('far', { left: 120, width: 30 })]
    expect(collectFollowMemberIds(els).has('far')).toBe(false)
  })

  it('表格上方的元素不算成员', () => {
    const els = [table(), under('above', { top: 5 })]
    expect(collectFollowMemberIds(els).has('above')).toBe(false)
  })

  it('显式编组成员不参与跟随归属（整组同页优先）', () => {
    const els = [table(), under('g1a', { groupId: 'g1' }), under('g1b', { groupId: 'g1', top: 50 })]
    expect(collectFollowMemberIds(els).size).toBe(0)
  })

  it('多个成员全部收进，顺序不影响结果', () => {
    const a = [table(), under('f1'), under('f2', { top: 52 })]
    const b = [under('f2', { top: 52 }), table(), under('f1')]
    expect([...collectFollowMemberIds(a)].sort()).toEqual(['f1', 'f2'])
    expect([...collectFollowMemberIds(b)].sort()).toEqual(['f1', 'f2'])
  })

  it('无表格 → 空集合', () => {
    expect(collectFollowMemberIds([under('f1')]).size).toBe(0)
  })
})
