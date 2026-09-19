import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PropertyPanel from '../components/PropertyPanel.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function tpl(): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] }, elements: [],
  } as TemplateData
}

function mountPanel(multiPage: boolean) {
  return mount(PropertyPanel, {
    props: {
      element: null,
      templateData: tpl(),
      fields: [],
      activeTab: 'page',
      collapsed: false,
      multiPage,
    },
  })
}

describe('PropertyPanel 多页 gating', () => {
  it('多页模式隐藏拼版配置', () => {
    const w = mountPanel(true)
    expect(w.find('[data-test="tiling-config"]').exists()).toBe(false)
  })
  it('单页模式保留拼版配置', () => {
    const w = mountPanel(false)
    expect(w.find('[data-test="tiling-config"]').exists()).toBe(true)
  })
  it('多页模式过滤连续纸纸型（小票纸/连续纸不可选）', () => {
    const w = mountPanel(true)
    const values = w.findAll('select option').map(o => (o.element as HTMLOptionElement).value)
    expect(values).toEqual(expect.arrayContaining(['A4', 'DOT_FULL', 'LABEL_80X60']))
    expect(values).not.toContain('THERMAL_57')
    expect(values).not.toContain('THERMAL_80')
    expect(values).not.toContain('THERMAL_110')
    expect(values).not.toContain('CONTINUOUS')
  })
})