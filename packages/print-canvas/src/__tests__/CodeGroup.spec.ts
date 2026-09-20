import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import CodeGroup from '../components/property/CodeGroup.vue'
import PropertyPanel from '../components/PropertyPanel.vue'
import type { RuntimeElement, TemplateData } from '@worm-vue3-print/core/designer'

function makeElement(type: 'barcode' | 'qrcode' | 'text', options: Record<string, any> = {}): RuntimeElement {
  return reactive({
    id: `el-${type}`,
    options: { left: 0, top: 0, width: 56.4, height: 14.1, ...options },
    printElementType: { type, title: type },
  }) as unknown as RuntimeElement
}

function mountCodeGroup(element: RuntimeElement) {
  return mount(CodeGroup, { props: { element } })
}

function value(select: { element: unknown }): string {
  return (select.element as HTMLSelectElement).value
}

describe('CodeGroup 条形码元素：码制与自定义设置', () => {
  it('存量小写码制归一化显示（code128 → CODE128）', () => {
    const w = mountCodeGroup(makeElement('barcode', { barcodeType: 'code128' }))
    expect(value(w.findAll('select')[0]!)).toBe('CODE128')
  })

  it('切换码制写回 options 并通知变更', async () => {
    const element = makeElement('barcode', {})
    const w = mountCodeGroup(element)
    await w.findAll('select')[0]!.setValue('EAN13')
    expect(element.options.barcodeType).toBe('EAN13')
    expect(w.emitted('change')).toHaveLength(1)
  })

  it('码制切回 CODE128（渲染缺省值）时清除字段，避免模板冗余', async () => {
    const element = makeElement('barcode', { barcodeType: 'EAN13' })
    const w = mountCodeGroup(element)
    await w.findAll('select')[0]!.setValue('CODE128')
    expect(element.options.barcodeType).toBeUndefined()
  })

  it('显示文本勾选状态与 hideTitle 互为反义', async () => {
    const element = makeElement('barcode', {})
    const w = mountCodeGroup(element)
    const checkbox = w.find('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)

    await checkbox.setValue(false)
    expect(element.options.hideTitle).toBe(true)
    await checkbox.setValue(true)
    expect(element.options.hideTitle).toBeUndefined()
  })

  it('条宽以 2~4 倍率写入 barWidth（与出图端 jsbarcode width 口径一致）', async () => {
    const element = makeElement('barcode', {})
    const w = mountCodeGroup(element)
    const barWidth = w.findAll('input[type="number"]')[0]!
    expect((barWidth.element as HTMLInputElement).value).toBe('2')

    await barWidth.setValue('3')
    await barWidth.trigger('change')
    expect(element.options.barWidth).toBe(3)
  })

  it('自定义设置：最大宽高写入 options（条形码不提供缩放模式，尺寸由条宽与 dpi 结算）', async () => {
    const element = makeElement('barcode', {})
    const w = mountCodeGroup(element)
    // 下拉只有码制与打印机分辨率：拉伸会把条宽拉成非整数，故条形码没有缩放模式字段
    expect(w.findAll('select')).toHaveLength(2)
    expect(w.findAll('.pd-label').map(n => n.text())).not.toContain('缩放模式')

    // 数字输入顺序：条宽 / 文本字号 / 最大宽度 / 最大高度
    const numbers = w.findAll('input[type="number"]')
    await numbers[2]!.setValue('30')
    await numbers[2]!.trigger('change')
    await numbers[3]!.setValue('10')
    await numbers[3]!.trigger('change')
    expect(element.options.maxWidth).toBe(30)
    expect(element.options.maxHeight).toBe(10)
  })
})

describe('CodeGroup 打印机分辨率（条宽点对齐）', () => {
  it('缺省为「不对齐」，选中 dpi 写入 printerDpi 并通知变更', async () => {
    const element = makeElement('barcode', {})
    const w = mountCodeGroup(element)
    const dpi = w.findAll('select')[1]!
    expect(value(dpi)).toBe('')

    await dpi.setValue('203')
    expect(element.options.printerDpi).toBe(203)
    expect(w.emitted('change')).toHaveLength(1)
  })

  it('切回「不对齐」时清除字段', async () => {
    const element = makeElement('barcode', { printerDpi: 300 })
    const w = mountCodeGroup(element)
    expect(value(w.findAll('select')[1]!)).toBe('300')

    await w.findAll('select')[1]!.setValue('')
    expect(element.options.printerDpi).toBeUndefined()
  })

  it('条宽始终可调：它是落纸尺寸的第一来源，dpi 在此基础上吸附整数点', () => {
    const manual = mountCodeGroup(makeElement('barcode', {}))
    const aligned = mountCodeGroup(makeElement('barcode', { printerDpi: 203 }))
    expect(manual.text()).toContain('条宽（倍率）')
    expect(aligned.text()).toContain('条宽（倍率）')
    expect(aligned.text()).toContain('吸附到最近的整数打印点')
  })

  it('最大宽高始终可用：作为结算上限参与，而非事后 CSS 缩放', () => {
    const manual = mountCodeGroup(makeElement('barcode', {}))
    const aligned = mountCodeGroup(makeElement('barcode', { printerDpi: 203 }))
    // 下拉：码制 / 打印机分辨率（条形码无缩放模式）
    expect(manual.findAll('select')).toHaveLength(2)
    expect(aligned.findAll('select')).toHaveLength(2)
    // 数字输入：条宽 / 文本字号 / 最大宽度 / 最大高度 → 与是否点对齐无关
    expect(manual.findAll('input[type="number"]')).toHaveLength(4)
    expect(aligned.findAll('input[type="number"]')).toHaveLength(4)
    expect(aligned.text()).toContain('可用「最大宽高」限制上限')
  })

  it('二维码不受 dpi 影响，仍显示缩放模式与最大宽高', () => {
    const w = mountCodeGroup(makeElement('qrcode', { printerDpi: 203 }))
    expect(w.text()).toContain('缩放模式')
    expect(w.text()).toContain('最大宽度')
  })
})

describe('CodeGroup 二维码元素', () => {
  it('纠错级别回显与写回', async () => {
    const element = makeElement('qrcode', { qrCodeLevel: 'H' })
    const w = mountCodeGroup(element)
    const level = w.findAll('select')[0]!
    expect(value(level)).toBe('H')

    await level.setValue('Q')
    expect(element.options.qrCodeLevel).toBe('Q')
    expect(w.emitted('change')).toHaveLength(1)
  })

  it('二维码不展示条码独有项（码制 / 条宽 / 显示文本）', () => {
    const w = mountCodeGroup(makeElement('qrcode', {}))
    expect(w.text()).not.toContain('码制')
    expect(w.text()).not.toContain('条宽')
    expect(w.find('input[type="checkbox"]').exists()).toBe(false)
  })
})

function tpl(): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] }, elements: [],
  } as TemplateData
}

describe('PropertyPanel 挂载条码设置分组', () => {
  function mountPanel(element: RuntimeElement) {
    return mount(PropertyPanel, {
      props: { element, templateData: tpl(), fields: [], activeTab: 'element', collapsed: false },
    })
  }

  it('条形码 / 二维码元素显示「条码设置」', () => {
    expect(mountPanel(makeElement('barcode')).text()).toContain('条码设置')
    expect(mountPanel(makeElement('qrcode')).text()).toContain('条码设置')
  })

  it('文本元素不显示「条码设置」', () => {
    expect(mountPanel(makeElement('text')).text()).not.toContain('条码设置')
  })
})
