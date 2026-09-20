import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import TableCellGroup from '../components/property/TableCellGroup.vue'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'
import type { RuntimeElement, TableCell } from '@worm-vue3-print/core/designer'

function makeElement(cell: Partial<TableCell>): RuntimeElement {
  return reactive({
    id: 'el-table',
    options: {
      tableColWidths: [50],
      tableRows: [{
        id: 'r1',
        type: 'data',
        height: 10,
        cells: [{ id: 'c1', ...cell }],
      }],
    },
    printElementType: { type: 'table', title: '表格' },
  }) as unknown as RuntimeElement
}

function mountGroup(element: RuntimeElement) {
  return mount(TableCellGroup, {
    props: {
      element,
      selection: { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2: 0 },
      fields: [],
    },
    global: {
      provide: {
        [TABLE_EDIT_KEY as symbol]: { tableSelection: { value: null }, setTableSelection: () => {}, recordHistory: () => {} },
      },
    },
  })
}

/** 单元格分组内的下拉顺序：单元格类型（radio，非 select）→ 码制 → 打印机分辨率 → 缩放模式 */
function selects(w: ReturnType<typeof mountGroup>) {
  return w.findAll('select')
}

describe('TableCellGroup 条形码单元格打印机分辨率', () => {
  it('条形码单元格显示「打印机分辨率」，缺省为不对齐', () => {
    const w = mountGroup(makeElement({ cellType: 'barcode' }))
    expect(w.text()).toContain('打印机分辨率')
    const dpi = selects(w)[1]!
    expect((dpi.element as HTMLSelectElement).value).toBe('')
  })

  it('选中 dpi 写入 cell.printerDpi，选回「不对齐」清除字段', async () => {
    const element = makeElement({ cellType: 'barcode' })
    const w = mountGroup(element)
    const dpi = selects(w)[1]!
    await dpi.setValue('203')
    expect(element.options.tableRows![0]!.cells[0]!.printerDpi).toBe(203)

    await dpi.setValue('')
    expect(element.options.tableRows![0]!.cells[0]!.printerDpi).toBeUndefined()
  })

  it('启用 dpi 后移除缩放模式与最大宽高（点对齐时它们不参与）', () => {
    const manual = mountGroup(makeElement({ cellType: 'barcode' }))
    const aligned = mountGroup(makeElement({ cellType: 'barcode', printerDpi: 203 }))
    // 下拉：码制 / 打印机分辨率 / 缩放模式 / 边框样式 → 点对齐后缩放模式被移除
    expect(selects(manual)).toHaveLength(4)
    expect(selects(aligned)).toHaveLength(3)
    // 最大宽度/最大高度字段一并移除（提示文案里只有「最大宽高」四字，不含字段名）
    expect(manual.text()).toContain('最大宽度')
    expect(aligned.text()).not.toContain('最大宽度')
    expect(aligned.text()).toContain('缩放模式与最大宽高此时不参与')
  })

  it('非条形码单元格没有打印机分辨率（二维码模块数固定，图片无关）', () => {
    expect(mountGroup(makeElement({ cellType: 'qrcode' })).text()).not.toContain('打印机分辨率')
    expect(mountGroup(makeElement({ cellType: 'image' })).text()).not.toContain('打印机分辨率')
  })

  it('单元格类型切离条形码时清除 printerDpi', async () => {
    const element = makeElement({ cellType: 'barcode', printerDpi: 203 })
    const w = mountGroup(element)
    const radios = w.findAll('input[type="radio"]')
    await radios[2]!.setValue() // 二维码
    const cell = element.options.tableRows![0]!.cells[0]!
    expect(cell.cellType).toBe('qrcode')
    expect(cell.printerDpi).toBeUndefined()
  })
})
