import { describe, expect, it, vi } from 'vitest'
import { createRevisionCache } from '../../../../demo/src/template-session.js'

describe('浏览器 revision 单项缓存', () => {
  it('相同序列化内容复用摘要，内容变化后重新计算', async () => {
    const hash = vi.fn(async (value: unknown) => JSON.stringify(value))
    const cached = createRevisionCache(hash)
    const first = { b: 2, a: 1 }
    expect(await cached(first)).toBe('{"b":2,"a":1}')
    expect(await cached({ b: 2, a: 1 })).toBe('{"b":2,"a":1}')
    expect(hash).toHaveBeenCalledTimes(1)
    expect(await cached({ b: 3, a: 1 })).toBe('{"b":3,"a":1}')
    expect(hash).toHaveBeenCalledTimes(2)
  })
})
