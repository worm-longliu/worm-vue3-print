// web/src/components/print/__tests__/ExpressionEditor.spec.ts
import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ExpressionEditor from '../components/ExpressionEditor.vue'

const testFields = [
  { fieldKey: 'supplier', fieldLabel: '供应商信息', fieldType: 'string', sortOrder: 1 },
  { fieldKey: 'supplier.name', fieldLabel: '供应商名称', fieldType: 'string', sortOrder: 2 },
  { fieldKey: 'supplier.phone', fieldLabel: '供应商电话', fieldType: 'string', sortOrder: 3 },
  { fieldKey: 'goods', fieldLabel: '商品明细', fieldType: 'list', sortOrder: 4 },
  { fieldKey: 'goods.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 5 },
  { fieldKey: 'goods.spec', fieldLabel: '规格', fieldType: 'string', sortOrder: 6 },
]

function mountEditor(expression: string, modelValue = true) {
  return mount(ExpressionEditor, {
    props: { modelValue, expression, fields: testFields },
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

describe('ExpressionEditor 字段页（宿主 fields 驱动）', () => {
  it('渲染分组标题与全路径字段', () => {
    const wrapper = mountEditor('')
    expect(wrapper.text()).toContain('供应商信息')
    expect(wrapper.text()).toContain('供应商名称')
    expect(wrapper.text()).toContain('supplier.name')
    expect(wrapper.text()).toContain('商品明细')
  })

  it('双击字段插入完整路径表达式', async () => {
    const wrapper = mountEditor('')
    const item = wrapper.findAll('.ee-field-item').find(el => el.text().includes('规格'))
    await item!.trigger('dblclick')
    expect(textareaValue(wrapper)).toBe('{goods.spec}')
  })

  it('搜索关键字过滤字段（分组标题不计入字段行）', async () => {
    const wrapper = mountEditor('')
    const input = wrapper.find('.ee-content-search input')
    ;(input.element as HTMLInputElement).value = '商品'
    await input.trigger('input')
    const items = wrapper.findAll('.ee-field-item')
    expect(items.length).toBe(1)
    expect(items[0]!.text()).toContain('商品名称')
  })
})

describe('ExpressionEditor 智能大括号处理', () => {
  // 设置 textarea 内容与光标位置（触发 input 同步 v-model）
  function setContentAndCaret(wrapper: VueWrapper, value: string, caret: number) {
    const ta = wrapper.find('textarea.ee-textarea').element as HTMLTextAreaElement
    ta.value = value
    ta.selectionStart = ta.selectionEnd = caret
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function caretOf(wrapper: VueWrapper): number {
    const ta = wrapper.find('textarea.ee-textarea').element as HTMLTextAreaElement
    return ta.selectionStart
  }

  async function dblclickItem(wrapper: VueWrapper, label: string, tab?: string) {
    if (tab) {
      const tabEl = wrapper
        .findAll('.ee-nav-tab')
        .find(el => el.text().includes(tab))
      expect(tabEl, `找不到 ${tab} 页签`).toBeTruthy()
      await tabEl!.trigger('click')
    }
    const item = wrapper
      .findAll('.ee-list-item, .ee-field-item')
      .find(el => el.text().includes(label))
    expect(item, `找不到包含 ${label} 的列表项`).toBeTruthy()
    await item!.trigger('dblclick')
  }

  it('空编辑器双击函数自动包裹大括号，且光标定位到 () 内', async () => {
    const wrapper = mountEditor('')
    await dblclickItem(wrapper, 'SUM', '函数')
    expect(textareaValue(wrapper)).toBe('{SUM()}')
    expect(caretOf(wrapper)).toBe(5)
  })

  it('光标在未闭合 { 块内双击函数插入裸函数（不重复包裹）', async () => {
    const wrapper = mountEditor('')
    setContentAndCaret(wrapper, '{', 1)
    await dblclickItem(wrapper, 'SUM', '函数')
    expect(textareaValue(wrapper)).toBe('{SUM()')
  })

  it('格式化函数同样自动包裹大括号', async () => {
    const wrapper = mountEditor('')
    await dblclickItem(wrapper, 'MONEY', '函数')
    expect(textareaValue(wrapper)).toBe('{MONEY()}')
  })

  it('光标在函数参数内双击字段去除大括号', async () => {
    const wrapper = mountEditor('')
    setContentAndCaret(wrapper, '{SUM(', 5)
    await dblclickItem(wrapper, '规格')
    expect(textareaValue(wrapper)).toBe('{SUM(goods.spec')
  })

  it('光标在函数参数内双击变量去除大括号', async () => {
    const wrapper = mountEditor('')
    setContentAndCaret(wrapper, '{IF(', 4)
    await dblclickItem(wrapper, '当前页码', '变量')
    expect(textareaValue(wrapper)).toBe('{IF(pageIndex')
  })

  it('光标不在函数参数内双击字段保留大括号', async () => {
    const wrapper = mountEditor('')
    setContentAndCaret(wrapper, '合计', 2)
    await dblclickItem(wrapper, '规格')
    expect(textareaValue(wrapper)).toBe('合计{goods.spec}')
  })

  it('光标在函数参数内双击函数插入裸函数', async () => {
    const wrapper = mountEditor('')
    setContentAndCaret(wrapper, '{SUM(', 5)
    await dblclickItem(wrapper, 'AVG', '函数')
    expect(textareaValue(wrapper)).toBe('{SUM(AVG()')
  })
})
