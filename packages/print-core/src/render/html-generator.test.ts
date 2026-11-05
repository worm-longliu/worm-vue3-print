// print-core/src/render/html-generator.test.ts
import { describe, it, expect } from 'vitest'
import { generateHtml, renderFinalPages, wrapHtmlDocument } from './html-generator.js'
import { paginate } from './pagination-engine.js'
import type { TemplateData, PageLayout, CodeRenderer, CodeRenderOptions } from './types.js'

/** 测试用 CodeRenderer：返回可识别 SVG；EAN13 非数字码值抛错模拟非法码 */
function stubRenderer(onRender?: (opts: CodeRenderOptions) => void): CodeRenderer {
  return {
    render(value, cellType, opts) {
      if (opts?.barcodeType === 'EAN13' && !/^\d+$/.test(value)) throw new Error('illegal code')
      onRender?.(opts ?? {})
      return `<svg data-test-code="${cellType}" data-value="${value}"></svg>`
    },
  }
}

/**
 * 取码值 img 的行内声明列表：逐条比对，避免 toContain('width:100%') 被 'max-width:100%' 蒙过去。
 * srcIncludes 用于在含多个 img 的产物里定位目标码值（如表格单元格场景）。
 */
function imgDecls(html: string, srcIncludes = 'data:image/svg+xml'): string[] {
  for (const [, src, style] of html.matchAll(/<img src="([^"]*)"[^>]*style="([^"]*)"/g)) {
    if (!src.includes(srcIncludes)) continue
    return style!.split(';').map(d => d.trim()).filter(Boolean)
  }
  throw new Error(`html 中没有 src 含「${srcIncludes}」的 <img>`)
}

function makeTemplate(tableOptions: Record<string, any>): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{ id: 'tbl-1', type: 'table', options: { left: 0, top: 0, width: 100, ...tableOptions } } as any],
  }
}

const baseCell = { rowspan: 1, colspan: 1, merged: false }

describe('模板声明字体注入', () => {
  const withFonts = {
    ...makeTemplate({}),
    fonts: [{ family: 'Noto Sans SC', files: [{ url: '/fonts/noto-400.woff2', weight: 400 }] }],
  }
  const layouts = pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 }])

  it('测量趟与最终趟都注入 @font-face（两趟度量必须同一字体）', () => {
    const measure = generateHtml(withFonts, [], undefined, { isMeasurementPass: true })
    const final = generateHtml(withFonts, layouts, {})
    for (const html of [measure, final]) {
      expect(html).toContain('@font-face{font-family:"Noto Sans SC"')
      expect(html).toContain('/fonts/noto-400.woff2')
      expect(html).toContain('font-display:block')
    }
  })

  it('模板未声明字体时不产出 @font-face（老模板行为不变）', () => {
    expect(generateHtml(makeTemplate({}), layouts, {})).not.toContain('@font-face')
  })
})

function matrixOptions() {
  return {
    tableColWidths: [40, 60],
    _repeatHeaderCount: 1,
    _renderRows: [
      { type: 'header', height: 8, cells: [
        { ...baseCell, content: '品名', fontWeight: 'bold', borders: { bottom: { width: 0.75, style: 'solid', color: '#333333' } } },
        { ...baseCell, content: '数量' },
      ] },
      { type: 'data', height: 8, cells: [
        { ...baseCell, content: 'A', colspan: 2 },
        { ...baseCell, content: '', merged: true },
      ] },
      { type: 'data', height: 8, cells: [
        { ...baseCell, content: 'B' },
        { ...baseCell, content: '3', align: 'right' },
      ] },
    ],
  }
}

function pageWith(sections: PageLayout['sections']): PageLayout[] {
  return [{ pageIndex: 0, sections }]
}

describe('renderTableSlice 矩阵输出', () => {
  it('colgroup 按 mm 列宽输出，border-collapse 生效', () => {
    const html = generateHtml(makeTemplate(matrixOptions()), pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]))
    expect(html).toContain('<col style="width:40mm;">')
    expect(html).toContain('border-collapse:collapse')
    expect(html).toContain('width:100mm')
  })

  it('merged 占位格不输出 td，colspan 属性输出', () => {
    const html = generateHtml(makeTemplate(matrixOptions()), pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 1, endRow: 2 },
    ]))
    expect(html).toContain('colspan="2"')
    expect((html.match(/<td/g) ?? []).length).toBe(1)
  })

  it('按值归并产物输出 rowspan 属性，占位格不重复输出值', () => {
    // row-merge 归并后的数据行形态：行 1 首格 rowspan=2，行 2 同列 merged 占位
    const opts = matrixOptions()
    ;((opts._renderRows as any[])[1]!.cells[0] as any).rowspan = 2
    ;((opts._renderRows as any[])[2]!.cells[0] as any).merged = true
    ;((opts._renderRows as any[])[2]!.cells[0] as any).content = ''
    const html = generateHtml(makeTemplate(opts), pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]))
    expect(html).toContain('rowspan="2"')
    expect((html.match(/<td/g) ?? []).length).toBe(4)
    expect(html.match(/>A<\/td>/g)).toHaveLength(1)
  })

  it('repeatHeader 切片在行前重复表头段', () => {
    const html = generateHtml(makeTemplate(matrixOptions()), pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 2, endRow: 3, repeatHeader: true },
    ]))
    expect(html).toContain('品名')
    expect(html).toContain('>B</td>')
    expect(html).not.toContain('>A</td>')
  })

  it('逐格样式：边框/对齐/字重内联输出', () => {
    const html = generateHtml(makeTemplate(matrixOptions()), pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]))
    expect(html).toContain('border-bottom:0.75pt solid #333333')
    expect(html).toContain('font-weight:bold')
    expect(html).toContain('text-align:right')
  })

  it('tableDefaultBorders 作为逐格缺省：整表网格一次声明，单元格单边覆盖仍生效', () => {
    const grid = { width: 1.5, style: 'solid', color: '#000000' }
    const opts = matrixOptions()
    opts.tableDefaultBorders = { top: grid, right: grid, bottom: grid, left: grid }
    const html = generateHtml(makeTemplate(opts), pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]))
    // 未设 borders 的单元格四边都继承默认网格
    expect(html).toContain('border-top:1.5pt solid #000000')
    expect(html).toContain('border-left:1.5pt solid #000000')
    // 表头首格显式给了 bottom，覆盖默认值
    expect(html).toContain('border-bottom:0.75pt solid #333333')
    expect(html).not.toContain('border-bottom:none')
  })

  it('未设 tableDefaultBorders 时边框仍为 none（存量行为不变）', () => {
    const html = generateHtml(makeTemplate(matrixOptions()), pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 2, endRow: 3 },
    ]))
    expect(html).toContain('border-top:none')
    expect(html).toContain('border-left:none')
  })

  it('测量模式每行带 data-row-index', () => {
    const html = generateHtml(makeTemplate(matrixOptions()), [], undefined, { isMeasurementPass: true })
    expect(html).toContain('data-row-index="0"')
    expect(html).toContain('data-row-index="2"')
  })

  it('renderTop=0 覆盖设计 top：续片从页顶开始', () => {
    const opts = { ...matrixOptions(), top: 40 }
    const html = generateHtml(makeTemplate(opts), pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3, renderTop: 0 },
    ]))
    expect(html).toContain('top:0mm')
    expect(html).not.toContain('top:40mm')
  })

  it('无 renderTop 时回退设计 top', () => {
    const opts = { ...matrixOptions(), top: 40 }
    const html = generateHtml(makeTemplate(opts), pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]))
    expect(html).toContain('top:40mm')
  })

  it('非表格元素 section 带 renderTop 时按其定位', () => {
    const tpl = makeTemplate({})
    ;(tpl.elements as any[]) = [
      { id: 'e1', type: 'text', options: { left: 5, top: 200, width: 50, height: 20, formatter: '#x#' } },
    ]
    const html = generateHtml(tpl, pageWith([
      { elementId: 'e1', type: 'element', renderTop: 0 },
    ]))
    expect(html).toContain('top:0mm')
    expect(html).not.toContain('top:200mm')
  })
})

// ─── 区域元素（页眉/页脚）渲染单测 ───

function makeAreaTemplate(overrides: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 15, elements: [] },
    footer: { height: 12, elements: [] },
    elements: [],
    ...overrides,
  } as TemplateData
}

function makeAreaEl(type: string, options: Record<string, any> = {}) {
  return {
    id: `el-${type}`,
    type,
    options: { left: 0, top: 0, width: 50, height: 8, ...options },
    printElementType: { type },
  }
}

const singlePage = [{ pageIndex: 0, sections: [] }] as any

describe('页眉/页脚区域元素渲染', () => {
  it('页眉支持线条/矩形/椭圆类型', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [
          makeAreaEl('hline'),
          makeAreaEl('rect', { borderColor: '#f00', borderWidth: 2 }),
          makeAreaEl('oval'),
        ] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('border-top:0.75pt solid #333')
    expect(html).toContain('border:2pt solid #f00')
    expect(html).toContain('border-radius:50%')
  })

  it('横竖线出纸尊重 borderWidth/borderStyle/borderColor（pt 口径，与设计器一致）', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [
          makeAreaEl('hline', { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#f00' }),
          makeAreaEl('vline', { borderWidth: 2, borderColor: '#00f' }),
        ] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('border-top:1.5pt dashed #f00')
    expect(html).toContain('border-left:2pt solid #00f')
  })

  it('0 / 空串按设计器 || 语义回落缺省（0.75pt solid #333）', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [
          makeAreaEl('hline', { borderWidth: 0, borderStyle: '', borderColor: '' }),
          makeAreaEl('rect', { borderWidth: 0, borderColor: '' }),
        ] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('border-top:0.75pt solid #333')
    expect(html).toContain('border:1pt solid #333')
  })

  it('页脚条码经 CodeRenderer 渲染并内联为 SVG', () => {
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', { testData: 'BC-001' })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer() })
    // 条形码尺寸由条宽/打印点结算到 mm，只有内联 svg 能精确落纸
    expect(html).toContain('display:flex;align-items:center;justify-content:center;overflow:hidden;"><svg')
    expect(html).toContain('data-test-code="barcode"')
    expect(html).not.toContain('<span>BC-001</span>')
  })

  it('未注入 CodeRenderer 时条码降级为文本占位', () => {
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', { testData: 'BC-001' })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('<span>BC-001</span>')
    expect(html).not.toContain('<svg data-test-code')
  })

  it('CodeRenderer 抛错（码值非法）时降级为文本占位', () => {
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', { testData: 'ABC', barcodeType: 'EAN13' })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer() })
    expect(html).toContain('<span>ABC</span>')
    expect(html).not.toContain('<svg data-test-code')
  })

  it('条形码元素把可用框与条宽交给渲染器结算尺寸（不再拉伸填满）', () => {
    let captured: CodeRenderOptions = {}
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', { testData: '12345678', barWidth: 4, width: 60, height: 20 })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    // 尺寸由渲染器结算后内联，出图端不再叠加 object-fit / CSS 缩放
    expect(html).not.toContain('object-fit')
    expect(captured.barWidth).toBe(4)
    expect(captured.targetWidthMm).toBe(60)
    expect(captured.targetHeightMm).toBe(20)
  })

  it('二维码元素铺满元素盒：img 写死 width/height:100%，fit 缺省按 contain', () => {
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('qrcode', { testData: 'qrcode-x' })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer() })
    const decls = imgDecls(html)
    // 只给 max-* 时 img 停在 SVG 内在像素尺寸（116px≈30.7mm），盒子更大即不铺满且 object-fit 空转
    expect(decls).toContain('width:100%')
    expect(decls).toContain('height:100%')
    expect(decls).toContain('object-fit:contain')
    expect(decls).toContain('max-width:100%')
    expect(decls).toContain('max-height:100%')
    expect(html).toContain(encodeURIComponent('data-test-code="qrcode"'))
  })

  it('条形码元素的最大宽高并入可用框（参与结算，而非事后 CSS 缩放）', () => {
    let captured: CodeRenderOptions = {}
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', {
          testData: '12345678', fit: 'fill', maxWidth: 30, maxHeight: 10, width: 60, height: 20,
        })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    // 拉伸会把条宽拉成非整数，故条形码不再输出 object-fit / max-width
    expect(html).not.toContain('object-fit')
    expect(html).not.toContain('max-width:30mm')
    // 改为并入可用框交给渲染器结算：两者取小者
    expect(captured.targetWidthMm).toBe(30)
    expect(captured.targetHeightMm).toBe(10)
  })

  it('未设置最大宽高时可用框就是元素宽高', () => {
    let captured: CodeRenderOptions = {}
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', { testData: '12345678', width: 60, height: 20 })] as any,
      },
    })
    generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    expect(captured.targetWidthMm).toBe(60)
    expect(captured.targetHeightMm).toBe(20)
  })

  it('二维码元素透传缩放模式与最大宽高', () => {
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('qrcode', { testData: 'qrcode-x', fit: 'contain', maxWidth: 20 })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer() })
    expect(html).toContain('object-fit:contain')
    expect(html).toContain('max-width:20mm')
  })

  it('二维码元素把 qrQuietZone 交给渲染器（0 不能被当假值丢掉，未设置则不写该键）', () => {
    let captured: CodeRenderOptions = {}
    const withZone = makeAreaTemplate({
      footer: { height: 12, elements: [makeAreaEl('qrcode', { testData: 'qrcode-x', qrQuietZone: 0 })] as any },
    })
    generateHtml(withZone, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    expect(captured.qrQuietZone).toBe(0)

    captured = {}
    const bare = makeAreaTemplate({
      footer: { height: 12, elements: [makeAreaEl('qrcode', { testData: 'qrcode-x' })] as any },
    })
    generateHtml(bare, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    expect(captured.qrQuietZone).toBeUndefined()
  })

  it('条形码元素无论是否设置 printerDpi 都内联 <svg>（<img> 的内在尺寸会被取整到整数 CSS px）', () => {
    let captured: CodeRenderOptions = {}
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', {
          testData: '12345678', printerDpi: 203, width: 56.4, height: 14.1,
        })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    // 内联 svg：只有它能让渲染器算好的 mm 尺寸精确落纸
    expect(html).toContain('display:flex;align-items:center;justify-content:center;overflow:hidden;"><svg')
    expect(html).not.toContain('data:image/svg+xml')
    // 可用框与分辨率交给渲染器（点对齐据此求每模块点数）
    expect(captured.printerDpi).toBe(203)
    expect(captured.targetWidthMm).toBe(56.4)
    expect(captured.targetHeightMm).toBe(14.1)
  })

  it('条形码点对齐时不再叠加 fit / maxWidth（叠加会把结算尺寸重新缩成非整数点）', () => {
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', {
          testData: '12345678', printerDpi: 203, fit: 'fill', maxWidth: 30, maxHeight: 10,
        })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer() })
    expect(html).not.toContain('object-fit')
    expect(html).not.toContain('max-width:30mm')
    expect(html).not.toContain('max-height:10mm')
  })

  it('二维码元素不受 printerDpi 影响（模块数固定，尺寸仍由 fit/最大宽高决定）', () => {
    let captured: CodeRenderOptions = {}
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('qrcode', { testData: 'qrcode-x', printerDpi: 203 })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    expect(html).toContain('data:image/svg+xml')
    expect(captured.printerDpi).toBeUndefined()
  })

  it('表格单元格条形码按单元格可用框结算并内联 svg（不拉伸填满）', () => {
    let captured: CodeRenderOptions = {}
    const t = makeTemplate({
      ...matrixOptions(),
      tableDefaultFontSize: 10,
    })
    const rows = (matrixOptions()._renderRows as any[]).map(r => ({
      ...r,
      cells: r.cells.map((c: any, i: number) =>
        r.type === 'header' && i === 0 ? { ...c, cellType: 'barcode', barcodeType: 'CODE128', content: '12345678' } : c),
    }))
    t.elements[0].options._renderRows = rows
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]), undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    expect(html).toContain('display:flex;align-items:center;justify-content:center;overflow:hidden;"><svg')
    expect(html).not.toContain('data:image/svg+xml')
    expect(html).not.toContain('object-fit:contain')
    // 可用框 = 单元格内容区：列宽 40 − 左右内边距 2 − 塌陷边框（0.75pt/2 ≈ 0.1323mm）
    expect(captured.targetWidthMm).toBeCloseTo(38, 5)
    expect(captured.targetHeightMm).toBeCloseTo(6 - 0.1323, 3)
  })

  it('表格单元格二维码同样铺满单元格：img 写死 width/height:100%', () => {
    const t = makeTemplate({
      ...matrixOptions(),
      tableDefaultFontSize: 10,
    })
    const rows = (matrixOptions()._renderRows as any[]).map(r => ({
      ...r,
      cells: r.cells.map((c: any, i: number) =>
        r.type === 'header' && i === 0 ? { ...c, cellType: 'qrcode', content: 'qrcode-cell' } : c),
    }))
    t.elements[0].options._renderRows = rows
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]), undefined, { codeRenderer: stubRenderer() })
    expect(html).toContain('<img src="data:image/svg+xml;charset=utf-8,')
    const decls = imgDecls(html, encodeURIComponent('data-test-code="qrcode"'))
    expect(decls).toContain('width:100%')
    expect(decls).toContain('height:100%')
    expect(decls).toContain('object-fit:contain')
  })

  it('表格单元格条形码启用 printerDpi：按单元格可用宽高点对齐并内联 svg', () => {
    let captured: CodeRenderOptions = {}
    const t = makeTemplate({ ...matrixOptions(), tableDefaultFontSize: 10 })
    const rows = (matrixOptions()._renderRows as any[]).map(r => ({
      ...r,
      cells: r.cells.map((c: any, i: number) =>
        r.type === 'header' && i === 0
          ? { ...c, cellType: 'barcode', barcodeType: 'CODE128', content: '12345678', printerDpi: 203 }
          : c),
    }))
    t.elements[0].options._renderRows = rows
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]), undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    expect(html).toContain('display:flex;align-items:center;justify-content:center;overflow:hidden;"><svg')
    expect(html).not.toContain('data:image/svg+xml')
    expect(captured.printerDpi).toBe(203)
    // 可用框 = 单元格内容区：列宽 40 − 左右内边距 2 − 塌陷边框（0.75pt/2 ≈ 0.1323mm）
    expect(captured.targetWidthMm).toBeCloseTo(38, 5)
    expect(captured.targetHeightMm).toBeCloseTo(6 - 0.1323, 3)
  })

  it('静区/条宽/条码文本字号透传给渲染器：元素与单元格两条路都吃到（0 档不能被假值判断吃掉）', () => {
    let captured: CodeRenderOptions = {}
    const tElement = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', {
          testData: '12345678', barWidth: 6, barQuietZone: 0, fontSize: 12,
        })] as any,
      },
    })
    generateHtml(tElement, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    expect(captured.barQuietZone).toBe(0)
    expect(captured.barWidth).toBe(6)
    expect(captured.fontSize).toBe(12)

    let cellCaptured: CodeRenderOptions = {}
    const t = makeTemplate({ ...matrixOptions(), tableDefaultFontSize: 10 })
    t.elements[0].options._renderRows = (matrixOptions()._renderRows as any[]).map(r => ({
      ...r,
      cells: r.cells.map((c: any, i: number) =>
        r.type === 'header' && i === 0
          ? { ...c, cellType: 'barcode', content: '12345678', barQuietZone: 0, barWidth: 8, barFontSize: 14, fontSize: 9 }
          : c),
    }))
    generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]), undefined, { codeRenderer: stubRenderer(o => { cellCaptured = o }) })
    expect(cellCaptured.barQuietZone).toBe(0)
    expect(cellCaptured.barWidth).toBe(8)
    // 单元格的条码文本字号取 barFontSize：正文字号 fontSize 不该拿来决定条高相对值（与画布 CellBarcode 同口径）
    expect(cellCaptured.fontSize).toBe(14)
  })

  it('条高 barHeight 透传成渲染器的 barHeightMm：元素与单元格两条路都吃到', () => {
    let captured: CodeRenderOptions = {}
    const tElement = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', { testData: '12345678', barHeight: 20 })] as any,
      },
    })
    generateHtml(tElement, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    expect(captured.barHeightMm).toBe(20)

    let cellCaptured: CodeRenderOptions = {}
    const t = makeTemplate({ ...matrixOptions(), tableDefaultFontSize: 10 })
    t.elements[0].options._renderRows = (matrixOptions()._renderRows as any[]).map(r => ({
      ...r,
      cells: r.cells.map((c: any, i: number) =>
        r.type === 'header' && i === 0
          ? { ...c, cellType: 'barcode', content: '12345678', barHeight: 20 }
          : c),
    }))
    generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]), undefined, { codeRenderer: stubRenderer(o => { cellCaptured = o }) })
    expect(cellCaptured.barHeightMm).toBe(20)
  })

  it('表格未配置列宽时宽度不参与结算（可用宽度未知，只按行高与条宽落纸）', () => {
    let captured: CodeRenderOptions = {}
    const t = makeTemplate({ ...matrixOptions(), tableDefaultFontSize: 10, tableColWidths: [] })
    const rows = (matrixOptions()._renderRows as any[]).map(r => ({
      ...r,
      cells: r.cells.map((c: any, i: number) =>
        r.type === 'header' && i === 0
          ? { ...c, cellType: 'barcode', content: '12345678', printerDpi: 203 }
          : c),
    }))
    t.elements[0].options._renderRows = rows
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 3 },
    ]), undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    // 仍是内联 svg（条形码恒内联），但宽度上限未知 → 0 表示不约束
    expect(html).toContain('display:flex;align-items:center;justify-content:center;overflow:hidden;"><svg')
    expect(captured.printerDpi).toBe(203)
    expect(captured.targetWidthMm).toBe(0)
    expect(captured.targetHeightMm).toBeCloseTo(6 - 0.1323, 3)
  })

  it('页眉文本携带字体样式并替换页码变量', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [
          makeAreaEl('text', {
            testData: '第{pageIndex}页/共{totalPages}页',
            fontSize: 14,
            fontWeight: 'bold',
            color: '#333',
            textAlign: 'center',
          }),
        ] as any,
      },
    })
    const html = generateHtml(t, [
      { pageIndex: 0, sections: [] },
      { pageIndex: 1, sections: [] },
    ] as any)
    expect(html).toContain('第1页/共2页')
    expect(html).toContain('第2页/共2页')
    expect(html).toContain('font-size:14pt')
    expect(html).toContain('font-weight:bold')
    expect(html).toContain('color:#333')
    expect(html).toContain('text-align:center')
  })

  it('页眉图片渲染 img 标签', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [makeAreaEl('image', { src: 'https://x/logo.png' })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('src="https://x/logo.png"')
  })

  it('页脚容器绝对定位固定在页面底部且下边距生效（top = 纸高 - 下边距 - 页脚高）', () => {
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('text', { testData: '页脚' })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    const footerCss = html.match(/\.page-footer\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(footerCss).toContain('position: absolute')
    expect(footerCss).toContain('top: 275mm')
    // 绝对定位的包含块是 .print-page 的 padding box 外缘（= 纸面），
    // left 必须显式补 margins.left，否则页脚左边距丢失（与设计器三区几何不一致）
    expect(footerCss).toContain('left: 10mm')
  })
})

describe('内容区页码变量替换', () => {
  it('内容区元素 {pageIndex}/{totalPages} 按页替换', () => {
    const t = makeAreaTemplate({
      elements: [makeAreaEl('text', { formatter: '第{pageIndex}页/共{totalPages}页' })] as any,
    })
    const html = generateHtml(t, [
      { pageIndex: 0, sections: [{ type: 'text', elementId: 'el-text' }] },
      { pageIndex: 1, sections: [{ type: 'text', elementId: 'el-text' }] },
    ] as any)
    expect(html).toContain('第1页/共2页')
    expect(html).toContain('第2页/共2页')
  })

  it('totalPageCount 覆盖总页数：单页截取场景页码不失真', () => {
    const t = makeAreaTemplate({
      elements: [makeAreaEl('text', { formatter: '第{pageIndex}页/共{totalPages}页' })] as any,
    })
    // 只给第 2 页的 pageLayout，但真实总页数是 5
    const html = generateHtml(t, [
      { pageIndex: 1, sections: [{ type: 'text', elementId: 'el-text' }] },
    ] as any, undefined, { totalPageCount: 5 })
    expect(html).toContain('第2页/共5页')
  })
})

// ─── 文本元素垂直对齐（verticalAlign，与设计器 TextElement 行为一致）───

describe('文本元素 verticalAlign 渲染', () => {
  it('设置 verticalAlign 时输出 flex 垂直对齐 + 水平跟随 textAlign', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [
          makeAreaEl('text', { testData: 'X', textAlign: 'right', verticalAlign: 'middle' }),
        ] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('display:flex')
    expect(html).toContain('align-items:center')
    expect(html).toContain('justify-content:flex-end')
    expect(html).toContain('text-align:right')
  })

  it('未设置 verticalAlign 时不输出 flex（存量模板行为不变）', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [makeAreaEl('text', { testData: 'Y', textAlign: 'right' })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).not.toContain('align-items')
    expect(html).not.toContain('display:flex')
    expect(html).toContain('text-align:right')
  })
})

// ─── 文本元素背景色渲染（设计稿可见、打印稿必须同样可见）───

describe('文本元素 backgroundColor 渲染', () => {
  it('text 元素设置背景色时输出 background-color（与设计稿 TextElement 一致）', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [
          makeAreaEl('text', { testData: 'X', backgroundColor: '#ffd700' }),
        ] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('background-color:#ffd700')
  })

  it('未设置背景色时不输出 background-color（存量模板行为不变）', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [makeAreaEl('text', { testData: 'Y' })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    // 仅断言文本元素自身内联 style 无 background-color（CSS 中 thead th 自带背景，需排除）
    const style = html.match(/print-element" style="([^"]*)">Y<\/div>/)?.[1] ?? ''
    expect(style).not.toContain('background-color')
  })

  it('longText 元素设置背景色时输出 background-color', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [
          makeAreaEl('longText', { testData: '段落', backgroundColor: '#d0e8ff' }),
        ] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('background-color:#d0e8ff')
  })

  it('flow-group 跟随文本元素设置背景色时输出 background-color', () => {
    const t = makeTemplate(flowGroupOptions())
    t.elements.push({ ...followTextEl, options: { ...followTextEl.options, backgroundColor: '#f0f0f0' } } as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1'], groupTop: 10 },
    ]))
    expect(html).toContain('background-color:#f0f0f0')
  })

  it('打印 CSS 声明 print-color-adjust:exact，确保 Chromium 打印/PDF 保留背景色', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [makeAreaEl('text', { testData: 'X', backgroundColor: '#ffd700' })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    // Chromium 默认在打印/导出 PDF 时剔除背景色，必须显式声明才能保留
    expect(html).toContain('-webkit-print-color-adjust: exact')
    expect(html).toContain('print-color-adjust: exact')
  })
})

// ─── 页面(纸张)背景色渲染（预览与打印/PDF 一致）───

describe('页面背景色渲染', () => {
  it('设置 pageBackground 时 .print-page 输出对应 background', () => {
    const t = makeTemplate({}) as TemplateData
    t.pageBackground = '#f2f6ff'
    const html = generateHtml(t, singlePage)
    const pageCss = html.match(/\n\.print-page\s*\{([^}]*min-height:[^}]*)\}/)?.[1] ?? ''
    expect(pageCss).toContain('background: #f2f6ff')
  })

  it('未设置 pageBackground 时 .print-page 默认白色（存量模板行为不变）', () => {
    const t = makeTemplate({}) as TemplateData
    t.pageBackground = undefined
    const html = generateHtml(t, singlePage)
    const pageCss = html.match(/\n\.print-page\s*\{([^}]*min-height:[^}]*)\}/)?.[1] ?? ''
    expect(pageCss).toContain('background: #fff')
  })
})

// ─── 设计背景隔离：仅设计画布可见，渲染 HTML 必须完全不感知 ───

describe('设计背景不进入渲染管线', () => {
  it('模板带 designBackground 时，生成的 HTML/CSS 不包含其图片路径与节点', () => {
    const t = makeTemplate({}) as unknown as TemplateData & {
      designBackground?: { src: string; rotation: number }
    }
    t.designBackground = { src: 'https://host.example.com/scan-form.png', rotation: 90 }
    const html = generateHtml(t, singlePage)
    expect(html).not.toContain('scan-form.png')
    expect(html).not.toContain('designBackground')
    expect(html).not.toContain('design-background')
  })
})

// ─── 文本元素字符间距渲染（设计稿可见、打印稿必须同样可见）───

describe('文本元素 letterSpacing 渲染', () => {
  it('text 元素设置字间距时输出 letter-spacing:pt（与设计稿 TextElement 一致）', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [makeAreaEl('text', { testData: 'X', letterSpacing: 2 })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('letter-spacing:2pt')
  })

  it('未设置字间距时不输出 letter-spacing（存量模板行为不变）', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [makeAreaEl('text', { testData: 'Y' })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    const style = html.match(/print-element" style="([^"]*)">Y<\/div>/)?.[1] ?? ''
    expect(style).not.toContain('letter-spacing')
  })

  it('longText 元素设置字间距时输出 letter-spacing', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [makeAreaEl('longText', { testData: '段落', letterSpacing: 1 })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('letter-spacing:1pt')
  })

  it('pageNumber 元素设置字间距时经 default 分支输出 letter-spacing', () => {
    const t = makeAreaTemplate({
      header: {
        height: 15,
        elements: [makeAreaEl('pageNumber', { title: '{pageIndex}', letterSpacing: 3 })] as any,
      },
    })
    const html = generateHtml(t, singlePage)
    expect(html).toContain('letter-spacing:3pt')
  })
})

// ─── 元素层级 z-index 透传（设计器「层级」与预览/打印一致）───

describe('元素 z-index 渲染', () => {
  it('内容区元素设置 zIndex 时输出 z-index（重叠层序与设计稿一致）', () => {
    const t = makeTemplate({})
    ;(t.elements as any[]) = [
      { id: 'e1', type: 'rect', options: { left: 0, top: 0, width: 50, height: 20, zIndex: 1, borderColor: '#000' } },
      { id: 'e2', type: 'text', options: { left: 10, top: 5, width: 40, height: 8, zIndex: 10, testData: '在上层' } },
    ]
    const html = generateHtml(t, pageWith([
      { elementId: 'e1', type: 'element' },
      { elementId: 'e2', type: 'element' },
    ]))
    expect(html).toContain('z-index:1')
    expect(html).toContain('z-index:10')
  })

  it('未设置 zIndex 时不输出 z-index（存量模板层叠回退 DOM 顺序）', () => {
    const t = makeAreaTemplate({
      header: { height: 15, elements: [makeAreaEl('text', { testData: 'X' })] as any },
    })
    const html = generateHtml(t, singlePage)
    const style = html.match(/print-element" style="([^"]*)">X<\/div>/)?.[1] ?? ''
    expect(style).not.toContain('z-index')
  })

  it('表格元素设置 zIndex 时 print-element 输出 z-index', () => {
    const t = makeTemplate({ ...matrixOptions(), zIndex: 3 })
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 1 },
    ]))
    expect(html).toMatch(/class="print-element"[^>]*z-index:3;/)
  })

  it('测量模式同样输出 z-index', () => {
    const t = makeTemplate({})
    ;(t.elements as any[]) = [
      { id: 'e1', type: 'text', options: { left: 0, top: 0, width: 50, height: 8, zIndex: 7, testData: 'X' } },
    ]
    const html = generateHtml(t, [], undefined, { isMeasurementPass: true })
    expect(html).toContain('z-index:7')
  })
})

// ─── 方案 A+B：flow-group 相对容器渲染 ───

function flowGroupOptions() {
  return {
    left: 10, top: 10, width: 100, height: 24,
    tableColWidths: [100],
    _repeatHeaderCount: 1,
    // 设计模板行：header 8 + data 8 + summary 8 = 24 → 设计底部 34
    tableRows: [
      { type: 'header', height: 8, cells: [] },
      { type: 'data', height: 8, cells: [] },
      { type: 'summary', height: 8, cells: [] },
    ],
    _renderRows: [
      { type: 'header', height: 8, cells: [{ ...baseCell, content: '表头' }] },
      { type: 'data', height: 8, cells: [{ ...baseCell, content: '明细' }] },
    ],
  }
}

const followTextEl = {
  id: 'follow-1', type: 'text',
  options: { left: 12, top: 39, width: 80, height: 8, formatter: '经办人签字', fontSize: 12 },
}

describe('renderFlowGroup 相对容器', () => {
  it('容器按 groupTop 绝对定位，slice 文档流 + 跟随元素绝对定位（保留设计几何）', () => {
    const t = makeTemplate(flowGroupOptions())
    t.elements.push(followTextEl as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1'], groupTop: 10 },
    ]))
    expect(html).toMatch(/class="flow-group"[^>]*position:absolute;left:10mm;top:10mm;width:100mm/)
    expect(html).toContain('class="flow-slice"')
    // 跟随元素绝对定位：left=12−10=2mm，top=39−34=5mm（表格设计底部=10+24）
    expect(html).toMatch(/class="flow-follow"[^>]*position:relative;width:100mm;height:13mm/)
    expect(html).toMatch(/position:absolute;left:2mm;top:5mm;width:80mm;/)
    expect(html).toContain('经办人签字')
  })

  it('跟随区整体移页：flow-group 无 slice，容器从页顶开始', () => {
    const t = makeTemplate(flowGroupOptions())
    t.elements.push(followTextEl as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 0, followElementIds: ['follow-1'], groupTop: 0 },
    ]))
    expect(html).toMatch(/class="flow-group"[^>]*position:absolute;left:10mm;top:0mm/)
    expect(html).not.toContain('class="flow-slice"')
    expect(html).toContain('经办人签字')
  })

  it('多个跟随元素：按设计 top 相对表格底部绝对定位', () => {
    const follow2 = {
      id: 'follow-2', type: 'text',
      options: { left: 12, top: 51, width: 80, height: 8, formatter: '备注' },
    }
    const t = makeTemplate(flowGroupOptions())
    t.elements.push(followTextEl as any, follow2 as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1', 'follow-2'], groupTop: 10 },
    ]))
    // follow-1: top=39−34=5mm；follow-2: top=51−34=17mm（等价旧 margin-top 累积位置）
    expect(html).toMatch(/position:absolute;left:2mm;top:5mm;width:80mm;/)
    expect(html).toMatch(/position:absolute;left:2mm;top:17mm;width:80mm;/)
    expect(html).toContain('备注')
  })

  it('重叠的跟随元素保留设计重叠（不再压缩为块级堆叠）', () => {
    // follow-1 top=39 h=8（底部47），follow-2 top=41 h=8 → 设计上相互重叠
    const follow2 = {
      id: 'follow-2', type: 'text',
      options: { left: 30, top: 41, width: 60, height: 8, formatter: '重叠备注' },
    }
    const t = makeTemplate(flowGroupOptions())
    t.elements.push(followTextEl as any, follow2 as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1', 'follow-2'], groupTop: 10 },
    ]))
    // 两者均按设计坐标绝对定位：top=5mm / top=7mm，left 各自独立 → 重叠保留
    expect(html).toMatch(/position:absolute;left:2mm;top:5mm;width:80mm;/)
    expect(html).toMatch(/position:absolute;left:20mm;top:7mm;width:60mm;/)
    // 不再出现文档流间隙压缩标记
    expect(html).not.toMatch(/margin-top:/)
    expect(html).toContain('重叠备注')
  })

  it('跟随元素设置 zIndex 时输出 z-index，容器输出表格自身层级', () => {
    const t = makeTemplate({ ...flowGroupOptions(), zIndex: 5 })
    t.elements.push({ ...followTextEl, options: { ...followTextEl.options, zIndex: 9 } } as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1'], groupTop: 10 },
    ]))
    expect(html).toMatch(/class="flow-group"[^>]*z-index:5;/)
    expect(html).toMatch(/position:absolute;left:2mm;top:5mm;width:80mm;[^"]*z-index:9;/)
  })

  // T-11 C1：跟随区的 vline 靠 style 里的 height 定长，缺 height 即 0 高整条消失
  it('跟随区竖线保留设计高度（case vline 只出 border-left+width:0，长度全靠 height）', () => {
    const followVline = {
      id: 'follow-1', type: 'vline',
      options: { left: 12, top: 39, width: 1.8, height: 14 },
    }
    const t = makeTemplate(flowGroupOptions())
    t.elements.push(followVline as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1'], groupTop: 10 },
    ]))
    expect(html).toMatch(/position:absolute;left:2mm;top:5mm;width:1.8mm;height:14mm;/)
  })

  it('跟随区矩形/椭圆/图片照旧出 height（正对照，防止改 vline 时挪走既有档）', () => {
    for (const type of ['rect', 'oval', 'image']) {
      const t = makeTemplate(flowGroupOptions())
      t.elements.push({ id: 'follow-1', type, options: { left: 12, top: 39, width: 40, height: 14 } } as any)
      const html = generateHtml(t, pageWith([
        { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1'], groupTop: 10 },
      ]))
      expect(html, type).toMatch(/position:absolute;left:2mm;top:5mm;width:40mm;height:14mm;/)
    }
  })

  it('跟随区横线仍不出 height（hline 的 height:0 是有意为之，别顺手一起改）', () => {
    const t = makeTemplate(flowGroupOptions())
    t.elements.push({ id: 'follow-1', type: 'hline', options: { left: 12, top: 39, width: 80, height: 1.8 } } as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1'], groupTop: 10 },
    ]))
    expect(html).toMatch(/position:absolute;left:2mm;top:5mm;width:80mm;[^"]*"/)
    expect(html).not.toMatch(/top:5mm;width:80mm;height:1.8mm;/)
  })
})

// ─── 同族形态对账：区域元素（页眉/页脚）不该跟着跟随区一起漏 height ───

describe('区域元素的线条高度', () => {
  function withAreaLines(header: any[], footer: any[] = []): TemplateData {
    return {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 20, elements: header },
      footer: { height: 20, elements: footer },
      elements: [],
    } as unknown as TemplateData
  }

  it('页眉 vline 走 elementPositionStyle：height 原样落纸（区别于跟随区那条判据）', () => {
    const html = generateHtml(withAreaLines([
      { id: 'hv', type: 'vline', options: { left: 10, top: 2, width: 1.8, height: 14 }, printElementType: { type: 'vline' } },
    ]), [{ pageIndex: 0, sections: [] }])
    expect(html).toMatch(/width:1\.8mm;height:14mm;[^"]*border-left:0\.75pt solid/)
  })

  it('页眉 hline 末尾仍以 height:0 覆盖（长度走 width），别把它当成缺陷顺手改', () => {
    const html = generateHtml(withAreaLines([
      { id: 'hl', type: 'hline', options: { left: 10, top: 2, width: 80, height: 1.8 }, printElementType: { type: 'hline' } },
    ]), [{ pageIndex: 0, sections: [] }])
    expect(html).toMatch(/width:80mm;height:1\.8mm;[^"]*border-top:0\.75pt solid[^"]*height:0;/)
  })
})

// ─── 小计行 / 汇总行渲染 ───

describe('renderTableSlice 小计/汇总行', () => {
  function subtotalOptions() {
    return {
      ...matrixOptions(),
      _dataRowCtx: [
        { name: 'A', qty: 2 },
        { name: 'B', qty: 3 },
      ],
      _dataStartIdx: 1,
      _mainData: { orderNo: 'SO-1' },
      _subtotalTemplates: [
        { type: 'subtotal', height: 8, cells: [
          { ...baseCell, content: '本页小计：', rawFormatter: '本页小计：', fontWeight: 'bold' },
          { ...baseCell, content: '5', rawFormatter: '{SUM(qty)}', align: 'right' },
        ] },
      ],
      _summaryRows: [
        { type: 'summary', height: 8, cells: [
          { ...baseCell, content: '合计：', fontWeight: 'bold' },
          { ...baseCell, content: '5', align: 'right' },
        ] },
      ],
    }
  }

  it('subtotal 按本片 data 行区间求值，summary 渲染于末尾', () => {
    const t = makeTemplate(subtotalOptions())
    const html = generateHtml(t, pageWith([
      // bodyRows: header(0) + data(1..2)；本片 data 行 1..2 → qty 2+3
      { elementId: 'tbl-1', type: 'table-slice', startRow: 1, endRow: 3, subtotal: true, summary: true },
    ]))
    expect(html).toContain('本页小计：')
    expect(html).toContain('>5</td>')
    expect(html).toContain('合计：')
    expect(html).not.toContain('>品名</td>') // 本片不含 header
  })

  it('subtotal 仅统计本片数据行（非全表）', () => {
    const t = makeTemplate(subtotalOptions())
    const html = generateHtml(t, pageWith([
      // 本片只含 data 行 1（qty=2）→ 小计 2
      { elementId: 'tbl-1', type: 'table-slice', startRow: 1, endRow: 2, subtotal: true },
    ]))
    expect(html).toContain('>2</td>')
    expect(html).not.toContain('>5</td>')
  })

  it('flow-group 空 slice 也能渲染小计/汇总（跟随区移页场景）', () => {
    const t = makeTemplate(subtotalOptions())
    t.elements.push({ id: 'follow-1', type: 'text', options: { left: 12, top: 39, width: 80, height: 8, formatter: '签字' } } as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 3, endRow: 3, summary: true, followElementIds: ['follow-1'], groupTop: 0 },
    ]))
    expect(html).toContain('合计：')
    expect(html).toContain('签字')
  })
})

describe('批量文档拆分函数', () => {
  const tpl = {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [],
  } as unknown as TemplateData

  it('renderFinalPages 只产出 .print-page 序列', () => {
    const html = renderFinalPages(
      tpl,
      [{ pageIndex: 0, sections: [] }, { pageIndex: 1, sections: [] }],
      {},
      {},
    )
    expect(html).not.toContain('<!DOCTYPE')
    expect(html).not.toContain('<head>')
    expect(html).toContain('data-page="1"')
    expect(html).toContain('data-page="2"')
  })

  it('wrapHtmlDocument 包外壳并支持 body class', () => {
    const html = wrapHtmlDocument('/*c*/', '<section class="print-page"></section>', 'continuous')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<style>/*c*/</style>')
    expect(html).toContain('<body class="continuous">')
    expect(html).toContain('<section class="print-page"></section>')
  })
})

// ─── 字体（fontFamily）输出 ───
// 内联样式位于双引号包裹的 style="..." 属性中，字体栈里的族名引号必须转义为 &quot;，
// 否则属性会被提前闭合，整条 font-family 声明丢失（实测：happy-dom 解析后 fontFamily 为空串）。
describe('单元格与文本元素的字体输出', () => {
  const STACK_SUFFIX = '&quot;Microsoft YaHei&quot;, &quot;PingFang SC&quot;, &quot;Helvetica Neue&quot;, Arial, sans-serif'

  it('单元格 fontFamily 输出 font-family 并带全局兜底栈', () => {
    const html = generateHtml(makeTemplate({
      tableColWidths: [100],
      _repeatHeaderCount: 0,
      _renderRows: [
        { type: 'data', height: 8, cells: [{ ...baseCell, content: 'A', fontFamily: 'SimSun' }] },
      ],
    }), pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 1 }]))
    expect(html).toContain(`font-family:&quot;SimSun&quot;, ${STACK_SUFFIX}`)
  })

  it('单元格未设 fontFamily 时不输出 font-family（交还 CSS 继承）', () => {
    const html = generateHtml(makeTemplate({
      tableColWidths: [100],
      _repeatHeaderCount: 0,
      _renderRows: [
        { type: 'data', height: 8, cells: [{ ...baseCell, content: 'A' }] },
      ],
    }), pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 1 }]))
    const td = html.slice(html.indexOf('<td'), html.indexOf('</td>'))
    expect(td).not.toContain('font-family')
  })

  it('单元格未设时继承 tableDefaultFontFamily（与默认字号同一优先级口径）', () => {
    const html = generateHtml(makeTemplate({
      tableColWidths: [100],
      tableDefaultFontFamily: 'SimHei',
      _repeatHeaderCount: 0,
      _renderRows: [
        { type: 'data', height: 8, cells: [{ ...baseCell, content: 'A' }] },
      ],
    }), pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 1 }]))
    expect(html).toContain(`font-family:&quot;SimHei&quot;, ${STACK_SUFFIX}`)
  })

  it('单元格自己的 fontFamily 优先于表格默认字体', () => {
    const html = generateHtml(makeTemplate({
      tableColWidths: [100],
      tableDefaultFontFamily: 'SimHei',
      _repeatHeaderCount: 0,
      _renderRows: [
        { type: 'data', height: 8, cells: [{ ...baseCell, content: 'A', fontFamily: 'SimSun' }] },
      ],
    }), pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 1 }]))
    expect(html).toContain(`font-family:&quot;SimSun&quot;, ${STACK_SUFFIX}`)
    expect(html).not.toContain('&quot;SimHei&quot;')
  })

  it('文本元素 fontFamily 输出转义引号与兜底栈（原为裸值）', () => {
    const t: TemplateData = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] },
      footer: { height: 0, elements: [] },
      elements: [{
        id: 'txt-1', type: 'text',
        options: { left: 0, top: 0, width: 50, height: 10, fontFamily: 'KaiTi', fontSize: 12, formatter: 'HELLO' },
      }] as any,
    } as TemplateData
    const html = generateHtml(t, pageWith([{ elementId: 'txt-1', type: 'element', renderTop: 0 }]))
    expect(html).toContain(`font-family:&quot;KaiTi&quot;, ${STACK_SUFFIX}`)
  })

  it('不输出未转义的裸引号，避免双引号属性被提前闭合', () => {
    const html = generateHtml(makeTemplate({
      tableColWidths: [100],
      _repeatHeaderCount: 0,
      _renderRows: [
        { type: 'data', height: 8, cells: [{ ...baseCell, content: 'A', fontFamily: 'SimSun' }] },
      ],
    }), pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 1 }]))
    expect(html).not.toContain('font-family:"')
    expect(html).not.toContain('font-family:&quot;SimSun&quot;, "')
  })
})

describe('出纸旋转（outputRotation）整页旋转', () => {
  const t: TemplateData = {
    paperSize: 'A4', orientation: 'landscape',
    outputRotation: 90,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{
      id: 'txt-1', type: 'text',
      options: { left: 0, top: 0, width: 50, height: 10, fontSize: 12, formatter: 'HELLO' },
    }] as any,
  } as TemplateData

  it('最终渲染把设计稿整页包进 .print-page-rotor.print-page-rotor-90', () => {
    const html = generateHtml(t, pageWith([{ elementId: 'txt-1', type: 'element', renderTop: 0 }]))
    const rotorIdx = html.indexOf('<div class="print-page-rotor print-page-rotor-90"')
    const elIdx = html.indexOf('<div class="print-element"')
    // 转子元素存在，且内容元素位于转子内部
    expect(rotorIdx).toBeGreaterThanOrEqual(0)
    expect(elIdx).toBeGreaterThan(rotorIdx)
    expect(html).toContain('<div class="content-area">')
  })

  it('旋转 180° / 270° 也包裹对应角度转子类', () => {
    const r180 = generateHtml({ ...t, outputRotation: 180 }, pageWith([{ elementId: 'txt-1', type: 'element', renderTop: 0 }]))
    expect(r180).toContain('<div class="print-page-rotor print-page-rotor-180"')
    const r270 = generateHtml({ ...t, outputRotation: 270 }, pageWith([{ elementId: 'txt-1', type: 'element', renderTop: 0 }]))
    expect(r270).toContain('<div class="print-page-rotor print-page-rotor-270"')
  })

  it('测量趟不包裹转子元素（保证测量尺寸按设计稿）', () => {
    const html = generateHtml(t, [], undefined, { isMeasurementPass: true })
    expect(html).not.toContain('<div class="print-page-rotor"')
  })

  it('无 outputRotation（0°）时最终渲染也不包裹转子', () => {
    const plain = { ...t, outputRotation: undefined } as TemplateData
    const html = generateHtml(plain, pageWith([{ elementId: 'txt-1', type: 'element', renderTop: 0 }]))
    expect(html).not.toContain('<div class="print-page-rotor"')
  })
})

// ─── 元素级边框（非表格元素出纸） ───

describe('元素级边框出纸渲染', () => {
  function elTemplate(el: any): TemplateData {
    return {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] },
      footer: { height: 12, elements: [] },
      elements: [el],
    } as TemplateData
  }

  it('文本元素设 borderWidth 后出纸含 border:2pt dashed #f00 且只出现一次', () => {
    const t = elTemplate({
      id: 'txt-b', type: 'text',
      options: { left: 0, top: 0, width: 50, height: 8, testData: 'X', borderWidth: 2, borderStyle: 'dashed', borderColor: '#f00' },
    })
    const html = generateHtml(t, pageWith([{ elementId: 'txt-b', type: 'element', renderTop: 0 }]))
    expect(html).toContain('border:2pt dashed #f00')
    expect((html.match(/border:2pt dashed #f00/g) ?? []).length).toBe(1)
  })

  it('rect 元素不因元素级边框逻辑出现重复 border 声明', () => {
    const t = elTemplate({
      id: 'rect-b', type: 'rect',
      options: { left: 0, top: 0, width: 50, height: 8, borderWidth: 2, borderColor: '#f00' },
    })
    const html = generateHtml(t, pageWith([{ elementId: 'rect-b', type: 'element', renderTop: 0 }]))
    expect((html.match(/border:2pt solid #f00/g) ?? []).length).toBe(1)
  })

  it('文本元素整圈+分边：先整圈声明、后逐边覆盖，各只一条', () => {
    const t = elTemplate({
      id: 'txt-e', type: 'text',
      options: {
        left: 0, top: 0, width: 50, height: 8, testData: 'X',
        borderWidth: 1,
        borders: { top: { width: 3, style: 'dashed', color: '#f00' } },
      },
    })
    const html = generateHtml(t, pageWith([{ elementId: 'txt-e', type: 'element', renderTop: 0 }]))
    expect(html).toContain('border:1pt solid #000')
    expect(html).toContain('border-top:3pt dashed #f00')
    expect((html.match(/border-top:3pt dashed #f00/g) ?? []).length).toBe(1)
    // 整圈声明必须出现在分边覆盖之前（CSS 后写覆盖前写）
    expect(html.indexOf('border:1pt solid #000')).toBeLessThan(html.indexOf('border-top:3pt dashed #f00'))
  })

  it('文本元素仅分边（无整圈）：只输出该边，不输出 border 简写', () => {
    const t = elTemplate({
      id: 'txt-o', type: 'text',
      options: {
        left: 0, top: 0, width: 50, height: 8, testData: 'X',
        borders: { bottom: { width: 2 } },
      },
    })
    const html = generateHtml(t, pageWith([{ elementId: 'txt-o', type: 'element', renderTop: 0 }]))
    expect(html).toContain('border-bottom:2pt solid #000')
    const el = html.match(/<div class="print-element" style="([^"]*)"/g) ?? []
    expect(el.find(s => s.includes('border-bottom'))).not.toMatch(/;border:/)
  })

  it('rect 设分边字段不出纸（排除口径对 borders 同样生效）', () => {
    const t = elTemplate({
      id: 'rect-e', type: 'rect',
      options: {
        left: 0, top: 0, width: 50, height: 8, borderWidth: 2, borderColor: '#f00',
        borders: { top: { width: 5, style: 'dotted', color: '#00f' } },
      },
    })
    const html = generateHtml(t, pageWith([{ elementId: 'rect-e', type: 'element', renderTop: 0 }]))
    expect(html).not.toContain('border-top:5pt dotted #00f')
  })
})

// ─── 单元格换行与断词口径 ───
// 表达式编辑器（textarea）里的换行符要能落纸成多行；英文单词按整词换行，
// 只有当单词本身就比列宽还长时才在行末兜底切断（Word/WPS 口径）。
describe('单元格换行与断词口径', () => {
  /** 可换行档的三件套声明：pre-wrap 保换行符、normal 保整词、break-word 兜底超长串 */
  const WRAP = 'white-space:pre-wrap;word-break:normal;overflow-wrap:break-word'

  function cellHtml(cellPatch: Record<string, any> = {}): string {
    return generateHtml(makeTemplate({
      tableColWidths: [40, 60],
      _renderRows: [
        { type: 'header', height: 8, cells: [{ ...baseCell, content: '品名' }, { ...baseCell, content: '数量' }] },
        { type: 'data', height: 8, cells: [
          { ...baseCell, content: '12V 100Ah 磷酸铁锂电池\n型号 MB-100', colspan: 2, ...cellPatch },
          { ...baseCell, content: '', merged: true },
        ] },
      ],
    }), pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 2 }]))
  }

  /** 目标格所在行：整页里表头格恒为可换行档，按行切片才钉得住被 patch 的那一格 */
  function cellRow(html: string): string {
    const i = html.indexOf('磷酸铁锂电池')
    return html.slice(html.lastIndexOf('<tr', i), html.indexOf('</tr>', i))
  }

  it('可换行档（默认）输出 pre-wrap + 整词换行 + 超长串兜底', () => {
    expect(cellHtml()).toContain(WRAP)
  })

  it('内联与全局 .print-table 规则都不再出现逐字硬切', () => {
    expect(cellHtml()).not.toContain('word-break:break-all')
  })

  it('换行符原样落在 td 文本里，由 CSS 负责断行', () => {
    expect(cellHtml()).toContain('磷酸铁锂电池\n型号 MB-100')
  })

  it('不换行档逐字保持强制单行（该档语义就是折叠换行符）', () => {
    expect(cellRow(cellHtml({ wordWrap: false }))).toContain('white-space:nowrap;overflow:hidden')
  })
})

describe('repeatOnEveryPage 表格：整表 HTML 每页完整输出', () => {
  it('整表重复消费分页 renderTop，不再回退设计 top', () => {
    const tpl = makeTemplate({ ...matrixOptions(), repeatOnEveryPage: true, top: 12, height: 24 })
    ;(tpl.elements as any[]).push(
      { id: 'body-1', type: 'text', options: { left: 0, top: 0, width: 60, height: 150 } },
      { id: 'body-2', type: 'text', options: { left: 0, top: 150, width: 60, height: 150 } },
    )
    const pages = paginate(tpl, new Map([
      ['tbl-1', { id: 'tbl-1', measuredHeight: 24 }],
      ['body-1', { id: 'body-1', measuredHeight: 150 }],
      ['body-2', { id: 'body-2', measuredHeight: 150 }],
    ]))
    expect(pages[1]!.sections).toContainEqual({ elementId: 'tbl-1', type: 'element', renderTop: 0 })

    const html = generateHtml(tpl, pages)
    const wrappers = [...html.matchAll(/<div class="print-element" style="([^"]+)"[^>]*>\s*<table class="print-table" data-element-id="tbl-1"/g)]
    expect(wrappers).toHaveLength(2)
    expect(wrappers[0]![1]).toContain('top:12mm')
    expect(wrappers[1]![1]).toContain('top:0mm')
    expect(wrappers[0]![1]).not.toContain('height:24mm')
    expect(wrappers[1]![1]).not.toContain('height:24mm')
  })

  it('普通表格设 repeatOnEveryPage 后经分页：两页各自渲染完整表格（无切片），A/B 数据行每页出现', () => {
    const tpl = makeTemplate({ ...matrixOptions(), repeatOnEveryPage: true })
    ;(tpl.elements as any[]).push(
      { id: 'body-1', type: 'text', options: { left: 0, top: 0, width: 60, height: 150 } },
      { id: 'body-2', type: 'text', options: { left: 0, top: 150, width: 60, height: 150 } },
    )
    const pages = paginate(tpl, new Map([
      ['tbl-1', { id: 'tbl-1', measuredHeight: 24 }],
      ['body-1', { id: 'body-1', measuredHeight: 150 }],
      ['body-2', { id: 'body-2', measuredHeight: 150 }],
    ]))
    expect(pages).toHaveLength(2)
    const html = generateHtml(tpl, pages)
    expect((html.match(/data-element-id="tbl-1"/g) ?? [])).toHaveLength(2)
    expect((html.match(/>A<\/td>/g) ?? [])).toHaveLength(2)
    expect((html.match(/>B<\/td>/g) ?? [])).toHaveLength(2)
  })
})

describe('元素四向外边距定位', () => {
  const sections = pageWith([{ elementId: 'tbl-1', type: 'table-slice', startRow: 0, endRow: 0 }])

  it('普通元素输出四边距，缺省模板 HTML 不含新声明', () => {
    const options = { left: 2, top: 17, width: 80, marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4 }
    const html = generateHtml(makeTemplate(options), sections)
    expect(html).toContain('position:absolute;left:2mm;top:17mm;width:80mm;')
    expect(html).toContain('margin-top:1mm;margin-right:2mm;margin-bottom:3mm;margin-left:4mm')
    const legacy = generateHtml(makeTemplate({ left: 2, top: 17, width: 80 }), sections)
    expect(legacy).not.toMatch(/margin-(top|right|bottom|left):/)
  })
})

describe('flow-group 外边距几何', () => {
  it('锚点与成员分别消费自身边距，组容器不重复偏移', () => {
    const t = makeTemplate({
      ...flowGroupOptions(), left: 10, top: 20, width: 100, height: 30,
      marginTop: 3, marginBottom: 4, marginLeft: 2,
    })
    t.elements.push({ id: 'follow-1', type: 'text', options: {
      left: 15, top: 58, width: 80, height: 8,
      marginTop: 5, marginBottom: 2, marginLeft: 1, formatter: '跟随备注',
    } } as any)
    const html = generateHtml(t, pageWith([{
      elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 1,
      followElementIds: ['follow-1'], groupTop: 20,
    }]))
    expect(html).toMatch(/flow-slice" style="[^"]*margin-top:3mm[^"]*margin-left:2mm/)
    expect(html).toMatch(/position:absolute;left:5mm;top:1mm;[^"]*margin-top:5mm[^"]*margin-left:1mm/)
    expect(html).toMatch(/class="flow-follow" style="[^"]*height:16mm/)
    expect(html).not.toMatch(/flow-group" style="[^"]*margin-top/)
  })
})
