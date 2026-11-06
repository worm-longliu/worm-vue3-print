import { describe, it, expect } from 'vitest'
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, assertImageSizeWithinLimit, estimateBase64Bytes } from './image-limits.js'

describe('图片尺寸上限', () => {
  it('常量口径：长边 4000、总像素 2000 万、文件 20MB', () => {
    expect(MAX_IMAGE_SIDE).toBe(4000)
    expect(MAX_IMAGE_PIXELS).toBe(20_000_000)
    expect(MAX_IMAGE_BYTES).toBe(20 * 1024 * 1024)
  })

  it('A4@300dpi（2480×3508）与 4000 长边以内的比例可以通过', () => {
    expect(() => assertImageSizeWithinLimit(2480, 3508)).not.toThrow()
    expect(() => assertImageSizeWithinLimit(4000, 4000)).not.toThrow()
  })

  it('长边超限抛 IMAGE_TOO_LARGE，消息含实际尺寸与上限值', () => {
    expect(() => assertImageSizeWithinLimit(4001, 100)).toThrow(/4001×100.*长边 ≤ 4000/)
    expect(() => assertImageSizeWithinLimit(100, 4001)).toThrow(/IMAGE|4001/)
    try {
      assertImageSizeWithinLimit(5000, 2000)
      expect.unreachable()
    } catch (e) {
      expect((e as Error & { code: string }).code).toBe('IMAGE_TOO_LARGE')
      expect((e as Error).message).toContain('4000')
    }
  })

  it('总像素与长边双门：4000×4000（16M）可过，超任一门即抛', () => {
    expect(() => assertImageSizeWithinLimit(4000, 4000)).not.toThrow()
    // 4000×5000 同时破长边与总像素门
    try {
      assertImageSizeWithinLimit(4000, 5000)
      expect.unreachable()
    } catch (e) {
      expect((e as Error & { code: string }).code).toBe('IMAGE_TOO_LARGE')
      expect((e as Error).message).toContain('20000000')
    }
  })

  it('非有限尺寸按解码失败拒绝', () => {
    try {
      assertImageSizeWithinLimit(Number.NaN, 100)
      expect.unreachable()
    } catch (e) {
      expect((e as Error & { code: string }).code).toBe('IMAGE_DECODE_FAILED')
    }
  })
})

describe('estimateBase64Bytes', () => {
  it('按 length*3/4 向上估算，能拦下超过文件上限的渲染结果', () => {
    expect(estimateBase64Bytes('')).toBe(0)
    expect(estimateBase64Bytes('AAAA')).toBe(3)
    expect(estimateBase64Bytes('AAAAA')).toBe(4)
    // 约 29MB 的 base64 → 估算超过 20MB
    expect(estimateBase64Bytes('A'.repeat(28_000_000))).toBeGreaterThan(MAX_IMAGE_BYTES)
  })
})
