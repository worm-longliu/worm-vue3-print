// packages/print-core/tests/functions/aggregate.test.ts
import { describe, it, expect } from 'vitest'
import { sum, avg, count, min, max } from '../../src/functions/aggregate.js'

describe('aggregate functions', () => {
  const rows = [
    { price: 10, qty: 2 },
    { price: 20, qty: 3 },
    { price: 30, qty: 1 },
  ]

  it('SUM', () => {
    expect(sum(rows, 'price')).toBe(60)
    expect(sum(rows, 'qty')).toBe(6)
  })

  it('AVG', () => {
    expect(avg(rows, 'price')).toBe(20)
    expect(avg(rows, 'qty')).toBe(2)
  })

  it('COUNT', () => {
    expect(count(rows, 'price')).toBe(3)
  })

  it('MIN', () => {
    expect(min(rows, 'price')).toBe(10)
  })

  it('MAX', () => {
    expect(max(rows, 'price')).toBe(30)
  })

  it('handles empty rows', () => {
    expect(sum([], 'price')).toBe(0)
    expect(avg([], 'price')).toBe(0)
    expect(count([], 'price')).toBe(0)
  })
})
