// 扩展元素注册表：内置 12 种之外的元素（如 ECharts 图表）由独立可选包注册，
// 主包只认注册表、不依赖任何图表库。注册表是模块级单例，每个用例后必须清空。
import { describe, it, expect, afterEach } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import type { ElementExtension } from '../composables/useElementExtensionRegistry'
import {
  registerElementExtension,
  unregisterElementExtension,
  getElementExtensions,
  getElementExtension,
  clearElementExtensions,
} from '../composables/useElementExtensionRegistry'

function stubComponent(name: string) {
  return defineComponent({ name, setup: () => () => h('div', { class: name }) })
}

function chartExtension(overrides: Partial<ElementExtension> = {}): ElementExtension {
  return {
    type: 'chart',
    label: '图表',
    icon: '▤',
    canvasComponent: stubComponent('chart-canvas'),
    ...overrides,
  }
}

afterEach(() => clearElementExtensions())

describe('useElementExtensionRegistry', () => {
  it('注册后可查询到完整扩展项', () => {
    const canvasComponent = stubComponent('chart-canvas')
    registerElementExtension(chartExtension({ canvasComponent }))

    expect(getElementExtensions()).toHaveLength(1)
    const chart = getElementExtension('chart')
    expect(chart).toMatchObject({ type: 'chart', label: '图表', icon: '▤' })
    expect(chart?.canvasComponent).toBe(canvasComponent)
  })

  it('同类型重复注册以后者覆盖（热更新/重复安装不产生重复卡片）', () => {
    registerElementExtension(chartExtension({ label: '图表（旧）' }))
    registerElementExtension(chartExtension({ label: '图表（新）' }))

    expect(getElementExtensions()).toHaveLength(1)
    expect(getElementExtension('chart')?.label).toBe('图表（新）')
  })

  it('注销后不再可查；未注册/空类型返回 undefined', () => {
    registerElementExtension(chartExtension())
    unregisterElementExtension('chart')

    expect(getElementExtensions()).toEqual([])
    expect(getElementExtension('chart')).toBeUndefined()
    expect(getElementExtension()).toBeUndefined()
    expect(getElementExtension(null)).toBeUndefined()
  })

  it('clearElementExtensions 一次清空全部扩展', () => {
    registerElementExtension(chartExtension())
    registerElementExtension(chartExtension({ type: 'signature', label: '签名' }))

    clearElementExtensions()

    expect(getElementExtensions()).toEqual([])
    expect(getElementExtension('chart')).toBeUndefined()
    expect(getElementExtension('signature')).toBeUndefined()
  })

  it('注册表变化驱动响应式列表刷新（素材卡列表依赖它）', () => {
    const types = computed(() => getElementExtensions().map(ext => ext.type))
    expect(types.value).toEqual([])

    registerElementExtension(chartExtension())
    expect(types.value).toEqual(['chart'])

    unregisterElementExtension('chart')
    expect(types.value).toEqual([])
  })

  it('缺少 type 或 canvasComponent 的非法注册直接报错', () => {
    expect(() => registerElementExtension({ type: '', canvasComponent: stubComponent('x') } as unknown as ElementExtension))
      .toThrow(/type/)
    expect(() => registerElementExtension({ type: 'chart' } as unknown as ElementExtension))
      .toThrow(/canvasComponent/)
  })
})
