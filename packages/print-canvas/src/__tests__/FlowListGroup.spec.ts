import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FlowListGroup from '../components/property/FlowListGroup.vue'
import { propertyTip } from '@worm-vue3-print/core/designer'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

function makeElement(options: Record<string, any> = {}): RuntimeElement {
  return {
    id: 'el-flowlist',
    options: {
      left: 0, top: 0, width: 190, height: 24, fontSize: 10.5,
      formatter: '{name} {spec}', dataSource: 'drugs',
      flowColumns: 4, flowRowHeight: 8, flowGapX: 6,
      ...options,
    },
    printElementType: { type: 'flowList', title: '流式列表' },
  }
}

function labelsOf(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.pd-label').map(n => n.text())
}

/** 可见行标签：canvas 用 v-show 门控（节点在、隐藏），与 common 的条件渲染不同，断言按可见性对齐 */
function visibleLabelsOf(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.pd-field')
    .filter(f => (f.element as HTMLElement).style.display !== 'none')
    .map(f => f.find('.pd-label').text())
}

/** 取某一行的步进框并写入新值（与属性台真实事件链一致：input → change） */
function commitStepper(wrapper: ReturnType<typeof mount>, label: string, value: string) {
  const row = wrapper.findAll('.pd-field').find(f => (f.find('.pd-label').text() ?? '').includes(label))
  if (!row) throw new Error(`未找到属性行：${label}`)
  const input = row.find('input.pd-step-input')
  if (!input.exists()) throw new Error(`属性行没有步进输入框：${label}`)
  input.setValue(value)
  input.trigger('change')
}

describe('FlowListGroup 属性台', () => {
  it('列数、行高、间距、跨列开关四行都在；开关缺省关时「最多跨几列」不可见', () => {
    const wrapper = mount(FlowListGroup, { props: { element: makeElement() } })
    const labels = labelsOf(wrapper)
    expect(labels).toContain('每行列数')
    expect(labels.some(l => l.includes('行高 (mm)'))).toBe(true)
    expect(labels.some(l => l.includes('单元横向间距'))).toBe(true)
    expect(labels.some(l => l.includes('内容过长时跨列'))).toBe(true)
    expect(visibleLabelsOf(wrapper).some(l => l.includes('最多跨几列'))).toBe(false)
  })

  it('打开跨列开关后补出「最多跨几列」，值按每行列数收敛', () => {
    const element = makeElement({ flowMaxSpan: 9 })
    const wrapper = mount(FlowListGroup, { props: { element } })
    wrapper.find('input.pd-switch').setValue(true)
    expect(element.options.flowAutoSpan).toBe(true)
    expect(element.options.flowMaxSpan).toBe(4)
    expect(labelsOf(wrapper).some(l => l.includes('最多跨几列'))).toBe(true)
  })

  it('每行列数改小时「最多跨几列」被一并顶回（全案唯一改用户值处）', () => {
    const element = makeElement({ flowColumns: 4, flowAutoSpan: true, flowMaxSpan: 4 })
    const wrapper = mount(FlowListGroup, { props: { element } })
    commitStepper(wrapper, '每行列数', '2')
    expect(element.options.flowColumns).toBe(2)
    expect(element.options.flowMaxSpan).toBe(2)
  })

  it('列数挤不下时只给提示，绝不回写用户填的列数', () => {
    const element = makeElement({ flowColumns: 8, width: 20 })
    const wrapper = mount(FlowListGroup, { props: { element } })
    const hint = wrapper.find('.pd-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('偏挤')
    expect(hint.text()).toContain('数值保持不变')
    expect(element.options.flowColumns).toBe(8)
  })

  it('框宽够用时不出提示行（不无病呻吟）', () => {
    const wrapper = mount(FlowListGroup, { props: { element: makeElement({ flowColumns: 4, width: 190 }) } })
    expect(wrapper.find('.pd-hint').exists()).toBe(false)
  })

  it('行高与间距按档位钳制：行高最小 3mm、间距最大 50mm', () => {
    const element = makeElement()
    const wrapper = mount(FlowListGroup, { props: { element } })
    commitStepper(wrapper, '行高', '1')
    expect(element.options.flowRowHeight).toBe(3)
    commitStepper(wrapper, '单元横向间距', '80')
    expect(element.options.flowGapX).toBe(50)
  })

  it('四行挂 `.pd-help` 且文案取自 core 注册表；跨列开关行不挂（与 print-common 同四条）', () => {
    const wrapper = mount(FlowListGroup, { props: { element: makeElement({ flowAutoSpan: true }) } })
    const rowOf = (text: string) => wrapper.findAll('.pd-field')
      .find(f => f.find('.pd-label').text().includes(text))!
    for (const [label, key] of [
      ['每行列数', 'fl-columns'], ['行高 (mm)', 'fl-row-height'],
      ['单元横向间距', 'fl-gap-x'], ['最多跨几列', 'fl-max-span'],
    ] as const) {
      const help = rowOf(label).find('.pd-help')
      expect(help.exists(), `${label} 应有字段说明`).toBe(true)
      expect(help.attributes('data-tip')).toBe(propertyTip(key))
      expect(propertyTip(key), `${key} 的注册表文案不应为空`).toBeTruthy()
    }
    // 反面对照：开关行两侧都不挂说明图标
    expect(rowOf('内容过长时跨列').find('.pd-help').exists()).toBe(false)
  })

  it('缺字段时步进框显示 core 解析出的出厂值（不留空框）', () => {
    const element = makeElement({ flowColumns: undefined, flowRowHeight: undefined, flowGapX: undefined })
    const wrapper = mount(FlowListGroup, { props: { element } })
    const valueOf = (label: string) => wrapper.findAll('.pd-field')
      .find(f => f.find('.pd-label').text().includes(label))!
      .find('input.pd-step-input').element as HTMLInputElement
    expect(valueOf('每行列数').value).toBe('4')
    expect(valueOf('行高').value).toBe('8')
    expect(valueOf('单元横向间距').value).toBe('4')
  })

  it('关掉跨列开关不凭空写 flowMaxSpan（只有打开那一支补钳）', () => {
    const element = makeElement({ flowAutoSpan: true, flowMaxSpan: undefined })
    const wrapper = mount(FlowListGroup, { props: { element } })
    wrapper.find('input.pd-switch').setValue(false)
    expect(element.options.flowAutoSpan).toBe(false)
    expect(element.options.flowMaxSpan).toBeUndefined()
  })
})

describe('FlowListGroup 动态布局模式', () => {
  it('缺省固定模式，动态时才显示四边独立内边距', async () => {
    const element = makeElement()
    const wrapper = mount(FlowListGroup, { props: { element } })
    const mode = wrapper.find('[data-test="flow-layout-mode"]')
    expect((mode.element as HTMLSelectElement).value).toBe('fixed')
    expect(visibleLabelsOf(wrapper).some(l => l.includes('上内边距'))).toBe(false)

    await mode.setValue('dynamic')
    expect(element.options.flowLayoutMode).toBe('dynamic')
    for (const label of ['上内边距', '右内边距', '下内边距', '左内边距']) {
      expect(visibleLabelsOf(wrapper).some(l => l.includes(label)), `${label} 应可见`).toBe(true)
    }

    await mode.setValue('fixed')
    expect(element.options.flowLayoutMode).toBe('fixed')
    expect(visibleLabelsOf(wrapper).some(l => l.includes('上内边距'))).toBe(false)
  })

  it('四个步进框分别提交到独立内边距字段', () => {
    const element = makeElement({ flowLayoutMode: 'dynamic' })
    const wrapper = mount(FlowListGroup, { props: { element } })
    commitStepper(wrapper, '上内边距', '2')
    commitStepper(wrapper, '右内边距', '3')
    commitStepper(wrapper, '下内边距', '4')
    commitStepper(wrapper, '左内边距', '5')
    expect(element.options.flowPaddingTop).toBe(2)
    expect(element.options.flowPaddingRight).toBe(3)
    expect(element.options.flowPaddingBottom).toBe(4)
    expect(element.options.flowPaddingLeft).toBe(5)
  })

  it('新增字段使用 core 注册的搜索 key', () => {
    const mode = mount(FlowListGroup, {
      props: { element: makeElement(), searching: true, matchedKeys: new Set(['fl-layout-mode']) },
    })
    expect(visibleLabelsOf(mode).some(l => l.includes('布局模式'))).toBe(true)

    const padding = mount(FlowListGroup, {
      props: {
        element: makeElement({ flowLayoutMode: 'dynamic' }),
        searching: true,
        matchedKeys: new Set(['fl-padding-left']),
      },
    })
    expect(visibleLabelsOf(padding).some(l => l.includes('左内边距'))).toBe(true)
    expect(visibleLabelsOf(padding).some(l => l.includes('上内边距'))).toBe(false)
  })
})
