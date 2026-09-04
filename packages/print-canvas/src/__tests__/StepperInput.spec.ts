import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StepperInput from '../components/property/StepperInput.vue'

/** 挂载 StepperInput 的辅助函数 */
function makeWrapper(props: Record<string, unknown> = {}) {
  return mount(StepperInput, {
    props: {
      modelValue: 10,
      ...props,
    },
  })
}

describe('StepperInput', () => {
  it('渲染顺序：左侧减号、中间输入框、右侧加号', () => {
    const wrapper = makeWrapper()
    const buttons = wrapper.findAll('button')
    const input = wrapper.find('input')
    expect(buttons.length).toBe(2)
    // 减号按钮在输入框之前，加号按钮在输入框之后
    const inputEl = input.element
    const minusEl = buttons[0].element
    const plusEl = buttons[1].element
    expect(minusEl.compareDocumentPosition(inputEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(plusEl.compareDocumentPosition(inputEl) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    // 语义可读
    expect(buttons[0].text()).toContain('−')
    expect(buttons[1].text()).toContain('+')
  })

  it('显示取整后的值（不做四舍五入之外的运算）', () => {
    const wrapper = makeWrapper({ modelValue: 12.6 })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('13')
  })

  it('点击加号：值 + step 并 emit 整数', async () => {
    const wrapper = makeWrapper({ modelValue: 10 })
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([11])
  })

  it('点击减号：值 - step 并 emit 整数', async () => {
    const wrapper = makeWrapper({ modelValue: 10 })
    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([9])
  })

  it('自定义 step 生效', async () => {
    const wrapper = makeWrapper({ modelValue: 10, step: 5 })
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([15])
  })

  it('到达 min 时减号禁用', async () => {
    const wrapper = makeWrapper({ modelValue: 0, min: 0 })
    expect(wrapper.findAll('button')[0].attributes('disabled')).toBeDefined()
  })

  it('到达 max 时加号禁用', async () => {
    const wrapper = makeWrapper({ modelValue: 100, max: 100 })
    expect(wrapper.findAll('button')[1].attributes('disabled')).toBeDefined()
  })

  it('越界步进会被 min/max 夹取', async () => {
    const minusWrapper = makeWrapper({ modelValue: 0, min: 0 })
    await minusWrapper.findAll('button')[0].trigger('click')
    // 已禁用，点击不应产生新值
    expect(minusWrapper.emitted('update:modelValue')).toBeUndefined()

    const plusWrapper = makeWrapper({ modelValue: 100, max: 100 })
    await plusWrapper.findAll('button')[1].trigger('click')
    expect(plusWrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('手动输入小数并在失焦/回车后提交为整数', async () => {
    const wrapper = makeWrapper({ modelValue: 10 })
    const input = wrapper.find('input')
    await input.setValue('15.7')
    await input.trigger('change')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([16])
  })

  it('手动输入会被 min/max 夹取', async () => {
    const wrapper = makeWrapper({ modelValue: 10, min: 5, max: 20 })
    const input = wrapper.find('input')
    await input.setValue('99')
    await input.trigger('change')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([20])

    const wrapper2 = makeWrapper({ modelValue: 10, min: 5, max: 20 })
    await wrapper2.find('input').setValue('1')
    await wrapper2.find('input').trigger('change')
    expect(wrapper2.emitted('update:modelValue')![0]).toEqual([5])
  })

  it('输入为空时回退到当前值，不产生 NaN', async () => {
    const wrapper = makeWrapper({ modelValue: 10 })
    const input = wrapper.find('input')
    // happy-dom 的 setValue 不接受空值，直接改 DOM 值模拟清空输入
    ;(input.element as HTMLInputElement).value = ''
    await input.trigger('input')
    await input.trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    // 输入框回显原值
    expect((input.element as HTMLInputElement).value).toBe('10')
  })

  // ─── 小数精度（按 step 推导） ───

  it('小数步进：step=0.5 保留 1 位小数', async () => {
    const wrapper = makeWrapper({ modelValue: 1.5, step: 0.5 })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('1.5')
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([2])
  })

  it('小数步进：step=0.25 保留 2 位小数', async () => {
    const wrapper = makeWrapper({ modelValue: 0.75, step: 0.25 })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('0.75')
    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([0.5])
  })

  it('小数步进：step=0.1 保留 1 位小数并规避浮点误差', async () => {
    const wrapper = makeWrapper({ modelValue: 0.3, step: 0.1 })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('0.3')
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([0.4])
  })

  it('小数步进：手动输入按 step 精度保留小数', async () => {
    const wrapper = makeWrapper({ modelValue: 1, step: 0.25 })
    const input = wrapper.find('input')
    await input.setValue('1.77')
    await input.trigger('change')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([1.77])
  })

  // ─── 未设置（undefined / 继承默认）态 ───

  it('未设置时输入框显示空值并展示占位提示', () => {
    const wrapper = mount(StepperInput, {
      props: { modelValue: undefined, placeholder: '默认' },
    })
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect((input.element as HTMLInputElement).placeholder).toBe('默认')
  })

  it('未设置时点击加号：从 min 起步生成具体值', async () => {
    const wrapper = mount(StepperInput, {
      props: { modelValue: undefined, min: 5, step: 1 },
    })
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([6])
  })

  it('未设置时减号禁用，清空失焦保持未设置', async () => {
    const wrapper = mount(StepperInput, {
      props: { modelValue: undefined, min: 0 },
    })
    expect(wrapper.findAll('button')[0].attributes('disabled')).toBeDefined()
    const input = wrapper.find('input')
    ;(input.element as HTMLInputElement).value = ''
    await input.trigger('input')
    await input.trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect((input.element as HTMLInputElement).value).toBe('')
  })
})
