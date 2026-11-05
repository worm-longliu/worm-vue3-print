import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import BaseElement from '../components/elements/BaseElement.vue'
import PositionSizeGroup from '../components/property/PositionSizeGroup.vue'
import { SELECTED_IDS_KEY } from '../composables/useSelection'

function makeEl(options: Record<string, unknown> = {}): RuntimeElement {
  return reactive({
    id: 'e',
    options: { left: 10, top: 20, width: 40, height: 8, formatter: '文本', ...options },
    printElementType: { type: 'text', title: '文本' },
  }) as unknown as RuntimeElement
}

function mountBase(element: RuntimeElement) {
  return mount(BaseElement, {
    props: { element, designMode: true, scale: 1, allElements: [element] },
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
})
