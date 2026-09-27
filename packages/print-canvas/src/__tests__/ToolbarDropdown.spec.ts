import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolbarDropdown from '../components/ToolbarDropdown.vue'

function mountDd(props: Record<string, unknown> = {}) {
  return mount(ToolbarDropdown, {
    props,
    slots: {
      trigger: '<span class="t-x">触发</span>',
      default: '<div class="p-x">面板</div>',
    },
  })
}

describe('ToolbarDropdown 开合', () => {
  it('默认收起，点击触发钮展开面板，再点收起', async () => {
    const w = mountDd()
    expect(w.find('.p-x').exists()).toBe(false)
    await w.find('[data-test=dd-trigger]').trigger('click')
    expect(w.find('.p-x').exists()).toBe(true)
    await w.find('[data-test=dd-trigger]').trigger('click')
    expect(w.find('.p-x').exists()).toBe(false)
  })

  it('面板展开后 document pointerdown 在组件外触发时收起', async () => {
    const w = mountDd()
    await w.find('[data-test=dd-trigger]').trigger('click')
    document.dispatchEvent(new PointerEvent('pointerdown'))
    await w.vm.$nextTick()
    expect(w.find('.p-x').exists()).toBe(false)
  })

  it('点击组件内部不收起', async () => {
    const w = mountDd()
    await w.find('[data-test=dd-trigger]').trigger('click')
    w.find('.p-x').element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.find('.p-x').exists()).toBe(true)
  })

  it('disabled 时点击不展开；展开后转 disabled 自动收起', async () => {
    const w = mountDd()
    await w.find('[data-test=dd-trigger]').trigger('click')
    expect(w.find('.p-x').exists()).toBe(true)
    await w.setProps({ disabled: true })
    expect(w.find('.p-x').exists()).toBe(false)
    await w.find('[data-test=dd-trigger]').trigger('click')
    expect(w.find('.p-x').exists()).toBe(false)
  })

  it('触发钮透传 data-test 与 data-tip', () => {
    const w = mountDd({ testId: 'my-dd', tip: '我的下拉' })
    const btn = w.find('[data-test=my-dd]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('data-tip')).toBe('我的下拉')
  })
})
