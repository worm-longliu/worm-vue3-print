import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageTabs from '../components/PageTabs.vue'

describe('PageTabs', () => {
  it('渲染页面名与激活态，点击切换', async () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }, { name: '内容' }], activeIndex: 0, multi: true } })
    expect(w.text()).toContain('封面')
    expect(w.text()).toContain('内容')
    const second = w.findAll('button.page-tab')[1]
    await second.trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([1])
  })

  it('新增/删除/复制/排序按钮发出对应事件', async () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }], activeIndex: 0, multi: true } })
    w.find('[data-test="add-page"]').trigger('click')
    w.find('[data-test="duplicate-page"]').trigger('click')
    w.find('[data-test="delete-page"]').trigger('click')
    expect(w.emitted('add')).toHaveLength(1)
    expect(w.emitted('duplicate')).toHaveLength(1)
    expect(w.emitted('delete')).toHaveLength(1)
  })

  it('仅剩一页时删除按钮禁用', () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }], activeIndex: 0, multi: false } })
    expect(w.find('[data-test="delete-page"]').attributes('disabled')).toBeDefined()
  })
})