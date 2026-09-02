// web/src/components/print/__tests__/PageNumberElement.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PageNumberElement from '../components/elements/PageNumberElement.vue'
import type { RuntimeElement, TextAlign } from '../types'

function makeElement(textAlign?: TextAlign): RuntimeElement {
  return {
    id: 'el-pn',
    options: {
      left: 0,
      top: 0,
      width: 42.3,
      height: 7.1,
      title: '{pageIndex}/{totalPages}',
      ...(textAlign ? { textAlign } : {}),
    },
    printElementType: { type: 'pageNumber', title: '页码' },
  }
}

function styleOf(wrapper: { element: Element }): string {
  return (wrapper.element.getAttribute('style') ?? '').replace(/\s/g, '')
}

describe('PageNumberElement 对齐渲染（设计器与打印端一致）', () => {
  it('未设置 textAlign 时按左对齐渲染（与打印端同语义）', () => {
    const wrapper = mount(PageNumberElement, {
      props: { element: makeElement(), designMode: true },
    })
    expect(styleOf(wrapper)).toContain('text-align:left')
  })

  it('textAlign=center 时居中渲染且不依赖 flex', () => {
    const wrapper = mount(PageNumberElement, {
      props: { element: makeElement('center'), designMode: true },
    })
    expect(styleOf(wrapper)).toContain('text-align:center')
  })

  it('组件样式中不包含强制 flex 居中规则', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/elements/PageNumberElement.vue'),
      'utf-8',
    )
    const styleBlock = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? ''
    expect(styleBlock).not.toContain('flex')
  })
})
