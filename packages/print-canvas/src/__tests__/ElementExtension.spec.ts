// 可选包（如 @worm-vue3-print/echarts）注册扩展元素后的设计器联动：
// 素材卡出现、画布渲染扩展组件、属性台渲染扩展分组；未注册时主包行为完全不变。
// 注册表是模块级单例，用例之间必须清空，避免扩展泄漏到其他 spec。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import type { PropType } from 'vue'
import type { RuntimeElement, TemplateData } from '@worm-vue3-print/core/designer'
import { createRuntimeElement } from '@worm-vue3-print/core/designer'
import LeftPanel from '../components/LeftPanel.vue'
import LayerPanel from '../components/LayerPanel.vue'
import BaseElement from '../components/elements/BaseElement.vue'
import PropertyPanel from '../components/PropertyPanel.vue'
import { SELECTED_IDS_KEY } from '../composables/useSelection'
import {
  registerElementExtension,
  clearElementExtensions,
} from '../composables/useElementExtensionRegistry'

/** 扩展画布组件桩：记录收到的 element/data/designMode，验证 props 与内置元素一致 */
const ChartCanvasStub = defineComponent({
  name: 'ChartCanvasStub',
  props: {
    element: { type: Object as PropType<RuntimeElement>, required: true },
    data: { type: Array as PropType<Record<string, any>[]>, default: () => [] },
    designMode: { type: Boolean, default: false },
  },
  setup(props) {
    return () => h('div', { class: 'chart-canvas-stub' }, `${props.element.id}|${props.designMode}|${props.data.length}`)
  },
})

/** 扩展属性组桩：与内置属性组同约定（element/data prop + change 事件） */
const ChartPropertyStub = defineComponent({
  name: 'ChartPropertyStub',
  props: {
    element: { type: Object as PropType<RuntimeElement>, required: true },
    data: { type: Array as PropType<Record<string, any>[]>, default: () => [] },
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h('div', { class: 'chart-property-stub' }, [
      h('span', { class: 'chart-property-value' }, `${String(props.element.options.chartCategoryField ?? '')}|${props.data.length}`),
      h('button', { type: 'button', class: 'chart-property-change', onClick: () => emit('change') }, 'change'),
    ])
  },
})

function registerChartExtension() {
  registerElementExtension({
    type: 'chart',
    label: '图表',
    icon: '▤',
    canvasComponent: ChartCanvasStub,
    propertyComponent: ChartPropertyStub,
  })
}

afterEach(() => clearElementExtensions())

function mkElement(type: string): RuntimeElement {
  return reactive({
    id: `el-${type}`,
    options: { left: 0, top: 0, width: 100, height: 60, title: type },
    printElementType: { type, title: type },
  }) as unknown as RuntimeElement
}

function mountBase(element: RuntimeElement) {
  return mount(BaseElement, {
    props: { element, designMode: true, scale: 1 },
    global: { provide: { [SELECTED_IDS_KEY as symbol]: ref(new Set<string>()) } },
  })
}

function mountLeftPanel() {
  return mount(LeftPanel, {
    props: { fields: [], elements: [], selectedIds: new Set<string>(), collapsed: false },
  })
}

describe('LeftPanel 扩展素材卡', () => {
  it('未注册扩展时素材卡与主包内置项完全一致（12 项、无图表）', () => {
    const cards = mountLeftPanel().findAll('.material-label').map(node => node.text())
    expect(cards).toHaveLength(12)
    expect(cards).not.toContain('图表')
  })

  it('注册扩展后追加素材卡，注销后即时移除（响应式）', async () => {
    const w = mountLeftPanel()
    registerChartExtension()
    await nextTick()
    expect(w.findAll('.material-label').map(node => node.text())).toEqual(
      expect.arrayContaining(['图表', '文本']),
    )
    expect(w.findAll('.material-card')).toHaveLength(13)

    clearElementExtensions()
    await nextTick()
    expect(w.findAll('.material-card')).toHaveLength(12)
    expect(w.findAll('.material-label').map(node => node.text())).not.toContain('图表')
  })

  it('扩展素材卡拖拽写入 elementType，供画布按注册类型创建元素', async () => {
    registerChartExtension()
    const w = mountLeftPanel()
    const card = w.findAll('.material-card').at(-1)!
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' }
    await card.trigger('dragstart', { dataTransfer })

    expect(dataTransfer.setData).toHaveBeenCalledWith('elementType', 'chart')
    expect(dataTransfer.effectAllowed).toBe('all')
  })
})

describe('BaseElement 扩展组件解析', () => {
  it('未注册扩展时渲染占位而不崩溃（未知类型同样兜底）', () => {
    const chart = mountBase(mkElement('chart'))
    expect(chart.find('.extension-placeholder').text()).toContain('未安装扩展：chart')
    expect(chart.find('.chart-canvas-stub').exists()).toBe(false)

    const unknown = mountBase(mkElement('signature'))
    expect(unknown.find('.extension-placeholder').text()).toContain('未安装扩展：signature')
  })

  it('注册后渲染扩展组件，并按内置元素口径透传 element/designMode/data', () => {
    registerChartExtension()
    const w = mountBase(mkElement('chart'))
    const stub = w.find('.chart-canvas-stub')
    expect(stub.exists()).toBe(true)
    expect(stub.text()).toBe('el-chart|true|0')
    expect(w.find('.extension-placeholder').exists()).toBe(false)
  })

  it('挂载后注册扩展，画布即时切换为扩展组件；注销后回到占位', async () => {
    const w = mountBase(mkElement('chart'))
    expect(w.find('.extension-placeholder').exists()).toBe(true)

    registerChartExtension()
    await nextTick()
    expect(w.find('.chart-canvas-stub').exists()).toBe(true)
    expect(w.find('.extension-placeholder').exists()).toBe(false)

    clearElementExtensions()
    await nextTick()
    expect(w.find('.chart-canvas-stub').exists()).toBe(false)
    expect(w.find('.extension-placeholder').exists()).toBe(true)
  })
})

describe('LayerPanel 扩展类型图标', () => {
  it('图表有专属图标，未登记类型落到通用图标而不是 "?"', () => {
    const w = mount(LayerPanel, {
      props: {
        elements: [mkElement('chart'), mkElement('signature')],
        selectedIds: new Set<string>(),
      },
    })
    const icons = w.findAll('.layer-icon').map(node => node.text())
    expect(icons).toEqual(['▤', '◆'])
    expect(icons).not.toContain('?')
  })
})

function tpl(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [],
  } as TemplateData
}

function mountPropertyPanel(element: RuntimeElement, recordHistory?: () => void) {
  return mount(PropertyPanel, {
    props: {
      element,
      templateData: tpl(),
      fields: [],
      activeTab: 'element',
      collapsed: false,
      recordHistory,
    },
  })
}

describe('PropertyPanel 扩展属性组', () => {
  it('注册后为扩展元素渲染 propertyComponent，并透传 element 与设计态示例数据', () => {
    registerChartExtension()
    const w = mountPropertyPanel(createRuntimeElement('chart'))
    const group = w.find('.chart-property-stub')
    expect(group.exists()).toBe(true)
    // createDefaultOptions('chart') 默认类目字段为 name；data 为 DEFAULT_DEMO_DATA 的数组信封
    expect(group.find('.chart-property-value').text()).toBe('name|1')
  })

  it('内置元素不渲染扩展属性组', () => {
    registerChartExtension()
    const w = mountPropertyPanel(createRuntimeElement('text'))
    expect(w.find('.chart-property-stub').exists()).toBe(false)
  })

  it('扩展组件的 change 事件汇入既有历史记录通道（recordHistory）', async () => {
    registerChartExtension()
    const recordHistory = vi.fn()
    const w = mountPropertyPanel(createRuntimeElement('chart'), recordHistory)
    await w.find('.chart-property-change').trigger('click')
    expect(recordHistory).toHaveBeenCalledTimes(1)
  })
})
