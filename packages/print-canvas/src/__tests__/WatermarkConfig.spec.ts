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
  it('绑定字段模式下的自定义表达式写回 binding', async () => {
    const wrapper = mountConfig()
    const radios = wrapper.findAll('input[type="radio"]')
    await radios[1].setValue('binding')
    const exprInput = wrapper.find('input[placeholder*="字段路径"]')
    expect(exprInput.exists()).toBe(true)
    await exprInput.setValue('order.no')
    const last = lastEmit(wrapper)
    expect(last?.mode).toBe('binding')
    expect(last?.binding).toBe('order.no')
  })

  it('密度预设写入 tileWidth/Height', async () => {
    const wrapper = mountConfig()
    const select = wrapper.find('select')
    await select.setValue('loose')
    const last = lastEmit(wrapper)
    expect(last?.tileWidth).toBe(340)
    expect(last?.tileHeight).toBe(260)
  })

  it('开启时间戳显示时间格式输入并可自定义', async () => {
    const wrapper = mountConfig()
    await wrapper.find('input[type="checkbox"]').setValue()
    const formatInput = wrapper.find('input[placeholder="YYYY-MM-DD HH:mm"]')
    expect(formatInput.exists()).toBe(true)
    await formatInput.setValue('YYYY/MM/DD')
    const last = lastEmit(wrapper)
    expect(last?.format).toBe('YYYY/MM/DD')
  })

  it('向后兼容：默认 fixed 模式且提供固定文本输入', () => {
    const wrapper = mountConfig({ content: '内部资料' })
    expect(wrapper.find('input[placeholder="水印文字"]').exists()).toBe(true)
  })
})