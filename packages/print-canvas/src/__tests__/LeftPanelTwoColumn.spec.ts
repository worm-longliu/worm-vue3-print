// 素材台元素页签两列栅格：短标签两列并排，文本较长的素材整行独占（判据来自 core 的 isWideMaterialLabel）。
// 字段页签与图层页签保持单列，不受该栅格影响。
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import LeftPanel from '../components/LeftPanel.vue'
import {
  registerElementExtension,
  clearElementExtensions,
} from '../composables/useElementExtensionRegistry'

function mountLeftPanel() {
  return mount(LeftPanel, {
    props: { fields: [], elements: [], selectedIds: new Set<string>(), collapsed: false },
  })
}

const Stub = defineComponent({ name: 'Stub', render: () => null })

afterEach(() => clearElementExtensions())

describe('LeftPanel 素材台两列栅格', () => {
  it('只有元素页签挂两列栅格，字段与图层页签保持单列', () => {
    const w = mountLeftPanel()
    const panes = w.findAll('.pd-tab-pane')
    expect(panes).toHaveLength(3)
    expect(panes[0]!.classes()).toContain('material-grid')
    expect(panes[1]!.classes()).not.toContain('material-grid')
    expect(panes[2]!.classes()).not.toContain('material-grid')
  })

  it('内置素材里只有「流式列表」文本较长，独占整行', () => {
    const w = mountLeftPanel()
    const wide = w.findAll('.material-card--wide').map(node => node.text())
    expect(wide).toHaveLength(1)
    expect(wide[0]).toContain('流式列表')
    expect(w.findAll('.material-card')).toHaveLength(11)
  })

  it('素材顺序为表格后紧跟长文，且不再提供 HTML 素材入口', () => {
    const w = mountLeftPanel()
    const labels = w.findAll('.material-label').map(node => node.text())
    expect(labels.slice(labels.indexOf('表格'), labels.indexOf('表格') + 3)).toEqual(['表格', '长文', '流式列表'])
    expect(labels).not.toContain('HTML')
  })

  it('扩展素材按标签文本长度判定，不依赖内置名单', () => {
    registerElementExtension({
      type: 'chartA',
      label: '超长图表名称',
      canvasComponent: Stub,
      propertyComponent: Stub,
    })
    registerElementExtension({
      type: 'chartB',
      label: '图表',
      canvasComponent: Stub,
      propertyComponent: Stub,
    })
    const w = mountLeftPanel()
    const wideLabels = w.findAll('.material-card--wide').map(node => node.find('.material-label').text())
    expect(wideLabels).toEqual(['流式列表', '超长图表名称'])
  })
})
