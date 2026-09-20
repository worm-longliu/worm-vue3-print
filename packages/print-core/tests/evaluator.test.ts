// packages/print-core/tests/evaluator.test.ts
import { describe, it, expect } from 'vitest'
import { evaluate } from '../src/evaluator.js'
import { parse } from '../src/parser.js'
import { tokenize } from '../src/lexer.js'

describe('evaluate', () => {
  function evalExpr(input: string, ctx: Record<string, any> = {}, fns: Record<string, any> = {}) {
    const ast = parse(tokenize(input))
    return evaluate(ast, ctx, fns)
  }

  it('evaluates number', () => {
    expect(evalExpr('42')).toBe(42)
  })

  it('evaluates string', () => {
    expect(evalExpr('"hello"')).toBe('hello')
  })

  it('evaluates boolean', () => {
    expect(evalExpr('true')).toBe(true)
  })

  it('evaluates identifier from context', () => {
    expect(evalExpr('amount', { amount: 100 })).toBe(100)
  })

  it('evaluates binary arithmetic', () => {
    expect(evalExpr('1 + 2')).toBe(3)
    expect(evalExpr('10 * 3')).toBe(30)
    expect(evalExpr('10 / 3')).toBeCloseTo(3.333)
    expect(evalExpr('10 % 3')).toBe(1)
  })

  it('evaluates comparison', () => {
    expect(evalExpr('5 > 3')).toBe(true)
    expect(evalExpr('5 < 3')).toBe(false)
    expect(evalExpr('5 == 5')).toBe(true)
    expect(evalExpr('5 !== 5')).toBe(false)
  })

  it('evaluates logical operators', () => {
    expect(evalExpr('true && false')).toBe(false)
    expect(evalExpr('true || false')).toBe(true)
    expect(evalExpr('!true')).toBe(false)
  })

  it('evaluates ternary', () => {
    expect(evalExpr('true ? "yes" : "no"')).toBe('yes')
    expect(evalExpr('false ? "yes" : "no"')).toBe('no')
  })

  it('evaluates member access', () => {
    expect(evalExpr('supplier.name', { supplier: { name: 'ACME' } })).toBe('ACME')
    expect(evalExpr('a.b.c', { a: { b: { c: 42 } } })).toBe(42)
  })

  it('evaluates function call', () => {
    const fns = {
      MONEY: (x: number) => x.toFixed(2),
    }
    expect(evalExpr('MONEY(1234.5)', {}, fns)).toBe('1234.50')
  })

  it('evaluates nested function call', () => {
    const fns = {
      SUM: (rows: any[], field: string) =>
        rows.reduce((s, r) => s + r[field], 0),
    }
    expect(
      evalExpr('SUM(items, "price")', {
        items: [{ price: 10 }, { price: 20 }],
      }, fns)
    ).toBe(30)
  })

  it('evaluates array literal', () => {
    expect(evalExpr('[1, 2, 3]')).toEqual([1, 2, 3])
  })

  it('evaluates object literal', () => {
    expect(evalExpr('{ a: 1, b: "x" }')).toEqual({ a: 1, b: 'x' })
  })

  it('evaluates unary negation', () => {
    expect(evalExpr('-x', { x: 5 })).toBe(-5)
  })

  it('throws on undefined variable', () => {
    expect(() => evalExpr('undefinedVar')).toThrow('未定义的标识符')
  })

  it('throws on calling non-function', () => {
    expect(() => evalExpr('x(1)', { x: 42 })).toThrow('不是函数')
  })

  it('throws on accessing property of null', () => {
    expect(() => evalExpr('x.y', { x: null })).toThrow('无法访问空值')
  })
})

describe('算术运算的数值语义', () => {
  function evalExpr(input: string, ctx: Record<string, any> = {}) {
    return evaluate(parse(tokenize(input)), ctx)
  }

  it('字符串数字按数值相加，不拼接', () => {
    expect(evalExpr('a + b', { a: '10', b: '20' })).toBe(30)
    expect(evalExpr('a + 1', { a: '3' })).toBe(4)
  })

  it('非数值仍保持字符串拼接', () => {
    expect(evalExpr('name + suffix', { name: 'ACME', suffix: '有限公司' })).toBe('ACME有限公司')
    expect(evalExpr('name + 1', { name: 'ACME' })).toBe('ACME1')
  })

  it('拼接时 null / undefined 视为空串', () => {
    expect(evalExpr('name + blank', { name: 'ACME', blank: null })).toBe('ACME')
    expect(evalExpr('blank + 5', { blank: null })).toBe(5)
  })

  it('消除二进制浮点误差', () => {
    expect(evalExpr('0.1 + 0.2')).toBe(0.3)
    expect(evalExpr('1.1 * 3')).toBe(3.3)
    expect(evalExpr('0.07 + 0.01')).toBe(0.08)
  })

  it('除零与空值兜底为 0', () => {
    expect(evalExpr('10 / 0')).toBe(0)
    expect(evalExpr('10 % 0')).toBe(0)
    expect(evalExpr('x * y', { x: null, y: 'abc' })).toBe(0)
  })

  it('一元正负号走数值化', () => {
    expect(evalExpr('-a', { a: '5' })).toBe(-5)
    expect(evalExpr('+a', { a: '5' })).toBe(5)
    expect(evalExpr('-a', { a: 'abc' })).toBe(0)
  })
})
