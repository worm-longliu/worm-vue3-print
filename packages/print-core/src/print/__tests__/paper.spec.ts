import { describe, it, expect } from 'vitest'
import { resolvePaperMm, paperViewportPx, escapeHeightMm } from '../paper.js'

const derived = { paperMm: { width: 80, height: 132.5 }, continuous: true }
const plain = { paperMm: { width: 210, height: 297 }, continuous: false }

describe('resolvePaperMm', () => {
  it('普通模板无覆盖：取 core 纸尺寸，来源 config', () => {
    expect(resolvePaperMm(plain)).toEqual({ paperMm: plain.paperMm, heightSource: 'config' })
  })
  it('连续纸无覆盖：采用推导高度，来源 derived', () => {
    expect(resolvePaperMm(derived)).toEqual({ paperMm: derived.paperMm, heightSource: 'derived' })
  })
  it('连续纸显式覆盖高度：来源 config', () => {
    expect(resolvePaperMm({ ...derived, override: { height: 200 } }))
      .toEqual({ paperMm: { width: 80, height: 200 }, heightSource: 'config' })
  })
  it('连续纸同时覆盖宽高：全部覆盖', () => {
    expect(resolvePaperMm({ ...derived, override: { width: 58, height: 200 } }))
      .toEqual({ paperMm: { width: 58, height: 200 }, heightSource: 'config' })
  })
  it('连续纸只覆盖宽度：高度仍用推导值，来源仍 derived', () => {
    expect(resolvePaperMm({ ...derived, override: { width: 58 } }))
      .toEqual({ paperMm: { width: 58, height: 132.5 }, heightSource: 'derived' })
  })
  it('非连续纸覆盖纸型：以覆盖为准，来源 config', () => {
    expect(resolvePaperMm({ ...plain, override: { width: 215.9, height: 279.4 } }))
      .toEqual({ paperMm: { width: 215.9, height: 279.4 }, heightSource: 'config' })
  })
  it('覆盖高度为 0 或负数视为未传', () => {
    expect(resolvePaperMm({ ...derived, override: { height: 0 } }).heightSource).toBe('derived')
    expect(resolvePaperMm({ ...derived, override: { height: -5 } }).paperMm.height).toBe(132.5)
    expect(resolvePaperMm({ ...plain, override: { height: 0 } }).paperMm.height).toBe(297)
  })
})

describe('paperViewportPx', () => {
  it('按同一常量换算，A4 纵向为 794×1123（297 × 3.7795275591 = 1122.52 四舍五入）', () => {
    expect(paperViewportPx({ width: 210, height: 297 })).toEqual({ width: 794, height: 1123 })
  })
})

describe('escapeHeightMm', () => {
  it('paperHeightMm 优先于协议覆盖高度', () => {
    expect(escapeHeightMm({ paperHeightMm: 150, override: { height: 200 } })).toBe(150)
  })
  it('未提供或非法时返回 undefined', () => {
    expect(escapeHeightMm({})).toBeUndefined()
    expect(escapeHeightMm({ paperHeightMm: 0, override: { height: -1 } })).toBeUndefined()
  })
})
