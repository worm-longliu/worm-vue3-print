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

/** 单元格分组内的下拉顺序：单元格类型（radio，非 select）→ 码制 → 打印机分辨率 → 边框样式 */
function selects(w: ReturnType<typeof mountGroup>) {
  return w.findAll('select')
}

describe('TableCellGroup 条宽推荐（选了分辨率后给参考，不改值）', () => {
  const cellOf = (el: RuntimeElement) => (el.options.tableRows as any[])[0].cells[0] as TableCell

  it('203dpi 的条形码单元格出推荐倍率 3 并点明当前档低于下限，且不回写 barWidth', () => {
    const element = makeElement({ cellType: 'barcode', printerDpi: 203 })
    const w = mountGroup(element)
    expect(w.text()).toContain('推荐条宽倍率 3')
    expect(w.text()).toContain('低于下限')
    expect(w.text()).toContain('不会替你改值')
    expect(cellOf(element).barWidth).toBeUndefined()
  })

  it('未选分辨率不给推荐；当前档已达标时改口已达标', () => {
    expect(mountGroup(makeElement({ cellType: 'barcode' })).text()).not.toContain('推荐条宽倍率')
    const ok = mountGroup(makeElement({ cellType: 'barcode', printerDpi: 203, barWidth: 4 }))
    expect(ok.text()).toContain('已达标')
    expect(ok.text()).not.toContain('低于下限')
  })
})

describe('TableCellGroup 二维码单元格静区', () => {
  const quietField = (w: ReturnType<typeof mountGroup>) =>
    w.findAll('.pd-field').find(f => f.find('.pd-label').text() === '静区 (模块)')
  const cellOf = (el: RuntimeElement) => (el.options.tableRows as any[])[0].cells[0] as TableCell

  it('二维码与条形码单元格各出「静区 (模块)」，文本单元格不出', () => {
    expect(quietField(mountGroup(makeElement({ cellType: 'qrcode' })))).toBeTruthy()
    expect(quietField(mountGroup(makeElement({ cellType: 'barcode' })))).toBeTruthy()
    expect(quietField(mountGroup(makeElement({ formatter: '文本' })))).toBeUndefined()
  })

  it('条形码单元格的静区档位与说明独立：上限 20、占位「默认 10」、tip 取条码那一条', () => {
    const field = quietField(mountGroup(makeElement({ cellType: 'barcode' })))!
    const input = field.find('input[type="number"]').element as HTMLInputElement
    expect(input.placeholder).toBe('默认 10')
    expect(input.getAttribute('max')).toBe('20')
    expect(field.find('.pd-help').attributes('data-tip')).toContain('一维码码制要求的下限')
  })

  it('条形码单元格填 0 写 barQuietZone = 0（0 档把左右白边换成条宽），且不误写二维码那一份', async () => {
    const element = makeElement({ cellType: 'barcode' })
    const input = quietField(mountGroup(element))!.find('input[type="number"]')
    await input.setValue('0')
    await input.trigger('change')
    expect(cellOf(element).barQuietZone).toBe(0)
    expect(cellOf(element).qrQuietZone).toBeUndefined()
  })

  it('单元格类型从条形码切走时清除 barQuietZone', async () => {
    const element = makeElement({ cellType: 'barcode', barQuietZone: 3 })
    const w = mountGroup(element)
    expect(cellOf(element).barQuietZone).toBe(3)
    await w.find('input[type="radio"][value="text"]').setValue()
    expect(cellOf(element).barQuietZone).toBeUndefined()
  })

  it('填 0 写进单元格（0 就是「无白边、码面铺满」，被假值判断归成未设置这档就没了）', async () => {
    const element = makeElement({ cellType: 'qrcode' })
    const input = quietField(mountGroup(element))!.find('input[type="number"]')
    await input.setValue('0')
    await input.trigger('change')
    expect(cellOf(element).qrQuietZone).toBe(0)
  })

  it('说明挂在标签后的帮助图标上（悬浮/点击显示），不常驻文字提示', () => {
    const field = quietField(mountGroup(makeElement({ cellType: 'qrcode' })))!
    const help = field.find('.pd-help')
    expect(help.exists(), '静区标签后应有帮助图标').toBe(true)
    expect(help.attributes('data-tip')).toContain('0 即不留白边')
    expect(field.find('.pd-hint').exists(), '说明不应常驻成一行文字').toBe(false)
  })

  it('已设置的档位原样回显，单元格类型切走时清除该字段', async () => {
    const element = makeElement({ cellType: 'qrcode', qrQuietZone: 4 })
    const w = mountGroup(element)
    expect((quietField(w)!.find('input[type="number"]').element as HTMLInputElement).value).toBe('4')

    await w.find('input[type="radio"][value="text"]').setValue()
    expect(cellOf(element).qrQuietZone).toBeUndefined()
  })
})

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

  it('条形码单元格不提供缩放模式，最大宽高作为结算上限始终可用', () => {
    const manual = mountGroup(makeElement({ cellType: 'barcode' }))
    const aligned = mountGroup(makeElement({ cellType: 'barcode', printerDpi: 203 }))
    // 下拉：码制 / 打印机分辨率 / 边框样式 → 与是否设置 dpi 无关（条形码无缩放模式）
    expect(selects(manual)).toHaveLength(3)
    expect(selects(aligned)).toHaveLength(3)
    // 最大宽度/最大高度并入可用框参与结算，两种模式下都保留
    expect(manual.text()).toContain('最大宽度')
    expect(aligned.text()).toContain('最大宽度')
    expect(aligned.text()).toContain('可用「最大宽高」限制上限')
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

describe('单元格图片裁剪锚点（仅剪裁档）', () => {
  const anchorRow = (w: ReturnType<typeof mountGroup>) =>
    w.findAll('.pd-field').find(f => (f.find('.pd-label').text() || '').includes('裁剪锚点'))
  const cellOf = (el: RuntimeElement) => (el.options.tableRows![0] as any).cells[0] as TableCell

  it('未选剪裁时锚点行整个不出现', () => {
    const w = mountGroup(makeElement({ cellType: 'image', formatter: 'data:image/gif;base64,R0lGOD' }))
    expect(anchorRow(w)).toBeUndefined()
  })

  it('缩放模式里 cover 叫「剪裁」，旧文案不再出现', () => {
    const w = mountGroup(makeElement({ cellType: 'image' }))
    const fit = w.findAll('select').find(s => s.text().includes('剪裁（等比铺满后裁边）'))!
    expect(fit).toBeTruthy()
    expect(w.text()).not.toContain('覆盖（保持比例）')
  })

  it('选了剪裁才出锚点控件，选档写回 50% 0%', async () => {
    const el = makeElement({ cellType: 'image', formatter: 'data:image/gif;base64,R0lGOD', fit: 'cover' })
    const w = mountGroup(el)
    expect(anchorRow(w)).toBeTruthy()
    await w.find('[data-field="ap-img-object-position"] select').setValue('50,0')
    expect(cellOf(el).objectPosition).toBe('50% 0%')
  })

  it('回到居中即撤掉该属性，而不是留个空串', async () => {
    const el = makeElement({ cellType: 'image', fit: 'cover', objectPosition: '50% 0%' })
    const w = mountGroup(el)
    await w.find('[data-field="ap-img-object-position"] select').setValue('50,50')
    expect(cellOf(el).objectPosition).toBeUndefined()
  })

  it('放大比例写回 cell.fitScale，退回 100 即撤掉该键', async () => {
    const el = makeElement({ cellType: 'image', fit: 'cover' })
    const w = mountGroup(el)
    const row = w.findAll('.pd-field').find(f => (f.find('.pd-label').text() || '').includes('放大比例'))!
    await row.find('.pd-step-plus').trigger('click')
    expect(cellOf(el).fitScale).toBe(105)

    await row.find('input').setValue('100')
    await row.find('input').trigger('change')
    expect(cellOf(el).fitScale).toBeUndefined()
  })

  it('二维码与文本单元格都不出锚点行（只有图片会裁）', () => {
    expect(anchorRow(mountGroup(makeElement({ cellType: 'qrcode', fit: 'cover' })))).toBeUndefined()
    expect(anchorRow(mountGroup(makeElement({ content: '文本' } as any)))).toBeUndefined()
  })

  it('可挪量按可用内容框算（扣内边距），与出纸钉盒同一口径', async () => {
    const w = mountGroup(makeElement({ cellType: 'image', formatter: '/a.png', fit: 'cover' }))
    const img = w.find('.pd-crop-preview img')
    Object.defineProperty(img.element, 'naturalWidth', { value: 60, configurable: true })
    Object.defineProperty(img.element, 'naturalHeight', { value: 90, configurable: true })
    await img.trigger('load')
    // 格 50×10、内边距各 1mm → 可用框 48×8：scale 0.8，可挪 90×0.8−8=64mm（照原始 50×10 会报成 65mm）
    expect(w.text()).toContain('64mm')
  })
})

describe('单元格水平对齐第 4 档（两端）', () => {
  function alignField(w: ReturnType<typeof mountGroup>) {
    return w.findAll('.pd-field').find(f => (f.find('.pd-label').text() || '').includes('水平对齐'))!
  }

  it('档位为 左/中/右/两端，值依次 left/center/right/justify', () => {
    const field = alignField(mountGroup(makeElement({ formatter: '名称' })))
    expect(field.findAll('input[type="radio"]').map(i => (i.element as HTMLInputElement).value))
      .toEqual(['left', 'center', 'right', 'justify'])
    expect(field.findAll('label span').map(s => s.text())).toEqual(['左', '中', '右', '两端'])
  })

  it('选「两端」把 justify 写进被选单元格', async () => {
    const el = makeElement({ formatter: '名称' })
    const w = mountGroup(el)
    await alignField(w).findAll('input[type="radio"]')[3].setValue('justify')
    expect((el.options.tableRows![0] as any).cells[0].align).toBe('justify')
  })

  it('已设为 justify 时第 4 档呈选中态（工具栏写入的值在面板可见）', () => {
    const field = alignField(mountGroup(makeElement({ formatter: '名称', align: 'justify' })))
    const checked = field.findAll('input[type="radio"]').filter(i => (i.element as HTMLInputElement).checked)
    expect(checked.map(i => (i.element as HTMLInputElement).value)).toEqual(['justify'])
  })
})

describe('TableCellGroup 条形码单元格条高 (mm)', () => {
  const heightField = (w: ReturnType<typeof mountGroup>) =>
    w.findAll('.pd-field').find(f => f.find('.pd-label').text().startsWith('条高'))
  const cellOf = (el: RuntimeElement) => (el.options.tableRows as any[])[0].cells[0] as TableCell

  it('条形码单元格出「条高 (mm)」，二维码与文本单元格不出', () => {
    expect(heightField(mountGroup(makeElement({ cellType: 'barcode' })))).toBeTruthy()
    expect(heightField(mountGroup(makeElement({ cellType: 'qrcode' })))).toBeUndefined()
    expect(heightField(mountGroup(makeElement({ formatter: '文本' })))).toBeUndefined()
  })

  it('填 20 写进单元格的 barHeight', async () => {
    const element = makeElement({ cellType: 'barcode' })
    const input = heightField(mountGroup(element))!.find('input[type="number"]')
    await input.setValue('20')
    await input.trigger('change')
    expect(cellOf(element).barHeight).toBe(20)
  })

  it('已填档位原样回显，单元格类型从条形码切走时清除 barHeight', async () => {
    const element = makeElement({ cellType: 'barcode', barHeight: 20 })
    const w = mountGroup(element)
    expect((heightField(w)!.find('input[type="number"]').element as HTMLInputElement).value).toBe('20')
    await w.find('input[type="radio"][value="text"]').setValue()
    expect(cellOf(element).barHeight).toBeUndefined()
  })

  it('tip 点出条宽优先：兑现不满不是 bug，是条高给框高让位', () => {
    const field = heightField(mountGroup(makeElement({ cellType: 'barcode' })))!
    expect(field.find('.pd-help').attributes('data-tip'), '条高应有帮助说明').toContain('条宽')
  })
})

describe('TableCellGroup 边框草稿：预设与单边才落盘', () => {
  const cellOf = (el: RuntimeElement) => (el.options.tableRows as any[])[0].cells[0] as TableCell

  it('预设与单边之下常驻一行说明，且排在两组控件之后', () => {
    const nodes = mountGroup(makeElement({ formatter: '文本' }))
      .findAll('.pd-form > *')
      .map(n => n.attributes('class') ?? '')
    const hint = nodes.indexOf('pd-hint')
    expect(hint, '应有边框草稿说明').toBeGreaterThan(-1)
    expect(hint).toBeGreaterThan(nodes.indexOf('pd-checkbox-group'))
    expect(mountGroup(makeElement({ formatter: '文本' })).text())
      .toContain('选中格已有的边框规格一致时会填进这三行')
  })

  it('无边框格回显「无 / 0」；选实线自动补缺省宽度，改宽度后点「全部」才落盘', async () => {
    const element = makeElement({ formatter: '文本' })
    const w = mountGroup(element)
    const sel = w.find('.border-style-row select')
    const width = () => (w.find('.border-style-row input[type="number"]').element as HTMLInputElement).value

    expect((sel.element as HTMLSelectElement).value, '四边都没有边框 ⇒ 线型无').toBe('none')
    expect(width(), '四边都没有边框 ⇒ 宽度 0').toBe('0')

    await sel.setValue('solid')
    expect(width(), '选实线自动补缺省宽度').toBe('0.75')
    await w.find('.border-style-row input[type="number"]').setValue('2')
    await w.find('.border-style-row input[type="number"]').trigger('change')
    expect(cellOf(element).borders, '仅改宽度不应落盘').toBeUndefined()

    const all = w.findAll('.border-presets button').find(b => b.text() === '全部')!
    await all.trigger('click')
    const borders = cellOf(element).borders!
    expect(['top', 'right', 'bottom', 'left'].map(s => (borders as any)[s].width)).toEqual([2, 2, 2, 2])
  })
})

describe('TableCellGroup 边框回显：勾选框反映选区真实边位', () => {
  const border = (
    w = 0.75, style: 'solid' | 'dashed' | 'dotted' | 'double' = 'solid', color = '#333333',
  ) => ({ width: w, style, color })

  /** 单格 / 双格都能挂：cells 原样进矩阵，选区可覆盖整行 */
  function mountCells(cells: Array<Partial<TableCell>>, c2 = 0) {
    const element = reactive({
      id: 'el-table',
      options: {
        tableColWidths: cells.map(() => 50),
        tableRows: [{ id: 'r1', type: 'data', height: 10, cells }],
      },
      printElementType: { type: 'table', title: '表格' },
    }) as unknown as RuntimeElement
    return mount(TableCellGroup, {
      props: { element, selection: { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2 }, fields: [] },
      global: {
        provide: {
          [TABLE_EDIT_KEY as symbol]: { tableSelection: { value: null }, setTableSelection: () => {}, recordHistory: () => {} },
        },
      },
    })
  }

  const checked = (w: ReturnType<typeof mountCells>) =>
    w.findAll('.pd-checkbox-group input[type="checkbox"]').map(b => (b.element as HTMLInputElement).checked)
  const indeterminate = (w: ReturnType<typeof mountCells>) =>
    w.findAll('.pd-checkbox-group input[type="checkbox"]').map(b => (b.element as HTMLInputElement).indeterminate)

  it('四边都有边框的单元格：勾选框全亮（此前恒为本地草稿，模型状态不回显）', () => {
    const w = mountCells([{ borders: { top: border(), right: border(), bottom: border(), left: border() } }])
    expect(checked(w)).toEqual([true, true, true, true])
  })

  it('只有上边的单元格：只有「上」亮；完全无边框的单元格：全不亮——三种状态在面板上必须可区分', () => {
    expect(checked(mountCells([{ borders: { top: border() } }]))).toEqual([true, false, false, false])
    expect(checked(mountCells([{ borders: undefined }]))).toEqual([false, false, false, false])
  })

  it('勾一条边只动那一条：不得把模型里其余三边删掉', async () => {
    const cell: Partial<TableCell> = { borders: { right: border(), bottom: border(), left: border() } }
    const w = mountCells([cell])
    expect(checked(w)).toEqual([false, true, true, true])
    await w.findAll('.pd-checkbox-group input[type="checkbox"]')[0]!.setValue(true)
    expect(Object.keys(cell.borders!).sort()).toEqual(['bottom', 'left', 'right', 'top'])
    expect(checked(w)).toEqual([true, true, true, true])
  })

  it('取消勾选只撤那一条边，其余留着', async () => {
    const cell: Partial<TableCell> = { borders: { top: border(), right: border() } }
    const w = mountCells([cell])
    await w.findAll('.pd-checkbox-group input[type="checkbox"]')[0]!.setValue(false)
    expect(cell.borders!.top).toBeUndefined()
    expect(cell.borders!.right).toBeTruthy()
  })

  it('多选不回显单格边位：一格有上边也不半选，点下去按批写补齐全部', async () => {
    const a: Partial<TableCell> = { borders: { top: border(), left: border() } }
    const b: Partial<TableCell> = { borders: { left: border() } }
    const w = mountCells([a, b], 1)
    expect(checked(w), '多选不取任何一格的边位').toEqual([false, false, false, false])
    expect(indeterminate(w)).toEqual([false, false, false, false])

    await w.findAll('.pd-checkbox-group input[type="checkbox"]')[0]!.setValue(true)
    expect(a.borders!.top).toBeTruthy()
    expect(b.borders!.top).toBeTruthy()
    expect([a.borders!.left, b.borders!.left].every(Boolean), '补齐上边不得动其它边位').toBe(true)
    expect(Object.keys(a.borders!).sort()).toEqual(['left', 'top'])
    expect(Object.keys(b.borders!).sort()).toEqual(['left', 'top'])
    expect(checked(w), '批写过的边在本选区回显为勾选').toEqual([true, false, false, false])
  })

  it('切换选区后勾选框跟着变（不残留上一格的状态）', async () => {
    const a: Partial<TableCell> = { borders: { top: border(), right: border(), bottom: border(), left: border() } }
    const b: Partial<TableCell> = { borders: undefined }
    const w = mountCells([a, b])
    expect(checked(w)).toEqual([true, true, true, true])
    await w.setProps({ selection: { elementId: 'el-table', r1: 0, c1: 1, r2: 0, c2: 1 } })
    expect(checked(w)).toEqual([false, false, false, false])
  })

  describe('三行待应用规格取自选区（方案 B）', () => {
    const rows3 = (w: ReturnType<typeof mountCells>) => ({
      style: (w.find('.border-style-row select').element as HTMLSelectElement).value,
      width: (w.find('.border-style-row input[type="number"]').element as HTMLInputElement).value,
      color: w.find('.border-style-row .preset-color-trigger').attributes('title'),
    })

    it('选区里的边规格一致 ⇒ 线型 / 宽度 / 颜色回显该规格', () => {
      const w = mountCells([{
        borders: { top: border(2, 'dashed', '#123456'), left: border(2, 'dashed', '#123456') },
      }])
      expect(rows3(w)).toEqual({ style: 'dashed', width: '2', color: '#123456' })
    })

    it('一条边都还没画 ⇒ 线型「无」、宽度 0，颜色仍按缺省草稿', () => {
      expect(rows3(mountCells([{ borders: undefined }]))).toEqual({ style: 'none', width: '0', color: '#333333' })
    })

    it('选区里边规格不一 ⇒ 不谎报，整组回到缺省档', () => {
      const w = mountCells([
        { borders: { top: border(2, 'dashed') } },
        { borders: { top: border(3, 'dotted') } },
      ], 1)
      expect(rows3(w)).toEqual({ style: 'solid', width: '0.75', color: '#333333' })
    })

    it('改宽度只暂存不落盘；切到别的选区后暂存作废、两格各自回到自己的规格', async () => {
      const a: Partial<TableCell> = { borders: { top: border(2, 'dashed', '#123456') } }
      const b: Partial<TableCell> = { borders: { top: border(1) } }
      const w = mountCells([a, b])
      const input = () => (w.find('.border-style-row input[type="number"]').element as HTMLInputElement).value
      await w.find('.border-style-row input[type="number"]').setValue('4')
      expect(input()).toBe('4')
      expect(a.borders!.top!.width, '仅改值不落盘').toBe(2)

      await w.setProps({ selection: { elementId: 'el-table', r1: 0, c1: 1, r2: 0, c2: 1 } })
      expect(input(), '换选区给的是该格自己的 1，不残留敲过的 4').toBe('1')
      await w.setProps({ selection: { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2: 0 } })
      expect(input(), '切回来也重新派生').toBe('2')

      const all = w.findAll('.border-presets button').find(x => x.text() === '全部')!
      await all.trigger('click')
      expect(a.borders!.top!.width, '没敲新值就按派生规格落盘').toBe(2)
    })
  })
})

describe('TableCellGroup 线型可设为「无」', () => {
  function mountCells(cells: Array<Partial<TableCell>>) {
    const element = reactive({
      id: 'el-table',
      options: { tableColWidths: [50], tableRows: [{ id: 'r1', type: 'data', height: 10, cells }] },
      printElementType: { type: 'table', title: '表格' },
    }) as unknown as RuntimeElement
    return mount(TableCellGroup, {
      props: { element, selection: { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2: 0 }, fields: [] },
      global: {
        provide: {
          [TABLE_EDIT_KEY as symbol]: { tableSelection: { value: null }, setTableSelection: () => {}, recordHistory: () => {} },
        },
      },
    })
  }

  it('线型下拉含「无」；选区里边全是 none 时回显「无」', () => {
    const w = mountCells([{ borders: { top: { width: 1, style: 'none', color: '#333333' } } }])
    const sel = w.find('.border-style-row select').element as HTMLSelectElement
    expect(Array.from(sel.options).map(o => o.textContent)).toEqual(['无', '实线', '虚线', '点线', '双线'])
    expect(sel.value).toBe('none')
  })

  it('选「无」后点「全部」＝清掉边框（不写一条隐形的 none 边）', async () => {
    const cell: Partial<TableCell> = { borders: { top: { width: 2, style: 'dashed', color: '#333333' } } }
    const w = mountCells([cell])
    await w.find('.border-style-row select').setValue('none')
    await w.findAll('.border-presets button').find(b => b.text() === '全部')!.trigger('click')
    expect(cell.borders).toBeUndefined()
  })

  it('线型＝无时勾一条边不会出线（按没有这条边处理）', async () => {
    const cell: Partial<TableCell> = { borders: { top: { width: 1, style: 'solid', color: '#333333' } } }
    const w = mountCells([cell])
    await w.find('.border-style-row select').setValue('none')
    await w.findAll('.pd-checkbox-group input[type="checkbox"]')[1]!.setValue(true)
    expect(cell.borders?.right).toBeUndefined()
  })
})

describe('TableCellGroup 单选回显 / 多选批写', () => {
  const border = (
    w = 0.75, style: 'solid' | 'dashed' | 'dotted' | 'double' = 'solid', color = '#333333',
  ) => ({ width: w, style, color })

  function mountMatrix(
    rowCells: Array<Array<Partial<TableCell>>>,
    selection: { r1: number; c1: number; r2: number; c2: number },
  ) {
    const element = reactive({
      id: 'el-table',
      options: {
        tableColWidths: rowCells[0]!.map(() => 50),
        tableRows: rowCells.map((cells, ri) => ({
          id: `r${ri}`,
          type: 'data',
          height: 10,
          cells: cells.map((cell, ci) => ({ id: `c${ri}-${ci}`, ...cell })),
        })),
      },
      printElementType: { type: 'table', title: '表格' },
    }) as unknown as RuntimeElement
    const w = mount(TableCellGroup, {
      props: { element, selection: { elementId: 'el-table', ...selection }, fields: [] },
      global: {
        provide: {
          [TABLE_EDIT_KEY as symbol]: { tableSelection: { value: null }, setTableSelection: () => {}, recordHistory: () => {} },
        },
      },
    })
    return { w, element }
  }

  const cellOf = (element: RuntimeElement, r: number, c: number) =>
    (element.options.tableRows as any[])[r].cells[c] as TableCell
  const field = (w: ReturnType<typeof mount>, label: string) =>
    w.findAll('.pd-field').find(f => f.find('.pd-label').text() === label)
  const checkedRadios = (w: ReturnType<typeof mount>, label: string) =>
    field(w, label)!.findAll('input[type="radio"]').map(i => (i.element as HTMLInputElement).checked)
  const edgeBoxes = (w: ReturnType<typeof mount>) =>
    w.findAll('.pd-checkbox-group input[type="checkbox"]').map(i => ({
      checked: (i.element as HTMLInputElement).checked,
      mixed: (i.element as HTMLInputElement).indeterminate,
    }))

  it('多选：不显示任何一格的配置值，控件留空并给出「多选」占位', () => {
    const { w } = mountMatrix([[
      { formatter: 'A', fontSize: 12, align: 'left', fontWeight: 'bold', color: '#123456' },
      { formatter: 'B', fontSize: 16, align: 'center' },
    ]], { r1: 0, c1: 0, r2: 0, c2: 1 })

    expect(w.text()).toContain('已选 2 格 · 批量设置')
    const content = field(w, '内容')!.find('input.pd-input').element as HTMLInputElement
    expect(content.value).toBe('')
    expect(content.placeholder).toContain('多选')
    const size = field(w, '字号 (pt)')!.find('input[type="number"]').element as HTMLInputElement
    expect(size.value).toBe('')
    expect(size.placeholder).toBe('多选')
    expect(checkedRadios(w, '水平对齐')).toEqual([false, false, false, false])
    const bold = field(w, '加粗')!.find('input.pd-switch').element as HTMLInputElement
    expect(bold.checked).toBe(false)
    expect(field(w, '字体')!.find('.font-select-input').attributes('placeholder')).toBe('多选')
    // 边框三行不取任何一格的派生值，落缺省档；四边不勾也没有半选
    expect((w.find('.border-style-row select').element as HTMLSelectElement).value).toBe('solid')
    expect(edgeBoxes(w)).toEqual([
      { checked: false, mixed: false }, { checked: false, mixed: false },
      { checked: false, mixed: false }, { checked: false, mixed: false },
    ])
    expect(w.text()).toContain('多选时不回显单格边框')
  })

  it('多选批写：改字号写到全部选中格，控件显示本次批写值', async () => {
    const { w, element } = mountMatrix([[
      { fontSize: 12 }, { fontSize: 16 },
    ]], { r1: 0, c1: 0, r2: 0, c2: 1 })

    const size = field(w, '字号 (pt)')!.find('input[type="number"]')
    await size.setValue('14')
    expect(cellOf(element, 0, 0).fontSize).toBe(14)
    expect(cellOf(element, 0, 1).fontSize).toBe(14)
    expect((size.element as HTMLInputElement).value).toBe('14')
  })

  it('换选区即清批写草稿；切回来也不复活', async () => {
    const { w, element } = mountMatrix([[
      { fontSize: 12 }, { fontSize: 16 },
    ]], { r1: 0, c1: 0, r2: 0, c2: 1 })
    const size = () => field(w, '字号 (pt)')!.find('input[type="number"]').element as HTMLInputElement

    await field(w, '字号 (pt)')!.find('input[type="number"]').setValue('14')
    expect(size().value).toBe('14')

    await w.setProps({ selection: { elementId: 'el-table', r1: 0, c1: 1, r2: 0, c2: 1 } })
    expect(size().value, '单选取该格真实值（批写后两格都是 14）').toBe('14')

    await w.setProps({ selection: { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2: 1 } })
    expect(size().value, '换回多选不残留上次批写值').toBe('')
    expect(cellOf(element, 0, 0).fontSize).toBe(14)
  })

  it('合并格虽然 rect 跨两行，只有一个可写主格 ⇒ 仍按单选回显', () => {
    const { w } = mountMatrix([
      [{ rowspan: 2, formatter: '合并标题', fontSize: 20 }],
      [{ merged: true }],
    ], { r1: 0, c1: 0, r2: 1, c2: 0 })

    expect(w.text()).not.toContain('批量设置')
    expect((field(w, '内容')!.find('input.pd-input').element as HTMLInputElement).value).toBe('合并标题')
    expect((field(w, '字号 (pt)')!.find('input[type="number"]').element as HTMLInputElement).value).toBe('20')
  })

  it('多选的类型专属行按共有类型出现：全条码才有码制，混合类型不显示', () => {
    const allBarcode = mountMatrix([[
      { cellType: 'barcode' }, { cellType: 'barcode' },
    ]], { r1: 0, c1: 0, r2: 0, c2: 1 }).w
    expect(field(allBarcode, '码制')).toBeTruthy()
    expect((field(allBarcode, '码制')!.find('select').element as HTMLSelectElement).value).toBe('__multi__')

    const mixed = mountMatrix([[
      { cellType: 'barcode' }, { cellType: 'qrcode' },
    ]], { r1: 0, c1: 0, r2: 0, c2: 1 }).w
    expect(field(mixed, '码制')).toBeUndefined()
    expect(field(mixed, '纠错级别')).toBeUndefined()
    expect(field(mixed, '文字溢出')).toBeUndefined()
  })

  it('多选边框：预置按缺省档批写，不沿用某格已有的款式', async () => {
    const a: Partial<TableCell> = { borders: { top: border(2, 'dashed') } }
    const b: Partial<TableCell> = { borders: { top: border(3, 'dotted') } }
    const { w, element } = mountMatrix([[a, b]], { r1: 0, c1: 0, r2: 0, c2: 1 })

    await w.findAll('.border-presets button').find(x => x.text() === '全部')!.trigger('click')
    expect(cellOf(element, 0, 0).borders!.top).toEqual({ width: 0.75, style: 'solid', color: '#333333' })
    expect(cellOf(element, 0, 1).borders!.top).toEqual({ width: 0.75, style: 'solid', color: '#333333' })
    // 四边勾选框只反映本次点过的单边，不把预设当成四边都点过（预设的外侧/内部并非四边均沾）
    expect(edgeBoxes(w).every(x => !x.checked && !x.mixed)).toBe(true)
  })

  it('多选的重置按钮恒可点且不显示单格脏点，点击写 undefined 到全部', async () => {
    const { w, element } = mountMatrix([[
      { fontSize: 12 }, { fontSize: 16 },
    ]], { r1: 0, c1: 0, r2: 0, c2: 1 })

    const reset = field(w, '字号 (pt)')!.find('.pd-reset-btn')
    expect(reset.classes()).not.toContain('is-dirty')
    await reset.trigger('click')
    expect(cellOf(element, 0, 0).fontSize).toBeUndefined()
    expect(cellOf(element, 0, 1).fontSize).toBeUndefined()
  })
})

describe('TableCellGroup 单格四边不一致显示混合', () => {
  function mountCells(cells: Array<Partial<TableCell>>) {
    const element = reactive({
      id: 'el-table',
      options: { tableColWidths: cells.map(() => 50), tableRows: [{ id: 'r1', type: 'data', height: 10, cells }] },
      printElementType: { type: 'table', title: '表格' },
    }) as unknown as RuntimeElement
    return mount(TableCellGroup, {
      props: { element, selection: { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2: 0 }, fields: [] },
      global: {
        provide: {
          [TABLE_EDIT_KEY as symbol]: { tableSelection: { value: null }, setTableSelection: () => {}, recordHistory: () => {} },
        },
      },
    })
  }

  it('三行显示「混合」，未改项批写按缺省档，落盘后回到实线 0.75', async () => {
    const cell: Partial<TableCell> = {
      borders: {
        top: { width: 2, style: 'dashed', color: '#ff0000' },
        right: { width: 0.75, style: 'solid', color: '#333333' },
      },
    }
    const w = mountCells([cell])
    const sel = w.find('.border-style-row select').element as HTMLSelectElement
    expect(sel.value).toBe('__mixed__')
    expect(Array.from(sel.options).some(o => o.textContent === '混合' && o.disabled)).toBe(true)

    const width = w.find('.border-style-row input[type="number"]').element as HTMLInputElement
    expect(width.value).toBe('')
    expect(width.placeholder).toBe('混合')
    expect(w.find('.border-style-row .preset-color-trigger').attributes('title')).toBe('混合')
    expect(w.text()).toContain('四边边框规格不一致')

    await w.findAll('.border-presets button').find(b => b.text() === '全部')!.trigger('click')
    expect(cell.borders!.top).toEqual({ width: 0.75, style: 'solid', color: '#333333' })
    expect(cell.borders!.right).toEqual({ width: 0.75, style: 'solid', color: '#333333' })
    await w.vm.$nextTick()
    expect((w.find('.border-style-row select').element as HTMLSelectElement).value).toBe('solid')
    expect(w.text()).not.toContain('四边边框规格不一致')
  })
})

describe('TableCellGroup 按值合并开关', () => {
  const cellOf = (element: RuntimeElement, r: number, c: number) =>
    (element.options.tableRows as any[])[r].cells[c] as TableCell
  const field = (w: ReturnType<typeof mount>, label: string) =>
    w.findAll('.pd-field').find(f => f.find('.pd-label').text() === label)
  const switchOf = (w: ReturnType<typeof mount>) => field(w, '按值合并')!.find('input.pd-switch')

  function mountRows(
    rowTypes: Array<'header' | 'data'>,
    selection: { r1: number; c1: number; r2: number; c2: number },
  ) {
    const element = reactive({
      id: 'el-table',
      options: {
        tableColWidths: [50, 50],
        tableRows: rowTypes.map((type, ri) => ({
          id: `r${ri}`,
          type,
          height: 10,
          cells: [
            { id: `c${ri}-0`, formatter: 'A' },
            { id: `c${ri}-1`, formatter: 'B' },
          ],
        })),
      },
      printElementType: { type: 'table', title: '表格' },
    }) as unknown as RuntimeElement
    const w = mount(TableCellGroup, {
      props: { element, selection: { elementId: 'el-table', ...selection }, fields: [] },
      global: {
        provide: {
          [TABLE_EDIT_KEY as symbol]: { tableSelection: { value: null }, setTableSelection: () => {}, recordHistory: () => {} },
        },
      },
    })
    return { w, element }
  }

  it('数据行单选：回显当前值，勾选写入 mergeSameValue，再点取消', async () => {
    const { w, element } = mountRows(['data'], { r1: 0, c1: 0, r2: 0, c2: 0 })
    expect((switchOf(w).element as HTMLInputElement).checked).toBe(false)
    await switchOf(w).setValue(true)
    expect(cellOf(element, 0, 0).mergeSameValue).toBe(true)
    await switchOf(w).setValue(false)
    expect(cellOf(element, 0, 0).mergeSameValue).toBe(false)
  })

  it('非数据行禁用并给理由，数据行可用', () => {
    const header = mountRows(['header'], { r1: 0, c1: 0, r2: 0, c2: 0 })
    expect((switchOf(header.w).element as HTMLInputElement).disabled).toBe(true)
    expect(switchOf(header.w).attributes('title')).toBe('仅数据行（明细行）支持按值合并')

    const mixed = mountRows(['header', 'data'], { r1: 0, c1: 0, r2: 1, c2: 0 })
    expect((switchOf(mixed.w).element as HTMLInputElement).disabled).toBe(true)

    const data = mountRows(['data', 'data'], { r1: 0, c1: 0, r2: 1, c2: 0 })
    expect((switchOf(data.w).element as HTMLInputElement).disabled).toBe(false)
  })

  it('跨数据行多选批写：整列选中格全部写入', async () => {
    const { w, element } = mountRows(['data', 'data'], { r1: 0, c1: 0, r2: 1, c2: 0 })
    await switchOf(w).setValue(true)
    expect(cellOf(element, 0, 0).mergeSameValue).toBe(true)
    expect(cellOf(element, 1, 0).mergeSameValue).toBe(true)
  })
})
