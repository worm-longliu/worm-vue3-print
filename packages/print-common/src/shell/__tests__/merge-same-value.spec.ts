// @vitest-environment happy-dom
// 单元格「按值合并」（mergeSameValue）：壳层单元格台开关与表格右键菜单 toggle 的落盘行为
import { describe, it, expect, beforeAll } from 'vitest'
import type { RuntimeElement, TableCell, TableRow } from '@worm-vue3-print/core/designer'
import { DesignerStore } from '../../core/store'
import { FormatToolbar } from '../../core/format'
import { render, h } from '../../core/h'
import type { ShellCtx, ShellState } from '../controls'
import { tableCellGroup } from '../table-props'
import { renderTable, renderTableContextMenu } from '../table'
import type { TableMenuState } from '../table'

beforeAll(() => {
  // happy-dom 不实现 canvas 2d 上下文；jsbarcode 文本测量需要 getContext('2d')
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = function () {
    return { font: '', measureText: (t: string) => ({ width: String(t).length * 8 }) }
  }
})

const rowOf = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll<HTMLElement>('.pd-field'))
    .find(f => (f.querySelector('.pd-label')?.textContent ?? '').includes(text))

function makeStore(rowTypes: TableRow['type'][]): DesignerStore {
  const rows: TableRow[] = rowTypes.map((type, ri) => ({
    id: `r${ri}`, type, height: 8,
    cells: [
      { id: `c${ri}-0`, formatter: 'A' },
      { id: `c${ri}-1`, formatter: 'B' },
    ] as TableCell[],
  }))
  const store = new DesignerStore()
  store.addElement('table', {
    left: 10, top: 10, width: 100, height: 8 * rowTypes.length,
    tableColWidths: [50, 50], tableRows: rows,
  } as never)
  return store
}

function paintPanel(store: DesignerStore, el: RuntimeElement) {
  const host = document.createElement('div')
  const state: ShellState = {
    leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
    openDd: null, collapsedGroups: new Set(), renamingPage: null,
  }
  const ctx: ShellCtx = {
    store, format: new FormatToolbar(store), state,
    repaint: () => { host.replaceChildren(); render(tableCellGroup(ctx, el), host) },
    fire: () => {}, showHelp: true, isEdit: false, host: {},
  }
  ctx.repaint()
  document.body.replaceChildren(host)
  return { host, ctx }
}

describe('壳层单元格台「按值合并」开关', () => {
  it('数据行勾选写入 mergeSameValue', () => {
    const store = makeStore(['data'])
    const el = store.elements[0] as RuntimeElement
    store.setTableSelection({ elementId: el.id, r1: 0, c1: 0, r2: 0, c2: 0 })
    const { host } = paintPanel(store, el)
    const box = rowOf(host, '按值合并')!.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(box.disabled).toBe(false)
    box.checked = true
    box.dispatchEvent(new Event('change'))
    expect((el.options.tableRows![0].cells[0] as TableCell).mergeSameValue).toBe(true)
  })

  it('header 行禁用：checkbox 置灰，label 带理由', () => {
    const store = makeStore(['header'])
    const el = store.elements[0] as RuntimeElement
    store.setTableSelection({ elementId: el.id, r1: 0, c1: 0, r2: 0, c2: 0 })
    const { host } = paintPanel(store, el)
    const field = rowOf(host, '按值合并')!
    const box = field.querySelector('input[type="checkbox"]') as HTMLInputElement
    // 禁用拦截的是用户交互（浏览器不派发 change），程序化 dispatch 不受控
    expect(box.disabled).toBe(true)
    expect(field.querySelector('.pd-label')!.getAttribute('title')).toBe('仅数据行（明细行）支持按值合并')
  })
})

describe('壳层表格右键菜单「按值合并」', () => {
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
  function openMenu(store: DesignerStore, menu: TableMenuState, r: number, c: number) {
    paint(store, () => {}, menu)
    const host = paint(store, () => {}, menu)
    const cells = Array.from(host.querySelectorAll('tr')[r]!.querySelectorAll('td'))
    cells[c]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    expect(menu.visible, '菜单应已打开').toBe(true)
    return paint(store, () => {}, menu)
  }

  const menuItem = (host: HTMLElement, text: string): HTMLElement =>
    Array.from(host.querySelectorAll<HTMLElement>('.table-ctx-menu .menu-item'))
      .find(i => i.textContent?.trim() === text)!

  it('数据行 toggle 写入模型并高亮；header 行置灰且不落盘', () => {
    const store = makeStore(['header', 'data'])
    const menu: TableMenuState = { visible: false, x: 0, y: 0 }
    // header 行：置灰 + 理由，点击不改模型
    let host = openMenu(store, menu, 0, 0)
    let item = menuItem(host, '按值合并')
    expect(item.className).toContain('disabled')
    expect(item.getAttribute('title')).toBe('仅数据行（明细行）支持按值合并')
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect((store.elements[0].options.tableRows![0].cells[0] as TableCell).mergeSameValue).toBeUndefined()
    // data 行：toggle 开 → 模型写入
    host = openMenu(store, menu, 1, 0)
    item = menuItem(host, '按值合并')
    expect(item.className).not.toContain('disabled')
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect((store.elements[0].options.tableRows![1].cells[0] as TableCell).mergeSameValue).toBe(true)
    // 再次打开：active 高亮；再点关
    host = openMenu(store, menu, 1, 0)
    item = menuItem(host, '按值合并')
    expect(item.className).toContain('active')
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect((store.elements[0].options.tableRows![1].cells[0] as TableCell).mergeSameValue).toBe(false)
  })
})
