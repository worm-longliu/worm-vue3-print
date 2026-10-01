// 画布右键菜单逐项测试：元素菜单（复制/剪切/粘贴/删除/置顶/上移/下移/置底）
// 与空白菜单（粘贴/全选/取消选择）。核心口径：右键命中未选中元素时应先选中该元素，
// 菜单动作才能作用于被右键的元素（历史 bug：右键不改选中，动作静默作用于旧选中或空选中）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import CanvasArea from '../components/CanvasArea.vue'
import { SELECTED_IDS_KEY } from '../composables/useSelection'
import type { RuntimeElement, TemplateData } from '@worm-vue3-print/core/designer'

function makeTemplate(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    elements: [],
  } as TemplateData
}

function makeElement(id: string): RuntimeElement {
  return {
    id,
    options: { left: 10, top: 10, width: 30, height: 8 },
    printElementType: { type: 'text', title: id },
  } as RuntimeElement
}

function mountArea(opts: {
  elements?: RuntimeElement[]
  selected?: string[]
  hasClipboard?: boolean
  attachTo?: HTMLElement
}) {
  const selectedIds = ref<Set<string>>(new Set(opts.selected ?? []))
  const wrapper = mount(CanvasArea, {
    props: {
      templateData: makeTemplate(),
      elements: opts.elements ?? [],
      scale: 1,
      hasClipboard: opts.hasClipboard ?? false,
    },
    global: {
      provide: { [SELECTED_IDS_KEY as symbol]: selectedIds },
      stubs: { BaseElement: true },
    },
    attachTo: opts.attachTo,
  })
  return { wrapper, selectedIds }
}

/** 触发元素右键（等价于 BaseElement 上抛 contextmenu(id, e)） */
async function rightClickElement(wrapper: ReturnType<typeof mount>, id: string) {
  const paper = wrapper.findComponent({ name: 'CanvasPaper' })
  paper.vm.$emit('contextmenu', id, new MouseEvent('contextmenu', {
    clientX: 100, clientY: 100, bubbles: true, cancelable: true,
  }))
  await nextTick()
}

/** 触发空白右键：contextmenu 落在纸张背景上 */
async function rightClickBackground(wrapper: ReturnType<typeof mount>) {
  const paper = wrapper.find('.hiprint-printPaper')
  await paper.trigger('contextmenu', { clientX: 100, clientY: 100 })
  await nextTick()
}

function menuItems(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.context-menu-item').map(i => i.text())
}

async function clickMenuItemByText(wrapper: ReturnType<typeof mount>, text: string) {
  const item = wrapper.findAll('.context-menu-item').find(i => i.text() === text)
  if (!item) throw new Error(`菜单项不存在: ${text}`)
  await item.trigger('click')
}

describe('CanvasArea 元素右键菜单', () => {
  it('元素右键菜单包含全部 8 项动作', async () => {
    const { wrapper } = mountArea({ elements: [makeElement('a')] })
    await rightClickElement(wrapper, 'a')
    expect(menuItems(wrapper)).toEqual([
      '复制', '剪切', '粘贴', '删除', '置顶', '上移', '下移', '置底',
    ])
  })

  it('右键未选中元素：先派发单选 select（宿主据此更新选中集，动作再作用于该元素）', async () => {
    const { wrapper } = mountArea({
      elements: [makeElement('a'), makeElement('b')],
      selected: ['a'],
    })
    await rightClickElement(wrapper, 'b')
    const emitted = wrapper.emitted('select')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1]).toEqual(['b', false])
  })

  it('右键已选中元素：不打断既有多选', async () => {
    const { wrapper } = mountArea({
      elements: [makeElement('a'), makeElement('b')],
      selected: ['a', 'b'],
    })
    await rightClickElement(wrapper, 'b')
    const emitted = wrapper.emitted('select')
    expect(emitted).toBeFalsy()
  })

  it.each([
    ['复制', 'copy', undefined],
    ['剪切', 'cut', undefined],
    ['粘贴', 'paste', undefined],
    ['删除', 'delete', undefined],
    ['置顶', 'move-layer', 'top'],
    ['上移', 'move-layer', 'up'],
    ['下移', 'move-layer', 'down'],
    ['置底', 'move-layer', 'bottom'],
  ] as const)('菜单项「%s」点击后派发对应事件', async (text, event, arg) => {
    const { wrapper } = mountArea({
      elements: [makeElement('a')],
      selected: ['a'],
      hasClipboard: true, // 粘贴项需剪贴板有数据才派发
    })
    await rightClickElement(wrapper, 'a')
    await clickMenuItemByText(wrapper, text)
    const emitted = wrapper.emitted(event)
    expect(emitted).toBeTruthy()
    const last = emitted![emitted!.length - 1]!
    if (arg === undefined) expect(last).toEqual([])
    else expect(last).toEqual([arg])
  })

  it('元素菜单粘贴：剪贴板为空时置灰且不派发', async () => {
    const { wrapper } = mountArea({ elements: [makeElement('a')], selected: ['a'], hasClipboard: false })
    await rightClickElement(wrapper, 'a')
    const pasteItem = wrapper.findAll('.context-menu-item').find(i => i.text() === '粘贴')!
    expect(pasteItem.classes()).toContain('disabled')
    await pasteItem.trigger('click')
    expect(wrapper.emitted('paste')).toBeFalsy()
  })

  it('动作派发后菜单关闭', async () => {
    const { wrapper } = mountArea({ elements: [makeElement('a')], selected: ['a'] })
    await rightClickElement(wrapper, 'a')
    await clickMenuItemByText(wrapper, '复制')
    expect(wrapper.find('.context-menu').exists()).toBe(false)
  })

  it('菜单内按下不关闭（子项 click 才能派发），菜单外按下关闭', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const { wrapper } = mountArea({ elements: [makeElement('a')], selected: ['a'], attachTo: host })
    await rightClickElement(wrapper, 'a')
    const item = wrapper.findAll('.context-menu-item')[0]
    // 菜单项上按下：@mousedown.stop 阻止冒泡，菜单保持打开，click 正常派发
    await item.trigger('mousedown')
    expect(wrapper.find('.context-menu').exists()).toBe(true)
    await item.trigger('click')
    expect(wrapper.emitted('copy')).toBeTruthy()
    expect(wrapper.find('.context-menu').exists()).toBe(false)
    // 再次打开后在菜单外按下：关闭
    await rightClickElement(wrapper, 'a')
    host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()
    expect(wrapper.find('.context-menu').exists()).toBe(false)
    wrapper.unmount()
    host.remove()
  })
})

describe('CanvasArea 空白右键菜单', () => {
  it('空白右键菜单包含 粘贴/全选/取消选择', async () => {
    const { wrapper } = mountArea({})
    await rightClickBackground(wrapper)
    expect(menuItems(wrapper)).toEqual(['粘贴', '全选', '取消选择'])
  })

  it('无剪贴板数据时粘贴项置灰且不派发 paste', async () => {
    const { wrapper } = mountArea({ hasClipboard: false })
    await rightClickBackground(wrapper)
    const pasteItem = wrapper.findAll('.context-menu-item')[0]
    expect(pasteItem.classes()).toContain('disabled')
    await pasteItem.trigger('click')
    expect(wrapper.emitted('paste')).toBeFalsy()
  })

  it('有剪贴板数据时点击粘贴派发 paste', async () => {
    const { wrapper } = mountArea({ hasClipboard: true })
    await rightClickBackground(wrapper)
    await clickMenuItemByText(wrapper, '粘贴')
    expect(wrapper.emitted('paste')).toBeTruthy()
  })

  it('全选/取消选择分别派发 select-all / clear-selection', async () => {
    const { wrapper } = mountArea({})
    await rightClickBackground(wrapper)
    await clickMenuItemByText(wrapper, '全选')
    expect(wrapper.emitted('select-all')).toBeTruthy()

    await rightClickBackground(wrapper)
    await clickMenuItemByText(wrapper, '取消选择')
    expect(wrapper.emitted('clear-selection')).toBeTruthy()
  })
})
