// print-core/src/render/html-generator.test.ts
import { describe, it, expect } from 'vitest'
import { generateHtml } from './html-generator.js'
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

function makeTemplate(tableOptions: Record<string, any>): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [{ id: 'tbl-1', type: 'table', options: { left: 0, top: 0, width: 100, ...tableOptions } } as any],
  }
}

const baseCell = { rowspan: 1, colspan: 1, merged: false }

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
    firstPageOverlay: { height: 0, elements: [] },
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
    expect(html).toContain('border-top:1px solid #000')
    expect(html).toContain('border:2px solid #f00')
    expect(html).toContain('border-radius:50%')
  })

  it('页脚条码经 CodeRenderer 渲染为 SVG 图片（URL 编码 data URI）', () => {
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', { testData: 'BC-001' })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer() })
    expect(html).toContain('<img src="data:image/svg+xml;charset=utf-8,')
    expect(html).toContain(encodeURIComponent('data-test-code="barcode"'))
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
    expect(html).not.toContain('<img src="data:image/svg+xml')
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
    expect(html).not.toContain('<img src="data:image/svg+xml')
  })

  it('条形码元素等比填满元素框（object-fit:contain）并透传 barWidth', () => {
    let captured: CodeRenderOptions = {}
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('barcode', { testData: '12345678', barWidth: 4 })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer(o => { captured = o }) })
    expect(html).toContain('object-fit:contain')
    expect(captured.barWidth).toBe(4)
  })

  it('二维码元素保持原 shrink-to-fit（不含 object-fit:contain）', () => {
    const t = makeAreaTemplate({
      footer: {
        height: 12,
        elements: [makeAreaEl('qrcode', { testData: 'qrcode-x' })] as any,
      },
    })
    const html = generateHtml(t, singlePage, undefined, { codeRenderer: stubRenderer() })
    expect(html).toContain(encodeURIComponent('data-test-code="qrcode"'))
    expect(html).toContain('max-width:100%;max-height:100%')
    expect(html).not.toContain('object-fit:contain')
  })

  it('表格单元格条形码等比填满单元格（object-fit:contain）', () => {
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
    ]), undefined, { codeRenderer: stubRenderer() })
    expect(html).toContain('<img src="data:image/svg+xml;charset=utf-8,')
    expect(html).toContain('object-fit:contain')
    expect(html).not.toContain('max-width:100%;max-height:100%')
  })

  it('表格单元格二维码保持原 shrink-to-fit（不含 object-fit:contain）', () => {
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
    expect(html).toContain('max-width:100%;max-height:100%')
    expect(html).not.toContain('object-fit:contain')
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
    expect(footerCss).toContain('left: 0')
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
  it('容器按 groupTop 绝对定位，slice 与跟随元素文档流排布', () => {
    const t = makeTemplate(flowGroupOptions())
    t.elements.push(followTextEl as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1'], groupTop: 10 },
    ]))
    expect(html).toMatch(/class="flow-group"[^>]*position:absolute;left:10mm;top:10mm;width:100mm/)
    expect(html).toContain('class="flow-slice"')
    // 跟随元素相对定位：left=12−10=2mm，margin-top=39−34=5mm
    expect(html).toMatch(/position:relative;left:2mm;width:80mm;margin-top:5mm/)
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

  it('多个跟随元素：间距按设计 Y 差值依次累加', () => {
    const follow2 = {
      id: 'follow-2', type: 'text',
      options: { left: 12, top: 51, width: 80, height: 8, formatter: '备注' },
    }
    const t = makeTemplate(flowGroupOptions())
    t.elements.push(followTextEl as any, follow2 as any)
    const html = generateHtml(t, pageWith([
      { elementId: 'tbl-1', type: 'flow-group', startRow: 0, endRow: 2, followElementIds: ['follow-1', 'follow-2'], groupTop: 10 },
    ]))
    // follow-1: margin-top=5（39−34）；follow-2: margin-top=4（51−47）
    expect(html).toMatch(/margin-top:5mm/)
    expect(html).toMatch(/margin-top:4mm/)
    expect(html).toContain('备注')
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
