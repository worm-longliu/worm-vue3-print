// @vitest-environment happy-dom
// 临时验收脚本（跑完即删）：表格渲染 / 右键菜单 / 矩阵操作 / 列宽拖拽 / 单元格码
import { describe, it, expect, beforeAll, vi } from 'vitest'
import type { TableRow } from '@worm-vue3-print/core/designer'
import { DesignerStore } from '../../core/store'
import { render, h } from '../../core/h'
import { abortTableColResize, renderTable, renderTableContextMenu } from '../table'
import type { TableMenuState } from '../table'

beforeAll(() => {
  // happy-dom 不实现 canvas 2d 上下文；jsbarcode 文本测量需要 getContext('2d')
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = function () {
    return { font: '', measureText: (t: string) => ({ width: String(t).length * 8 }) }
  }
})

function makeStore(): DesignerStore {
  const rows: TableRow[] = [
    {
      id: 'r1', type: 'header', height: 8, repeatOnPage: true,
      cells: [
        { id: 'c1', formatter: '列1', align: 'center' },
        { id: 'c2', formatter: '列2' },
        { id: 'c3', formatter: '列3' },
      ],
    },
    {
      id: 'r2', type: 'data', height: 8,
      cells: [
        { id: 'c4', formatter: '{name}' },
        { id: 'c5', formatter: '{qty}', wordWrap: false },
        { id: 'c6', cellType: 'barcode', formatter: '{code}', barcodeType: 'CODE128' },
      ],
    },
    {
      id: 'r3', type: 'summary', height: 8,
      cells: [
        { id: 'c7', formatter: '合计', colspan: 2 },
        { id: 'c8', merged: true },
        { id: 'c9', formatter: '{MONEY(SUM(qty))}', textFit: 'shrink' },
      ],
    },
  ]
  const store = new DesignerStore()
  store.addElement('table', {
    left: 10, top: 10, width: 150, height: 24,
    tableColWidths: [50, 50, 50], tableRows: rows,
  } as never)
  return store
}

function paint(store: DesignerStore, fire: (a: string, arg?: unknown) => void, menu: TableMenuState) {
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const el = store.elements.find(e => e.printElementType.type === 'table')!
  render(h('div', { class: 'print-element', dataset: { elId: el.id } }, [renderTable(el, store, fire)]), host)
  const m = renderTableContextMenu(store, fire, menu)
  if (m !== '') render(m, host)
  return host
}

/** 走真实交互路径打开表格菜单：contextmenu 会登记菜单归属元素并置 visible */
function openMenu(store: DesignerStore, menu: TableMenuState, id: string, r: number, c: number) {
  paint(store, () => {}, menu)
  const host = paint(store, () => {}, menu)
  const cells = Array.from(host.querySelectorAll('tr')[r]!.querySelectorAll('td'))
  cells[c]!.dispatchEvent(mouse('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
  expect(menu.visible, '菜单应已打开').toBe(true)
  void id
  return paint(store, () => {}, menu)
}

function mouse(type: string, init: MouseEventInit = MouseEvent.prototype) {
  return new MouseEvent(type, init as MouseEventInit)
}

describe('表格渲染 DOM 与 canvas 逐字一致', () => {
  it('类名 / 结构 / 内联样式', () => {
    const store = makeStore()
    const host = paint(store, () => {}, { visible: false, x: 0, y: 0 })
    const table = host.querySelector('.print-table')!
    expect(table.className).toBe('print-table design-mode')
    expect(table.querySelector('table')).toBeTruthy()
    expect(table.querySelectorAll('colgroup col')).toHaveLength(3)
    expect(table.querySelector('col')!.getAttribute('style')).toContain('width: 50mm')
    const tds = Array.from(table.querySelectorAll('td'))
    // 第 3 行第 2 列是 merged 占位格 → 不渲染
    expect(tds).toHaveLength(8)
    expect(tds.map(td => td.className)).toEqual([
      '', '', '', 'row-data-bg', 'row-data-bg', 'row-data-bg', '', '',
    ])
    expect(tds[6].getAttribute('colspan')).toBe('2')
    expect(tds[7].textContent).toBe('{MONEY(SUM(qty))}')
    const fit = tds[7].querySelector<HTMLElement>('.cell-fit')!
    expect(fit.dataset.fit).toBe('shrink')
    expect(fit.dataset.fitBase).toBe('10')
    expect(fit.dataset.fitMin).toBe('6')
    expect(fit.getAttribute('style')).toContain('max-height: 6mm')
    // 数据行占位
    expect(tds[3].querySelector('.data-placeholder')!.textContent).toBe('{name}')
    // 徽标
    const badges = Array.from(host.querySelectorAll('.row-badge')).map(b => b.textContent)
    expect(badges).toEqual(['题', '数', '汇'])
    // 列宽手柄
    const handles = Array.from(host.querySelectorAll<HTMLElement>('.col-resize-handle'))
    expect(handles).toHaveLength(3)
    expect(handles.map(x => x.style.left)).toEqual(['50mm', '100mm', '150mm'])
    expect(handles[0].getAttribute('aria-label')).toBe('列宽手柄1')
    expect(handles[0].getAttribute('role')).toBe('separator')
  })

  it('单元格条形码出 svg（码制合法）', () => {
    const store = makeStore()
    const host = paint(store, () => {}, { visible: false, x: 0, y: 0 })
    const code = host.querySelector('.cell-barcode')!
    const svg = code.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBeTruthy()
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges')
    expect(code.querySelector('.cell-barcode-fallback')).toBeNull()
    expect(svg.getAttribute('style')).toContain('width: ')
  })
})

describe('单元格图片 / 二维码', () => {
  it('图片格：无 src 出占位；有 src 出 img；表达式走 demo 数据求值', async () => {
    const store = makeStore()
    const rows = JSON.parse(JSON.stringify(store.elements[0]!.options.tableRows)) as TableRow[]
    rows[0]!.cells[0]!.cellType = 'image'
    delete rows[0]!.cells[0]!.formatter
    rows[0]!.cells[1]!.cellType = 'image'
    rows[0]!.cells[1]!.formatter = 'https://example.com/a.png'
    rows[0]!.cells[2]!.cellType = 'qrcode'
    rows[0]!.cells[2]!.formatter = '{code}'
    store.updateElement(store.elements[0]!.id, { tableRows: rows } as never, false)
    const host = paint(store, () => {}, { visible: false, x: 0, y: 0 })
    const imgs = Array.from(host.querySelectorAll('.cell-image'))
    expect(imgs).toHaveLength(2)
    expect(imgs[0]!.querySelector('.image-placeholder')!.textContent).toBe('图片')
    expect(imgs[1]!.querySelector('img')!.getAttribute('src')).toBe('https://example.com/a.png')
    expect(imgs[1]!.querySelector('img')!.style.maxWidth).toBe('100%')
    // 二维码：dataUrl 异步补 img
    await new Promise(r => setTimeout(r, 300))
    const qr = host.querySelector('.cell-barcode img')
    expect(qr, '二维码应已异步出图').toBeTruthy()
    expect(qr!.getAttribute('alt')).toBe('qrcode')
  })
})

describe('选区与右键菜单', () => {
  it('左键按下设单选区并阻止冒泡；选中格带 cell-selected', () => {
    const store = makeStore()
    const fired: string[] = []
    const menu: TableMenuState = { visible: false, x: 0, y: 0 }
    const host = paint(store, a => fired.push(a), menu)
    const td = host.querySelectorAll('td')[1]
    td.dispatchEvent(mouse('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    expect(store.tableSelection).toEqual({
      elementId: store.elements[0]!.id, r1: 0, c1: 1, r2: 0, c2: 1,
    })
    expect(fired).toContain('table-selection-change')
  })

  it('右键打开菜单，条目顺序/文案/禁用原因与 canvas 一致', () => {
    const store = makeStore()
    const fired: string[] = []
    const menu: TableMenuState = { visible: false, x: 0, y: 0 }
    // 先由菜单渲染登记状态引用
    paint(store, a => fired.push(a), menu)
    const host0 = paint(store, a => fired.push(a), menu)
    const td = host0.querySelectorAll('td')[0]
    td.dispatchEvent(mouse('contextmenu', { bubbles: true, cancelable: true, clientX: 123, clientY: 45 }))
    expect(menu.visible).toBe(true)
    expect(menu.x).toBe(123)
    expect(fired).toContain('table-cell-contextmenu')
    const host = paint(store, a => fired.push(a), menu)
    const m = host.querySelector('.table-ctx-menu')!
    expect(m.getAttribute('style')).toContain('left: 123px')
    expect(m.getAttribute('style')).toContain('top: 45px')
    const labels = Array.from(m.children).map(c => `${c.className}#${c.textContent ?? ''}`)
    expect(labels).toEqual([
      'menu-item#在上方插入行',
      'menu-item#在下方插入行',
      'menu-item#删除行',
      'menu-divider#',
      'menu-item#在左侧插入列',
      'menu-item#在右侧插入列',
      'menu-item#删除列',
      'menu-divider#',
      'menu-item disabled#合并单元格',
      'menu-item disabled#拆分单元格',
      'menu-divider#',
      'menu-group-title#行类型',
      'menu-item active#标题行',
      'menu-item disabled#数据行',
      'menu-item disabled#小计行',
      'menu-item disabled#汇总行',
    ])
    const kids = Array.from(m.children)
    expect(kids[8].getAttribute('title')).toBe('至少选择 2 个单元格')
    // 单选格（第 1 行表头）：数据行已存在 → 由 core 试算给出禁用原因
    expect(kids[13].getAttribute('title')).toBe('数据行已存在（第 2 行），全表最多一行')
  })

  it('表格未选中时右键单元格仍打开菜单，并单选该表格（与 canvas 同口径）', () => {
    const store = makeStore()
    const fired: string[] = []
    const menu: TableMenuState = { visible: false, x: 0, y: 0 }
    const id0 = store.elements[0]!.id
    store.clearSelection()
    const host = paint(store, a => fired.push(a), menu)
    host.querySelectorAll('td')[0]!.dispatchEvent(
      mouse('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    expect(menu.visible, '未选中表格时右键不应无反应').toBe(true)
    expect(fired).toContain('table-cell-contextmenu')
    expect(store.selectedIds.has(id0)).toBe(true)
  })

  it('单格选区不可合并；两格可选后可合并', () => {
    const store = makeStore()
    const menu: TableMenuState = { visible: false, x: 0, y: 0 }
    const id0 = store.elements[0]!.id
    const opened = openMenu(store, menu, id0, 0, 0)
    expect(Array.from(opened.querySelector('.table-ctx-menu')!.children)[8].className).toContain('disabled')
    store.tableSelection = { elementId: id0, r1: 0, c1: 0, r2: 0, c2: 1 }
    menu.visible = true
    const host2 = paint(store, () => {}, menu)
    const merge = Array.from(host2.querySelector('.table-ctx-menu')!.children)[8] as HTMLElement
    expect(merge.className).toBe('menu-item')
    merge.dispatchEvent(mouse('click', { bubbles: true }))
    const rows = store.elements[0]!.options.tableRows as TableRow[]
    expect(rows[0]!.cells[0]!.colspan).toBe(2)
    expect(rows[0]!.cells[1]!.merged).toBe(true)
    expect(menu.visible).toBe(false)
  })

  it('行类型：汇总行改小计行生效；禁用项点击不改数据', () => {
    const store = makeStore()
    const alertSpy = vi.fn()
    ;(globalThis as unknown as { alert: (m: string) => void }).alert = alertSpy
    const menu: TableMenuState = { visible: true, x: 0, y: 0 }
    const id = store.elements[0]!.id
    store.tableSelection = { elementId: id, r1: 2, c1: 0, r2: 2, c2: 0 }
    let host = openMenu(store, menu, id, 2, 0)
    Array.from(host.querySelector('.table-ctx-menu')!.children)[14].dispatchEvent(mouse('click', { bubbles: true }))
    expect((store.elements[0]!.options.tableRows as TableRow[])[2]!.type).toBe('subtotal')
    store.tableSelection = { elementId: id, r1: 0, c1: 0, r2: 0, c2: 0 }
    host = openMenu(store, menu, id, 0, 0)
    const subtotalItem = Array.from(host.querySelector('.table-ctx-menu')!.children)[14] as HTMLElement
    expect(subtotalItem.className).toContain('disabled')
    expect(subtotalItem.getAttribute('title')).toBe('小计/汇总行必须位于数据行之后')
    subtotalItem.dispatchEvent(mouse('click', { bubbles: true }))
    expect((store.elements[0]!.options.tableRows as TableRow[])[0]!.type).toBe('header')
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('插入列超打印范围宽度：拒绝且不改数据', () => {
    const store = makeStore()
    store.updateTemplateData({ width: 100 } as never)
    const alertSpy = vi.fn()
    ;(globalThis as unknown as { alert: (m: string) => void }).alert = alertSpy
    const menu: TableMenuState = { visible: false, x: 0, y: 0 }
    const id = store.elements[0]!.id
    const host = openMenu(store, menu, id, 0, 0)
    Array.from(host.querySelector('.table-ctx-menu')!.children)[4].dispatchEvent(mouse('click', { bubbles: true }))
    expect(store.elements[0]!.options.tableColWidths).toHaveLength(3)
    expect(alertSpy.mock.calls[0]?.[0]).toContain('超过打印范围宽度')
  })
})

describe('列宽拖拽', () => {
  it('拖拽改列宽并保持边界跟随光标；结束同步元素尺寸并记历史', () => {
    const store = makeStore()
    const fired: string[] = []
    const host = paint(store, a => fired.push(a), { visible: false, x: 0, y: 0 })
    const handle = host.querySelectorAll('.col-resize-handle')[0] as HTMLElement
    handle.dispatchEvent(mouse('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 100 }))
    expect(handle.className).toContain('dragging')
    document.dispatchEvent(mouse('mousemove', { clientX: 100 + 3.7795275591 * 10 }))
    const widths = store.elements[0]!.options.tableColWidths as number[]
    expect(widths[0]).toBeCloseTo(60, 0)
    expect((host.querySelector('col') as HTMLElement).style.width).toBe('60mm')
    expect((host.querySelectorAll('.col-resize-handle')[0] as HTMLElement).style.left).toBe('60mm')
    document.dispatchEvent(mouse('mouseup', {}))
    expect(handle.className).not.toContain('dragging')
    expect(store.elements[0]!.options.width).toBeCloseTo(160, 0)
    expect(store.canUndo).toBe(true)
    expect(fired).toContain('table-col-resize-end')
    store.undo()
    expect((store.elements[0]!.options.tableColWidths as number[])[0]).toBe(50)
    abortTableColResize()
  })
})
