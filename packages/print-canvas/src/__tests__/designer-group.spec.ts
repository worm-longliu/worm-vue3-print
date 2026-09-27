// print-canvas/src/__tests__/designer-group.spec.ts
// 组合/取消组合入口（「排列」下拉内）：常驻+置灰口径——按选中状态控制可用性而非显隐。
// 回归背景：取消组合原要求 !hasMultiSelection，而点选组成员必然整组扩展为多选，按钮永不出现。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DesignerToolbar from '../components/DesignerToolbar.vue'

async function mountArranged(props: Record<string, boolean>) {
  const w = mount(DesignerToolbar, { props })
  await w.find('[data-test=arrange-dd]').trigger('click')
  return w
}

function btnByTip(w: ReturnType<typeof mount>, tip: string) {
  return w.findAll('button').find(b => b.attributes('data-tip') === tip)
}

describe('DesignerToolbar 组合/取消组合入口', () => {
  it('多选且选中含组元素：组合与取消组合均可用', async () => {
    const w = await mountArranged({ hasMultiSelection: true, hasSelection: true, selectedElementHasGroup: true })
    expect(btnByTip(w, '组合 (Ctrl+G)')!.attributes('disabled')).toBeUndefined()
    expect(btnByTip(w, '取消组合 (Ctrl+Shift+G)')!.attributes('disabled')).toBeUndefined()
  })

  it('多选但选中不含组元素：组合可用、取消组合置灰', async () => {
    const w = await mountArranged({ hasMultiSelection: true, hasSelection: true, selectedElementHasGroup: false })
    expect(btnByTip(w, '组合 (Ctrl+G)')!.attributes('disabled')).toBeUndefined()
    expect(btnByTip(w, '取消组合 (Ctrl+Shift+G)')!.attributes('disabled')).toBeDefined()
  })

  it('单选含组元素：组合置灰、取消组合可用', async () => {
    const w = await mountArranged({ hasMultiSelection: false, hasSelection: true, selectedElementHasGroup: true })
    expect(btnByTip(w, '组合 (Ctrl+G)')!.attributes('disabled')).toBeDefined()
    expect(btnByTip(w, '取消组合 (Ctrl+Shift+G)')!.attributes('disabled')).toBeUndefined()
  })

  it('无选中：两个按钮均置灰', async () => {
    const w = await mountArranged({ hasMultiSelection: false, hasSelection: false, selectedElementHasGroup: false })
    expect(btnByTip(w, '组合 (Ctrl+G)')!.attributes('disabled')).toBeDefined()
    expect(btnByTip(w, '取消组合 (Ctrl+Shift+G)')!.attributes('disabled')).toBeDefined()
  })

  it('点击取消组合发出 ungroup 事件', async () => {
    const w = await mountArranged({ hasMultiSelection: true, hasSelection: true, selectedElementHasGroup: true })
    await btnByTip(w, '取消组合 (Ctrl+Shift+G)')!.trigger('click')
    expect(w.emitted('ungroup')).toHaveLength(1)
  })

  it('排列面板未展开时不渲染（下拉懒渲染）', () => {
    const w = mount(DesignerToolbar, { props: { hasMultiSelection: true } })
    expect(w.find('[data-test=arrange-panel]').exists()).toBe(false)
  })
})
