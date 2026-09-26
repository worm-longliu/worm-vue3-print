// print-canvas/src/__tests__/layer-panel-select.spec.ts
// 图层面板点选：Ctrl/⌘+点击应传 multiple=true，供 selectElement 走加选/减选切换。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LayerPanel from '../components/LayerPanel.vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

function mkEl(id: string, z: number): RuntimeElement {
  return {
    id,
    options: { left: 0, top: 0, width: 10, height: 10, zIndex: z, title: id },
    printElementType: { type: 'text', title: id },
  } as unknown as RuntimeElement
}

function mountPanel() {
  return mount(LayerPanel, {
    props: { elements: [mkEl('a', 1), mkEl('b', 2)], selectedIds: new Set<string>() },
  })
}

describe('LayerPanel 点选事件', () => {
  // sortedLayers 按 zIndex 降序：[0]=b(z2)，[1]=a(z1)
  it('普通点击发出 multiple=false', async () => {
    const w = mountPanel()
    await w.findAll('.layer-item')[0]!.trigger('click')
    expect(w.emitted('select')).toEqual([['b', false]])
  })

  it('Ctrl+点击发出 multiple=true', async () => {
    const w = mountPanel()
    await w.findAll('.layer-item')[0]!.trigger('click', { ctrlKey: true })
    expect(w.emitted('select')).toEqual([['b', true]])
  })

  it('⌘+点击（Mac）发出 multiple=true', async () => {
    const w = mountPanel()
    await w.findAll('.layer-item')[1]!.trigger('click', { metaKey: true })
    expect(w.emitted('select')).toEqual([['a', true]])
  })
})
