// print-canvas/src/__tests__/WatermarkConfig.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WatermarkConfig from '../components/WatermarkConfig.vue'

const fields = [
  { fieldKey: 'order.no', fieldLabel: '订单号' },
  { fieldKey: 'customer.name', fieldLabel: '客户名称' },
]

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
  it('字段表达式模式：直接输入写回 binding', async () => {
    const wrapper = mountConfig()
    const radios = wrapper.findAll('input[type="radio"]')
    await radios[1].setValue('binding')
    const exprInput = wrapper.find('input[placeholder*="{printDate}"]')
    expect(exprInput.exists()).toBe(true)
    await exprInput.setValue('{order.no}')
    const last = lastEmit(wrapper)
    expect(last?.mode).toBe('binding')
    expect(last?.binding).toBe('{order.no}')
  })

  it('字段表达式经「编辑表达式」弹框编辑并写回 binding', async () => {
    const wrapper = mountConfig({ mode: 'binding', binding: '' })
    await wrapper.find('button').trigger('click')
    const textarea = wrapper.find('.ee-textarea')
    expect(textarea.exists()).toBe(true)
    await textarea.setValue('{printDate} {printTime}')
    const footerButtons = wrapper.findAll('.pd-dialog-footer button')
    await footerButtons[footerButtons.length - 1].trigger('click')
    const last = lastEmit(wrapper)
    expect(last?.binding).toBe('{printDate} {printTime}')
  })

  it('不再展示预设绑定字段与时间戳配置', () => {
    const wrapper = mountConfig({ mode: 'binding', binding: 'order.no' })
    // 预设字段下拉已移除（面板里唯一的 select 是密度）
    expect(wrapper.find('select.pd-select').exists()).toBe(true)
    expect(wrapper.findAll('option[value="order.no"]')).toHaveLength(0)
    // 时间戳开关与时间格式输入已移除
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.find('input[placeholder="YYYY-MM-DD HH:mm"]').exists()).toBe(false)
  })

  it('密度预设写入 tileWidth/Height', async () => {
    const wrapper = mountConfig()
    const select = wrapper.find('select')
    await select.setValue('loose')
    const last = lastEmit(wrapper)
    expect(last?.tileWidth).toBe(340)
    expect(last?.tileHeight).toBe(260)
  })

  it('向后兼容：默认 fixed 模式且提供固定文本输入', () => {
    const wrapper = mountConfig({ content: '内部资料' })
    expect(wrapper.find('input[placeholder="水印文字"]').exists()).toBe(true)
  })
})
