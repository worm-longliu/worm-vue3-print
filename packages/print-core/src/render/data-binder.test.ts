import { describe, it, expect } from 'vitest'
import { bindData } from './data-binder.js'
import type { TemplateData } from './types.js'

function makeTemplate(tableOptions: Record<string, any>): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [{ id: 'tbl-1', type: 'table', options: { left: 0, top: 0, width: 150, ...tableOptions } }],
  } as TemplateData
}

const cell = (partial: Record<string, any> = {}) => ({ id: 'c', formatter: '', ...partial })

function dynamicRows() {
  return [
    { id: 'r1', type: 'header', height: 8, repeatOnPage: true, cells: [cell({ formatter: '品名' }), cell({ formatter: '数量' })] },
    { id: 'r2', type: 'data', height: 8, cells: [cell({ formatter: '{name}' }), cell({ formatter: '{qty}' })] },
    { id: 'r3', type: 'summary', height: 8, cells: [cell({ formatter: '合计：' }), cell({ formatter: '{SUM(qty)}' })] },
  ]
}

describe('bindTableData 动态模式', () => {
  it('data 行按列表展开 N 行，header/summary 各保留一行', () => {
    const t = makeTemplate({ tableMode: 'dynamic', tableRows: dynamicRows(), fields: [{ text: 'items', dataSource: 'items' }] })
    const bound = bindData(t, { items: [{ name: 'A', qty: 2 }, { name: 'B', qty: 3 }] })
    const opts = bound.elements[0]!.options
    expect(opts._renderRows.map((r: any) => r.type)).toEqual(['header', 'data', 'data', 'summary'])
    expect(opts._renderRows[1].cells[0].content).toBe('A')
    expect(opts._renderRows[2].cells[1].content).toBe('3')
    expect(opts._repeatHeaderCount).toBe(1)
  })

  it('summary SUM 聚合', () => {
    const t = makeTemplate({ tableMode: 'dynamic', tableRows: dynamicRows(), fields: [{ text: 'items', dataSource: 'items' }] })
    const bound = bindData(t, { items: [{ name: 'A', qty: 2 }, { name: 'B', qty: 3 }] })
    const summaryRow = bound.elements[0]!.options._renderRows[3]
    expect(summaryRow.cells[0].content).toBe('合计：')
    expect(summaryRow.cells[1].content).toBe('5')
  })

  it('summary MONEY(SUM(amount)) 格式化聚合', () => {
    const rows = dynamicRows()
    ;(rows[2]!.cells[1] as any).formatter = '{MONEY(SUM(qty))}'
    const t = makeTemplate({ tableMode: 'dynamic', tableRows: rows, fields: [{ text: 'items', dataSource: 'items' }] })
    const bound = bindData(t, { items: [{ qty: 2 }, { qty: 3 }] })
    expect(bound.elements[0]!.options._renderRows[3].cells[1].content).toBe('5.00')
  })

  it('data 行支持函数 {MONEY(qty)}', () => {
    const rows = dynamicRows()
    ;(rows[1]!.cells[1] as any).formatter = '{MONEY(qty)}'
    const t = makeTemplate({ tableMode: 'dynamic', tableRows: rows, fields: [{ text: 'items', dataSource: 'items' }] })
    const bound = bindData(t, { items: [{ name: 'A', qty: 1299 }] })
    expect(bound.elements[0]!.options._renderRows[1].cells[1].content).toBe('1,299.00')
  })

  it('数据源缺失或非数组时 data 行展开 0 行', () => {
    const t = makeTemplate({ tableMode: 'dynamic', tableRows: dynamicRows(), fields: [{ text: 'items', dataSource: 'items' }] })
    const bound = bindData(t, { items: 'not-array' })
    expect(bound.elements[0]!.options._renderRows.map((r: any) => r.type)).toEqual(['header', 'summary'])
  })

  it('无 printData 时仍生成 _renderRows（data 行 0 行）', () => {
    const t = makeTemplate({ tableMode: 'dynamic', tableRows: dynamicRows(), fields: [{ text: 'items', dataSource: 'items' }] })
    const bound = bindData(t)
    expect(bound.elements[0]!.options._renderRows).toBeDefined()
    expect(bound.elements[0]!.options._repeatHeaderCount).toBe(1)
  })

  it('merged 占位格 content 为空', () => {
    const rows = dynamicRows()
    ;(rows[0]!.cells[0] as any).colspan = 2
    ;(rows[0]!.cells[1] as any).merged = true
    const bound = bindData(makeTemplate({ tableMode: 'dynamic', tableRows: rows, fields: [{ text: 'items', dataSource: 'items' }] }), { items: [] })
    const header = bound.elements[0]!.options._renderRows[0]
    expect(header.cells[0].colspan).toBe(2)
    expect(header.cells[1].merged).toBe(true)
    expect(header.cells[1].content).toBe('')
  })
})

describe('bindTableData 静态模式', () => {
  it('formatter 变量替换', () => {
    const t = makeTemplate({
      tableMode: 'static',
      tableRows: [{ id: 'r1', type: 'static', height: 8, cells: [cell({ formatter: '单号：{orderNo}' }), cell({ formatter: '固定' })] }],
    })
    const bound = bindData(t, { orderNo: 'SO-001' })
    const rows = bound.elements[0]!.options._renderRows
    expect(rows).toHaveLength(1)
    expect(rows[0].cells[0].content).toBe('单号：SO-001')
    expect(rows[0].cells[1].content).toBe('固定')
  })
})

describe('文本元素 formatter 求值', () => {
  it('文本元素 options.formatter 在绑定后求值', () => {
    const tpl = { paperSize: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 }, header: { height: 10, elements: [] }, footer: { height: 10, elements: [] }, firstPageOverlay: { height: 0, elements: [] }, elements: [{ id: 'e1', type: 'text', options: { formatter: '公司：{company.name}' } }] } as any
    const bound = bindData(tpl, { company: { name: '乐檬' } })
    expect(bound.elements[0].options.formatter).toBe('公司：乐檬')
  })
})

describe('bindData 点分路径', () => {
  const mkTpl = (rows: any[]): TemplateData => ({
    paperSize: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] }, footer: { height: 10, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [{
      id: 't1', type: 'table',
      options: { tableMode: 'dynamic', fields: [{ text: '商品', dataSource: 'goods' }],
        tableRows: [
          { id: 'h', type: 'header', height: 8, cells: [{ id: 'c1', formatter: '名称' }] },
          { id: 'd', type: 'data', height: 8, cells: [{ id: 'c2', formatter: '{name}' }] },
          { id: 's', type: 'summary', height: 8, cells: [{ id: 'c3', formatter: '{SUM(amount)} 合计' }] },
        ] },
    }] as any,
    elements_rows: rows,
  } as any)

  it('表格 data 行按字段取值,dataKey=goods', () => {
    const tpl = mkTpl([])
    const data = { goods: [{ name: '手机', amount: 100 }, { name: '壳', amount: 20 }] }
    const bound = bindData(tpl as any, data)
    const renderRows = (bound.elements[0] as any).options._renderRows
    const dataRows = renderRows.filter((r: any) => r.type === 'data')
    expect(dataRows.length).toBe(2)
    expect(dataRows[0].cells[0].content).toBe('手机')
  })
  it('summary sum 聚合', () => {
    const tpl = mkTpl([])
    const data = { goods: [{ name: 'a', amount: 100 }, { name: 'b', amount: 20 }] }
    const bound = bindData(tpl as any, data)
    const summaryRow = (bound.elements[0] as any).options._renderRows.find((r: any) => r.type === 'summary')
    expect(summaryRow.cells[0].content).toContain('120')
  })
  it('变量替换支持点分 {company.name}', () => {
    const tpl = { paperSize: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 }, header: { height: 10, elements: [] }, footer: { height: 10, elements: [] }, firstPageOverlay: { height: 0, elements: [] }, elements: [{ id: 'e1', type: 'text', options: { formatter: '{company.name}' } }] } as any
    const bound = bindData(tpl, { company: { name: '乐檬' } })
    expect(bound.elements[0].options.formatter).toBe('乐檬')
  })
})

describe('printData 数组兼容', () => {
  it('printData 为单元素数组时取首个对象为根数据', () => {
    const tpl = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [{
        id: 't1', type: 'table',
        options: { left: 10, top: 10, width: 100, height: 30, tableMode: 'dynamic',
          tableColWidths: [50, 50],
          fields: [{ dataSource: 'goods' }],
          tableRows: [
            { id: 'h', type: 'header', height: 8, cells: [{ formatter: 'A' }, { formatter: 'B' }] },
            { id: 'd', type: 'data', height: 8, cells: [{ formatter: '{name}' }, { formatter: '{qty}' }] },
          ] },
      }],
    }
    const printData = [{ supplier: { name: 'X' }, goods: [{ name: 'A1', qty: 2 }, { name: 'A2', qty: 3 }] }]
    const bound = bindData(tpl as any, printData as any)
    const rows = (bound.elements![0].options as any)._renderRows
    expect(rows).toHaveLength(3) // header + 2 data
    expect(rows[1].cells[0].content).toBe('A1')
    expect(rows[2].cells[1].content).toBe('3')
  })

  it('data 行 formatter 带列表前缀 {goods.name} 时按当前行取值', () => {
    const tpl = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [{
        id: 't1', type: 'table',
        options: { left: 10, top: 10, width: 100, height: 30, tableMode: 'dynamic',
          tableColWidths: [50, 50], fields: [],
          tableRows: [
            { id: 'd', type: 'data', height: 8, cells: [{ formatter: '{goods.name}' }, { formatter: '{goods.qty}' }] },
          ] },
      }],
    }
    const printData = { goods: [
      { name: '碳钢螺丝 M8', qty: 500 },
      { name: '不锈钢螺母 M10', qty: 200 },
      { name: '弹簧垫圈', qty: 1000 },
    ] }
    const bound = bindData(tpl as any, printData)
    const rows = (bound.elements![0].options as any)._renderRows
    expect(rows).toHaveLength(3)
    expect(rows[0].cells[0].content).toBe('碳钢螺丝 M8')
    expect(rows[0].cells[1].content).toBe('500')
    expect(rows[2].cells[0].content).toBe('弹簧垫圈')
  })

  it('显式 dataSource 配置优先于顶层数组推导', () => {
    const tpl = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [{
        id: 't1', type: 'table',
        options: { left: 10, top: 10, width: 100, height: 30, tableMode: 'dynamic',
          tableColWidths: [50, 50], fields: [], dataSource: 'goods',
          tableRows: [
            { id: 'd', type: 'data', height: 8, cells: [{ formatter: '{name}' }] },
          ] },
      }],
    }
    const printData = { other: [{ name: 'X' }], goods: [{ name: 'A1' }] }
    const bound = bindData(tpl as any, printData)
    const rows = (bound.elements![0].options as any)._renderRows
    expect(rows).toHaveLength(1)
    expect(rows[0].cells[0].content).toBe('A1')
  })

  it('summary 聚合 SUM(goods.amount) 支持列表前缀', () => {
    const tpl = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [{
        id: 't1', type: 'table',
        options: { left: 10, top: 10, width: 100, height: 30, tableMode: 'dynamic',
          tableColWidths: [50, 50], fields: [], dataSource: 'goods',
          tableRows: [
            { id: 's', type: 'summary', height: 8, cells: [{ formatter: '合计:{SUM(goods.amount)}' }] },
          ] },
      }],
    }
    const printData = { goods: [{ amount: 425 }, { amount: 240 }, { amount: 150 }] }
    const bound = bindData(tpl as any, printData)
    const summaryRow = (bound.elements![0].options as any)._renderRows.find((r: any) => r.type === 'summary')
    expect(summaryRow.cells[0].content).toContain('815')
  })

  it('fields 为空时从 printData 顶层推导首个数组为数据源', () => {
    const tpl = {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [{
        id: 't1', type: 'table',
        options: { left: 10, top: 10, width: 100, height: 30, tableMode: 'dynamic',
          tableColWidths: [50, 50], fields: [],
          tableRows: [
            { id: 'd', type: 'data', height: 8, cells: [{ formatter: '{name}' }, { formatter: '{qty}' }] },
          ] },
      }],
    }
    const printData = { goods: [{ name: 'A1', qty: 2 }] }
    const bound = bindData(tpl as any, printData)
    const rows = (bound.elements![0].options as any)._renderRows
    expect(rows).toHaveLength(1)
    expect(rows[0].cells[0].content).toBe('A1')
  })
})

describe('bindData 图片 src', () => {
  function makeImageTemplate(src: string): TemplateData {
    return {
      paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 0, elements: [] },
      elements: [{ id: 'img-1', type: 'image', options: { left: 0, top: 0, width: 30, height: 30, src } }],
    } as TemplateData
  }

  it('{字段} 表达式求值为打印数据中的绝对 URL（动态传参）', () => {
    const t = makeImageTemplate('{photoUrl}')
    const bound = bindData(t, { photoUrl: 'https://x.com/sign.png' })
    expect(bound.elements[0]!.options.src).toBe('https://x.com/sign.png')
  })

  it('相对路径 src 拼接服务端 base URL', () => {
    const t = makeImageTemplate('/docfiles/20260824/1_logo.png')
    const bound = bindData(t, undefined, 'http://localhost:10103')
    expect(bound.elements[0]!.options.src).toBe('http://localhost:10103/docfiles/20260824/1_logo.png')
  })

  it('绝对 URL src 不拼接 base URL', () => {
    const t = makeImageTemplate('https://x.com/logo.png')
    const bound = bindData(t, undefined, 'http://localhost:10103')
    expect(bound.elements[0]!.options.src).toBe('https://x.com/logo.png')
  })

  it('未传 baseUrl 时相对路径保持原样（兼容旧调用）', () => {
    const t = makeImageTemplate('/docfiles/20260824/1_logo.png')
    const bound = bindData(t)
    expect(bound.elements[0]!.options.src).toBe('/docfiles/20260824/1_logo.png')
  })
})

describe('bindTableData 小计行 subtotal', () => {
  function subtotalRows() {
    return [
      { id: 'r1', type: 'header', height: 8, repeatOnPage: true, cells: [cell({ formatter: '品名' }), cell({ formatter: '数量' })] },
      { id: 'r2', type: 'data', height: 8, cells: [cell({ formatter: '{name}' }), cell({ formatter: '{qty}' })] },
      { id: 'r3', type: 'subtotal', height: 8, cells: [cell({ formatter: '本页小计：' }), cell({ formatter: '{SUM(qty)}' })] },
      { id: 'r4', type: 'summary', height: 8, cells: [cell({ formatter: '合计：' }), cell({ formatter: '{SUM(qty)}' })] },
    ]
  }

  it('subtotal 生成占位行（整表聚合）并保留 rawFormatter', () => {
    const t = makeTemplate({ tableMode: 'dynamic', tableRows: subtotalRows(), fields: [{ text: 'items', dataSource: 'items' }] })
    const bound = bindData(t, { items: [{ name: 'A', qty: 2 }, { name: 'B', qty: 3 }] })
    const opts = bound.elements[0]!.options
    // 占位行保留在 _renderRows 末尾供测量高度；顺序 header/data/data/subtotal/summary
    expect(opts._renderRows.map((r: any) => r.type)).toEqual(['header', 'data', 'data', 'subtotal', 'summary'])
    const sub = opts._renderRows[3]
    expect(sub.cells[0].content).toBe('本页小计：')
    expect(sub.cells[1].content).toBe('5') // 占位 = 整表聚合
    expect(sub.cells[1].rawFormatter).toBe('{SUM(qty)}')
  })

  it('每页上下文 _dataRowCtx 与 data 展开行一一对应，dataStartIdx 指向 header 之后', () => {
    const t = makeTemplate({ tableMode: 'dynamic', tableRows: subtotalRows(), fields: [{ text: 'items', dataSource: 'items' }] })
    const bound = bindData(t, { items: [{ name: 'A', qty: 2 }, { name: 'B', qty: 3 }] })
    const opts = bound.elements[0]!.options
    expect(opts._dataRowCtx).toHaveLength(2)
    expect(opts._dataRowCtx[0]).toMatchObject({ name: 'A', qty: 2 })
    expect(opts._dataStartIdx).toBe(1)
    expect(opts._subtotalTemplates).toHaveLength(1)
    expect(opts._subtotalTemplates[0].cells[1].rawFormatter).toBe('{SUM(qty)}')
    expect(opts._summaryRows).toHaveLength(1)
    expect(opts._summaryRows[0].cells[1].content).toBe('5')
  })
})
