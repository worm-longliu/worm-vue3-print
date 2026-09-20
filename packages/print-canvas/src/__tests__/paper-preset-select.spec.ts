// print-canvas/src/__tests__/paper-preset-select.spec.ts
// 纸张尺寸下拉：新增的针式打印纸 / 标签纸 / 小票纸预设可见、可选，
// 且小票纸按连续纸语义处理（强制纵向、只给纸宽、出纸高度按内容推导）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PropertyPanel from '../components/PropertyPanel.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function pageTemplate(over: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    ...over,
  } as TemplateData
}

function mountPanel(template: TemplateData) {
  return mount(PropertyPanel, {
    props: {
      element: null,
      templateData: template,
      fields: [],
      activeTab: 'page',
      collapsed: false,
    },
  })
}

function optionValues(wrapper: ReturnType<typeof mountPanel>): string[] {
  return wrapper.findAll('select option').map(o => (o.element as HTMLOptionElement).value)
}

describe('纸张尺寸下拉：预设分组', () => {
  it('包含针式打印纸 / 标签纸 / 小票纸预设，并按分组渲染', () => {
    const wrapper = mountPanel(pageTemplate())
    const values = optionValues(wrapper)
    expect(values).toEqual(expect.arrayContaining([
      'DOT_FULL', 'DOT_HALF', 'DOT_THIRD',
      'LABEL_80X60', 'LABEL_60X40', 'LABEL_40X30',
      'THERMAL_57', 'THERMAL_80', 'THERMAL_110',
    ]))
    const groups = wrapper.findAll('select optgroup').map(g => g.attributes('label'))
    expect(groups).toEqual(['常用纸张', '针式打印纸', '标签纸', '小票纸', '连续纸'])
  })

  it('选项显示中文名与尺寸，不直接暴露预设键', () => {
    const wrapper = mountPanel(pageTemplate())
    const texts = wrapper.findAll('select option').map(o => o.text())
    expect(texts).toContain('全等分 241×279.4mm')
    expect(texts).toContain('二等分 241×139.7mm')
    expect(texts).toContain('三等分 241×93.1mm')
    expect(texts).toContain('80×60mm')
    expect(texts).toContain('57mm')
    expect(texts).toContain('110mm')
  })
})

describe('标签纸默认取消页眉页脚与页边距', () => {
  it('切到 80×60mm：四边距与页眉页脚高度归零', async () => {
    const template = pageTemplate({
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 12, elements: [] },
      footer: { height: 8, elements: [] },
    })
    const wrapper = mountPanel(template)
    await wrapper.find('select').setValue('LABEL_80X60')

    const next = wrapper.emitted('update:templateData')?.[0]?.[0] as TemplateData
    expect(next.paperSize).toBe('LABEL_80X60')
    expect(next.margins).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(next.header.height).toBe(0)
    expect(next.footer.height).toBe(0)
  })

  it('页眉页脚已有元素保留（改回高度即可恢复，不静默删内容）', async () => {
    const template = pageTemplate({ header: { height: 12, elements: [{ id: 'h1' }] as any } })
    const wrapper = mountPanel(template)
    await wrapper.find('select').setValue('LABEL_60X40')

    const next = wrapper.emitted('update:templateData')?.[0]?.[0] as TemplateData
    expect(next.header.height).toBe(0)
    expect(next.header.elements).toHaveLength(1)
  })

  it('切回 A4 不覆盖版面设置（默认只在切到标签纸时套用一次）', async () => {
    const wrapper = mountPanel(pageTemplate({ paperSize: 'LABEL_80X60' }))
    await wrapper.find('select').setValue('A4')

    const next = wrapper.emitted('update:templateData')?.[0]?.[0] as TemplateData
    expect(next.paperSize).toBe('A4')
    expect(next.margins).toEqual({ top: 10, right: 10, bottom: 10, left: 10 })
    expect(next.header.height).toBe(0)
  })

  it('标签纸下给出默认版面提示', () => {
    const wrapper = mountPanel(pageTemplate({ paperSize: 'LABEL_80X60' }))
    expect(wrapper.text()).toContain('已取消页边距与页眉页脚')
    expect(mountPanel(pageTemplate({ paperSize: 'A4' })).text()).not.toContain('已取消页边距与页眉页脚')
  })
})

describe('小票纸按连续纸处理', () => {
  it('选中 57mm：写入 paperSize=THERMAL_57、强制纵向、不带旧自定义宽度', async () => {
    const wrapper = mountPanel(pageTemplate({ customWidth: 200, orientation: 'landscape' }))
    const select = wrapper.find('select')
    await select.setValue('THERMAL_57')

    const emitted = wrapper.emitted('update:templateData')
    const next = emitted?.[0]?.[0] as TemplateData
    expect(next.paperSize).toBe('THERMAL_57')
    expect(next.orientation).toBe('portrait')
    expect(next.customWidth).toBeUndefined()
  })

  it('小票纸下只显示纸宽（57），隐藏方向选择', () => {
    const wrapper = mountPanel(pageTemplate({ paperSize: 'THERMAL_57' }))
    const labels = wrapper.findAll('.pd-label').map(l => l.text())
    expect(labels).toContain('纸宽 (mm)')
    expect(labels).not.toContain('方向')

    const widthInput = wrapper.findAll('input').find(i => (i.element as HTMLInputElement).value === '57')
    expect(widthInput).toBeTruthy()
  })

  it('A4 等固定纸仍显示方向选择、不显示纸宽', () => {
    const wrapper = mountPanel(pageTemplate())
    const labels = wrapper.findAll('.pd-label').map(l => l.text())
    // 纸张方向（切换即交换纸张长宽）+ 内容旋转角度（0/90/180/270）均为固定纸可见
    expect(labels).toContain('纸张方向')
    expect(labels).toContain('内容旋转角度')
    expect(labels).not.toContain('纸宽 (mm)')
  })

  it('固定纸显示内容旋转角度四档（0/90/180/270），默认 0° 不旋转', () => {
    const wrapper = mountPanel(pageTemplate({ orientation: 'landscape' }))
    const radios = wrapper.findAll('input[type="radio"]').map(r => (r.element as HTMLInputElement).value)
    expect(radios).toEqual(expect.arrayContaining(['0', '90', '180', '270']))
    const checked = wrapper.findAll('input[type="radio"]:checked').map(r => (r.element as HTMLInputElement).value)
    expect(checked).toContain('0')
  })
})
