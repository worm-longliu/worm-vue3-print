import { describe, it, expect } from 'vitest'
import { resolvePaper } from './paper.js'

const A4 = { width: 210, height: 297 }
const CONT = { width: 80, height: 123.456 } // core 已推导的连续纸尺寸（mm）

describe('resolvePaper', () => {
  it('普通模板无覆盖：宽高取 core paperMm（微米），来源 config', () => {
    const r = resolvePaper({ print: {}, paperMm: A4, continuous: false })
    expect(r.paper).toEqual({ width: 210000, height: 297000 })
    expect(r.heightSource).toBe('config')
  })

  it('连续纸无覆盖：采用 core 推导高度（四舍五入到微米），来源 derived', () => {
    const r = resolvePaper({ print: {}, paperMm: CONT, continuous: true })
    expect(r.paper).toEqual({ width: 80000, height: 123456 })
    expect(r.heightSource).toBe('derived')
  })

  it('连续纸显式传 height：覆盖推导值，来源 config', () => {
    const r = resolvePaper({ print: { paperSize: { height: 200000 } }, paperMm: CONT, continuous: true })
    expect(r.paper).toEqual({ width: 80000, height: 200000 })
    expect(r.heightSource).toBe('config')
  })

  it('连续纸显式传 width+height：全部覆盖', () => {
    const r = resolvePaper({ print: { paperSize: { width: 58000, height: 150000 } }, paperMm: CONT, continuous: true })
    expect(r.paper).toEqual({ width: 58000, height: 150000 })
    expect(r.heightSource).toBe('config')
  })

  it('连续纸只覆盖 width：高度仍用推导值，来源仍 derived', () => {
    const r = resolvePaper({ print: { paperSize: { width: 58000 } }, paperMm: CONT, continuous: true })
    expect(r.paper).toEqual({ width: 58000, height: 123456 })
    expect(r.heightSource).toBe('derived')
  })

  it('非连续纸显式覆盖 paperSize：以覆盖为准，来源 config', () => {
    const r = resolvePaper({ print: { paperSize: { width: 100000, height: 150000 } }, paperMm: A4, continuous: false })
    expect(r.paper).toEqual({ width: 100000, height: 150000 })
    expect(r.heightSource).toBe('config')
  })

  it('显式 height 为 0/负数视为未传（连续纸回退推导）', () => {
    const r = resolvePaper({ print: { paperSize: { height: 0 } }, paperMm: CONT, continuous: true })
    expect(r.paper).toEqual({ width: 80000, height: 123456 })
    expect(r.heightSource).toBe('derived')
  })
})
