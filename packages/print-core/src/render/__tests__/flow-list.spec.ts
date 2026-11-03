// 流式列表排布纯逻辑的单测：宽度估算、跨列档位、占位换行、列数钳制与提示上限。
import { describe, it, expect } from 'vitest'
import {
  detectFlowListKey,
  estimateTextWidthMm,
  flowColumnWidthMm,
  flowContentWidthMm,
  flowGridStyle,
  flowSpanWidthMm,
  layoutFlowList,
  resolveFlowColumns,
  resolveFlowGapX,
  resolveFlowMaxSpan,
  resolveFlowPadding,
  resolveFlowRowHeight,
  resolveFlowLayoutMode,
  spanForText,
  suggestFlowColumns,
  type FlowLayoutConfig,
} from '../flow-list.js'

const base: FlowLayoutConfig = {
  width: 80,
  columns: 4,
  gapX: 4,
  rowHeight: 8,
  fontSizePt: 12,
  autoSpan: true,
  maxSpan: 2,
}

describe('布局模式与四边内边距解析', () => {
  it('动态布局缺省保持 fixed，非法值不触发分页', () => {
    expect(resolveFlowLayoutMode(undefined)).toBe('fixed')
    expect(resolveFlowLayoutMode('fixed')).toBe('fixed')
    expect(resolveFlowLayoutMode('dynamic')).toBe('dynamic')
    expect(resolveFlowLayoutMode('unknown')).toBe('fixed')
  })

  it('四边内边距独立解析，负值和非有限值归零', () => {
    expect(resolveFlowPadding({
      flowPaddingTop: 2, flowPaddingRight: -1,
      flowPaddingBottom: Number.NaN, flowPaddingLeft: 4,
    })).toEqual({ top: 2, right: 0, bottom: 0, left: 4 })
    expect(resolveFlowPadding({})).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(flowContentWidthMm(100, { top: 2, right: 3, bottom: 2, left: 4 })).toBe(93)
    expect(flowContentWidthMm(5, { top: 0, right: 4, bottom: 0, left: 4 })).toBe(0)
  })
})

describe('resolve* 缺省与钳制', () => {
  it('列数缺省 4、非法回落、钳到 1~12', () => {
    expect(resolveFlowColumns(undefined)).toBe(4)
    expect(resolveFlowColumns(0)).toBe(1)
    expect(resolveFlowColumns(99)).toBe(12)
    expect(resolveFlowColumns(Number.NaN)).toBe(4)
  })

  it('行高缺省 8mm、钳到 3~100mm；间距缺省 4mm、钳到 0~50mm', () => {
    expect(resolveFlowRowHeight(undefined)).toBe(8)
    expect(resolveFlowRowHeight(1)).toBe(3)
    expect(resolveFlowRowHeight(500)).toBe(100)
    expect(resolveFlowGapX(undefined)).toBe(4)
    expect(resolveFlowGapX(-2)).toBe(0)
    expect(resolveFlowGapX(80)).toBe(50)
  })

  it('最多跨几列钳到每行列数（第 9 项：唯一改用户值处）', () => {
    expect(resolveFlowMaxSpan(6, 4)).toBe(4)
    expect(resolveFlowMaxSpan(2, 4)).toBe(2)
    expect(resolveFlowMaxSpan(undefined, 4)).toBe(2)
    expect(resolveFlowMaxSpan(0, 4)).toBe(1)
    // 列数非法时先按缺省 4 收敛，不会出现「跨 3 列但只有 1 列」
    expect(resolveFlowMaxSpan(3, 1)).toBe(1)
  })
})

describe('宽度估算', () => {
  it('四个汉字在 12pt 下约 4 个 em', () => {
    const one = estimateTextWidthMm('一', 12)
    expect(estimateTextWidthMm('黄芪当归', 12)).toBeCloseTo(one * 4, 6)
  })

  it('字号翻倍，估算宽度同比翻倍', () => {
    expect(estimateTextWidthMm('炙黄芪', 24)).toBeCloseTo(estimateTextWidthMm('炙黄芪', 12) * 2, 6)
  })

  it('半角数字比汉字窄、空格最窄', () => {
    expect(estimateTextWidthMm('0', 12)).toBeLessThan(estimateTextWidthMm('一', 12))
    expect(estimateTextWidthMm(' ', 12)).toBeLessThan(estimateTextWidthMm('0', 12))
  })

  it('空串宽度为 0', () => {
    expect(estimateTextWidthMm('', 12)).toBe(0)
  })
})

describe('列宽与跨列可用宽', () => {
  it('80mm 框 4 列 4mm 间距 → 单列 17mm', () => {
    expect(flowColumnWidthMm(80, 4, 4)).toBeCloseTo(17, 6)
  })

  it('跨 2 列可用宽 = 2 个列宽 + 1 个间距', () => {
    expect(flowSpanWidthMm(17, 4, 2)).toBeCloseTo(38, 6)
  })

  it('间距吃掉全部宽度时列宽为 0（不返回负数）', () => {
    expect(flowColumnWidthMm(10, 4, 50)).toBe(0)
  })
})

describe('spanForText', () => {
  it('关闭跨列时永远是 1 列', () => {
    const cfg = { ...base, autoSpan: false, colUnitMm: 17 }
    expect(spanForText('炙黄芪（先煎兑服）30g', cfg)).toBe(1)
  })

  it('短单元占 1 列，长单元占 2 列，且不超过 maxSpan', () => {
    const cfg = { ...base, colUnitMm: 17 }
    expect(spanForText('红花 10g', cfg)).toBe(1)
    expect(spanForText('炙黄芪（先煎）30g', cfg)).toBe(2)
    expect(spanForText('炙黄芪（先煎、外用兑洗）三十克一整行超长文本', cfg)).toBe(2)
  })

  it('列宽为 0 时不再放大多跨（兜 1 列）', () => {
    expect(spanForText('黄芪', { ...base, colUnitMm: 0 })).toBe(1)
  })
})

describe('layoutFlowList 占位换行', () => {
  it('关闭跨列：严格按每行 4 个单元切行', () => {
    const items = ['a 1', 'b 2', 'c 3', 'd 4', 'e 5', 'f 6', 'g 7']
    const rows = layoutFlowList(items, { ...base, autoSpan: false })
    expect(rows.map(r => r.cells.length)).toEqual([4, 3])
    expect(rows[1].cells.map(c => c.text)).toEqual(['e 5', 'f 6', 'g 7'])
    expect(rows.every(r => r.cells.every(c => c.span === 1))).toBe(true)
  })

  it('跨 2 列的单元吃掉两个列位，本行剩不够时整个挪到下一行行首', () => {
    const items = ['黄芪 20g', '炙黄芪（先煎）30g', '红花 10g', '地龙 10g']
    const rows = layoutFlowList(items, base)
    // 第 1 行：黄芪(1) + 炙黄芪(2) + 红花(1) = 4 个列位，正好排满
    expect(rows[0].cells.map(c => [c.text, c.span])).toEqual([
      ['黄芪 20g', 1],
      ['炙黄芪（先煎）30g', 2],
      ['红花 10g', 1],
    ])
    // 列位已满，地龙整体落到第二行行首（而不是挤在第一行末尾）
    expect(rows[1].cells.map(c => c.text)).toEqual(['地龙 10g'])
  })

  it('行内剩不够放跨列单元时换行，而不是把它切成两半', () => {
    const items = ['黄芪 20g', '当归尾 15g', '赤芍 10g', '炙黄芪（先煎）30g']
    const rows = layoutFlowList(items, base)
    expect(rows[0].cells.map(c => c.text)).toEqual(['黄芪 20g', '当归尾 15g', '赤芍 10g'])
    expect(rows[1].cells.map(c => [c.text, c.span])).toEqual([['炙黄芪（先煎）30g', 2]])
  })

  it('超宽单元被 maxSpan 钳住后仍按列位排布，不会溢出列数', () => {
    const rows = layoutFlowList(['炙黄芪（先煎、外用兑洗）三十克一整行超长文本', '红花 10g'], base)
    for (const row of rows) {
      expect(row.cells.reduce((s, c) => s + c.span, 0)).toBeLessThanOrEqual(base.columns)
    }
  })

  it('空数组不产出行', () => {
    expect(layoutFlowList([], base)).toEqual([])
  })

  it('网格样式带列数、间距与最小行高', () => {
    const css = flowGridStyle(base)
    expect(css).toContain('display:grid')
    expect(css).toContain('grid-template-columns:repeat(4,minmax(0,1fr))')
    expect(css).toContain('column-gap:4mm')
    expect(css).toContain('grid-auto-rows:minmax(8mm,auto)')
  })
})

describe('detectFlowListKey（列表源从表达式里检出）', () => {
  const data = { hospital: '中医院', drugs: [{ name: '黄芪' }], other: [1, 2] }

  it('表达式引用 drugs.name 时检出 drugs', () => {
    expect(detectFlowListKey('{drugs.name} {drugs.spec}', data)).toBe('drugs')
  })

  it('两个数组字段都被引用时取第一个出现的', () => {
    expect(detectFlowListKey('{other} {drugs.name}', data)).toBe('other')
  })

  it('表达式只引用行内字段（{name}）时检不出来，交回调用方兜底', () => {
    expect(detectFlowListKey('{name} {spec}', data)).toBeUndefined()
  })

  it('非数组字段、缺表达式、缺数据都不误判', () => {
    expect(detectFlowListKey('{hospital}', data)).toBeUndefined()
    expect(detectFlowListKey('', data)).toBeUndefined()
    expect(detectFlowListKey(undefined, data)).toBeUndefined()
    expect(detectFlowListKey('{drugs.name}', undefined)).toBeUndefined()
  })

  it('函数表达式里的字段路径同样能检出', () => {
    expect(detectFlowListKey('{CONCAT(drugs.name, drugs.spec)}', data)).toBe('drugs')
  })
})

describe('suggestFlowColumns（只提示不写值）', () => {
  it('窄框建议的列数少于宽框', () => {
    expect(suggestFlowColumns(30, 4, 12)).toBeLessThan(suggestFlowColumns(120, 4, 12))
  })

  it('字号越大建议列数越少', () => {
    expect(suggestFlowColumns(80, 4, 24)).toBeLessThanOrEqual(suggestFlowColumns(80, 4, 12))
  })

  it('建议值始终落在 1~12', () => {
    expect(suggestFlowColumns(0.5, 0, 12)).toBe(1)
    expect(suggestFlowColumns(500, 0, 6)).toBeLessThanOrEqual(12)
  })
})
