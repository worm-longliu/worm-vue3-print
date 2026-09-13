// print-core/src/render/watermark.test.ts
// 水印核心逻辑：文本解析、瓦片网格（显式矢量瓦片）、每页水印层 HTML。
// 关键回归：水印层不得再出现 CSS 平铺背景（background-repeat / background-image），
// 否则 Chromium 会把它编译成 PDF 平铺图案，出纸链路的 RIP 会把水印放大/错位（见 spec）。
import { describe, it, expect } from 'vitest'
import { generateHtml } from './html-generator.js'
import { buildPageCss } from './css-builder.js'
import {
  isWatermarkVisible,
  resolveWatermarkText,
  formatTimestamp,
  resolveTileSize,
  resolveWatermarkLayout,
  renderWatermarkTileSvg,
  renderWatermarkLayerHtml,
  WATERMARK_DEFAULTS,
  WATERMARK_DENSITY_PRESETS,
  MM_PER_PX,
} from './watermark.js'
import type { TemplateData, PageLayout } from './types.js'
import type { WatermarkOptions } from '../designer/types.js'

/** A4（210×297mm） */
const A4 = { width: 210, height: 297 }

function makeTemplate(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
  }
}

describe('isWatermarkVisible', () => {
  it('未配置（watermark undefined / {}）不可见，保持旧模板零输出', () => {
    expect(isWatermarkVisible(undefined)).toBe(false)
    expect(isWatermarkVisible({})).toBe(false)
  })
  it('fixed：content 非空可见，空白隐藏', () => {
    expect(isWatermarkVisible({ mode: 'fixed', content: '内部资料' })).toBe(true)
    expect(isWatermarkVisible({ mode: 'fixed', content: '   ' })).toBe(false)
  })
  it('向后兼容：无 mode 时按 fixed 处理', () => {
    expect(isWatermarkVisible({ content: '机密' })).toBe(true)
  })
  it('binding：binding 非空可见', () => {
    expect(isWatermarkVisible({ mode: 'binding', binding: 'order.no' })).toBe(true)
    expect(isWatermarkVisible({ mode: 'binding', binding: '' })).toBe(false)
  })
})

describe('resolveWatermarkText', () => {
  it('fixed 取 content', () => {
    expect(resolveWatermarkText({ mode: 'fixed', content: '机密文件' }, {})).toBe('机密文件')
  })
  it('binding 支持字段完整路径', () => {
    const data = { order: { no: 'SO-001' } }
    expect(resolveWatermarkText({ mode: 'binding', binding: 'order.no' }, data)).toBe('SO-001')
  })
  it('binding 支持顶层扁平 key（含点优先）', () => {
    const data = { 'order.no': 'FLAT-1' }
    expect(resolveWatermarkText({ mode: 'binding', binding: 'order.no' }, data)).toBe('FLAT-1')
  })
  it('binding 支持花括号表达式与函数', () => {
    const data = { user: { name: '张三' }, order: { no: 'SO-009' } }
    expect(resolveWatermarkText({ mode: 'binding', binding: '{order.no}' }, data)).toBe('SO-009')
    expect(resolveWatermarkText({ mode: 'binding', binding: "CONCAT('单号:', order.no)" }, data)).toBe('单号:SO-009')
  })
  it('binding 取不到值回退 testData，再回退 [binding]', () => {
    expect(resolveWatermarkText({ mode: 'binding', binding: 'order.no', testData: '示例单号' }, {})).toBe('示例单号')
    expect(resolveWatermarkText({ mode: 'binding', binding: 'order.no' }, {})).toBe('[order.no]')
  })
  it('binding null/undefined 值时回退 testData，再回退 [binding]', () => {
    expect(resolveWatermarkText({ mode: 'binding', binding: 'order.no', testData: '兜底' }, { order: { no: null } })).toBe('兜底')
    expect(resolveWatermarkText({ mode: 'binding', binding: 'order.no' }, { order: { no: undefined } })).toBe('[order.no]')
  })
  it('timestamp 追加时间，format 自定义生效', () => {
    const text = resolveWatermarkText(
      { mode: 'fixed', content: '机密', timestamp: true, format: 'YYYY/MM/DD' },
      {},
    )
    const year = new Date().getFullYear()
    expect(text).toMatch(new RegExp(`^机密 ${year}/\\d{2}/\\d{2}$`))
  })
})

describe('formatTimestamp', () => {
  it('缺省格式为 YYYY-MM-DD HH:mm', () => {
    expect(formatTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(formatTimestamp('')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
  it('支持自定义 token', () => {
    expect(formatTimestamp('HH:mm:ss')).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})

describe('resolveTileSize（瓦片为 px 配置，落纸换算 mm）', () => {
  it('默认瓦片 260×180px，等于 68.79×47.63mm @96dpi', () => {
    const size = resolveTileSize()
    expect(size).toEqual({ width: 260, height: 180 })
    expect(Number((size.width * MM_PER_PX).toFixed(2))).toBe(68.79)
    expect(Number((size.height * MM_PER_PX).toFixed(2))).toBe(47.63)
  })
  it('低于下限被钳制', () => {
    expect(resolveTileSize({ tileWidth: 10, tileHeight: 10 })).toEqual({
      width: WATERMARK_DEFAULTS.minTileWidth,
      height: WATERMARK_DEFAULTS.minTileHeight,
    })
  })
})

describe('resolveWatermarkLayout（瓦片网格）', () => {
  it('不可见、文本为空时返回 null', () => {
    expect(resolveWatermarkLayout(undefined, {}, A4)).toBeNull()
    expect(resolveWatermarkLayout({}, {}, A4)).toBeNull()
    expect(resolveWatermarkLayout({ mode: 'fixed', content: '   ' }, {}, A4)).toBeNull()
  })

  it('A4 默认密度：4 列 × 7 行 = 28 块，网格铺满整张纸', () => {
    const layout = resolveWatermarkLayout({ mode: 'fixed', content: '内部资料' }, {}, A4)!
    expect(layout.columns).toBe(4)
    expect(layout.rows).toBe(7)
    expect(layout.tiles).toHaveLength(28)
    expect(layout.tileWidthMm).toBe(68.7917)
    expect(layout.tileHeightMm).toBe(47.625)
    expect(layout.tiles[0]).toEqual({ leftMm: 0, topMm: 0, widthMm: 68.7917, heightMm: 47.625 })
    expect(layout.tiles[27]).toEqual({
      leftMm: 206.3751,
      topMm: 285.75,
      widthMm: 68.7917,
      heightMm: 47.625,
    })
    // 末列/末行必须越过纸边（由 overflow:hidden 裁切），保证右/下边缘不留空白
    expect(layout.tiles[27].leftMm + layout.tileWidthMm).toBeGreaterThan(A4.width)
    expect(layout.tiles[27].topMm + layout.tileHeightMm).toBeGreaterThan(A4.height)
  })

  it('连续纸按推导纸高铺网格（80×150mm）', () => {
    const layout = resolveWatermarkLayout({ mode: 'fixed', content: '热敏' }, {}, { width: 80, height: 150 })!
    expect(layout.columns).toBe(2)
    expect(layout.rows).toBe(4)
    expect(layout.tiles).toHaveLength(8)
  })

  it('密度预设与自定义瓦片尺寸生效', () => {
    const dense = resolveWatermarkLayout(
      {
        mode: 'fixed',
        content: '密',
        tileWidth: WATERMARK_DENSITY_PRESETS.dense.width,
        tileHeight: WATERMARK_DENSITY_PRESETS.dense.height,
      },
      {},
      A4,
    )!
    expect(dense.tileWidthMm).toBe(52.9167)
    expect(dense.tileHeightMm).toBe(31.75)
    // 密度只改平铺疏密，不改字号
    expect(dense.fontSizePx).toBe(WATERMARK_DEFAULTS.fontSize)
    expect(dense.columns).toBe(4)
    expect(dense.rows).toBe(10)
  })

  it('颜色/角度/透明度取配置值，缺省回退默认值', () => {
    const layout = resolveWatermarkLayout(
      { mode: 'fixed', content: '配色', color: '#ff0000', rotate: 45, opacity: 0.3 },
      {},
      A4,
    )!
    expect(layout.color).toBe('#ff0000')
    expect(layout.rotate).toBe(45)
    expect(layout.opacity).toBe(0.3)

    const fallback = resolveWatermarkLayout({ mode: 'fixed', content: '默认' }, {}, A4)!
    expect(fallback.color).toBe(WATERMARK_DEFAULTS.color)
    expect(fallback.rotate).toBe(WATERMARK_DEFAULTS.rotate)
    expect(fallback.opacity).toBe(WATERMARK_DEFAULTS.opacity)
  })

  it('绑定字段水印按 printData 求值，数组数据取首份', () => {
    const layout = resolveWatermarkLayout(
      { mode: 'binding', binding: 'order.no' },
      [{ order: { no: 'SO-100' } }],
      A4,
    )!
    expect(layout.text).toBe('SO-100')
  })
})

describe('renderWatermarkTileSvg', () => {
  it('瓦片 mm 定位 + px viewBox，字号/角度/颜色与配置一致', () => {
    const layout = resolveWatermarkLayout(
      { mode: 'fixed', content: '机密', color: '#ff0000', rotate: 45 },
      {},
      A4,
    )!
    const svg = renderWatermarkTileSvg(layout, layout.tiles[5])
    expect(svg).toContain('class="watermark-tile"')
    expect(svg).toContain('left:68.7917mm;top:47.625mm;width:68.7917mm;height:47.625mm')
    expect(svg).toContain('viewBox="0 0 260 180"')
    expect(svg).toContain('font-size="16"')
    expect(svg).toContain('fill="#ff0000"')
    expect(svg).toContain('rotate(45,130,90)')
    expect(svg).toContain('>机密</text>')
  })

  it('文本转义 & < >', () => {
    const layout = resolveWatermarkLayout({ mode: 'fixed', content: 'A&B<C>D' }, {}, A4)!
    const svg = renderWatermarkTileSvg(layout, layout.tiles[0])
    expect(svg).not.toContain('A&B<C>D')
    expect(svg).toContain('A&amp;B&lt;C&gt;D')
  })
})

describe('renderWatermarkLayerHtml', () => {
  it('不可见或文本为空时输出空串', () => {
    expect(renderWatermarkLayerHtml(undefined, {}, A4)).toBe('')
    expect(renderWatermarkLayerHtml({}, {}, A4)).toBe('')
    expect(renderWatermarkLayerHtml({ mode: 'fixed', content: ' ' }, {}, A4)).toBe('')
  })

  it('输出显式矢量瓦片（每块一个 <svg>），透明度挂在层上', () => {
    const html = renderWatermarkLayerHtml({ mode: 'fixed', content: '内部资料', opacity: 0.25 }, {}, A4)
    expect(html).toContain('<div class="watermark-layer" style="opacity:0.25">')
    expect(html.match(/class="watermark-tile"/g) ?? []).toHaveLength(28)
  })

  it('回归防线：水印层不得使用 CSS 平铺背景（否则 PDF 落成 tiling pattern）', () => {
    const html = renderWatermarkLayerHtml(
      { mode: 'fixed', content: "机密'引号", opacity: 0.2, tileWidth: 200, tileHeight: 120 },
      {},
      A4,
    )
    expect(html).not.toContain('background-repeat')
    expect(html).not.toContain('background-image')
    expect(html).not.toContain('data:image/svg')
    // 层的 style 属性只有 opacity，可被 [^"]* 完整捕获（无内部裸双引号）
    expect(html.match(/<div class="watermark-layer" style="([^"]*)"/)).not.toBeNull()
  })
})

describe('generateHtml 水印集成（四端起同构渲染）', () => {
  const pageLayouts: PageLayout[] = [{ pageIndex: 0, sections: [] }, { pageIndex: 1, sections: [] }]

  it('每页最终 HTML 输出水印层，瓦片数按纸张算满整页', () => {
    const tpl = makeTemplate()
    tpl.watermark = { mode: 'fixed', content: '内部资料' }
    const html = generateHtml(tpl, pageLayouts)
    expect(html.match(/class="watermark-layer"/g) ?? []).toHaveLength(2)
    expect(html.match(/class="watermark-tile"/g) ?? []).toHaveLength(56)
  })

  it('连续纸按 pageHeightMm 推导纸高铺瓦片（与 @page 同源）', () => {
    const tpl = makeTemplate()
    tpl.paperSize = 'CONTINUOUS'
    tpl.customHeight = 80
    tpl.watermark = { mode: 'fixed', content: '热敏' }
    const html = generateHtml(tpl, [{ pageIndex: 0, sections: [] }], undefined, { pageHeightMm: 100 })
    // 80mm 宽 → 2 列；100mm 高 → ceil(100/47.625)=3 行
    expect(html.match(/class="watermark-tile"/g) ?? []).toHaveLength(6)
    expect(html).toContain('@page { size: 80mm 100mm;')
  })

  it('绑定字段水印按 printData 求值，数组数据取首份', () => {
    const tpl = makeTemplate()
    tpl.watermark = { mode: 'binding', binding: 'order.no' }
    const html = generateHtml(tpl, pageLayouts, [{ order: { no: 'SO-100' } }])
    expect(html).toContain('SO-100')
    expect(html).not.toContain('order.no')
  })

  it('测量模式同样输出水印层且不影响 data-measure-id', () => {
    const tpl = makeTemplate()
    tpl.watermark = { mode: 'fixed', content: '测量水印' }
    tpl.elements = [{ id: 'txt', type: 'text', options: { left: 0, top: 0, width: 50, formatter: '内容' } } as any]
    const html = generateHtml(tpl, [], undefined, { isMeasurementPass: true })
    expect(html).toContain('class="watermark-layer"')
    expect(html).toContain('data-measure-id="txt"')
  })

  it('watermark 未配置时不输出水印层（旧模板行为不变）', () => {
    const html = generateHtml(makeTemplate(), pageLayouts)
    expect(html).not.toContain('class="watermark-layer"')
    expect(html).not.toContain('class="watermark-tile"')
  })

  it('buildPageCss 含水印层与瓦片样式，且不含平铺背景规则', () => {
    const css = buildPageCss(makeTemplate())
    expect(css).toContain('.watermark-layer')
    expect(css).toContain('.watermark-tile')
    expect(css).toContain('pointer-events: none')
    expect(css).not.toContain('background-repeat')
  })

  it('WATERMARK_DENSITY_PRESETS 提供密/中/疏三档', () => {
    expect(WATERMARK_DENSITY_PRESETS.dense).toEqual({ width: 200, height: 120, label: '密' })
    expect(WATERMARK_DENSITY_PRESETS.medium).toEqual({ width: 260, height: 180, label: '中（默认）' })
    expect(WATERMARK_DENSITY_PRESETS.loose).toEqual({ width: 340, height: 260, label: '疏' })
  })
})
