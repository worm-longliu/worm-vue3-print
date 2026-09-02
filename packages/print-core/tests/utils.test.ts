// packages/print-core/tests/utils.test.ts
import { describe, it, expect } from 'vitest'
import { getByPath } from '../src/utils.js'

describe('getByPath', () => {
  it('gets top-level property', () => {
    expect(getByPath({ a: 1 }, 'a')).toBe(1)
  })

  it('gets nested property', () => {
    expect(getByPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42)
  })

  it('returns undefined for missing path', () => {
    expect(getByPath({ a: 1 }, 'b')).toBeUndefined()
  })

  it('returns undefined for null obj', () => {
    expect(getByPath(null, 'a')).toBeUndefined()
  })

  it('supports flat key with dot', () => {
    const obj = { 'a.b': 1 }
    expect(getByPath(obj, 'a.b')).toBe(1) // flat key 优先
    expect(getByPath(obj, 'a')).toBeUndefined() // 不应该取到
  })
})
