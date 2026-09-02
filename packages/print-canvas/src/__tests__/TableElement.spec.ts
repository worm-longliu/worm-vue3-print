// web/src/components/print/__tests__/TableElement.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'

import TableElement from '../components/elements/TableElement.vue'
import TableContextMenu from '../components/elements/TableContextMenu.vue'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'
import type { RuntimeElement, TableSelection } from '../types'

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
