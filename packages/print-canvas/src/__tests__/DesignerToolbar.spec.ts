import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DesignerToolbar from '../components/DesignerToolbar.vue'

describe('DesignerToolbar 加载默认布局按钮', () => {
  it('未开启 showLoadDefault 时不渲染按钮', () => {
    const wrapper = mount(DesignerToolbar)
    expect(wrapper.text()).not.toContain('加载默认布局')
  })

  it('showLoadDefault 为 true 时渲染按钮并发出 load-default', async () => {
    const wrapper = mount(DesignerToolbar, { props: { showLoadDefault: true } })
    const btn = wrapper.findAll('button').find(b => b.text() === '加载默认布局')
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    expect(wrapper.emitted('load-default')).toBeTruthy()
  })
})

describe('DesignerToolbar 标尺开关', () => {
  it('默认开启，渲染标尺按钮且点击发出 toggle-ruler', async () => {
    const wrapper = mount(DesignerToolbar)
    const btn = wrapper.findAll('button').find(b => b.text().includes('标尺'))
    expect(btn).toBeDefined()
    expect(btn!.classes()).toContain('on')
    await btn!.trigger('click')
    expect(wrapper.emitted('toggle-ruler')).toBeTruthy()
  })

  it('showRuler 为 true 时按钮呈开启态', () => {
    const wrapper = mount(DesignerToolbar, { props: { showRuler: true } })
    const btn = wrapper.findAll('button').find(b => b.text().includes('标尺'))!
    expect(btn.classes()).toContain('on')
  })

  it('showRuler 为 false 时按钮不呈开启态', () => {
    const wrapper = mount(DesignerToolbar, { props: { showRuler: false } })
    const btn = wrapper.findAll('button').find(b => b.text().includes('标尺'))!
    expect(btn.classes()).not.toContain('on')
  })
})
