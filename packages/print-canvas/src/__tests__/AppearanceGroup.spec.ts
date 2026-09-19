import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppearanceGroup from '../components/property/AppearanceGroup.vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

function makeElement(type: string, options: Record<string, any> = {}): RuntimeElement {
  return {
    id: 'el-1',
    options: { left: 0, top: 0, width: 42.3, height: 7.1, fontSize: 12, formatter: '文本', ...options },
    printElementType: { type, title: type },
  } as unknown as RuntimeElement
}

function mountGroup(element: RuntimeElement) {
  return mount(AppearanceGroup, {
    props: { element, isTextType: true },
  })
}

/** 文字溢出下拉：模板中唯一含「自动缩小」选项的 select */
function fitSelect(wrapper: ReturnType<typeof mountGroup>) {
  return wrapper.findAll('select').find(s => s.text().includes('自动缩小'))!
}

describe('AppearanceGroup 文字溢出显示形式', () => {
  it('文本元素未配置时显示默认「截断」', () => {
    const wrapper = mountGroup(makeElement('text'))
    expect(fitSelect(wrapper).element.value).toBe('clip')
  })

  it('长文本元素未配置时显示默认「自适应行高」', () => {
    const wrapper = mountGroup(makeElement('longText'))
    expect(fitSelect(wrapper).element.value).toBe('autoHeight')
  })

  it('切换下拉写入 options.textFit', async () => {
    const element = makeElement('text')
    const wrapper = mountGroup(element)
    await fitSelect(wrapper).setValue('shrink')
    expect(element.options.textFit).toBe('shrink')
  })

  it('最小字号仅在选择「自动缩小」时出现', async () => {
    const wrapper = mountGroup(makeElement('text', { textFit: 'clip' }))
    expect(wrapper.text()).not.toContain('最小字号')

    await fitSelect(wrapper).setValue('shrink')
    expect(wrapper.text()).toContain('最小字号')
  })

  it('自动换行默认开启，取消勾选写入 wordWrap=false', async () => {
    const element = makeElement('text')
    const wrapper = mountGroup(element)
    const checkbox = wrapper.find('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)

    await checkbox.setValue(false)
    expect(element.options.wordWrap).toBe(false)
  })
})
