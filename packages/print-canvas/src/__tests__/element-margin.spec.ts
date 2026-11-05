import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import BaseElement from '../components/elements/BaseElement.vue'
import { useAdsorbManager } from '../composables/useAdsorbManager'
import { mmToPx } from '@worm-vue3-print/core/designer'
import PositionSizeGroup from '../components/property/PositionSizeGroup.vue'
import { SELECTED_IDS_KEY } from '../composables/useSelection'

function makeEl(options: Record<string, unknown> = {}): RuntimeElement {
  return reactive({
    id: 'e',
    options: { left: 10, top: 20, width: 40, height: 8, formatter: '文本', ...options },
    printElementType: { type: 'text', title: '文本' },
  }) as unknown as RuntimeElement
}

function mountBase(element: RuntimeElement, designMode = true) {
  return mount(BaseElement, {
    props: { element, designMode, scale: 1, allElements: [element] },
    global: { provide: { [SELECTED_IDS_KEY as symbol]: ref(new Set<string>()) } },
  })
}

describe('canvas 元素四向外边距', () => {
  it('根元素只偏移边框盒，不改坐标与尺寸', () => {
    const wrapper = mountBase(makeEl({ marginTop: 2, marginRight: 3, marginBottom: 4, marginLeft: 5 }))
    const style = (wrapper.find('.print-element').element as HTMLElement).style
    expect(style.left).toBe('10mm')
    expect(style.top).toBe('20mm')
    expect(style.width).toBe('40mm')
    expect(style.height).toBe('8mm')
    expect(style.marginTop).toBe('2mm')
    expect(style.marginRight).toBe('3mm')
    expect(style.marginBottom).toBe('4mm')
    expect(style.marginLeft).toBe('5mm')
  })

  it('缺省与零值不生成外边距声明', () => {
    const style = mountBase(makeEl({ marginTop: 0 })).find('.print-element').attributes('style') ?? ''
    expect(style).not.toContain('margin-')
  })

  it('属性面板提供四向输入并保留负数', async () => {
    const element = makeEl()
    const wrapper = mount(PositionSizeGroup, { props: { element } })
    const fields = wrapper.findAll('.margin-grid .pd-field')
    expect(fields).toHaveLength(4)
    expect(fields.map(field => field.find('.pd-label').text())).toEqual(['上', '右', '下', '左'])
    const input = fields[3]!.find('input')
    expect(input.attributes('min')).toBeUndefined()
    await input.setValue('-3')
    await input.trigger('change')
    expect(element.options.marginLeft).toBe(-3)
  })

  it('非零外边距在外接盒对应边上显示淡红线并继承元素边框', () => {
    const wrapper = mountBase(makeEl({
      marginTop: 2, marginRight: 3, marginBottom: 4, marginLeft: 5,
      borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#000',
    }))
    const guide = wrapper.find('.element-margin-guide')
    expect(guide.exists()).toBe(true)
    const style = (guide.element as HTMLElement).style
    expect(style.left).toBe('-5mm')
    expect(style.top).toBe('-2mm')
    expect(style.width).toBe('48mm')
    expect(style.height).toBe('14mm')
    expect(style.borderTop).toContain('1.5pt dashed')
    expect(style.borderRight).toContain('1.5pt dashed')
    expect(style.borderBottom).toContain('1.5pt dashed')
    expect(style.borderLeft).toContain('1.5pt dashed')
    expect(style.borderTopColor).toBe('rgba(239, 68, 68, 0.35)')
  })

  it('分边外边距只画对应指示线并继承分边线型', () => {
    const wrapper = mountBase(makeEl({
      marginTop: 2, marginBottom: 3,
      borderWidth: 1, borderStyle: 'solid',
      borders: { bottom: { width: 2, style: 'dotted', color: '#000' } },
    }))
    const style = (wrapper.find('.element-margin-guide').element as HTMLElement).style
    expect(style.borderTop).toContain('1pt solid')
    expect(style.borderBottom).toContain('2pt dotted')
    expect(style.borderRight).toBe('')
    expect(style.borderLeft).toBe('')
  })

  it('零外边距与非设计态不显示辅助线', () => {
    expect(mountBase(makeEl({ marginTop: 0 })).find('.element-margin-guide').exists()).toBe(false)
    expect(mountBase(makeEl({ marginTop: 2 }), false).find('.element-margin-guide').exists()).toBe(false)
  })

  it('负外边距按实际外接位置绘制且未设置边框时使用默认淡红实线', () => {
    const wrapper = mountBase(makeEl({ marginTop: -2, marginLeft: -3 }))
    const style = (wrapper.find('.element-margin-guide').element as HTMLElement).style
    expect(style.left).toBe('3mm')
    expect(style.top).toBe('2mm')
    expect(style.width).toBe('37mm')
    expect(style.height).toBe('6mm')
    expect(style.borderTop).toContain('1px solid')
    expect(style.borderLeft).toContain('1px solid')
  })

  it('吸附候选与拖拽主元素都使用外边距盒', () => {
    const other = makeEl({ left: 20, top: 0, width: 40, height: 10, marginLeft: 2, marginRight: 3 })
    const { requestAdsorb } = useAdsorbManager({
      getElements: () => [other],
      getPaperSize: () => ({ width: 200, height: 200 }),
      config: { adsorbMin: 1, showAdsorbLine: false },
    })
    expect(requestAdsorb({ id: 'moving', left: 65.5, top: 0, width: 20, height: 10 }).left).toBe(65)
  })

  it('带边距拖拽只回写外边距盒坐标，不重复偏移', async () => {
    const element = makeEl({ marginLeft: 5, marginTop: 4 })
    const wrapper = mountBase(element)
    await wrapper.find('.print-element').trigger('mousedown', { clientX: 100, clientY: 100, button: 0 })
    document.dispatchEvent(new MouseEvent('mousemove', {
      clientX: 100 + 20 * mmToPx(1), clientY: 100 + 20 * mmToPx(1),
    }))
    document.dispatchEvent(new MouseEvent('mouseup', {
      clientX: 100 + 20 * mmToPx(1), clientY: 100 + 20 * mmToPx(1),
    }))
    expect(element.options.left).toBeCloseTo(30)
    expect(element.options.top).toBeCloseTo(40)
    expect(element.options.marginLeft).toBe(5)
    expect(element.options.marginTop).toBe(4)
  })

})
