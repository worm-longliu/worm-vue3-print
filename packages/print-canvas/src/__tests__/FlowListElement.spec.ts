import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import FlowListElement from '../components/elements/FlowListElement.vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

function makeElement(options: Partial<RuntimeElement['options']> = {}): RuntimeElement {
  return {
    id: 'el-flowlist',
    options: {
      left: 0, top: 0, width: 190, height: 24, fontSize: 10.5,
      formatter: '{name} {spec}', dataSource: 'drugs',
      flowColumns: 4, flowRowHeight: 8, flowGapX: 6,
      flowAutoSpan: true, flowMaxSpan: 2,
      ...options,
    },
    printElementType: { type: 'flowList', title: '流式列表' },
  }
}

const DRUGS = [
  { name: '黄芪', spec: '20g' },
  { name: '炙黄芪（先煎）', spec: '30g' },
  { name: '红花', spec: '10g' },
]
/** 设计器把打印数据按「每行一份」传进来，明细数组挂在记录自己的字段上 */
const PRINT_DATA = [{ drugs: DRUGS }]

function rootStyle(wrapper: { element: Element }): string {
  return (wrapper.element.getAttribute('style') ?? '').replace(/\s/g, '')
}

describe('FlowListElement 设计态铺法', () => {
  it('网格列数、间距、最小行高与出纸同源', () => {
    const wrapper = mount(FlowListElement, { props: { element: makeElement(), data: PRINT_DATA, designMode: true } })
    const style = rootStyle(wrapper)
    expect(style).toContain('grid-template-columns:repeat(4,minmax(0,1fr))')
    expect(style).toContain('column-gap:6mm')
    expect(style).toContain('grid-auto-rows:minmax(8mm,auto)')
    expect(style).toContain('overflow:hidden')
  })

  it('单元模板按业务数据逐项求值，一物一格里排开', () => {
    const wrapper = mount(FlowListElement, { props: { element: makeElement(), data: PRINT_DATA, designMode: true } })
    expect(wrapper.findAll('.print-flow-cell').map(c => c.text()))
      .toEqual(['黄芪 20g', '炙黄芪（先煎） 30g', '红花 10g'])
  })

  it('未填数据源时取记录里第一个数组（与出纸 resolveListSource 同兜底）', () => {
    const wrapper = mount(FlowListElement, {
      props: { element: makeElement({ dataSource: undefined }), data: [{ herbs: DRUGS }], designMode: true },
    })
    expect(wrapper.findAll('.print-flow-cell').length).toBe(3)
  })

  it('单元模板写成完整表达式时按表达式里的列表路径取数', () => {
    const wrapper = mount(FlowListElement, {
      props: {
        element: makeElement({ formatter: '{drugs.name} {drugs.spec}', dataSource: undefined }),
        data: PRINT_DATA,
        designMode: true,
      },
    })
    expect(wrapper.findAll('.print-flow-cell').map(c => c.text()))
      .toEqual(['黄芪 20g', '炙黄芪（先煎） 30g', '红花 10g'])
  })

  it('设计台不预演跨列：开了自动跨列也不写 grid-column:span', () => {
    const wrapper = mount(FlowListElement, { props: { element: makeElement(), data: PRINT_DATA, designMode: true } })
    expect(wrapper.html()).not.toContain('grid-column:span')
    expect(rootStyle(wrapper)).not.toContain('span')
  })

  it('没有数据时按内置样例铺出形状，新拖入的元素不是空框', () => {
    const wrapper = mount(FlowListElement, { props: { element: makeElement(), designMode: true } })
    expect(wrapper.findAll('.print-flow-cell').length).toBe(7)
  })

  it('运行态无数据时不硬塞样例（出纸不能凭空多出不存在的药味）', () => {
    const wrapper = mount(FlowListElement, { props: { element: makeElement(), designMode: false } })
    expect(wrapper.findAll('.print-flow-cell').length).toBe(0)
  })

  it('列数非法值回落到下限档，不出现 repeat(0)', () => {
    const wrapper = mount(FlowListElement, {
      props: { element: makeElement({ flowColumns: 0 }), data: PRINT_DATA, designMode: true },
    })
    expect(rootStyle(wrapper)).toContain('grid-template-columns:repeat(1,minmax(0,1fr))')
  })
})

describe('FlowListElement 动态布局样式', () => {
  it('动态模式根节点四边内边距、自动高度且不裁切', () => {
    const wrapper = mount(FlowListElement, {
      props: {
        element: makeElement({
          flowLayoutMode: 'dynamic',
          flowPaddingTop: 2, flowPaddingRight: 3, flowPaddingBottom: 4, flowPaddingLeft: 5,
        }),
        data: PRINT_DATA,
        designMode: true,
      },
    })
    const style = rootStyle(wrapper)
    expect(style).toContain('padding:2mm3mm4mm5mm')
    expect(style).toContain('height:auto')
    expect(style).toContain('overflow:visible')
  })

  it('固定模式保持原设计高度与裁切，不写动态内边距', () => {
    const wrapper = mount(FlowListElement, {
      props: {
        element: makeElement({
          flowLayoutMode: 'fixed',
          flowPaddingTop: 2, flowPaddingRight: 3, flowPaddingBottom: 4, flowPaddingLeft: 5,
        }),
        data: PRINT_DATA,
        designMode: true,
      },
    })
    const style = rootStyle(wrapper)
    expect(style).toContain('height:100%')
    expect(style).toContain('overflow:hidden')
    expect(style).not.toContain('padding:')
  })

  it('缺省（未声明模式）与非法值仍按 fixed 呈现', () => {
    for (const mode of [undefined, 'unknown']) {
      const wrapper = mount(FlowListElement, {
        props: { element: makeElement({ flowLayoutMode: mode as any }), data: PRINT_DATA, designMode: true },
      })
      const style = rootStyle(wrapper)
      expect(style).toContain('height:100%')
      expect(style).toContain('overflow:hidden')
    }
  })
})

describe('FlowListElement 动态高度实测', () => {
  const PX_PER_MM = 3.7795275591

  async function flushMeasurement() {
    await nextTick()
    await nextTick()
  }

  function mockRootHeight(wrapper: ReturnType<typeof mount>, px: number) {
    const root = wrapper.find('.print-flowlist').element
    Object.defineProperty(root, 'offsetHeight', { configurable: true, value: px })
  }

  it('动态内容实测后回写毫米高度（两位小数）', async () => {
    const element = reactive(makeElement({ flowLayoutMode: 'dynamic' }))
    const wrapper = mount(FlowListElement, { props: { element, data: PRINT_DATA, designMode: true } })
    mockRootHeight(wrapper, 76)
    await flushMeasurement()
    expect(element.options.height).toBe(20.11)
  })

  it('实测时加上父 .print-element 的上下边框像素', async () => {
    const element = reactive(makeElement({ flowLayoutMode: 'dynamic' }))
    const wrapper = mount(FlowListElement, {
      props: { element, data: PRINT_DATA, designMode: true },
      attachTo: document.body,
    })
    const host = document.createElement('div')
    host.className = 'print-element'
    host.style.borderTop = '2px solid #000'
    host.style.borderBottom = '3px solid #000'
    document.body.appendChild(host)
    host.appendChild(wrapper.element)

    mockRootHeight(wrapper, 72)
    await flushMeasurement()
    expect(element.options.height).toBe(Math.round(((72 + 2 + 3) / PX_PER_MM) * 100) / 100)

    wrapper.unmount()
    host.remove()
  })

  it('打印数据变化后按新内容重新测量高度', async () => {
    const element = reactive(makeElement({ flowLayoutMode: 'dynamic' }))
    const wrapper = mount(FlowListElement, { props: { element, data: PRINT_DATA, designMode: true } })
    let heightPx = 76
    const root = wrapper.find('.print-flowlist').element
    Object.defineProperty(root, 'offsetHeight', { configurable: true, get: () => heightPx })
    await flushMeasurement()
    expect(element.options.height).toBe(20.11)

    heightPx = 114
    await wrapper.setProps({ data: [{ drugs: [...DRUGS, { name: '丹参', spec: '15g' }] }] })
    await flushMeasurement()
    expect(element.options.height).toBe(30.16)
  })

  it('零高度不写模型高度', async () => {
    const element = reactive(makeElement({ flowLayoutMode: 'dynamic' }))
    const wrapper = mount(FlowListElement, { props: { element, data: PRINT_DATA, designMode: true } })
    mockRootHeight(wrapper, 0)
    await flushMeasurement()
    expect(element.options.height).toBe(24)
  })

  it('固定模式不启动实测', async () => {
    const element = reactive(makeElement({ flowLayoutMode: 'fixed' }))
    const wrapper = mount(FlowListElement, { props: { element, data: PRINT_DATA, designMode: true } })
    mockRootHeight(wrapper, 76)
    await flushMeasurement()
    expect(element.options.height).toBe(24)
  })

  it('非设计态不回写高度', async () => {
    const element = reactive(makeElement({ flowLayoutMode: 'dynamic' }))
    const wrapper = mount(FlowListElement, { props: { element, data: PRINT_DATA, designMode: false } })
    mockRootHeight(wrapper, 76)
    await flushMeasurement()
    expect(element.options.height).toBe(24)
  })
})
