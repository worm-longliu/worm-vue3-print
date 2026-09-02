// packages/print-core/tests/functions/format.test.ts
import { describe, it, expect } from 'vitest'
import { formatMoney, formatDate, toUpperCaseAmount, ifFn } from '../../src/functions/format.js'

describe('formatMoney', () => {
  it('formats positive number', () => {
    expect(formatMoney(1234.5)).toBe('1,234.50')
  })

  it('formats zero', () => {
    expect(formatMoney(0)).toBe('0.00')
  })

  it('formats negative number', () => {
    expect(formatMoney(-1234.5)).toBe('-1,234.50')
  })

  it('formats with no decimals', () => {
    expect(formatMoney(1000)).toBe('1,000.00')
  })

  it('formats large number', () => {
    expect(formatMoney(1234567.89)).toBe('1,234,567.89')
  })

  it('handles string input', () => {
    expect(formatMoney('1234.5')).toBe('1,234.50')
  })
})

describe('formatDate', () => {
  it('formats YYYY-MM-DD', () => {
    const d = new Date('2026-08-06T12:00:00')
    expect(formatDate(d, 'YYYY-MM-DD')).toBe('2026-08-06')
  })

  it('formats YYYY年MM月DD日', () => {
    const d = new Date('2026-08-06T12:00:00')
    expect(formatDate(d, 'YYYY年MM月DD日')).toBe('2026年08月06日')
  })

  it('formats HH:mm:ss', () => {
    const d = new Date('2026-08-06T14:30:45')
    expect(formatDate(d, 'HH:mm:ss')).toBe('14:30:45')
  })

  it('handles string date', () => {
    expect(formatDate('2026-08-06', 'YYYY/MM/DD')).toBe('2026/08/06')
  })

  it('handles timestamp', () => {
    const ts = new Date('2026-01-01').getTime()
    expect(formatDate(ts, 'YYYY-MM-DD')).toBe('2026-01-01')
  })
})

describe('toUpperCaseAmount', () => {
  it('converts zero', () => {
    expect(toUpperCaseAmount(0)).toBe('零元整')
  })

  it('converts simple number', () => {
    expect(toUpperCaseAmount(1)).toBe('壹元整')
  })

  it('converts with jiao and fen', () => {
    expect(toUpperCaseAmount(1.23)).toBe('壹元贰角叁分')
  })

  it('converts large number', () => {
    expect(toUpperCaseAmount(1234.56)).toBe('壹仟贰佰叁拾肆元伍角陆分')
  })

  it('converts negative', () => {
    expect(toUpperCaseAmount(-100)).toBe('负壹佰元整')
  })
})

describe('ifFn', () => {
  it('returns true branch', () => {
    expect(ifFn(true, 'yes', 'no')).toBe('yes')
  })

  it('returns false branch', () => {
    expect(ifFn(false, 'yes', 'no')).toBe('no')
  })
})
