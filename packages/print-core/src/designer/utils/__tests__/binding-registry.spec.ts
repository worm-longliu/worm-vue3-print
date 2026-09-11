import { describe, it, expect } from 'vitest'
import { ELEMENT_BINDING_REGISTRY, getElementBindings, getTableCellBindings } from '../binding-registry.js'

describe('binding-registry', () => {
  it('text 元素只有 1 个 formatter 绑定描述符', () => {
    const bindings = ELEMENT_BINDING_REGISTRY['text']!
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.targetPath).toBe('options.formatter')
    expect(bindings[0]!.label).toBe('内容')
  })

  it('longText 有 formatter + styler 两个描述符', () => {
    const bindings = ELEMENT_BINDING_REGISTRY['longText']!
    expect(bindings).toHaveLength(2)
    expect(bindings[0]!.targetPath).toBe('options.formatter')
    expect(bindings[1]!.targetPath).toBe('options.styler')
  })

  it('image 元素绑定 options.src（内容路径输入框）', () => {
    const bindings = ELEMENT_BINDING_REGISTRY['image']!
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.targetPath).toBe('options.src')
    expect(bindings[0]!.label).toBe('内容')
  })

  it('getElementBindings 返回静态绑定', () => {
    const element = { id: 'el-1', printElementType: { type: 'text' }, options: { formatter: '{name}' } }
    const bindings = getElementBindings(element as any)
    expect(bindings.length).toBe(1)
  })

  it('getTableCellBindings data 行返回 formatter', () => {
    const bindings = getTableCellBindings('data', 0, 0, 'items')
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.targetPath).toBe('options.tableRows[0].cells[0].formatter')
    expect(bindings[0]!.dataSource).toBe('list')
  })

  it('getTableCellBindings summary 行返回 formatter', () => {
    const bindings = getTableCellBindings('summary', 2, 1, 'items')
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.targetPath).toBe('options.tableRows[2].cells[1].formatter')
    expect(bindings[0]!.dataSource).toBe('summary')
  })
})
