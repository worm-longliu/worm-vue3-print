import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PrintDesigner from '../components/PrintDesigner.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function template(): TemplateData {
  return {
    unit: 'mm', paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    elements: [{
      id: 't1', type: 'text',
      options: { left: 10, top: 10, width: 40, height: 10, formatter: '附件单据' },
      printElementType: { type: 'text', title: '文本' },
    }],
  } as TemplateData
}

function mountDesigner() {
  localStorage.clear()
  localStorage.setItem('property-group-advanced', 'true')
  return mount(PrintDesigner, {
    attachTo: document.body,
    props: { initialTemplate: template(), showHelp: true },
  })
}

function advancedGroup(wrapper: ReturnType<typeof mountDesigner>) {
  const group = wrapper.findAll('.property-group')
    .find(item => item.find('.group-title').text() === '高级设置')
  expect(group).toBeTruthy()
  return group!
}

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('高级设置帮助', () => {
  it('点击分组右侧帮助图标：展开对应章节且不改变分组展开态', async () => {
    const wrapper = mountDesigner()
    localStorage.setItem('worm-print-help-tab', 'faq')
    await wrapper.find('.print-element').trigger('mousedown')
    await wrapper.vm.$nextTick()
    const group = advancedGroup(wrapper)
    const expanded = group.classes('is-expanded')

    const help = group.find('.group-help')
    expect(help.exists()).toBe(true)
    await help.trigger('click')
    await wrapper.vm.$nextTick()

    expect(group.classes('is-expanded')).toBe(expanded)
    expect(document.body.querySelector('.help-tab.active')?.textContent).toBe('高级设置')
    const content = document.body.querySelector('.help-content')?.textContent ?? ''
    expect(content).toContain('每页固定')
    expect(content).toContain('右侧')
    expect(content).toContain('每页重复')

    document.body.querySelector<HTMLButtonElement>('.help-modal-close')?.click()
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.help-modal-overlay')).toBeNull()
    wrapper.unmount()
  })

  it('普通工具栏帮助仍使用记住的页签', async () => {
    const wrapper = mountDesigner()
    localStorage.setItem('worm-print-help-tab', 'faq')
    await wrapper.find('.help-button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('.help-tab.active')?.textContent).toBe('常见问题')
    wrapper.unmount()
  })
})
