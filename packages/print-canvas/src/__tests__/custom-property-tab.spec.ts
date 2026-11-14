// P3「自定义属性」tab 回归：单一 tab + 实例级 hasProperties 判据 + DOM 第一位 +
// 选中默认激活 + 属性搜索覆盖 + 折叠态一致；同时钉住「内置元素零变化」的 P0 基线。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import type { PropType } from 'vue'
import type { RuntimeElement, TemplateData } from '@worm-vue3-print/core/designer'
import PropertyPanel from '../components/PropertyPanel.vue'
import PrintDesigner from '../components/PrintDesigner.vue'
import LeftPanel from '../components/LeftPanel.vue'
import LayerPanel from '../components/LayerPanel.vue'
import {
  registerElementExtension,
  clearElementExtensions,
  resolveElementPropertyTab,
  CUSTOM_PROPERTY_TAB_LABEL,
} from '../composables/useElementExtensionRegistry'
import type { ElementExtension, PropertyTabKey } from '../composables/useElementExtensionRegistry'

const CanvasStub = defineComponent({
  name: 'CanvasStub',
  props: { element: { type: Object as PropType<RuntimeElement>, required: true } },
  setup() {
    return () => h('div', { class: 'custom-canvas-stub' })
  },
})

const PropertyStub = defineComponent({
  name: 'PropertyStub',
  props: {
    element: { type: Object as PropType<RuntimeElement>, required: true },
    data: { type: Array as PropType<Record<string, any>[]>, default: () => [] },
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h('div', { class: 'custom-property-stub' }, [
      h('span', { class: 'custom-property-label' }, String(props.element.options.title ?? '')),
      h('button', { type: 'button', class: 'custom-property-change', onClick: () => emit('change') }, 'change'),
    ])
  },
})

const AltPropertyStub = defineComponent({
  name: 'AltPropertyStub',
  setup() {
    return () => h('div', { class: 'alt-property-stub' })
  },
})

function mkElement(type: string, options: Record<string, unknown> = {}): RuntimeElement {
  return reactive({
    id: `el-${type}`,
    options: { left: 0, top: 0, width: 100, height: 60, title: type, ...options },
    printElementType: { type, title: type },
  }) as unknown as RuntimeElement
}

function tpl(): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    elements: [],
  } as TemplateData
}

function register(overrides: Partial<ElementExtension> = {}) {
  registerElementExtension({
    type: 'customBadge',
    label: '徽章',
    icon: '◈',
    canvasComponent: CanvasStub,
    propertyComponent: PropertyStub,
    ...overrides,
  })
}

function mountPanel(
  element: RuntimeElement | null,
  activeTab: PropertyTabKey = 'custom',
  collapsed = false,
  recordHistory?: () => void,
) {
  return mount(PropertyPanel, {
    props: { element, templateData: tpl(), fields: [], activeTab, collapsed, recordHistory },
  })
}

afterEach(() => clearElementExtensions())

describe('resolveElementPropertyTab（实例级判据）', () => {
  it('无元素 / 内置元素 / 未注册扩展均返回 undefined', () => {
    expect(resolveElementPropertyTab(null)).toBeUndefined()
    expect(resolveElementPropertyTab(mkElement('text'))).toBeUndefined()
    expect(resolveElementPropertyTab(mkElement('customBadge'))).toBeUndefined()
  })

  it('旧 propertyComponent 自动取得资格：已装包宿主零改动即可用新 tab', () => {
    register()
    const tab = resolveElementPropertyTab(mkElement('customBadge'))
    expect(tab?.label).toBe(CUSTOM_PROPERTY_TAB_LABEL)
    expect(tab?.icon).toBe('◈')
    expect(tab?.component).toBe(PropertyStub)
    expect(tab?.searchKeywords).toContain('徽章')
  })

  it('propertyTab 描述符可覆盖 label / icon / component / searchKeywords', () => {
    register({
      propertyTab: {
        label: '徽章设置', icon: '★', component: AltPropertyStub,
        searchKeywords: ['徽章', '等级'],
      },
    })
    const tab = resolveElementPropertyTab(mkElement('customBadge'))
    expect(tab?.label).toBe('徽章设置')
    expect(tab?.icon).toBe('★')
    expect(tab?.component).toBe(AltPropertyStub)
    expect(tab?.searchKeywords).toEqual(['徽章', '等级'])
  })

  it('hasProperties 按实例判定：同一类型不同实例可显示/不显示', () => {
    register({ propertyTab: { hasProperties: el => !!el.options.title && el.options.title !== 'none' } })
    expect(resolveElementPropertyTab(mkElement('customBadge'))).toBeTruthy()
    expect(resolveElementPropertyTab(mkElement('customBadge', { title: 'none' }))).toBeUndefined()
  })

  it('插件判据抛错时按「无属性」处理，不打断设计器', () => {
    register({ propertyTab: { hasProperties: () => { throw new Error('boom') } } })
    expect(resolveElementPropertyTab(mkElement('customBadge'))).toBeUndefined()
  })

  it('注销扩展后注册态即时回落', () => {
    register()
    expect(resolveElementPropertyTab(mkElement('customBadge'))).toBeTruthy()
    clearElementExtensions()
    expect(resolveElementPropertyTab(mkElement('customBadge'))).toBeUndefined()
  })
})

describe('属性台单一「自定义属性」tab', () => {
  it('内置元素：展开态仍是 2 个 tab、折叠态仍是 3 个 .pc-btn（P0 基线等价）', () => {
    const w = mountPanel(mkElement('text'), 'element')
    expect(w.findAll('.pd-tab').map(t => t.text())).toEqual(['元素属性', '页面属性'])
    expect(w.text()).not.toContain(CUSTOM_PROPERTY_TAB_LABEL)
    const c = mountPanel(mkElement('text'), 'element', true)
    expect(c.findAll('.pc-btn').map(b => b.text())).toEqual(['«', '▦', '▤'])
  })

  it('自定义元素有属性：tab 排 DOM 第一位且可激活，扩展组件迁入新 pane', () => {
    register()
    const w = mountPanel(mkElement('customBadge'))
    const tabs = w.findAll('.pd-tab')
    expect(tabs.map(t => t.text())).toEqual([CUSTOM_PROPERTY_TAB_LABEL, '元素属性', '页面属性'])
    expect(tabs[0]?.classes()).toContain('active')
    expect(w.find('.custom-property-stub').exists()).toBe(true)
    expect(w.find('.custom-property-label').text()).toBe('customBadge')
  })

  it('折叠态 4 个 .pc-btn：自定义 tab 在展开按钮之后、两个内置 tab 之前', () => {
    register()
    const w = mountPanel(mkElement('customBadge'), 'custom', true)
    const btns = w.findAll('.pc-btn')
    expect(btns.map(b => b.attributes('title')))
      .toEqual(['展开属性台', CUSTOM_PROPERTY_TAB_LABEL, '元素属性', '页面属性'])
    expect(btns.map(b => b.text())).toEqual(['«', '◈', '▦', '▤'])
    expect(btns[1]?.classes()).toContain('on')
  })

  it('点击折叠态自定义 tab：emit update:activeTab=custom 与 toggle-collapse', async () => {
    register()
    const w = mountPanel(mkElement('customBadge'), 'page', true)
    await w.findAll('.pc-btn')[1]!.trigger('click')
    expect(w.emitted('update:activeTab')?.[0]).toEqual(['custom'])
    expect(w.emitted('toggle-collapse')).toHaveLength(1)
  })

  it('该实例无自定义属性（hasProperties=false）时 tab 不渲染', () => {
    register({ propertyTab: { hasProperties: () => false } })
    const w = mountPanel(mkElement('customBadge'), 'element')
    expect(w.findAll('.pd-tab').map(t => t.text())).toEqual(['元素属性', '页面属性'])
    expect(w.text()).not.toContain(CUSTOM_PROPERTY_TAB_LABEL)
  })

  it('扩展组件 change 仍汇入既有历史记录通道', async () => {
    register()
    const recordHistory = vi.fn()
    const w = mountPanel(mkElement('customBadge'), 'custom', false, recordHistory)
    await w.find('.custom-property-change').trigger('click')
    expect(recordHistory).toHaveBeenCalledTimes(1)
  })

  it('属性搜索覆盖自定义属性：命中扩展名显示、无关词隐藏；页面 tab 不显示搜索框', async () => {
    register()
    const w = mountPanel(mkElement('customBadge'))
    expect(w.find('.custom-property-stub').exists()).toBe(true)
    await w.find('input[type="search"]').setValue('无关关键词')
    expect(w.find('.custom-property-stub').exists()).toBe(false)
    await w.find('input[type="search"]').setValue('徽章')
    expect(w.find('.custom-property-stub').exists()).toBe(true)

    const page = mountPanel(mkElement('customBadge'), 'page')
    expect(page.find('.property-search').attributes('style') ?? '').toContain('display: none')
    // 元素属性 tab 仍保留原有搜索框
    const elementTab = mountPanel(mkElement('text'), 'element')
    expect(elementTab.find('.property-search').attributes('style') ?? '').not.toContain('display: none')
  })

  it('切页签保留搜索框实例：切回后输入值与过滤状态一致', async () => {
    register()
    const w = mountPanel(mkElement('customBadge'))
    await w.find('input[type="search"]').setValue('徽章')
    expect(w.find('.custom-property-stub').exists()).toBe(true)
    await w.setProps({ activeTab: 'page' })
    await w.setProps({ activeTab: 'custom' })
    expect((w.find('input[type="search"]').element as HTMLInputElement).value).toBe('徽章')
    expect(w.find('.custom-property-stub').exists()).toBe(true)
  })
})

describe('设计器联动：默认激活 / 分组 / 图层图标', () => {
  it('选中带自定义属性的扩展元素默认激活 custom，内置元素回落 element', async () => {
    registerElementExtension({
      type: 'chart', label: '图表', icon: '▤',
      canvasComponent: CanvasStub, propertyComponent: PropertyStub,
    })
    const template = {
      ...tpl(),
      elements: [
        {
          id: 'el-chart', type: 'chart',
          printElementType: { type: 'chart', title: '图表' },
          options: { left: 0, top: 0, width: 100, height: 60 },
        },
        {
          id: 'el-text', type: 'text',
          printElementType: { type: 'text', title: '文本' },
          options: { left: 0, top: 70, width: 60, height: 10 },
        },
      ],
    } as unknown as TemplateData
    const w = mount(PrintDesigner, { props: { initialTemplate: template } })
    const left = w.findComponent(LeftPanel)

    left.vm.$emit('select', 'el-chart', false)
    await w.vm.$nextTick()
    expect(w.findComponent(PropertyPanel).props('activeTab')).toBe('custom')

    left.vm.$emit('select', 'el-text', false)
    await w.vm.$nextTick()
    expect(w.findComponent(PropertyPanel).props('activeTab')).toBe('element')
  })

  it('LeftPanel：扩展声明 group 才渲染分组标题，未声明时 DOM 与内置态一致', () => {
    const props = { fields: [], elements: [], selectedIds: new Set<string>(), collapsed: false }
    expect(mount(LeftPanel, { props }).find('.material-group-title').exists()).toBe(false)
    register({ group: '扩展元素' })
    const w = mount(LeftPanel, { props })
    expect(w.find('.material-group-title').text()).toBe('扩展元素')
    expect(w.findAll('.material-label')).toHaveLength(13)
  })

  it('LayerPanel：扩展 icon 优先于内置表，未注册时回落通用图标', () => {
    const props = { elements: [mkElement('customBadge')], selectedIds: new Set<string>() }
    expect(mount(LayerPanel, { props }).find('.layer-icon').text()).toBe('◆')
    register()
    expect(mount(LayerPanel, { props }).find('.layer-icon').text()).toBe('◈')
  })
})
