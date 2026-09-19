import { describe, it, expect } from 'vitest'
import { useClipboard } from '../composables/useClipboard'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

function makeEl(id: string, groupId?: string): RuntimeElement {
  return {
    id,
    zone: 'content',
    printElementType: { type: 'text', title: '文本' },
    options: {
      left: 10,
      top: 10,
      width: 40,
      height: 20,
      ...(groupId ? { groupId } : {}),
    },
  } as RuntimeElement
}

describe('useClipboard 编组粘贴', () => {
  it('整组粘贴：副本获得全新 groupId，与原组及彼此之间不串组', () => {
    const clip = useClipboard()
    clip.copy([makeEl('a', 'grp-1'), makeEl('b', 'grp-1')])

    const first = clip.paste()!
    expect(first).toHaveLength(2)
    const firstGid = first[0]!.options.groupId
    expect(firstGid).toBeTruthy()
    expect(firstGid).not.toBe('grp-1')
    // 同一次粘贴的两个成员共享新组
    expect(first[1]!.options.groupId).toBe(firstGid)
    // 元素 id 也被重新生成
    expect(first.map(e => e.id)).not.toEqual(['a', 'b'])

    const second = clip.paste(20)!
    const secondGid = second[0]!.options.groupId
    expect(secondGid).toBeTruthy()
    // 二次粘贴再换一个组，不与第一次粘贴的副本串组
    expect(secondGid).not.toBe(firstGid)
    expect(second[1]!.options.groupId).toBe(secondGid)
  })

  it('只复制组内单个成员：粘贴时剥离 groupId，不残留组身份', () => {
    const clip = useClipboard()
    clip.copy([makeEl('a', 'grp-1')])
    const pasted = clip.paste()!
    expect(pasted).toHaveLength(1)
    expect(pasted[0]!.options.groupId).toBeUndefined()
  })

  it('无组元素粘贴后仍无 groupId', () => {
    const clip = useClipboard()
    clip.copy([makeEl('x'), makeEl('y')])
    const pasted = clip.paste()!
    expect(pasted.every(e => e.options.groupId === undefined)).toBe(true)
  })
})
