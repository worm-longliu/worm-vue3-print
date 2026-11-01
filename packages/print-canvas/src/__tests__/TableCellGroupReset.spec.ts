import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import TableCellGroup from '../components/property/TableCellGroup.vue'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'
import type { RuntimeElement, TableCell } from '@worm-vue3-print/core/designer'

function makeElement(cells: Partial<TableCell>[]): RuntimeElement {
  return reactive({
    id: 'el-table',
    options: {
      tableColWidths: cells.map(() => 50),
      tableDefaultFontSize: 10,
      tableRows: [{
        id: 'r1', type: 'data', height: 10,
        cells: cells.map((c, i) => ({ id: `c${i + 1}`, ...c })),
      }],
    },
    printElementType: { type: 'table', title: '表格' },
  }) as unknown as RuntimeElement
}

function mountCells(cells: Partial<TableCell>[], span = cells.length - 1) {
  return mount(TableCellGroup, {
    props: {
      element: makeElement(cells),
      selection: { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2: span },
      fields: [],
    },
    global: {
      provide: {
        [TABLE_EDIT_KEY as symbol]: { tableSelection: { value: null }, setTableSelection: () => {}, recordHistory: () => {} },
      },
    },
  })
}

function rowOf(w: any, text: string) {
  const row = w.findAll('.pd-field').find((f: any) => f.find('.pd-label').exists() && f.find('.pd-label').text().includes(text))
  if (!row) throw new Error(`未找到属性行：${text}`)
  return row
}

describe('单元格「恢复默认值」', () => {
  it('提示固定「跟随表格默认」且不带数字——回落目标是作者可改的表级默认', () => {
    const w = mountCells([{ fontSize: 14 }])
    expect(rowOf(w, '字号').find('.pd-reset-btn').attributes('data-tip')).toBe('恢复默认值（跟随表格默认）')
  })

  it('未设过的格 ⇒ 灰态，点击不产生任何写入', async () => {
    const w = mountCells([{ fontSize: undefined }])
    const btn = rowOf(w, '字号').find('.pd-reset-btn')
    expect(btn.classes()).not.toContain('is-dirty')
    await btn.trigger('click')
    expect((w.props('element') as any).options.tableRows[0].cells[0].fontSize).toBeUndefined()
  })

  it('整选区写回：三格字号一起回到未设（不是只改当前格）', async () => {
    const w = mountCells([{ fontSize: 14 }, { fontSize: 14 }, { fontSize: 9 }])
    await rowOf(w, '字号').find('.pd-reset-btn').trigger('click')
    const cells = (w.props('element') as any).options.tableRows[0].cells
    expect(cells.map((c: any) => c.fontSize)).toEqual([undefined, undefined, undefined])
  })

  it('选区外的格不受影响', async () => {
    const w = mountCells([{ fontSize: 14 }, { fontSize: 14 }, { fontSize: 7 }], 1)
    await rowOf(w, '字号').find('.pd-reset-btn').trigger('click')
    const cells = (w.props('element') as any).options.tableRows[0].cells
    expect(cells[0].fontSize).toBeUndefined()
    expect(cells[1].fontSize).toBeUndefined()
    expect(cells[2].fontSize).toBe(7)
  })

  it('0 与未设是两个状态：内边距设成 0 仍判为已偏离，点击回未设', async () => {
    const w = mountCells([{ padding: 0 }])
    const btn = rowOf(w, '内边距').find('.pd-reset-btn')
    expect(btn.classes()).toContain('is-dirty')
    await btn.trigger('click')
    expect((w.props('element') as any).options.tableRows[0].cells[0].padding).toBeUndefined()
  })

  it('单元格类型 / 码制 / 内容三行不挂图标', () => {
    const w = mountCells([{ fontSize: 14 }])
    for (const t of ['单元格类型', '内容']) {
      expect(rowOf(w, t).find('.pd-reset-btn').exists()).toBe(false)
    }
  })

  /** 单元格行按 cellType 条件渲染，所以"挂了几行"要分类型断言，不能按 22 行总数硬核 */
  it('文本格：11 个无条件行全部挂上图标', () => {
    const w = mountCells([{ fontSize: 14, padding: 2, color: '#ff0000' }])
    const withIcon = w.findAll('.pd-field').filter(f => f.find('.pd-reset-btn').exists())
    expect(withIcon.length).toBe(11)
    for (const t of ['水平对齐', '垂直对齐', '字体', '字号', '加粗', '文字颜色', '背景色', '内边距', '自动换行', '文字溢出', '按值合并']) {
      expect(rowOf(w, t).find('.pd-reset-btn').exists(), `缺图标：${t}`).toBe(true)
    }
  })

  it('条码格：六个条码专属行都挂图标，唯独「码制」不挂', () => {
    const w = mountCells([{ cellType: 'barcode', barcodeType: 'CODE128', barWidth: 4 }])
    for (const t of ['显示文本', '条宽', '静区', '条高', '文本字号', '打印机分辨率']) {
      expect(rowOf(w, t).find('.pd-reset-btn').exists(), `缺图标：${t}`).toBe(true)
    }
    expect(rowOf(w, '码制').find('.pd-reset-btn').exists()).toBe(false)
  })

  it('全部标签文本不含"默认"二字（图标不得写字）', () => {
    for (const cells of [[{ fontSize: 14 }], [{ cellType: 'barcode', barcodeType: 'EAN13' }], [{ cellType: 'qrcode', qrQuietZone: 3 }]] as any[]) {
      for (const l of mountCells(cells).findAll('.pd-label')) expect(l.text()).not.toContain('默认')
    }
  })

  /** 裁剪两行住在 CropAnchorField 里，单元格台此前没把 options/base 传进去 ⇒ 图标整段不出现 */
  it('图片格（cover）：裁剪锚点与放大比例两行也挂图标，提示跟随表格默认', () => {
    const el = makeElement([{ cellType: 'image', fit: 'cover', objectPosition: '0% 0%', fitScale: 150 }])
    const w = mount(TableCellGroup, {
      props: { element: el, selection: { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2: 0 }, fields: [] },
      global: {
        provide: {
          [TABLE_EDIT_KEY as symbol]: { tableSelection: { value: null }, setTableSelection: () => {}, recordHistory: () => {} },
        },
      },
    })
    for (const t of ['裁剪锚点', '放大比例']) {
      const b = rowOf(w, t).find('.pd-reset-btn')
      expect(b.exists(), `缺图标：${t}`).toBe(true)
      expect(b.attributes('data-tip'), `提示不对：${t}`).toBe('恢复默认值（跟随表格默认）')
    }
    rowOf(w, '裁剪锚点').find('.pd-reset-btn').trigger('click')
    expect(((el.options.tableRows as never as any[])[0].cells[0]).objectPosition).toBeUndefined()
  })
})
