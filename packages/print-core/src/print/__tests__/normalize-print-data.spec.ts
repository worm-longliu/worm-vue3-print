import { describe, it, expect } from 'vitest'
import {
  MAX_BATCH_COPIES,
  normalizePrintData,
} from '../normalize-print-data.js'

describe('normalizePrintData', () => {
  it('undefined 归一为 single 空对象', () => {
    expect(normalizePrintData(undefined)).toEqual({ mode: 'single', data: {} })
  })

  it('对象归一为 single，原样返回引用', () => {
    const data = { a: 1 }
    expect(normalizePrintData(data)).toEqual({ mode: 'single', data })
  })

  it('非空对象数组归一为 batch', () => {
    const r = normalizePrintData([{ a: 1 }, { a: 2 }])
    expect(r.mode).toBe('batch')
    if (r.mode !== 'batch') throw new Error('类型收窄失败')
    expect(r.dataList).toHaveLength(2)
  })

  it('空数组抛错', () => {
    expect(() => normalizePrintData([])).toThrow('批量打印数据必须是非空对象数组')
  })

  it('数组含非对象项时报告 1 基项序号', () => {
    expect(() => normalizePrintData([{ a: 1 }, null])).toThrow('批量打印数据第 2 项必须是对象')
    expect(() => normalizePrintData([{ a: 1 }, 'x' as unknown as Record<string, any>])).toThrow(
      '批量打印数据第 2 项必须是对象',
    )
  })

  it(`超过 ${MAX_BATCH_COPIES} 份抛错并报告实际份数`, () => {
    const list = Array.from({ length: MAX_BATCH_COPIES + 1 }, () => ({}))
    expect(() => normalizePrintData(list)).toThrow(
      `批量打印最多支持 ${MAX_BATCH_COPIES} 份，当前 ${MAX_BATCH_COPIES + 1} 份`,
    )
  })

  it('恰好上限可通过', () => {
    const list = Array.from({ length: MAX_BATCH_COPIES }, () => ({}))
    expect(normalizePrintData(list).mode).toBe('batch')
  })
})
