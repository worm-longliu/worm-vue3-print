import { describe, it, expect } from 'vitest'
import { groupFields, filterGroups } from '../utils/field-groups'
import type { PrintBusinessField } from '../types'

const fields: PrintBusinessField[] = [
  { fieldKey: 'remark', fieldLabel: '单据备注', fieldType: 'string', sortOrder: 0 },
  { fieldKey: 'supplier', fieldLabel: '供应商信息', fieldType: 'string', sortOrder: 1 },
  { fieldKey: 'supplier.name', fieldLabel: '供应商名称', fieldType: 'string', sortOrder: 2 },
  { fieldKey: 'supplier.phone', fieldLabel: '供应商电话', fieldType: 'string', sortOrder: 3 },
  { fieldKey: 'goods', fieldLabel: '商品明细', fieldType: 'list', sortOrder: 4 },
  { fieldKey: 'goods.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 5 },
  { fieldKey: 'goods.spec', fieldLabel: '规格', fieldType: 'string', sortOrder: 6 },
]

describe('groupFields', () => {
  it('按 fieldKey 首段分组，容器记录提供分组名', () => {
    const groups = groupFields(fields)
    // 顶层独立字段 + supplier + goods
    expect(groups.map(g => g.key)).toEqual(['', 'supplier', 'goods'])
    expect(groups[1]!.label).toBe('供应商信息')
    expect(groups[1]!.isList).toBe(false)
    expect(groups[1]!.fields.map(f => f.fieldKey)).toEqual(['supplier.name', 'supplier.phone'])
  })

  it('fieldType=list 的容器标记为明细列表分组', () => {
    const groups = groupFields(fields)
    const goods = groups.find(g => g.key === 'goods')!
    expect(goods.isList).toBe(true)
    expect(goods.label).toBe('商品明细')
  })

  it('无点且无子字段的记录作为独立顶层字段', () => {
    const groups = groupFields(fields)
    expect(groups[0]!.fields.map(f => f.fieldKey)).toEqual(['remark'])
  })

  it('缺少容器记录时分组名回退为 key', () => {
    const groups = groupFields([
      { fieldKey: 'receiver.name', fieldLabel: '收货人', fieldType: 'string', sortOrder: 1 },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('receiver')
    expect(groups[0]!.label).toBe('receiver')
  })
})

describe('filterGroups', () => {
  it('按字段名/字段 key 过滤叶子并剔除空分组', () => {
    const groups = filterGroups(groupFields(fields), '规格')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('goods')
    expect(groups[0]!.fields.map(f => f.fieldKey)).toEqual(['goods.spec'])
  })

  it('无关键字时原样返回', () => {
    expect(filterGroups(groupFields(fields), '')).toHaveLength(3)
  })
})
