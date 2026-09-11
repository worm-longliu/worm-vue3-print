import { describe, it, expect } from 'vitest'
import { useAlign } from '../useAlign.js'
import type { RuntimeElement } from '../types.js'

function makeEl(id: string, left: number, top: number, width: number, height: number): RuntimeElement {
  return { id, options: { left, top, width, height }, printElementType: { type: 'text', title: '文本' } }
}

describe('useAlign', () => {
  it('元素少于 2 个时静默返回', () => {
    const { align } = useAlign()
    const el = makeEl('a', 10, 20, 100, 50)
    align([el], 'left')
    expect(el.options.left).toBe(10)
    align([], 'left')
    // 没有报错即可
  })

  it('左对齐', () => {
    const { align } = useAlign()
    const a = makeEl('a', 10, 20, 100, 50)
    const b = makeEl('b', 80, 60, 80, 40)
    align([a, b], 'left')
    expect(a.options.left).toBe(10)
    expect(b.options.left).toBe(10)
  })

  it('右对齐', () => {
    const { align } = useAlign()
    const a = makeEl('a', 10, 20, 100, 50)
    const b = makeEl('b', 80, 60, 80, 40)
    align([a, b], 'right')
    // a: right edge = 10+100=110, b: right edge = 80+80=160, max right = 160
    // a.left = 160-100=60, b.left = 160-80=80
    expect(a.options.left).toBe(60)
    expect(b.options.left).toBe(80)
  })

  it('顶部对齐', () => {
    const { align } = useAlign()
    const a = makeEl('a', 10, 20, 100, 50)
    const b = makeEl('b', 80, 60, 80, 40)
    align([a, b], 'top')
    expect(a.options.top).toBe(20)
    expect(b.options.top).toBe(20)
  })

  it('底部对齐', () => {
    const { align } = useAlign()
    const a = makeEl('a', 10, 20, 100, 50)
    const b = makeEl('b', 80, 60, 80, 40)
    align([a, b], 'bottom')
    // a: bottom edge = 20+50=70, b: bottom edge = 60+40=100, max bottom = 100
    // a.top = 100-50=50, b.top = 100-40=60
    expect(a.options.top).toBe(50)
    expect(b.options.top).toBe(60)
  })

  it('垂直居中', () => {
    const { align } = useAlign()
    const a = makeEl('a', 10, 20, 100, 50)
    const b = makeEl('b', 80, 60, 80, 40)
    align([a, b], 'vertical')
    // minLeft=10, maxRight=160, centerX=(10+160)/2=85
    // a.left = 85-50=35, b.left = 85-40=45
    expect(a.options.left).toBe(35)
    expect(b.options.left).toBe(45)
  })

  it('水平居中', () => {
    const { align } = useAlign()
    const a = makeEl('a', 10, 20, 100, 50)
    const b = makeEl('b', 80, 60, 80, 40)
    align([a, b], 'horizontal')
    // minTop=20, maxBottom=100, centerY=(20+100)/2=60
    // a.top = 60-25=35, b.top = 60-20=40
    expect(a.options.top).toBe(35)
    expect(b.options.top).toBe(40)
  })

  it('水平分布', () => {
    const { align } = useAlign()
    const a = makeEl('a', 0, 0, 40, 20)
    const b = makeEl('b', 100, 0, 40, 20)
    const c = makeEl('c', 200, 0, 40, 20)
    align([a, b, c], 'distributeHor')
    // sorted by left: a(0), b(100), c(200)
    // minLeft=0, maxRight=240, totalW=120, gap=(240-0-120)/(3-1)=60
    // a.left=0, b.left=0+40+60=100, c.left=100+40+60=200
    expect(a.options.left).toBe(0)
    expect(b.options.left).toBe(100)
    expect(c.options.left).toBe(200)
  })

  it('水平分布 2 元素时 gap=0', () => {
    const { align } = useAlign()
    const a = makeEl('a', 10, 0, 50, 20)
    const b = makeEl('b', 200, 0, 100, 20)
    align([a, b], 'distributeHor')
    // sorted: a(10), b(200)
    // minLeft=10, maxRight=300, totalW=150, gap=(300-10-150)/(2-1)=140
    // a.left=10, b.left=10+50+140=200
    expect(a.options.left).toBe(10)
    expect(b.options.left).toBe(200)
  })

  it('垂直分布', () => {
    const { align } = useAlign()
    const a = makeEl('a', 0, 0, 20, 30)
    const b = makeEl('b', 0, 60, 20, 30)
    const c = makeEl('c', 0, 120, 20, 30)
    align([a, b, c], 'distributeVer')
    // sorted by top: a(0), b(60), c(120)
    // minTop=0, maxBottom=150, totalH=90, gap=(150-0-90)/(3-1)=30
    // a.top=0, b.top=0+30+30=60, c.top=60+30+30=120
    expect(a.options.top).toBe(0)
    expect(b.options.top).toBe(60)
    expect(c.options.top).toBe(120)
  })
})
