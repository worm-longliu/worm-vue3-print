import { describe, it, expect } from 'vitest'
import { computeFitScale } from '../utils/scale'

describe('computeFitScale', () => {
  it('容器大于纸张时返回不超过 200 的适应缩放', () => {
    // 容器 800x600,纸张 595x842 pt(A4),min(800/595, 600/842)*0.9 ≈ 0.64 -> 64
    expect(computeFitScale(800, 600, 595, 842)).toBe(64)
  })
  it('容器很小时下限 50', () => {
    expect(computeFitScale(100, 100, 595, 842)).toBe(50)
  })
  it('容器很大时上限 200', () => {
    expect(computeFitScale(5000, 5000, 595, 842)).toBe(200)
  })
})
