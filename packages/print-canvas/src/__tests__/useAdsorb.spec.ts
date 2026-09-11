import { describe, it, expect } from 'vitest'
import { useAdsorb } from '../composables/useAdsorb'
import type { ElementRect } from '@worm-vue3-print/core/designer'

describe('useAdsorb', () => {
  it('阈值内水平吸附到其他元素左边缘', () => {
    const { check } = useAdsorb({ adsorbMin: 3 })
    const moving: ElementRect = { id: 'a', left: 22, top: 50, width: 80, height: 20 }
    const others: ElementRect[] = [
      { id: 'b', left: 20, top: 100, width: 80, height: 20 },
    ]
    const result = check(moving, others)
    // 22 与 20 距离 2 <= 3，应吸附到 20
    expect(result.left).toBe(20)
  })

  it('阈值外不吸附', () => {
    const { check } = useAdsorb({ adsorbMin: 3 })
    const moving: ElementRect = { id: 'a', left: 30, top: 50, width: 80, height: 20 }
    const others: ElementRect[] = [
      { id: 'b', left: 20, top: 100, width: 80, height: 20 },
    ]
    const result = check(moving, others)
    expect(result.left).toBe(30)
  })

  it('吸附时返回引导线', () => {
    const { check } = useAdsorb({ adsorbMin: 3, adsorbLineMin: 6, showAdsorbLine: true })
    const moving: ElementRect = { id: 'a', left: 22, top: 50, width: 80, height: 20 }
    const others: ElementRect[] = [
      { id: 'b', left: 20, top: 100, width: 80, height: 20 },
    ]
    const result = check(moving, others)
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it('垂直参考线只吸附水平方向(left 对齐)', () => {
    const { check } = useAdsorb({ adsorbMin: 3 })
    const moving: ElementRect = { id: 'm', left: 98, top: 0, width: 10, height: 10 }
    const res = check(moving, [], { vertical: [100], horizontal: [] })
    expect(res.left).toBe(100)
    expect(res.lines.length).toBeGreaterThan(0)
  })

  it('水平参考线只吸附垂直方向(top 对齐)', () => {
    const { check } = useAdsorb({ adsorbMin: 3 })
    const moving: ElementRect = { id: 'm', left: 0, top: 48, width: 10, height: 10 }
    const res = check(moving, [], { vertical: [], horizontal: [50] })
    expect(res.top).toBe(50)
  })
})
