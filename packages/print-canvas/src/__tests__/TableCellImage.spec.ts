import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TableElement from '../components/elements/TableElement.vue'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'

describe('TableElement with image cell', () => {
  const mockElement = {
    id: 'el-table',
    options: {
      tableColWidths: [50],
      tableRows: [{
        id: 'r1',
        type: 'data' as const,
        height: 10,
        cells: [{
          id: 'c1',
          formatter: 'https://example.com/image.png',
          cellType: 'image' as const,
          fit: 'contain',
          maxWidth: 40,
          maxHeight: 8,
        }]
      }]
    },
    printElementType: { type: 'table', title: '表格' }
  }

  const tableSelection = ref(null)
  const setTableSelection = () => {}
  const recordHistory = () => {}

  it('renders table with image cell', () => {
    const wrapper = mount(TableElement, {
      props: {
        element: mockElement,
        designMode: true,
        isSelected: true,
      },
      global: {
        provide: {
          [TABLE_EDIT_KEY as symbol]: {
            tableSelection,
            setTableSelection,
            recordHistory,
            maxTableWidth: ref(Infinity),
          }
        }
      }
    })
    
    // 检查表格是否被渲染
    expect(wrapper.find('table').exists()).toBe(true)
    // 检查单元格是否被渲染
    expect(wrapper.find('td').exists()).toBe(true)
    // 检查图片单元格是否被渲染（通过检查是否有 img 标签或占位符）
    const td = wrapper.find('td')
    expect(td.find('.cell-image').exists() || td.find('img').exists() || td.find('.image-placeholder').exists()).toBe(true)
  })
})