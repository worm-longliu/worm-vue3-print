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
