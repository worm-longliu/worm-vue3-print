// web/src/components/print/__tests__/TableElement.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'

import TableElement from '../components/elements/TableElement.vue'
import TableContextMenu from '../components/elements/TableContextMenu.vue'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'
import { SELECTED_IDS_KEY } from '../composables/useSelection'
import type { RuntimeElement, TableSelection } from '@worm-vue3-print/core/designer'

function makeElement(): RuntimeElement {
  return {
    id: 'el-table',
    options: {
      left: 0,
      top: 0,
      width: 50,
      height: 10,
      tableColWidths: [50],
      tableRows: [{
        id: 'row-1',
        type: 'header',
        height: 10,
        cells: [{ id: 'cell-1', formatter: '名称' }],
      }],
    },
    printElementType: { type: 'table', title: '表格' },
  }
}

describe('TableElement 表格操作提示', () => {
  it('删除最后一行失败时使用浏览器 alert 提示', async () => {
    const alert = vi.fn()
    Object.defineProperty(window, 'alert', { value: alert, configurable: true, writable: true })
    const tableSelection = ref<TableSelection | null>({
      elementId: 'el-table',
      r1: 0,
      c1: 0,
      r2: 0,
      c2: 0,
    })
    const wrapper = mount(TableElement, {
      props: { element: makeElement(), designMode: true },
      global: {
        provide: {
          [TABLE_EDIT_KEY]: {
            tableSelection,
            setTableSelection: () => {},
            recordHistory: () => {},
            maxTableWidth: ref(Infinity),
          },
        },
      },
    })

    wrapper.findComponent(TableContextMenu).vm.$emit('action', 'delete-row')
    await nextTick()

    expect(alert).toHaveBeenCalledWith('不能删除最后一行')
  })
})

describe('TableElement 设计态实测尺寸自愈', () => {
  const PX_PER_MM = 3.7795275591

  function mountTable(element: RuntimeElement, isSelected = true) {
    const tableSelection = ref<TableSelection | null>(null)
    return mount(TableElement, {
      props: { element, designMode: true, isSelected },
      global: {
        provide: {
          [TABLE_EDIT_KEY]: {
            tableSelection,
            setTableSelection: (s: TableSelection | null) => { tableSelection.value = s },
            recordHistory: () => {},
            maxTableWidth: ref(Infinity),
          },
        },
      },
    })
  }

  /** 模拟浏览器真实布局：表格/行的实测像素尺寸（px） */
  function mockLayout(wrapper: ReturnType<typeof mountTable>, tableMm: number, rowMms: number[]) {
    const table = wrapper.find('table').element as HTMLTableElement
    let acc = 0
    Array.from(table.rows).forEach((tr, i) => {
      const h = (rowMms[i] ?? 0) * PX_PER_MM
      Object.defineProperty(tr, 'offsetTop', { value: acc, configurable: true })
      Object.defineProperty(tr, 'offsetHeight', { value: h, configurable: true })
      acc += h
    })
    Object.defineProperty(table, 'offsetTop', { value: 0, configurable: true })
    Object.defineProperty(table, 'offsetHeight', {
      value: tableMm * PX_PER_MM, configurable: true,
    })
  }

  it('内容撑高表格后，options.height 回写为 <table> 实测高度（mm）', async () => {
    const element = reactive(makeElement()) // 模型高度 10mm（行高和 10mm）
    const wrapper = mountTable(element)
    await nextTick()

    // 真实浏览器中内容换行把表格撑到 12.31mm
    mockLayout(wrapper, 12.31, [12.31])
    element.options.tableRows![0]!.height = 12 // 触发任意 options 变更 → post 钩子实测
    await nextTick()

    expect(element.options.height).toBeCloseTo(12.31, 1)
  })

  it('实测高度与模型一致（差 ≤ 0.1mm）时不回写，避免抖动', async () => {
    const element = reactive(makeElement())
    const wrapper = mountTable(element)
    await nextTick()

    mockLayout(wrapper, 10.05, [10.05])
    element.options.tableRows![0]!.height = 11
    await nextTick()

    expect(element.options.height).toBe(10)
  })

  it('无布局环境（offsetHeight=0）跳过实测，不改动模型高度', async () => {
    const element = reactive(makeElement())
    mountTable(element)
    await nextTick()
    element.options.tableRows![0]!.height = 13
    await nextTick()
    expect(element.options.height).toBe(10)
  })

  it('行被撑高时，行类型徽标按实测位置/高度对齐', async () => {
    const element = reactive(makeElement())
    const wrapper = mountTable(element)
    await nextTick()

    // 模型：单行 10mm；实测：12.31mm
    mockLayout(wrapper, 12.31, [12.31])
    element.options.tableRows![0]!.height = 12
    await nextTick()

    const badge = wrapper.find('.row-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('style')).toContain('top: 0mm')
    expect(badge.attributes('style')).toContain('height: 12.31mm')
  })

  it('非设计态不进行实测回写', async () => {
    const element = reactive(makeElement())
    const tableSelection = ref<TableSelection | null>(null)
    const wrapper = mount(TableElement, {
      props: { element, designMode: false, isSelected: false },
      global: {
        provide: {
          [TABLE_EDIT_KEY]: {
            tableSelection,
            setTableSelection: () => {}, recordHistory: () => {}, maxTableWidth: ref(Infinity),
          },
        },
      },
    })
    await nextTick()
    mockLayout(wrapper, 99, [99])
    element.options.tableRows![0]!.height = 12
    await nextTick()
    expect(element.options.height).toBe(10)
  })
})

describe('TableElement 列宽拖拽', () => {
  function makeTableElement(cols: number[]): RuntimeElement {
    return {
      id: 'el-table',
      options: {
        left: 0, top: 0,
        width: cols.reduce((s, w) => s + w, 0),
        height: 10,
        tableColWidths: cols,
        tableRows: [{
          id: 'row-1',
          type: 'header',
          height: 10,
          cells: cols.map((_, i) => ({ id: `cell-${i}`, formatter: `列${i + 1}` })),
        }],
      },
      printElementType: { type: 'table', title: '表格' },
    }
  }

  function mountTable(overrides: {
    element?: RuntimeElement
    selected?: boolean
    designMode?: boolean
    maxW?: number
    scale?: number
  } = {}) {
    const recordHistory = vi.fn()
    const tableSelection = ref<TableSelection | null>(null)
    const wrapper = mount(TableElement, {
      props: {
        element: overrides.element ?? makeTableElement([40, 40, 40]),
        designMode: overrides.designMode ?? true,
        isSelected: overrides.selected ?? true,
        scale: overrides.scale ?? 1,
      },
      global: {
        provide: {
          [TABLE_EDIT_KEY]: {
            tableSelection,
            setTableSelection: () => {},
            recordHistory,
            maxTableWidth: ref(overrides.maxW ?? Infinity),
          },
        },
      },
    })
    return { wrapper, recordHistory }
  }

  it('选中+设计态时，内部列边界与最后一列右边界都渲染拖拽手柄', () => {
    const { wrapper } = mountTable()
    expect(wrapper.findAll('.col-resize-handle')).toHaveLength(3)
  })

  it('未选中/锁定/非设计态时不渲染手柄', () => {
    expect(mountTable({ selected: false }).wrapper.findAll('.col-resize-handle')).toHaveLength(0)
    const locked = makeTableElement([40, 40, 40])
    locked.options.locked = true
    expect(mountTable({ element: locked }).wrapper.findAll('.col-resize-handle')).toHaveLength(0)
    expect(mountTable({ designMode: false }).wrapper.findAll('.col-resize-handle')).toHaveLength(0)
  })

  it('单一列表格仅在右边界渲染一个手柄', () => {
    expect(mountTable({ element: makeTableElement([40]) }).wrapper.findAll('.col-resize-handle')).toHaveLength(1)
  })

  it('拖拽手柄按位移（px/scale）修改目标列宽，其余列不变，mouseup 记一次历史', async () => {
    const element = reactive(makeTableElement([40, 40, 40]))
    const { wrapper, recordHistory } = mountTable({ element, scale: 1 })
    const handle = wrapper.findAll('.col-resize-handle')[0]!
    await handle.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140 })) // dx=40px → 40/3.78≈10.58mm
    expect(element.options.tableColWidths[0]).toBe(50.6) // 40 + 10.58，四舍五入到 0.1mm
    expect(element.options.tableColWidths[1]).toBe(40)
    expect(element.options.tableColWidths[2]).toBe(40)
    expect(recordHistory).not.toHaveBeenCalled() // 拖拽过程中不记历史
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(recordHistory).toHaveBeenCalledTimes(1)
    expect(element.options.width).toBe(130.6) // 列宽和同步
  })

  it('scale 折算位移：scale=2 时 40px → 约 5.29mm', async () => {
    const element = reactive(makeTableElement([40, 40, 40]))
    const { wrapper } = mountTable({ element, scale: 2 })
    const handle = wrapper.findAll('.col-resize-handle')[0]!
    await handle.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140 }))
    expect(element.options.tableColWidths[0]).toBe(45.3) // 40 + 40/(2*3.78)≈5.29，四舍五入到 0.1mm
    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('拖拽受 maxTableWidth 钳制：总宽不超过打印范围宽度', async () => {
    const element = reactive(makeTableElement([40, 40, 40]))
    const { wrapper } = mountTable({ element, maxW: 120 })
    const handle = wrapper.findAll('.col-resize-handle')[0]!
    await handle.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 })) // dx=200px → 200/3.78≈52.9mm
    expect(element.options.tableColWidths[0]).toBe(40) // 120 - 40 - 40
    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('内部列边界向左拖：左侧第 i-1 列变窄、边界跟随光标，mouseup 同步元素尺寸', async () => {
    const element = reactive(makeTableElement([40, 40, 40]))
    const { wrapper, recordHistory } = mountTable({ element })
    const handle = wrapper.findAll('.col-resize-handle')[0]!
    await handle.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 })) // dx=-100px → -100/3.78≈-26.46mm
    expect(element.options.tableColWidths[0]).toBe(13.5) // 40 - 26.46，四舍五入到 0.1mm
    expect(element.options.tableColWidths[1]).toBe(40) // 右侧列不动
    expect(element.options.tableColWidths[2]).toBe(40)
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(recordHistory).toHaveBeenCalledTimes(1)
    expect(element.options.width).toBe(93.5) // 13.5 + 40 + 40
  })

  it('内部列边界向左拖到最小列宽 5mm 时被钳制', async () => {
    const element = reactive(makeTableElement([40, 40, 40]))
    const { wrapper } = mountTable({ element })
    const handle = wrapper.findAll('.col-resize-handle')[0]!
    await handle.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -300 })) // dx=-400px → -400/3.78≈-105.83mm
    expect(element.options.tableColWidths[0]).toBe(5) // 40 - 105.83 被钳制到最小列宽
    expect(element.options.tableColWidths[1]).toBe(40)
    expect(element.options.tableColWidths[2]).toBe(40)
    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('中间列边界向左拖：左侧第 i-1 列变窄、右侧列不变', async () => {
    const element = reactive(makeTableElement([40, 40, 40]))
    const { wrapper } = mountTable({ element })
    const handle = wrapper.findAll('.col-resize-handle')[1]! // 第 2/3 列之间
    await handle.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 })) // dx=-40px → -40/3.78≈-10.58mm
    expect(element.options.tableColWidths[0]).toBe(40)
    expect(element.options.tableColWidths[1]).toBe(29.4) // 40 - 10.58
    expect(element.options.tableColWidths[2]).toBe(40)
    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('末列右边界向左拖缩窄末列，不低于最小列宽 5mm', async () => {
    const element = reactive(makeTableElement([40, 40, 40]))
    const { wrapper } = mountTable({ element })
    const last = wrapper.findAll('.col-resize-handle')[2]!
    await last.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -100 })) // dx=-200px → -200/3.78≈-52.92mm
    expect(element.options.tableColWidths).toEqual([40, 40, 5]) // 40 - 52.92 被钳制到最小列宽
    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('最后一列右边界手柄可拖拽，调整末列宽度并同步元素尺寸', async () => {
    const element = reactive(makeTableElement([40, 40, 40]))
    const { wrapper, recordHistory } = mountTable({ element })
    const last = wrapper.findAll('.col-resize-handle')[2]!
    await last.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140 })) // dx=40px → 40/3.78≈10.58mm
    expect(element.options.tableColWidths).toEqual([40, 40, 50.6])
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(recordHistory).toHaveBeenCalledTimes(1)
    expect(element.options.width).toBe(130.6) // 40 + 40 + 50.6
  })

  it('末列右边界拖拽受 maxTableWidth 钳制', async () => {
    const element = reactive(makeTableElement([40, 40, 40]))
    const { wrapper } = mountTable({ element, maxW: 120 })
    const last = wrapper.findAll('.col-resize-handle')[2]!
    await last.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 })) // dx=200px → 200/3.78≈52.9mm
    expect(element.options.tableColWidths[0]).toBe(40)
    expect(element.options.tableColWidths[2]).toBe(40) // 120 - 40 - 40
    document.dispatchEvent(new MouseEvent('mouseup'))
  })
})

describe('TableElement 单元格文字溢出显示形式', () => {
  /** 单列单行表格：行高 8mm、默认内边距 1mm → 可用内容高度 6mm */
  function makeFitElement(cell: Record<string, any> = {}): RuntimeElement {
    return {
      id: 'el-table-fit',
      options: {
        left: 0,
        top: 0,
        width: 50,
        height: 8,
        tableColWidths: [50],
        tableDefaultFontSize: 10,
        tableDefaultPadding: 1,
        tableRows: [{
          id: 'row-1',
          type: 'header',
          height: 8,
          cells: [{ id: 'cell-1', formatter: '内容', ...cell }],
        }],
      },
      printElementType: { type: 'table', title: '表格' },
    }
  }

  function mountFitTable(element: RuntimeElement) {
    return mount(TableElement, {
      props: { element, designMode: true },
      global: {
        provide: {
          [TABLE_EDIT_KEY]: {
            tableSelection: ref<TableSelection | null>(null),
            setTableSelection: () => {},
            recordHistory: () => {},
            maxTableWidth: ref(Infinity),
          },
        },
      },
    })
  }

  it('自适应行高（默认）：不加定高容器，由行自身撑高', () => {
    const wrapper = mountFitTable(makeFitElement())
    expect(wrapper.find('.cell-fit').exists()).toBe(false)
    expect(wrapper.find('td').text()).toBe('内容')
  })

  it('截断：内容包定高容器（max-height = 可用高度）并裁剪', () => {
    const wrapper = mountFitTable(makeFitElement({ textFit: 'clip' }))
    const box = wrapper.find('.cell-fit')
    expect(box.exists()).toBe(true)
    const style = (box.attributes('style') ?? '').replace(/\s/g, '')
    expect(style).toContain('max-height:6mm')
    expect(style).toContain('overflow:hidden')
    expect(box.attributes('data-fit')).toBeUndefined()
  })

  it('截断 + 不换行：单行省略号', () => {
    const wrapper = mountFitTable(makeFitElement({ textFit: 'clip', wordWrap: false }))
    const style = (wrapper.find('.cell-fit').attributes('style') ?? '').replace(/\s/g, '')
    expect(style).toContain('white-space:nowrap')
    expect(style).toContain('text-overflow:ellipsis')
  })

  it('自动缩小：带行定位标记与基准字号，供画布二分适配', () => {
    const wrapper = mountFitTable(makeFitElement({ textFit: 'shrink' }))
    const box = wrapper.find('.cell-fit')
    expect(box.attributes('data-fit')).toBe('shrink')
    expect(box.attributes('data-fit-base')).toBe('10')
    expect(box.attributes('data-fit-min')).toBe('6')
    // 可用高度 6mm 由同一函数换算（与打印端 data-fit-mm 同口径）
    expect(box.attributes('data-fit-mm')).toBe('6')
  })

  it('单元格级字号优先作为自动缩小基准', () => {
    const wrapper = mountFitTable(makeFitElement({ textFit: 'shrink', fontSize: 14, shrinkMinFontSize: 9 }))
    const box = wrapper.find('.cell-fit')
    expect(box.attributes('data-fit-base')).toBe('14')
    expect(box.attributes('data-fit-min')).toBe('9')
  })
})

// 表格右键菜单逐项测试：打开条件 + 每个菜单项对表格结构的实际效果。
// 历史 bug：未选中表格时单元格右键被 isSelected 守卫吞掉（表格层 stopPropagation
// 又挡住了元素菜单），表现为右键「完全无反应」。
describe('TableElement 右键菜单', () => {
  function makeMenuTable(): RuntimeElement {
    return reactive({
      id: 'el-table',
      options: {
        left: 0, top: 0, width: 60, height: 20,
        tableColWidths: [30, 30],
        tableRows: [
          { id: 'r0', type: 'header', height: 10, cells: [{ id: 'a0', formatter: 'A' }, { id: 'b0', formatter: 'B' }] },
          { id: 'r1', type: 'data', height: 10, cells: [{ id: 'a1', formatter: '1' }, { id: 'b1', formatter: '2' }] },
        ],
      },
      printElementType: { type: 'table', title: '表格' },
    } as unknown as RuntimeElement)
  }

  function mountMenuTable(opts: { selected?: boolean } = {}) {
    const element = makeMenuTable()
    const tableSelection = ref<TableSelection | null>(null)
    const selectedIds = ref<Set<string>>(opts.selected === false ? new Set() : new Set(['el-table']))
    const recordHistory = vi.fn()
    const wrapper = mount(TableElement, {
      props: { element, designMode: true, isSelected: opts.selected ?? true, scale: 1 },
      global: {
        provide: {
          [TABLE_EDIT_KEY]: {
            tableSelection,
            setTableSelection: (s: TableSelection | null) => { tableSelection.value = s },
            recordHistory,
            maxTableWidth: ref(Infinity),
          },
          [SELECTED_IDS_KEY as symbol]: selectedIds,
        },
      },
    })
    return { wrapper, element, tableSelection, selectedIds, recordHistory }
  }

  // 菜单经 Teleport 挂到 body：用 document 查询，并在每个用例前清理残留节点
  beforeEach(() => {
    document.querySelectorAll('.table-ctx-menu').forEach(n => n.remove())
  })

  function menuItems(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.table-ctx-menu .menu-item')) as HTMLElement[]
  }

  async function openMenu(wrapper: ReturnType<typeof mount>, r: number, c: number) {
    await wrapper.findAll('td')[r * 2 + c]!.trigger('contextmenu', { clientX: 50, clientY: 50 })
  }

  async function clickMenuItem(text: string) {
    const item = menuItems().find(i => i.textContent?.trim() === text)
    if (!item) throw new Error(`表格菜单项不存在: ${text}`)
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
  }

  it('单元格右键打开菜单：全部命令项齐全', async () => {
    const { wrapper } = mountMenuTable()
    await openMenu(wrapper, 0, 0)
    expect(menuItems().map(i => i.textContent?.trim())).toEqual([
      '在上方插入行', '在下方插入行', '删除行',
      '在左侧插入列', '在右侧插入列', '删除列',
      '合并单元格', '拆分单元格',
      '标题行', '数据行', '小计行', '汇总行',
    ])
  })

  it('表格未选中时单元格右键同样打开菜单，并单选本表格（历史 bug：无反应）', async () => {
    const { wrapper, tableSelection, selectedIds } = mountMenuTable({ selected: false })
    await openMenu(wrapper, 1, 1)
    expect(document.querySelector('.table-ctx-menu')).toBeTruthy()
    expect(tableSelection.value).toMatchObject({ r1: 1, c1: 1, r2: 1, c2: 1 })
    expect(selectedIds.value).toEqual(new Set(['el-table']))
  })

  it('在上方/下方插入行', async () => {
    const { wrapper, element } = mountMenuTable()
    await openMenu(wrapper, 1, 0)
    await clickMenuItem('在上方插入行')
    expect(element.options.tableRows).toHaveLength(3)
    expect(element.options.tableRows![1].cells.every(c => !c.formatter)).toBe(true) // 新行空内容
    await openMenu(wrapper, 1, 0)
    await clickMenuItem('在下方插入行')
    expect(element.options.tableRows).toHaveLength(4)
    expect(element.options.height).toBeCloseTo(10 * 4, 1) // 行高和同步元素尺寸
  })

  it('删除行：仅删命中行所在选区首行；最后一行置灰无效', async () => {
    const { wrapper, element } = mountMenuTable()
    await openMenu(wrapper, 0, 0)
    await clickMenuItem('删除行')
    expect(element.options.tableRows).toHaveLength(1)
    expect(element.options.tableRows![0].type).toBe('data')
    // 剩最后一行：删除项置灰且不改变结构
    await openMenu(wrapper, 0, 0)
    const del = menuItems().find(i => i.textContent?.trim() === '删除行')!
    expect(del.className).toContain('disabled')
    del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(element.options.tableRows).toHaveLength(1)
  })

  it('在左侧/右侧插入列：单元格矩阵与列宽同步增长', async () => {
    const { wrapper, element } = mountMenuTable()
    await openMenu(wrapper, 0, 0)
    await clickMenuItem('在左侧插入列')
    expect(element.options.tableColWidths).toHaveLength(3)
    expect(element.options.tableRows![0].cells).toHaveLength(3)
    await openMenu(wrapper, 0, 2)
    await clickMenuItem('在右侧插入列')
    expect(element.options.tableColWidths).toHaveLength(4)
    expect(element.options.width).toBeCloseTo(120, 1) // 列宽和同步
  })

  it('删除列：矩阵与列宽同步收缩', async () => {
    const { wrapper, element } = mountMenuTable()
    await openMenu(wrapper, 0, 0)
    await clickMenuItem('删除列')
    expect(element.options.tableColWidths).toEqual([30])
    expect(element.options.tableRows!.every(r => r.cells.length === 1)).toBe(true)
  })

  it('合并/拆分单元格：多单元格选区合并为首格，拆分还原矩阵', async () => {
    const { wrapper, element } = mountMenuTable()
    // 拖选 (0,0)-(0,1) 后合并
    await wrapper.findAll('td')[0]!.trigger('mousedown', { button: 0 })
    await wrapper.findAll('td')[1]!.trigger('mouseenter')
    await openMenu(wrapper, 0, 1)
    await clickMenuItem('合并单元格')
    const row0 = element.options.tableRows![0]
    expect(row0.cells[0].colspan).toBe(2)
    expect(row0.cells[1].merged).toBe(true)
    // 拆分
    await openMenu(wrapper, 0, 0)
    await clickMenuItem('拆分单元格')
    expect(element.options.tableRows![0].cells[0].colspan ?? 1).toBe(1)
    expect(element.options.tableRows![0].cells[1].merged).toBeFalsy()
  })

  it('行类型切换：数据行 → 汇总行，非法目标置灰', async () => {
    const { wrapper, element } = mountMenuTable()
    await openMenu(wrapper, 1, 0)
    await clickMenuItem('汇总行')
    expect(element.options.tableRows![1].type).toBe('summary')
    // 当前类型高亮；点击当前类型不改变结构
    await openMenu(wrapper, 0, 0)
    const headerItem = menuItems().find(i => i.textContent?.trim() === '标题行')!
    expect(headerItem.className).toContain('active')
    headerItem.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(element.options.tableRows![0].type).toBe('header')
  })

  it('动作执行后记一次历史并清空选区', async () => {
    const { wrapper, tableSelection, recordHistory } = mountMenuTable()
    await openMenu(wrapper, 0, 0)
    await clickMenuItem('在下方插入行')
    expect(recordHistory).toHaveBeenCalledTimes(1)
    expect(tableSelection.value).toBe(null)
  })
})
