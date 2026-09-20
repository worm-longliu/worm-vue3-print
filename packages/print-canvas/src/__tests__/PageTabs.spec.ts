import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PageTabs from '../components/PageTabs.vue'
import { TILING_SINGLE_PAGE_TIP } from '../composables/useDesignerState'

describe('PageTabs', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

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

  it('操作按钮 tooltip 携带当前页名上下文', () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }, { name: '内容' }], activeIndex: 1, multi: true } })
    expect(w.find('[data-test="add-page"]').attributes('data-tip')).toBe('新增页面（在当前页后追加空白页）')
    expect(w.find('[data-test="duplicate-page"]').attributes('data-tip')).toBe('复制当前页「内容」')
    expect(w.find('[data-test="delete-page"]').attributes('data-tip')).toBe('删除当前页「内容」')
    expect(w.find('[data-test="move-left"]').attributes('data-tip')).toBe('前移「内容」')
    expect(w.find('[data-test="move-right"]').attributes('data-tip')).toBe('后移「内容」')
  })

  it('开启拼版：新增/复制页按钮禁用并提示只能有一个设计页面', async () => {
    const w = mount(PageTabs, {
      props: { pages: [{ name: '标签' }], activeIndex: 0, multi: false, tilingEnabled: true },
    })
    expect(w.find('[data-test="add-page"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="duplicate-page"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="add-page"]').attributes('data-tip')).toBe(TILING_SINGLE_PAGE_TIP)
    expect(w.find('[data-test="duplicate-page"]').attributes('data-tip')).toBe(TILING_SINGLE_PAGE_TIP)
    // 禁用后点击不再派发增页事件
    await w.find('[data-test="add-page"]').trigger('click')
    await w.find('[data-test="duplicate-page"]').trigger('click')
    expect(w.emitted('add')).toBeUndefined()
    expect(w.emitted('duplicate')).toBeUndefined()
  })

  it('未开启拼版：增页按钮可用且 tooltip 为常规说明', () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }], activeIndex: 0, multi: false } })
    expect(w.find('[data-test="add-page"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-test="duplicate-page"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-test="duplicate-page"]').attributes('data-tip')).toBe('复制当前页「封面」')
  })

  it('单页时删除按钮 tooltip 提示不可删除原因', () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }], activeIndex: 0, multi: false } })
    expect(w.find('[data-test="delete-page"]').attributes('data-tip')).toBe('仅多页面模板可删除页面')
  })

  it('页签 tooltip 含双击重命名提示', () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }], activeIndex: 0, multi: true } })
    expect(w.find('button.page-tab').attributes('data-tip')).toBe('封面（双击重命名）')
  })

  it('悬停带 data-tip 的元素 300ms 后显示自定义 tooltip', async () => {
    const w = mount(PageTabs, { props: { pages: [{ name: '封面' }], activeIndex: 0, multi: true } })
    expect(w.find('.page-tabs-tip').exists()).toBe(false)
    await w.find('[data-test="duplicate-page"]').trigger('mouseover')
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(w.find('.page-tabs-tip').exists()).toBe(true)
    expect(w.find('.page-tabs-tip').text()).toBe('复制当前页「封面」')
    // 移出后隐藏
    await w.find('[data-test="duplicate-page"]').trigger('mouseout')
    expect(w.find('.page-tabs-tip').exists()).toBe(false)
  })
})
