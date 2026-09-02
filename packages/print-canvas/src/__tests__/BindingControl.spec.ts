import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BindingControl from '../components/property/BindingControl.vue'

describe('BindingControl', () => {
  it('未绑定时显示输入框与表达式占位提示', () => {
    const wrapper = mount(BindingControl, {
      props: {
        descriptor: { targetPath: 'options.formatter', label: '内容', dataSource: 'main' },
        modelValue: '',
        businessType: 'purchase_receipt',
      },
    })
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).placeholder).toContain('表达式')
  })

  it('已绑定时回显绑定表达式', () => {
    const wrapper = mount(BindingControl, {
      props: {
        descriptor: { targetPath: 'options.formatter', label: '内容', dataSource: 'main' },
        modelValue: '{supplier.name}',
        businessType: 'purchase_receipt',
      },
    })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('{supplier.name}')
  })
})
