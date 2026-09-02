// web/src/components/print/__tests__/TableElement.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

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
