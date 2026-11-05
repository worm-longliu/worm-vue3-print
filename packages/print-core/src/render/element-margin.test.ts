import { describe, expect, it } from 'vitest'
import {
  elementMarginCss,
  resolveElementBoxes,
  resolveElementMargins,
} from './element-margin.js'

describe('元素四向外边距几何', () => {
  it('正边距分别得到实际边框盒和外边距盒', () => {
    const { border, margin } = resolveElementBoxes({
      left: 10, top: 20, width: 40, height: 8,
      marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4,
    })
    expect(border).toEqual({ left: 14, top: 21, right: 54, bottom: 29, width: 40, height: 8 })
    expect(margin).toEqual({ left: 10, top: 20, right: 56, bottom: 32, width: 46, height: 12 })
  })

  it('实测高度只替换盒高，不改变外边距盒起点', () => {
    const { border, margin } = resolveElementBoxes({
      left: 10, top: 20, width: 40, height: 8, marginTop: 1, marginBottom: 3,
    }, 12)
    expect(border.bottom).toBe(33)
    expect(margin).toMatchObject({ top: 20, bottom: 36, height: 16 })
  })

  it('缺省与零值不输出声明，配置值按上右下左输出', () => {
    expect(elementMarginCss()).toBe('')
    expect(elementMarginCss({ marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0 })).toBe('')
    expect(elementMarginCss({ marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4 }))
      .toBe('margin-top:1mm;margin-right:2mm;margin-bottom:3mm;margin-left:4mm')
  })

  it('负边距保留，非法数值按零兜底', () => {
    expect(resolveElementMargins({
      marginTop: Number.NaN,
      marginRight: Number.POSITIVE_INFINITY,
      marginBottom: '4',
      marginLeft: -5,
    })).toEqual({ top: 0, right: 0, bottom: 0, left: -5 })
    expect(resolveElementBoxes({ left: 10, top: 20, width: 40, height: 8, marginTop: -2, marginLeft: -5 }).border)
      .toMatchObject({ left: 5, top: 18 })
  })

  it('极端负值只钳占用跨度，不修正边框盒或模板坐标', () => {
    const { border, margin } = resolveElementBoxes({
      left: 10, top: 20, width: 40, height: 8,
      marginLeft: -50, marginRight: -10,
      marginTop: -20, marginBottom: -10,
    })
    expect(margin.width).toBe(0)
    expect(margin.height).toBe(0)
    expect(border).toMatchObject({ left: -40, top: 0, width: 40, height: 8 })
    expect(margin.left).toBe(10)
    expect(margin.top).toBe(20)
  })
})
