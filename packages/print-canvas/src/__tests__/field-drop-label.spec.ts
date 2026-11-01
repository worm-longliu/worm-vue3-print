// 字段拖放口径：普通拖放生成取值绑定文本元素；按住 Ctrl（Mac 为 Cmd）松手生成
// 内容为字段中文名的静态文本元素。修饰键在 drop 事件上读取，拖动途中按下同样生效。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CanvasArea from '../components/CanvasArea.vue'
import { useDesignerState } from '../composables/useDesignerState'
import type { TemplateData } from '@worm-vue3-print/core/designer'

const FIELD = { fieldKey: 'supplier.name', fieldLabel: '供应商名称' }

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

/** happy-dom 没有可用的 DataTransfer，直接挂一个最小桩到 drop 事件上 */
function dropEvent(mods: { ctrlKey?: boolean; metaKey?: boolean } = {}): DragEvent {
  const ev = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperties(ev, {
    dataTransfer: {
      value: { getData: (type: string) => (type === 'fieldData' ? JSON.stringify(FIELD) : '') },
    },
    ctrlKey: { value: !!mods.ctrlKey },
    metaKey: { value: !!mods.metaKey },
    clientX: { value: 10 },
    clientY: { value: 10 },
  })
  return ev as unknown as DragEvent
}

function mountArea() {
  return mount(CanvasArea, {
    props: { templateData: makeTemplate(), elements: [], scale: 1 },
    global: { stubs: { BaseElement: true } },
  })
}

describe('画布字段落点：Ctrl 拖放标记透传', () => {
  it('普通放下：drop-field 第三参为 false', async () => {
    const wrapper = mountArea()
    wrapper.find('.canvas-area').element.dispatchEvent(dropEvent())
    await nextTick()
    const emitted = wrapper.emitted('drop-field')!
    expect(emitted).toHaveLength(1)
    expect(emitted[0]![0]).toEqual(FIELD)
    expect(emitted[0]![2]).toBe(false)
  })

  it('按住 Ctrl 放下：第三参为 true', async () => {
    const wrapper = mountArea()
    wrapper.find('.canvas-area').element.dispatchEvent(dropEvent({ ctrlKey: true }))
    await nextTick()
    expect(wrapper.emitted('drop-field')![0]![2]).toBe(true)
  })

  it('按住 Meta（Mac Cmd）放下：第三参同样为 true', async () => {
    const wrapper = mountArea()
    wrapper.find('.canvas-area').element.dispatchEvent(dropEvent({ metaKey: true }))
    await nextTick()
    expect(wrapper.emitted('drop-field')![0]![2]).toBe(true)
  })
})

describe('dragover：显式钉死 copy 效果（Windows 按住 Ctrl 会被原生重算吞掉复制徽标）', () => {
  it('dragover 写 dropEffect=copy 并拦截默认动作', () => {
    const wrapper = mountArea()
    const ev = new Event('dragover', { bubbles: true, cancelable: true })
    const dt: { dropEffect: string } = { dropEffect: 'none' }
    Object.defineProperty(ev, 'dataTransfer', { value: dt })
    wrapper.find('.canvas-area').element.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(dt.dropEffect).toBe('copy')
  })
})

describe('dragover 落点自绘徽标（.drop-hint，绕开 OS 光标徽标重算）', () => {
  /** dragover 桩：只暴露 types/dropEffect，模拟真实浏览器「拖动中读不了数据、能读类型」 */
  function dragOverEvent(opts: { types?: string[]; ctrlKey?: boolean; metaKey?: boolean } = {}) {
    const ev = new Event('dragover', { bubbles: true, cancelable: true })
    const dt: { types: string[]; dropEffect: string } = { types: opts.types ?? [], dropEffect: 'none' }
    Object.defineProperties(ev, {
      dataTransfer: { value: dt },
      ctrlKey: { value: !!opts.ctrlKey },
      metaKey: { value: !!opts.metaKey },
      clientX: { value: 120 },
      clientY: { value: 140 },
    })
    return { ev, dt }
  }
  function fire(wrapper: ReturnType<typeof mountArea>, opts: Parameters<typeof dragOverEvent>[0]) {
    const { ev, dt } = dragOverEvent(opts)
    wrapper.find('.canvas-area').element.dispatchEvent(ev)
    return dt
  }

  it('字段拖起 + ⌘：徽标「＋ 静态文本」，同时钉死 dropEffect=copy', async () => {
    const wrapper = mountArea()
    const dt = fire(wrapper, { types: ['fielddata'], metaKey: true })
    await nextTick()
    const hint = wrapper.find('.drop-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('＋ 静态文本')
    expect(dt.dropEffect).toBe('copy')
  })

  it('字段拖起不按修饰键「＋ 取值字段」；素材卡拖起「＋ 元素」且不随 ⌘ 变', async () => {
    const wrapper = mountArea()
    fire(wrapper, { types: ['fielddata'] })
    await nextTick()
    expect(wrapper.find('.drop-hint').text()).toBe('＋ 取值字段')
    fire(wrapper, { types: ['elementtype'], metaKey: true })
    await nextTick()
    expect(wrapper.find('.drop-hint').text()).toBe('＋ 元素')
  })

  it('外部拖入（files 类型）不出徽标，也不误报可放置', async () => {
    const wrapper = mountArea()
    fire(wrapper, { types: ['files'] })
    await nextTick()
    expect(wrapper.find('.drop-hint').exists()).toBe(false)
  })

  it('放下即隐藏', async () => {
    const wrapper = mountArea()
    fire(wrapper, { types: ['fielddata'], ctrlKey: true })
    await nextTick()
    expect(wrapper.find('.drop-hint').exists()).toBe(true)
    wrapper.find('.canvas-area').element.dispatchEvent(dropEvent({ ctrlKey: true }))
    await nextTick()
    expect(wrapper.find('.drop-hint').exists()).toBe(false)
  })

  it('拖拽取消（源端 dragend 到 document）兜底隐藏', async () => {
    const wrapper = mountArea()
    fire(wrapper, { types: ['fielddata'] })
    await nextTick()
    expect(wrapper.find('.drop-hint').exists()).toBe(true)
    document.dispatchEvent(new Event('dragend'))
    await nextTick()
    expect(wrapper.find('.drop-hint').exists()).toBe(false)
    wrapper.unmount()
  })

  it('拖拽中按过 ⌘ 即锁存：松键后的 drop 仍落静态文本，徽标同步锁存值', async () => {
    const wrapper = mountArea()
    const ev1 = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperties(ev1, {
      dataTransfer: { value: { types: ['fielddata'], dropEffect: 'none' } },
      metaKey: { value: true }, clientX: { value: 10 }, clientY: { value: 10 },
    })
    wrapper.find('.canvas-area').element.dispatchEvent(ev1)
    await nextTick()
    expect(wrapper.find('.drop-hint').text()).toBe('＋ 静态文本')
    // 途中松开 ⌘（macOS 用户被迫的先松键再松鼠标序列）
    const ev2 = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperties(ev2, {
      dataTransfer: { value: { types: ['fielddata'], dropEffect: 'none' } },
      metaKey: { value: false }, clientX: { value: 10 }, clientY: { value: 10 },
    })
    wrapper.find('.canvas-area').element.dispatchEvent(ev2)
    await nextTick()
    expect(wrapper.find('.drop-hint').text()).toBe('＋ 静态文本')
    wrapper.find('.canvas-area').element.dispatchEvent(dropEvent())
    await nextTick()
    expect(wrapper.emitted('drop-field')![0]![2]).toBe(true)
    // 锁存随会话结束复位：同实例下一次普通拖放仍是取值绑定
    wrapper.find('.canvas-area').element.dispatchEvent(dropEvent())
    await nextTick()
    expect(wrapper.emitted('drop-field')![1]![2]).toBe(false)
    wrapper.unmount()
  })
})

describe('addFieldElement：普通拖放 vs Ctrl 拖放', () => {
  it('普通拖放仍是取值绑定元素', () => {
    const s = useDesignerState()
    s.addFieldElement(FIELD)
    const el = s.elements.value[s.elements.value.length - 1]!
    expect(el.printElementType.type).toBe('text')
    expect(el.options.formatter).toBe('{supplier.name}')
    expect(el.options.title).toBe('供应商名称')
  })

  it('Ctrl 拖放生成静态文本元素：内容与图层名都是字段中文名', () => {
    const s = useDesignerState()
    s.addFieldElement(FIELD, undefined, true)
    const el = s.elements.value[s.elements.value.length - 1]!
    expect(el.printElementType.type).toBe('text')
    expect(el.options.formatter).toBe('供应商名称')
    expect(el.options.title).toBe('供应商名称')
  })
})
