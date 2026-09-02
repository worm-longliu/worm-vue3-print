// web/src/components/print/__tests__/TextElement.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TextElement from '../components/elements/TextElement.vue'
import type { RuntimeElement } from '../types'

function makeElement(options: Partial<RuntimeElement['options']> = {}): RuntimeElement {
  return {
    id: 'el-test',
    options: { left: 0, top: 0, width: 42.3, height: 7.1, ...options },
    printElementType: { type: 'text', title: '文本' },
  }
}

function styleOf(wrapper: { element: Element }): string {
  return (wrapper.element.getAttribute('style') ?? '').replace(/\s/g, '')
}

describe('TextElement 对齐渲染（设计器与打印端一致）', () => {
  it('textAlign=center 时水平居中且不使用 flex 布局', () => {
    const wrapper = mount(TextElement, {
      props: { element: makeElement({ textAlign: 'center', formatter: '文本' }), designMode: true },
    })
    const style = styleOf(wrapper)
    expect(style).toContain('text-align:center')
    expect(style).not.toContain('display:flex')
    expect(style).not.toContain('align-items')
  })

  it('未设置 textAlign 时默认左对齐', () => {
    const wrapper = mount(TextElement, {
      props: { element: makeElement({ formatter: '文本' }), designMode: true },
    })
    expect(styleOf(wrapper)).toContain('text-align:left')
  })

  it('textAlign=right 时右对齐且不产生垂直偏移', () => {
    const wrapper = mount(TextElement, {
      props: { element: makeElement({ textAlign: 'right', formatter: '文本' }), designMode: true },
    })
    const style = styleOf(wrapper)
    expect(style).toContain('text-align:right')
    expect(style).not.toContain('align-items:flex-end')
  })
})

describe('TextElement 垂直对齐（verticalAlign 显式设置时启用）', () => {
  it('verticalAlign=middle 且 textAlign=center：flex 垂直居中 + 水平居中', () => {
    const wrapper = mount(TextElement, {
      props: { element: makeElement({ textAlign: 'center', verticalAlign: 'middle', formatter: '文本' }), designMode: true },
    })
    const style = styleOf(wrapper)
    expect(style).toContain('display:flex')
    expect(style).toContain('align-items:center')
    expect(style).toContain('justify-content:center')
  })

  it('verticalAlign=bottom 且 textAlign=right：底部 + 右侧', () => {
    const wrapper = mount(TextElement, {
      props: { element: makeElement({ textAlign: 'right', verticalAlign: 'bottom', formatter: '文本' }), designMode: true },
    })
    const style = styleOf(wrapper)
    expect(style).toContain('align-items:flex-end')
    expect(style).toContain('justify-content:flex-end')
    expect(style).toContain('text-align:right')
  })

  it('verticalAlign=top：顶部对齐（align-items:flex-start）', () => {
    const wrapper = mount(TextElement, {
      props: { element: makeElement({ verticalAlign: 'top', formatter: '文本' }), designMode: true },
    })
    expect(styleOf(wrapper)).toContain('align-items:flex-start')
  })
})
