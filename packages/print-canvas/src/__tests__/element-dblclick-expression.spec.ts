// print-canvas/src/__tests__/element-dblclick-expression.spec.ts
// 画布双击元素 → 表达式弹出框：流式列表与文本/条码/二维码/图片同在白名单，
// 且「任意区域」都能打开——双击元素框（含内部单元格子）都落在同一个 dblclick-element 上。
// 对照 print-common 的 src/__tests__/expression-dblclick.spec.ts（两套外壳同一张白名单）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrintDesigner from '../components/PrintDesigner.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

/** ElementOptions 的 left/top/width/height 是必填项，夹具按同一形状声明 */
type Box = { left: number; top: number; width: number; height: number; [key: string]: any }

function a4(elements: TemplateData['elements']): TemplateData {
  return {
    // unit: 'mm' 必须显式声明——缺省视为历史 pt 模板，载入时会被 normalizeTemplateUnits 换算
    unit: 'mm',
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements,
  } as TemplateData
}

function flowList(id: string, options: Box) {
  return {
    id,
    type: 'flowList' as const,
    options,
    printElementType: { type: 'flowList' as const, title: '流式列表' },
  }
}

const FLOW_BOX: Box = {
  left: 10, top: 10, width: 120, height: 24, fontSize: 10.5,
  formatter: '{drugs.name} {drugs.spec}',
  flowColumns: 4, flowRowHeight: 8, flowGapX: 4,
  flowAutoSpan: false, flowMaxSpan: 2,
}

function mountDesigner(template: TemplateData) {
  return mount(PrintDesigner, { props: { initialTemplate: template } })
}

const overlay = (wrapper: ReturnType<typeof mountDesigner>) => wrapper.find('.pd-dialog-overlay')

function templateElements(wrapper: ReturnType<typeof mountDesigner>) {
  const json = wrapper.vm.getTemplateJson() as any
  return (Array.isArray(json) ? json[0] : json).elements as any[]
}

describe('画布双击元素 → 表达式弹出框（流式列表）', () => {
  it('双击流式列表元素框：弹框打开并预填单元模板 formatter', async () => {
    const wrapper = mountDesigner(a4([flowList('f1', { ...FLOW_BOX })] as TemplateData['elements']))
    await wrapper.vm.$nextTick()

    await wrapper.find('.print-element').trigger('dblclick')

    expect(overlay(wrapper).exists()).toBe(true)
    expect((wrapper.find('.ee-textarea').element as HTMLTextAreaElement).value).toBe('{drugs.name} {drugs.spec}')
  })

  it('双击流式列表内部任意单元格子（事件冒泡到元素框）同样打开弹框', async () => {
    const wrapper = mountDesigner(a4([flowList('f1', { ...FLOW_BOX })] as TemplateData['elements']))
    await wrapper.vm.$nextTick()

    const cell = wrapper.find('.print-element .print-flow-cell')
    expect(cell.exists()).toBe(true)
    await cell.trigger('dblclick')

    expect(overlay(wrapper).exists()).toBe(true)
  })

  it('确定后写回 options.formatter', async () => {
    const wrapper = mountDesigner(a4([flowList('f1', { ...FLOW_BOX })] as TemplateData['elements']))
    await wrapper.vm.$nextTick()

    await wrapper.find('.print-element').trigger('dblclick')
    const textarea = wrapper.find('.ee-textarea')
    // v-model 走 input 事件（触发 dblclick 后编辑器已把 expression 同步进本地值，这里直接覆写）
    ;(textarea.element as HTMLTextAreaElement).value = '{drugs.name}'
    await textarea.trigger('input')
    const confirm = wrapper.findAll('.pd-dialog-footer .pd-button').find(b => b.text() === '确定')
    await confirm!.trigger('click')

    expect(overlay(wrapper).exists()).toBe(false)
    expect(templateElements(wrapper)[0]!.options.formatter).toBe('{drugs.name}')
  })

  it('锁定元素双击：只选中不弹框', async () => {
    const wrapper = mountDesigner(a4([flowList('f1', { ...FLOW_BOX, locked: true })] as TemplateData['elements']))
    await wrapper.vm.$nextTick()

    await wrapper.find('.print-element').trigger('dblclick')

    expect(overlay(wrapper).exists()).toBe(false)
  })
})
