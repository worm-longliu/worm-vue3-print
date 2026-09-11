// web/src/components/print/__tests__/TableElement.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'

import TableElement from '../components/elements/TableElement.vue'
import TableContextMenu from '../components/elements/TableContextMenu.vue'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'
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
