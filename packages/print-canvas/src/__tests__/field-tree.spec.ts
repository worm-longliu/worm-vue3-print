// web/src/components/print/__tests__/field-tree.spec.ts
import { describe, it, expect } from 'vitest'
import { getFieldTree, getListFields, flattenFieldTree } from '../utils/field-tree-config'

describe('getFieldTree', () => {
  it('应按业务类型返回字段树', () => {
    const tree = getFieldTree('purchase_receipt')
    expect(tree.length).toBeGreaterThan(0)
    const supplier = tree.find(n => n.id === 'supplier')
    expect(supplier).toBeDefined()
    expect(supplier!.children.length).toBeGreaterThan(0)
  })

  it('未知业务类型应返回空数组', () => {
    expect(getFieldTree('unknown_type')).toEqual([])
  })
})

describe('getListFields', () => {
  it('应返回列表类型节点', () => {
    const lists = getListFields('purchase_receipt')
    expect(lists.length).toBe(1)
    expect(lists[0]!.id).toBe('goods')
    expect(lists[0]!.isList).toBe(true)
  })
})

describe('flattenFieldTree', () => {
  it('应展平为 label/value 对，排除列表容器', () => {
    const flat = flattenFieldTree(getFieldTree('purchase_receipt'))
    // 不应包含列表容器
    expect(flat.find(f => f.value === 'goods')).toBeUndefined()
    // 应包含叶子节点
    expect(flat.find(f => f.value === 'supplier.name')).toBeDefined()
    expect(flat.find(f => f.value === 'goods.name')).toBeDefined()
  })
})