import { describe, it, expect } from 'vitest'
import { useGroup, generateGroupId } from '../useGroup.js'
import type { RuntimeElement } from '../types.js'

function makeEl(id: string, groupId?: string): RuntimeElement {
  return { id, options: { left: 0, top: 0, width: 10, height: 10, groupId }, printElementType: { type: 'text', title: '文本' } }
}

describe('useGroup', () => {
  const { group, ungroup, getGroupedIds } = useGroup()

  it('组合：选中元素写入同一 groupId，未选中成员不受影响', () => {
    const grouped = group([makeEl('a'), makeEl('b'), makeEl('c')], new Set(['a', 'b']))
    const gid = grouped.find(e => e.id === 'a')!.options.groupId
    expect(gid).toBeTruthy()
    expect(grouped.find(e => e.id === 'b')!.options.groupId).toBe(gid)
    expect(grouped.find(e => e.id === 'c')!.options.groupId).toBeFalsy()
  })

  it('组合：不修改原数组与原元素对象', () => {
    const a = makeEl('a')
    const b = makeEl('b')
    const els = [a, b]
    const grouped = group(els, new Set(['a', 'b']))
    expect(grouped).not.toBe(els)
    expect(a.options.groupId).toBeUndefined()
    expect(b.options.groupId).toBeUndefined()
  })

  it('组合：选中不足 2 个时原样返回', () => {
    const els = [makeEl('a'), makeEl('b')]
    expect(group(els, new Set(['a']))).toBe(els)
    expect(group(els, new Set())).toBe(els)
  })

  it('取消组合：按整组剥离 groupId，即使只选中组内一个成员', () => {
    const gid = generateGroupId()
    const after = ungroup([makeEl('a', gid), makeEl('b', gid), makeEl('c')], new Set(['a']))
    expect(after.find(e => e.id === 'a')!.options.groupId).toBeUndefined()
    expect(after.find(e => e.id === 'b')!.options.groupId).toBeUndefined()
    expect(after.find(e => e.id === 'c')!.options.groupId).toBeUndefined()
  })

  it('取消组合：多组场景只剥离选中元素所在的组', () => {
    const gid1 = generateGroupId()
    const gid2 = generateGroupId()
    const after = ungroup(
      [makeEl('a', gid1), makeEl('b', gid1), makeEl('c', gid2), makeEl('d', gid2)],
      new Set(['a'])
    )
    expect(after.find(e => e.id === 'b')!.options.groupId).toBeUndefined()
    expect(after.find(e => e.id === 'c')!.options.groupId).toBe(gid2)
    expect(after.find(e => e.id === 'd')!.options.groupId).toBe(gid2)
  })

  it('getGroupedIds：组内成员返回整组 id，无组元素返回自身', () => {
    const gid = generateGroupId()
    const els = [makeEl('a', gid), makeEl('b', gid), makeEl('c')]
    expect(getGroupedIds(els, 'a')).toEqual(new Set(['a', 'b']))
    expect(getGroupedIds(els, 'c')).toEqual(new Set(['c']))
  })

  it('getGroupedIds：id 不存在时返回只含该 id 的集合', () => {
    expect(getGroupedIds([makeEl('a')], 'missing')).toEqual(new Set(['missing']))
  })
})

describe('generateGroupId', () => {
  it('grp- 前缀且批量生成不重复', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateGroupId()))
    expect(ids.size).toBe(50)
    expect([...ids][0]).toMatch(/^grp-\d+-[a-z0-9]{4}$/)
  })
})
