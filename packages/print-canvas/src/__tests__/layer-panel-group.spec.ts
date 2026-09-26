// 图层面板组合/取消组合按钮：先红后绿的回归测试
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LayerPanel from '../components/LayerPanel.vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

function mkEl(id: string, z: number, groupId?: string): RuntimeElement {
  return {
    id,
    options: { left: 0, top: 0, width: 10, height: 10, zIndex: z, title: id, groupId },
    printElementType: { type: 'text', title: id },
  } as unknown as RuntimeElement
}

function mountPanel(selected: string[]) {
  return mount(LayerPanel, {
    props: {
      elements: [mkEl('a', 1), mkEl('b', 2), mkEl('c', 3, 'g1'), mkEl('d', 4, 'g1')],
      selectedIds: new Set(selected),
    },
  })
}

function btnByTitle(w: ReturnType<typeof mountPanel>, title: string) {
  return w.findAll('button').find(b => b.attributes('title')?.startsWith(title))
}

describe('LayerPanel 组合/取消组合入口', () => {
  it('多选 2 个未组合元素：显示组合、不显示取消组合，点击发出 group', async () => {
    const w = mountPanel(['a', 'b'])
    expect(btnByTitle(w, '组合')).toBeTruthy()
    expect(btnByTitle(w, '取消组合')).toBeFalsy()
    await btnByTitle(w, '组合')!.trigger('click')
    expect(w.emitted('group')).toHaveLength(1)
  })

  it('选中整组（多选含组）：显示取消组合，点击发出 ungroup', async () => {
    const w = mountPanel(['c', 'd'])
    const btn = btnByTitle(w, '取消组合')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(w.emitted('ungroup')).toHaveLength(1)
  })

  it('单选组内成员：显示取消组合（点选已整组扩展，此处直接单选也显示）', () => {
    const w = mountPanel(['c'])
    expect(btnByTitle(w, '取消组合')).toBeTruthy()
    expect(btnByTitle(w, '组合')).toBeFalsy()
  })

  it('单选未组合元素：两个按钮都不显示', () => {
    const w = mountPanel(['a'])
    expect(btnByTitle(w, '组合')).toBeFalsy()
    expect(btnByTitle(w, '取消组合')).toBeFalsy()
  })
})
