import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DesignerToolbar from '../components/DesignerToolbar.vue'

async function mountViewOpened(props: Record<string, unknown> = {}) {
  const w = mount(DesignerToolbar, { props })
  await w.find('[data-test=view-dd]').trigger('click')
  return w
}

describe('DesignerToolbar 帮助入口开关', () => {
  it('默认开启，渲染帮助按钮且点击发出 help', async () => {
    const wrapper = mount(DesignerToolbar)
    expect(wrapper.find('.help-button').exists()).toBe(true)
    await wrapper.find('.help-button').trigger('click')
    expect(wrapper.emitted('help')).toBeTruthy()
  })

  it('showHelp 为 true 时渲染帮助按钮', () => {
    const wrapper = mount(DesignerToolbar, { props: { showHelp: true } })
    expect(wrapper.find('.help-button').exists()).toBe(true)
  })

  it('showHelp 为 false 时不渲染帮助按钮', () => {
    const wrapper = mount(DesignerToolbar, { props: { showHelp: false } })
    expect(wrapper.find('.help-button').exists()).toBe(false)
  })
})

describe('DesignerToolbar 视图下拉（标尺开关）', () => {
  it('默认开启，展开视图下拉后标尺按钮呈开启态且点击发出 toggle-ruler', async () => {
    const w = await mountViewOpened()
    const btn = w.findAll('button').find(b => b.text().includes('标尺'))
    expect(btn).toBeDefined()
    expect(btn!.classes()).toContain('on')
    await btn!.trigger('click')
    expect(w.emitted('toggle-ruler')).toBeTruthy()
  })

  it('showRuler 为 true 时按钮呈开启态', async () => {
    const w = await mountViewOpened({ showRuler: true })
    const btn = w.findAll('button').find(b => b.text().includes('标尺'))!
    expect(btn.classes()).toContain('on')
  })

  it('showRuler 为 false 时按钮不呈开启态', async () => {
    const w = await mountViewOpened({ showRuler: false })
    const btn = w.findAll('button').find(b => b.text().includes('标尺'))!
    expect(btn.classes()).not.toContain('on')
  })

  it('首页专属与叠层对比收入视图下拉', async () => {
    const w = await mountViewOpened()
    await w.findAll('button').find(b => b.text().includes('首页专属'))!.trigger('click')
    expect(w.emitted('add-overlay-element')).toHaveLength(1)
    await w.findAll('button').find(b => b.text().includes('叠层对比'))!.trigger('click')
    expect(w.emitted('toggle-overlay')).toHaveLength(1)
  })
})

describe('DesignerToolbar 剪贴板组', () => {
  it('默认置灰（clipboardDisabled 默认 true）', () => {
    const w = mount(DesignerToolbar)
    expect(w.find('[data-test=copy]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test=paste]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test=delete]').attributes('disabled')).toBeDefined()
  })

  it('元素上下文点击复制/删除触发事件', async () => {
    const w = mount(DesignerToolbar, { props: { clipboardDisabled: false } })
    await w.find('[data-test=copy]').trigger('click')
    await w.find('[data-test=delete]').trigger('click')
    expect(w.emitted('copy')).toHaveLength(1)
    expect(w.emitted('delete')).toHaveLength(1)
  })

  it('粘贴需有剪贴板内容', async () => {
    const w = mount(DesignerToolbar, { props: { clipboardDisabled: false, hasClipboard: true } })
    await w.find('[data-test=paste]').trigger('click')
    expect(w.emitted('paste')).toHaveLength(1)
  })
})

describe('DesignerToolbar 格式化区段 slot', () => {
  it('默认 slot 内容渲染在工具栏行内', () => {
    const w = mount(DesignerToolbar, { slots: { default: '<div class="slot-x">fmt</div>' } })
    expect(w.find('.designer-toolbar .slot-x').exists()).toBe(true)
  })
})

describe('DesignerToolbar 按钮提示', () => {
  it('预览/保存带 data-tip', () => {
    const w = mount(DesignerToolbar)
    expect(w.find('.btn-secondary').attributes('data-tip')).toBe('预览模板打印效果')
    expect(w.find('.btn-primary').attributes('data-tip')).toBe('保存模板')
  })

  it('剪贴板禁用时 tip 附带原因', () => {
    const w = mount(DesignerToolbar)
    expect(w.find('[data-test=copy]').attributes('data-tip')).toBe('复制 (Ctrl+C)，需选中元素')
    expect(w.find('[data-test=paste]').attributes('data-tip')).toBe('粘贴 (Ctrl+V)，需选中元素')
  })

  it('可用态 tip 恢复简洁文案', () => {
    const w = mount(DesignerToolbar, { props: { clipboardDisabled: false, hasClipboard: true } })
    expect(w.find('[data-test=copy]').attributes('data-tip')).toBe('复制 (Ctrl+C)')
    expect(w.find('[data-test=paste]').attributes('data-tip')).toBe('粘贴 (Ctrl+V)')
  })
})
