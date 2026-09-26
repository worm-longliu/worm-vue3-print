// print-canvas/src/__tests__/base-element-select.spec.ts
// 回归：mousedown 选中只应发生一次。历史 bug：useDrag.onStart 里无条件 emit('select', id, false)
// 会在 Ctrl+点击后立刻把多选重置为单选，导致 Ctrl 逐个点击多选失效。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import BaseElement from '../components/elements/BaseElement.vue'
import { SELECTED_IDS_KEY } from '../composables/useSelection'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

function mkEl(id: string, left: number): RuntimeElement {
  return {
    id,
    options: { left, top: 0, width: 10, height: 10, title: id },
    printElementType: { type: 'text', title: id },
  } as unknown as RuntimeElement
}

function mountEl(el: RuntimeElement) {
  return mount(BaseElement, {
    props: { element: el, designMode: true, scale: 1 },
    global: {
      provide: { [SELECTED_IDS_KEY as symbol]: ref(new Set<string>()) },
    },
  })
}

describe('BaseElement mousedown 选中事件', () => {
  it('Ctrl+点击仅发出一次带 multiple=true 的 select，不被重置', async () => {
    const w = mountEl(mkEl('b', 20))
    await w.find('.print-element').trigger('mousedown', { button: 0, ctrlKey: true })
    const events = w.emitted('select') ?? []
    expect(events).toEqual([['b', true]])
  })

  it('普通点击仅发出一次 multiple=false 的 select', async () => {
    const w = mountEl(mkEl('a', 0))
    await w.find('.print-element').trigger('mousedown', { button: 0 })
    const events = w.emitted('select') ?? []
    expect(events).toEqual([['a', false]])
  })

  it('完整拖拽过程中不额外补发 select', async () => {
    const w = mountEl(mkEl('a', 0))
    await w.find('.print-element').trigger('mousedown', { button: 0, clientX: 0, clientY: 0 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 50 }))
    const events = w.emitted('select') ?? []
    expect(events.length).toBe(1)
  })
})
