// print-canvas/src/__tests__/WatermarkConfig.spec.ts
// 水印配置面板：单一「水印表达式」输入——纯文本即静态水印（mode=fixed），
// 含 {字段}/函数调用/字段路径即表达式（mode=binding）；表达式经弹框编辑。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WatermarkConfig from '../components/WatermarkConfig.vue'

const fields = [
  { fieldKey: 'order.no', fieldLabel: '订单号' },
  { fieldKey: 'customer.name', fieldLabel: '客户名称' },
]

const TEXT_INPUT = 'input[placeholder*="{printDate}"]'
const TEST_VALUE_INPUT = 'input[placeholder="表达式取不到值时预览显示"]'

function lastEmit(wrapper: ReturnType<typeof mount>) {
  const emitted = wrapper.emitted('update:modelValue') ?? []
  return emitted[emitted.length - 1]?.[0] as Record<string, any> | undefined
}

function mountConfig(modelValue: Record<string, any> = {}) {
  return mount(WatermarkConfig, {
    props: { modelValue, fields },
  })
}

describe('WatermarkConfig', () => {
  it('输入表达式写回 binding，并展示测试值输入', async () => {
    const wrapper = mountConfig()
    await wrapper.find(TEXT_INPUT).setValue('{order.no}')
    const last = lastEmit(wrapper)
    expect(last?.mode).toBe('binding')
    expect(last?.binding).toBe('{order.no}')
    expect(last?.content).toBe('')
    expect(wrapper.find(TEST_VALUE_INPUT).exists()).toBe(true)
  })

  it('纯文本按静态水印落盘（mode=fixed + content），不展示测试值', async () => {
    const wrapper = mountConfig()
    await wrapper.find(TEXT_INPUT).setValue('内部资料 禁止外传')
    const last = lastEmit(wrapper)
    expect(last?.mode).toBe('fixed')
    expect(last?.content).toBe('内部资料 禁止外传')
    expect(last?.binding).toBe('')
    expect(wrapper.find(TEST_VALUE_INPUT).exists()).toBe(false)
  })

  it('函数调用与无花括号字段路径同样按表达式处理', async () => {
    const call = mountConfig()
    await call.find(TEXT_INPUT).setValue("CONCAT('单号：', order.no)")
    expect(lastEmit(call)?.mode).toBe('binding')

    const path = mountConfig()
    await path.find(TEXT_INPUT).setValue('order.no')
    expect(lastEmit(path)?.mode).toBe('binding')
  })

  it('表达式经「编辑表达式」弹框编辑并写回 binding', async () => {
    const wrapper = mountConfig({ mode: 'binding', binding: '' })
    await wrapper.find('button').trigger('click')
    const textarea = wrapper.find('.ee-textarea')
    expect(textarea.exists()).toBe(true)
    await textarea.setValue('{printDate} {printTime}')
    const footerButtons = wrapper.findAll('.pd-dialog-footer button')
    await footerButtons[footerButtons.length - 1].trigger('click')
    const last = lastEmit(wrapper)
    expect(last?.mode).toBe('binding')
    expect(last?.binding).toBe('{printDate} {printTime}')
  })

  it('不再展示模式切换、预设绑定字段与时间戳配置', () => {
    const wrapper = mountConfig({ mode: 'binding', binding: '{order.no}' })
    expect(wrapper.find('input[type="radio"]').exists()).toBe(false)
    // 面板里唯一的 select 是密度；预设字段下拉已移除
    expect(wrapper.find('select.pd-select').exists()).toBe(true)
    expect(wrapper.findAll('option[value="order.no"]')).toHaveLength(0)
    // 时间戳开关与时间格式输入已移除
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.find('input[placeholder="YYYY-MM-DD HH:mm"]').exists()).toBe(false)
  })

  it('存量模板（binding 存无花括号字段路径）仅改其它属性时仍按表达式落盘', async () => {
    const wrapper = mountConfig({ mode: 'binding', binding: 'order.no' })
    await wrapper.find('input[type="range"]').setValue(30)
    const last = lastEmit(wrapper)
    expect(last?.mode).toBe('binding')
    expect(last?.binding).toBe('order.no')
    expect(last?.rotate).toBe(30)
  })

  it('密度预设写入 tileWidth/Height', async () => {
    const wrapper = mountConfig()
    await wrapper.find('select').setValue('loose')
    const last = lastEmit(wrapper)
    expect(last?.tileWidth).toBe(340)
    expect(last?.tileHeight).toBe(260)
  })

  it('存量固定文本模板：文本框回显内容', () => {
    const wrapper = mountConfig({ content: '内部资料' })
    const input = wrapper.find(TEXT_INPUT)
    expect((input.element as HTMLInputElement).value).toBe('内部资料')
  })
})
