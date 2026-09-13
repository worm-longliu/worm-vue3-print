// pdf-printer 参数构造单测：纸张（方向）与色彩模式必须显式下发给打印系统
import { describe, it, expect } from 'vitest'
import {
  buildCupsArgs,
  buildSumatraSettings,
  resolveMediaOption,
  PT_PER_MM,
} from './pdf-printer.js'

describe('resolveMediaOption', () => {
  it('标准纸型按名称下发（横向 A4 仍报 A4，由页面方向决定实际朝向）', () => {
    expect(resolveMediaOption({ width: 210, height: 297 })).toBe('media=A4')
    expect(resolveMediaOption({ width: 297, height: 210 })).toBe('media=A4')
    expect(resolveMediaOption({ width: 148, height: 210 })).toBe('media=A5')
    expect(resolveMediaOption({ width: 216, height: 279 })).toBe('media=Letter')
  })

  it('非标准尺寸（连续纸/自定义）用 Custom.<宽>x<高>（点）', () => {
    // 80×150mm → 226.77×425.2 点
    expect(resolveMediaOption({ width: 80, height: 150 })).toBe('media=Custom.226.77x425.2')
    expect(PT_PER_MM).toBeCloseTo(2.8346, 3)
  })

  it('宿主指定的驱动纸型优先（如针式打印机预置纸型）', () => {
    expect(resolveMediaOption({ width: 210, height: 297 }, '收据241x140')).toBe('media=收据241x140')
    expect(resolveMediaOption(undefined, '  A4  ')).toBe('media=A4')
  })

  it('尺寸缺失时不下发 media（交给驱动默认）', () => {
    expect(resolveMediaOption(undefined)).toBeUndefined()
    expect(resolveMediaOption({ width: 0, height: 0 })).toBeUndefined()
  })
})

describe('buildCupsArgs', () => {
  it('横向自定义纸：声明 Custom 纸张 + 份数 + 目标打印机', () => {
    const args = buildCupsArgs('/tmp/job.pdf', {
      printerName: '热敏-80',
      copies: 2,
      paper: { width: 80, height: 150 },
    })
    expect(args).toEqual([
      '-d', '热敏-80',
      '-n', '2',
      '-o', 'media=Custom.226.77x425.2',
      '/tmp/job.pdf',
    ])
  })

  it('A4 页面下发标准纸型名（横向页同样报 A4，方向由页面本身决定）', () => {
    const args = buildCupsArgs('/tmp/job.pdf', { paper: { width: 297, height: 210 } })
    expect(args).toContain('media=A4')
  })

  it('双面与驱动纸型', () => {
    const args = buildCupsArgs('/tmp/job.pdf', {
      paperName: '收据241x140',
      duplex: true,
      paper: { width: 241, height: 140 },
    })
    expect(args).toContain('media=收据241x140')
    expect(args).toContain('sides=two-sided-long-edge')
    expect(args[args.length - 1]).toBe('/tmp/job.pdf')
  })
})

describe('buildSumatraSettings', () => {
  it('份数前缀', () => {
    expect(buildSumatraSettings({ copies: 3 })).toBe('3x')
  })
})
