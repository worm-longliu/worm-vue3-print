import { describe, it, expect } from 'vitest'
import {
  computeFitScale,
  clampScalePercent,
  nextWheelScale,
  MIN_SCALE_PERCENT,
} from '../utils/scale'

describe('computeFitScale', () => {
  it('容器略大于纸张时返回适应缩放', () => {
    // 容器 800x600,纸张 595x842 pt(A4),min(800/595, 600/842)*0.9 ≈ 0.64 -> 64
    expect(computeFitScale(800, 600, 595, 842)).toBe(64)
  })
  it('容器很小时可低于交互缩放下限(25%),保证大纸张整版容纳', () => {
    // min(100/595, 100/842) * 0.9 ≈ 0.107 -> 11,不受 25% 交互下限钳制
    expect(computeFitScale(100, 100, 595, 842)).toBe(11)
  })
  it('容器很大时不再钳制放大上限', () => {
    // min(5000/595, 5000/842) * 0.9 ≈ 5.34 -> 534,旧实现会被钳制为 200
    expect(computeFitScale(5000, 5000, 595, 842)).toBe(534)
  })
})

describe('clampScalePercent', () => {
  it('放大方向不设上限', () => {
    expect(clampScalePercent(534)).toBe(534)
    expect(clampScalePercent(1000)).toBe(1000)
  })
  it('低于最小缩放时钳制到下限', () => {
    expect(clampScalePercent(10)).toBe(MIN_SCALE_PERCENT)
    expect(MIN_SCALE_PERCENT).toBe(25)
  })
})

describe('nextWheelScale', () => {
  it('滚轮放大按 ×1.1 乘性步进并取整', () => {
    expect(nextWheelScale(100, 1)).toBe(110)
    expect(nextWheelScale(110, 1)).toBe(121)
  })
  it('可以越过旧的 200% 上限继续放大', () => {
    expect(nextWheelScale(200, 1)).toBe(220)
    expect(nextWheelScale(220, 1)).toBe(242)
  })
  it('滚轮缩小按 ÷1.1 乘性步进并取整', () => {
    expect(nextWheelScale(100, -1)).toBe(91)
  })
  it('缩小时不低于最小缩放', () => {
    expect(nextWheelScale(25, -1)).toBe(25)
    expect(nextWheelScale(27, -1)).toBe(25)
  })
})
