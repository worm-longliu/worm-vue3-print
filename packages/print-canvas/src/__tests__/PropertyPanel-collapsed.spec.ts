// P0 基线冻结：属性台折叠态与 tab 现状，作为 P3「自定义属性 tab」改造的起点。
// 现状：折叠态 3 个 .pc-btn（1 个展开按钮 + 2 个内置 tab 按钮），展开态 2 个 .pd-tab，
// 两处都没有「自定义属性」tab。P3 会在折叠态补第三个 tab 按钮、在展开态把自定义 tab 排到首位。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PropertyPanel from '../components/PropertyPanel.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function tpl(): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    elements: [],
  } as TemplateData
}

function mountPanel(collapsed: boolean, activeTab?: 'element' | 'page') {
  return mount(PropertyPanel, {
    props: {
      element: null,
      templateData: tpl(),
      fields: [],
      activeTab,
      collapsed,
    },
  })
}

describe('PropertyPanel 折叠态 / tab 现状（P0 基线冻结）', () => {
  it('collapsed=true 只渲染 .prop-collapsed，展开态结构全部不渲染', () => {
    const w = mountPanel(true, 'page')
    expect(w.find('.property-panel').classes()).toContain('collapsed')
    expect(w.find('.prop-collapsed').exists()).toBe(true)
    expect(w.find('.pd-tabs').exists()).toBe(false)
    expect(w.find('.pd-tab-bar').exists()).toBe(false)
    expect(w.findAll('.pd-tab')).toHaveLength(0)
    expect(w.find('.collapse-btn').exists()).toBe(false)
  })

  it('折叠态共 3 个 .pc-btn：1 展开 + 2 内置 tab，无自定义属性 tab', () => {
    const w = mountPanel(true, 'page')
    const btns = w.findAll('.pc-btn')
    expect(btns).toHaveLength(3)
    expect(btns.map(b => b.text())).toEqual(['«', '▦', '▤'])
    expect(btns.map(b => b.attributes('title')))
      .toEqual(['展开属性台', '元素属性', '页面属性'])
    // 按 title 排除纯展开按钮后，锁住「改造前只有 2 个 tab 按钮」；P3 会变成 3 个
    expect(btns.filter(b => b.attributes('title') !== '展开属性台')).toHaveLength(2)
    expect(w.text()).not.toContain('自定义属性')
  })

  it('activeTab 缺省高亮页面属性；显式 element 高亮元素属性', () => {
    expect(mountPanel(true).findAll('.pc-btn.on').map(b => b.attributes('title')))
      .toEqual(['页面属性'])
    expect(mountPanel(true, 'element').findAll('.pc-btn.on').map(b => b.attributes('title')))
      .toEqual(['元素属性'])
  })

  it('点击折叠态 tab 按钮同时 emit update:activeTab 与 toggle-collapse', async () => {
    const w = mountPanel(true, 'page')
    await w.findAll('.pc-btn')[1]!.trigger('click') // ▦ 元素属性
    expect(w.emitted('update:activeTab')?.[0]).toEqual(['element'])
    expect(w.emitted('toggle-collapse')).toHaveLength(1)
  })

  it('展开态 2 个 tab，顺序「元素属性 → 页面属性」，首位不是自定义属性', () => {
    const w = mountPanel(false, 'element')
    const tabs = w.findAll('.pd-tab')
    expect(tabs.map(t => t.text())).toEqual(['元素属性', '页面属性'])
    expect(tabs[0]?.classes()).toContain('active')
    expect(w.text()).not.toContain('自定义属性')
  })
})
