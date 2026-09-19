import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LongTextElement from '../components/elements/LongTextElement.vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

function makeElement(options: Partial<RuntimeElement['options']> = {}): RuntimeElement {
  return {
    id: 'el-longtext',
    options: { left: 0, top: 0, width: 141.1, height: 28.2, fontSize: 12, ...options },
    printElementType: { type: 'longText', title: '长文' },
  }
}

function styleOf(wrapper: { element: Element }): string {
  return (wrapper.element.getAttribute('style') ?? '').replace(/\s/g, '')
}

describe('LongTextElement 文字溢出显示形式', () => {
  it('未配置时默认自适应行高（与打印端一致）：放开高度与裁剪', () => {
    const wrapper = mount(LongTextElement, {
      props: { element: makeElement({ formatter: '长文本' }), designMode: true },
    })
    const style = styleOf(wrapper)
    expect(style).toContain('height:auto')
    expect(style).toContain('overflow:visible')
    expect(wrapper.attributes('data-fit')).toBeUndefined()
  })

  it('截断：锁高度并裁剪', () => {
    const wrapper = mount(LongTextElement, {
      props: { element: makeElement({ formatter: '长文本', textFit: 'clip' }), designMode: true },
    })
    const style = styleOf(wrapper)
    expect(style).toContain('height:100%')
    expect(style).toContain('overflow:hidden')
  })

  it('自动缩小：带 shrink 标记，基准字号来自 fontSize', () => {
    const wrapper = mount(LongTextElement, {
      props: { element: makeElement({ formatter: '长文本', fontSize: 14, textFit: 'shrink' }), designMode: true },
    })
    expect(wrapper.attributes('data-fit')).toBe('shrink')
    expect(wrapper.attributes('data-fit-base')).toBe('14')
    // 未配置下限时按默认 6pt
    expect(wrapper.attributes('data-fit-min')).toBe('6')
  })
})
