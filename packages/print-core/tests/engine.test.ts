// packages/print-core/tests/engine.test.ts
import { describe, it, expect } from 'vitest'
import { TemplateEngine } from '../src/index.js'

describe('TemplateEngine', () => {
  const engine = new TemplateEngine()

  it('evaluates simple expression', () => {
    expect(engine.evaluate('1 + 2', {})).toBe(3)
  })

  it('evaluates with context', () => {
    expect(engine.evaluate('amount', { amount: 100 })).toBe(100)
  })

  it('evaluates member access', () => {
    expect(engine.evaluate('supplier.name', { supplier: { name: 'ACME' } })).toBe('ACME')
  })

  it('evaluates with custom function', () => {
    const eng = new TemplateEngine({
      functions: { MONEY: (x: number) => x.toFixed(2) },
    })
    expect(eng.evaluate('MONEY(1234.5)', {})).toBe('1234.50')
  })

  it('renders template', () => {
    expect(engine.render('金额: {amount} 元', { amount: 100 })).toBe('金额: 100 元')
  })

  it('renders with custom function', () => {
    const eng = new TemplateEngine({
      functions: { MONEY: (x: number) => x.toFixed(2) },
    })
    expect(eng.render('{MONEY(amount)}', { amount: 1234.5 })).toBe('1234.50')
  })

  it('registers function dynamically', () => {
    const eng = new TemplateEngine()
    eng.registerFunction('DOUBLE', (x: number) => x * 2)
    expect(eng.evaluate('DOUBLE(5)', {})).toBe(10)
  })

  it('renders complex template', () => {
    const eng = new TemplateEngine({
      functions: {
        MONEY: (x: number) => x.toFixed(2),
        DATE: (d: Date, fmt: string) => {
          const pad = (n: number) => String(n).padStart(2, '0')
          return fmt
            .replace('YYYY', String(d.getFullYear()))
            .replace('MM', pad(d.getMonth() + 1))
            .replace('DD', pad(d.getDate()))
        },
      },
    })
    const result = eng.render(
      '订单日期: {DATE(orderDate, "YYYY-MM-DD")}，金额: {MONEY(amount)} 元',
      { orderDate: new Date('2026-08-06'), amount: 1234.5 }
    )
    expect(result).toBe('订单日期: 2026-08-06，金额: 1234.50 元')
  })
})
