// print-canvas/src/__tests__/designer-group.spec.ts
// 组合/取消组合工具栏入口：整组选中（多选+含组）时必须能看到并使用「取消组合」。
// 回归背景：取消组合原要求 !hasMultiSelection，而点选组成员必然整组扩展为多选，按钮永不出现。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DesignerToolbar from '../components/DesignerToolbar.vue'

function mountToolbar(props: Record<string, boolean>) {
  return mount(DesignerToolbar, { props })
}

function hasButtonByTip(wrapper: ReturnType<typeof mountToolbar>, tip: string): boolean {
  return wrapper.findAll('button').some(b => b.attributes('data-tip') === tip)
}

describe('DesignerToolbar 组合/取消组合入口', () => {
  it('多选且选中含组元素：组合与取消组合并列显示', () => {
    const w = mountToolbar({ hasMultiSelection: true, hasSelection: true, selectedElementHasGroup: true })
    expect(hasButtonByTip(w, '组合 (Ctrl+G)')).toBe(true)
    expect(hasButtonByTip(w, '取消组合 (Ctrl+Shift+G)')).toBe(true)
  })

  it('多选但选中不含组元素：只显示组合', () => {
    const w = mountToolbar({ hasMultiSelection: true, hasSelection: true, selectedElementHasGroup: false })
    expect(hasButtonByTip(w, '组合 (Ctrl+G)')).toBe(true)
    expect(hasButtonByTip(w, '取消组合 (Ctrl+Shift+G)')).toBe(false)
  })

  it('单选含组元素：只显示取消组合', () => {
    const w = mountToolbar({ hasMultiSelection: false, hasSelection: true, selectedElementHasGroup: true })
    expect(hasButtonByTip(w, '组合 (Ctrl+G)')).toBe(false)
    expect(hasButtonByTip(w, '取消组合 (Ctrl+Shift+G)')).toBe(true)
  })

  it('无选中：两个按钮都不显示', () => {
    const w = mountToolbar({ hasMultiSelection: false, hasSelection: false, selectedElementHasGroup: false })
    expect(hasButtonByTip(w, '组合 (Ctrl+G)')).toBe(false)
    expect(hasButtonByTip(w, '取消组合 (Ctrl+Shift+G)')).toBe(false)
  })

  it('点击取消组合发出 ungroup 事件', async () => {
    const w = mountToolbar({ hasMultiSelection: true, hasSelection: true, selectedElementHasGroup: true })
    const btn = w.findAll('button').find(b => b.attributes('data-tip') === '取消组合 (Ctrl+Shift+G)')!
    await btn.trigger('click')
    expect(w.emitted('ungroup')).toHaveLength(1)
  })
})
