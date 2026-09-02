// web/src/components/print/__tests__/useResize.spec.ts
import { describe, it, expect } from 'vitest'
import { calcResizeRect, RESIZE_POINTS } from '../composables/useResize'

const startRect = { left: 100, top: 100, width: 80, height: 60 }

describe('RESIZE_POINTS', () => {
  it('包含 8 个方位', () => {
    expect(RESIZE_POINTS).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])
  })
})

describe('calcResizeRect', () => {
  it('e：向右拉伸只改宽度', () => {
    expect(calcResizeRect('e', startRect, 10, 5, 10, 10)).toEqual({ left: 100, top: 100, width: 90, height: 60 })
  })

  it('w：向左拉伸改宽度并平移 left', () => {
    expect(calcResizeRect('w', startRect, -10, 0, 10, 10)).toEqual({ left: 90, top: 100, width: 90, height: 60 })
  })

  it('s：向下拉伸只改高度', () => {
    expect(calcResizeRect('s', startRect, 0, 15, 10, 10)).toEqual({ left: 100, top: 100, width: 80, height: 75 })
  })

  it('n：向上拉伸改高度并平移 top', () => {
    expect(calcResizeRect('n', startRect, 0, -15, 10, 10)).toEqual({ left: 100, top: 85, width: 80, height: 75 })
  })

  it('se：右下角同时改宽高', () => {
    expect(calcResizeRect('se', startRect, 10, 20, 10, 10)).toEqual({ left: 100, top: 100, width: 90, height: 80 })
  })

  it('nw：左上角改宽高并平移 left/top', () => {
    expect(calcResizeRect('nw', startRect, -10, -20, 10, 10)).toEqual({ left: 90, top: 80, width: 90, height: 80 })
  })

  it('sw：左下角改宽高并平移 left', () => {
    expect(calcResizeRect('sw', startRect, -10, 20, 10, 10)).toEqual({ left: 90, top: 100, width: 90, height: 80 })
  })

  it('ne：右上角改宽高并平移 top', () => {
    expect(calcResizeRect('ne', startRect, 10, -20, 10, 10)).toEqual({ left: 100, top: 80, width: 90, height: 80 })
  })

  it('最小宽高约束：w 方向缩到 minW 时 left 停在右缘 - minW', () => {
    expect(calcResizeRect('w', startRect, 200, 0, 10, 10)).toEqual({ left: 170, top: 100, width: 10, height: 60 })
  })

  it('最小宽高约束：n 方向缩到 minH 时 top 停在下缘 - minH', () => {
    expect(calcResizeRect('n', startRect, 0, 200, 10, 10)).toEqual({ left: 100, top: 150, width: 80, height: 10 })
  })
})
