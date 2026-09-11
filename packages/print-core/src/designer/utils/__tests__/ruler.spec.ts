import { describe, it, expect } from 'vitest'
import {
  buildRulerTicks,
  chooseMajorStepMM,
  minorStepMM,
} from '../ruler.js'

describe('chooseMajorStepMM 按缩放自适应主刻度步长', () => {
  // 96dpi 下 1mm ≈ 3.7795px；目标主刻度间距 ≥ 64px
  it('100% 时主刻度为 20mm（10mm 仅约 38px 过密）', () => {
    expect(chooseMajorStepMM(1)).toBe(20)
  })
  it('200% 时主刻度为 10mm', () => {
    expect(chooseMajorStepMM(2)).toBe(10)
  })
  it('500% 时主刻度为 5mm', () => {
    expect(chooseMajorStepMM(5)).toBe(5)
  })
  it('1000% 时主刻度为 2mm', () => {
    expect(chooseMajorStepMM(10)).toBe(2)
  })
  it('2000% 时主刻度为 1mm（步长不再继续细分）', () => {
    expect(chooseMajorStepMM(20)).toBe(1)
  })
  it('50% 缩小时主刻度为 50mm', () => {
    expect(chooseMajorStepMM(0.5)).toBe(50)
  })
  it('25% 最小缩放下主刻度为 100mm', () => {
    expect(chooseMajorStepMM(0.25)).toBe(100)
  })
  it('10% 极端缩小时主刻度为 200mm', () => {
    expect(chooseMajorStepMM(0.1)).toBe(200)
  })
  it('返回值随目标像素间距参数变化', () => {
    // 目标间距收紧到 30px 时，100% 下 10mm(38px) 即满足
    expect(chooseMajorStepMM(1, 30)).toBe(10)
  })
})

describe('minorStepMM 次刻度步长', () => {
  it.each([
    [1, null],
    [2, 1],
    [5, 1],
    [10, 2],
    [20, 10],
    [50, 10],
    [100, 20],
    [200, 100],
  ])('主刻度 %smm 的次刻度为 %s', (major, expected) => {
    expect(minorStepMM(major)).toBe(expected)
  })
})

describe('buildRulerTicks 生成可见范围刻度', () => {
  it('0~25mm、主刻度 10mm：主刻度带标签，次刻度间隔 2mm', () => {
    const ticks = buildRulerTicks(0, 25, 10)
    const majors = ticks.filter(t => t.major)
    expect(majors.map(t => t.mm)).toEqual([0, 10, 20])
    expect(majors.map(t => t.label)).toEqual(['0', '10', '20'])
    const minors = ticks.filter(t => !t.major)
    expect(minors.map(t => t.mm)).toEqual([2, 4, 6, 8, 12, 14, 16, 18, 22, 24])
  })

  it('范围含负值（纸张滚动到尺起点之后）时仍从首个次刻度对齐生成', () => {
    const ticks = buildRulerTicks(-5, 5, 10)
    expect(ticks.map(t => t.mm)).toEqual([-4, -2, 0, 2, 4])
    expect(ticks.filter(t => t.major).map(t => t.mm)).toEqual([0])
  })

  it('主刻度 1mm 时没有次刻度', () => {
    const ticks = buildRulerTicks(0, 3, 1)
    expect(ticks.every(t => t.major)).toBe(true)
    expect(ticks.map(t => t.mm)).toEqual([0, 1, 2, 3])
  })

  it('主刻度 2mm 时次刻度间隔 1mm', () => {
    const ticks = buildRulerTicks(0, 6, 2)
    expect(ticks.map(t => t.mm)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(ticks.filter(t => t.major).map(t => t.mm)).toEqual([0, 2, 4, 6])
  })

  it('主刻度 5mm 时次刻度间隔 1mm', () => {
    const ticks = buildRulerTicks(0, 12, 5)
    expect(ticks.filter(t => t.major).map(t => t.mm)).toEqual([0, 5, 10])
    expect(ticks.filter(t => !t.major).map(t => t.mm))
      .toEqual([1, 2, 3, 4, 6, 7, 8, 9, 11, 12])
  })

  it('刻度按毫米升序排列', () => {
    const ticks = buildRulerTicks(-30, 130, 50)
    const mms = ticks.map(t => t.mm)
    const sorted = [...mms].sort((a, b) => a - b)
    expect(mms).toEqual(sorted)
  })

  it('刻度位置无浮点累加误差', () => {
    const ticks = buildRulerTicks(0, 100, 2)
    for (const t of ticks) {
      expect(Number.isInteger(t.mm)).toBe(true)
    }
  })

  it('起止边界刻度均包含在内', () => {
    const ticks = buildRulerTicks(-10, 10, 10)
    expect(ticks[0].mm).toBe(-10)
    expect(ticks[ticks.length - 1].mm).toBe(10)
  })
})
