// web/src/components/print/__tests__/ExpressionEditor.spec.ts
import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ExpressionEditor from '../components/ExpressionEditor.vue'

function mountEditor(expression: string, modelValue = true) {
  return mount(ExpressionEditor, {
    props: { modelValue, businessType: 'purchase_receipt', expression },
    global: {
      stubs: {
        TreeNode: { name: 'TreeNode', template: '<div />' },
      },
    },
  })
}

function textareaValue(wrapper: VueWrapper): string {
  const ta = wrapper.find('textarea.ee-textarea').element as HTMLTextAreaElement
  return ta.value
}

describe('ExpressionEditor 打开时重置表达式（残留回归）', () => {
  it('打开时回显传入的 expression', () => {
    const wrapper = mountEditor('{name}')
    expect(textareaValue(wrapper)).toBe('{name}')
  })

  it('关闭后以空 expression 重新打开不携带上次残留值', async () => {
    const wrapper = mountEditor('{name}')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true, expression: '' })
    expect(textareaValue(wrapper)).toBe('')
  })

  it('关闭后以新 expression 重新打开显示新值', async () => {
    const wrapper = mountEditor('{name}')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true, expression: '{other}' })
    expect(textareaValue(wrapper)).toBe('{other}')
  })
})
